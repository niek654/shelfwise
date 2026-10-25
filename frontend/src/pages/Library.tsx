import { ReactNode, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  BookOpen, CheckCircle2, Circle, LayoutGrid, List, ListChecks, Loader2, Search, SlidersHorizontal, Trash2, Upload, X,
} from "lucide-react";
import { api, coverUrl, Book, BookPage, Facets, formatBytes, year } from "../lib/api";
import { activeFilters, FILTER_KEYS, FilterChips, FilterPanel, Filters } from "../components/LibraryFilters";
import { useToast } from "../lib/toast";
import BookCover from "../components/BookCover";

/** A book tile: a link normally, a selection toggle in select mode. */
function BookTile({
  book,
  selecting,
  selected,
  onToggle,
  className,
  children,
}: {
  book: Book;
  selecting: boolean;
  selected: boolean;
  onToggle: (id: number) => void;
  className: string;
  children: ReactNode;
}) {
  if (!selecting) {
    return (
      <Link to={`/books/${book.id}`} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      aria-label={`Select ${book.title}`}
      onClick={() => onToggle(book.id)}
      className={`${className} relative text-left`}
    >
      {children}
    </button>
  );
}

/** Selection mark: "overlay" sits on a cover, "inline" sits in a list row. */
function Check({ selected, inline, className = "" }: { selected: boolean; inline?: boolean; className?: string }) {
  if (selected) {
    return <CheckCircle2 className={`h-6 w-6 ${inline ? "text-brand-600 dark:text-brand-400" : "fill-brand-600 text-white"} ${className}`} />;
  }
  return <Circle className={`h-6 w-6 ${inline ? "text-ink-300 dark:text-ink-600" : "fill-black/20 text-white"} ${className}`} />;
}

const PAGE_SIZE = 48;
const VIEW_KEY = "shelfwise-view";

export default function Library() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const sort = params.get("sort") ?? "added";
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? ""])) as Filters;
  // Stable dependency for effects: changes whenever any filter changes.
  const filterKey = FILTER_KEYS.map((k) => filters[k]).join("\u0000");
  const activeCount = activeFilters(filters).length;
  const [showFilters, setShowFilters] = useState(activeCount > 0);
  const [query, setQuery] = useState(q);
  const toast = useToast();
  const [books, setBooks] = useState<Book[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [view, setView] = useState<"grid" | "list">(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
    } catch {
      return "grid";
    }
  });

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  // Debounce the search box into the URL.
  useEffect(() => {
    const t = setTimeout(() => query !== q && update("q", query), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const loadFacets = () => api<Facets>("/api/books/facets").then(setFacets).catch(() => undefined);
  useEffect(() => {
    loadFacets();
  }, []);

  const clearFilters = () => {
    const next = new URLSearchParams(params);
    FILTER_KEYS.forEach((k) => next.delete(k));
    setParams(next, { replace: true });
  };

  useEffect(() => {
    setPage(1);
  }, [q, sort, filterKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const search = new URLSearchParams({ sort, page: String(page), page_size: String(PAGE_SIZE) });
    if (q) search.set("q", q);
    for (const k of FILTER_KEYS) {
      const v = filters[k];
      // Only apply a year once all four digits are typed.
      if (v && (!k.startsWith("year_") || /^\d{4}$/.test(v))) search.set(k, v);
    }
    api<BookPage>(`/api/books?${search}`)
      .then((res) => {
        if (cancelled) return;
        setBooks((prev) => (page === 1 ? res.items : [...prev, ...res.items]));
        setTotal(res.total);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, sort, filterKey, page]);

  const setViewMode = (v: "grid" | "list") => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const allLoadedSelected = books.length > 0 && books.every((b) => selected.has(b.id));

  const deleteSelected = async () => {
    const n = selected.size;
    if (!confirm(`Delete ${n} ${n === 1 ? "book" : "books"}? Their files are removed from the library. This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await api<{ deleted: number }>("/api/books/bulk-delete", { method: "POST", json: { ids: [...selected] } });
      setBooks((prev) => prev.filter((b) => !selected.has(b.id)));
      setTotal((t) => t - res.deleted);
      toast(`Deleted ${res.deleted} ${res.deleted === 1 ? "book" : "books"}`);
      loadFacets();
      stopSelecting();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className={selecting ? "pb-20" : ""}>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold sm:text-3xl">Library</h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            {total} {total === 1 ? "book" : "books"}
            {q && ` matching “${q}”`}
            {activeCount > 0 && ` · ${activeCount} ${activeCount === 1 ? "filter" : "filters"}`}
          </p>
        </div>
        <div className="flex gap-2">
          {books.length > 0 && (
            <button className="btn-secondary" onClick={() => (selecting ? stopSelecting() : setSelecting(true))} aria-pressed={selecting}>
              {selecting ? <X className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}
              {selecting ? "Done" : "Select"}
            </button>
          )}
          <Link to="/upload" className="btn-primary hidden sm:inline-flex">
            <Upload className="h-4 w-4" /> Add books
          </Link>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-full sm:basis-auto">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            className="input pl-9"
            type="search"
            placeholder="Search title, author, ISBN, series…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select className="input w-auto flex-1 sm:flex-none" value={sort} onChange={(e) => update("sort", e.target.value === "added" ? "" : e.target.value)} aria-label="Sort by">
          <option value="added">Recently added</option>
          <option value="title">Title</option>
          <option value="author">Author</option>
          <option value="published">Publication date</option>
        </select>
        <button
          className={`btn-secondary flex-1 sm:flex-none ${showFilters ? "!border-brand-500 !text-brand-700 dark:!text-brand-300" : ""}`}
          onClick={() => setShowFilters(!showFilters)}
          aria-expanded={showFilters}
        >
          <SlidersHorizontal className="h-4 w-4" /> Filters
          {activeCount > 0 && <span className="badge bg-brand-600 px-1.5 text-white">{activeCount}</span>}
        </button>
        <div className="flex rounded-lg border border-ink-200 p-0.5 dark:border-ink-700">
          {(["grid", "list"] as const).map((v) => {
            const Icon = v === "grid" ? LayoutGrid : List;
            return (
              <button
                key={v}
                onClick={() => setViewMode(v)}
                aria-label={`${v} view`}
                className={`rounded-md p-1.5 ${view === v ? "bg-ink-100 text-ink-900 dark:bg-ink-800 dark:text-ink-100" : "text-ink-400"}`}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>
      </div>

      {showFilters && <FilterPanel facets={facets} filters={filters} onChange={update} onClear={clearFilters} />}
      <FilterChips filters={filters} onRemove={(k) => update(k, "")} />

      {!loading && books.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-16 text-center">
          <BookOpen className="h-10 w-10 text-ink-300 dark:text-ink-600" />
          <h2 className="mt-4 font-medium">{q || activeCount ? "No books match your filters" : "Your shelf is empty"}</h2>
          <p className="mt-1 max-w-sm text-sm text-ink-500 dark:text-ink-400">
            {q || activeCount ? "Try a different search or remove a filter." : "Upload EPUB, PDF, MOBI and other e-book files to get started."}
          </p>
          {!q && !activeCount && (
            <Link to="/upload" className="btn-primary mt-6">
              <Upload className="h-4 w-4" /> Upload books
            </Link>
          )}
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 min-[480px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7">
          {books.map((b) => (
            <BookTile key={b.id} book={b} selecting={selecting} selected={selected.has(b.id)} onToggle={toggle} className="group">
              <div className={`relative rounded-md transition ${selected.has(b.id) ? "ring-4 ring-brand-500 ring-offset-2 ring-offset-ink-50 dark:ring-offset-ink-950" : ""}`}>
                <BookCover
                  src={b.has_cover ? coverUrl(b.id, b.updated_at) : null}
                  title={b.title}
                  author={b.authors[0]}
                  className={`transition ${selecting ? (selected.has(b.id) ? "" : "opacity-80") : "group-hover:-translate-y-1 group-hover:shadow-lg"}`}
                />
                {selecting && <Check selected={selected.has(b.id)} className="absolute right-1.5 top-1.5 drop-shadow" />}
              </div>
              <h3 className="mt-2 line-clamp-2 text-sm font-medium leading-snug">{b.title}</h3>
              <p className="line-clamp-1 text-xs text-ink-500 dark:text-ink-400">{b.authors.join(", ") || "Unknown author"}</p>
            </BookTile>
          ))}
        </div>
      ) : (
        <div className="card divide-y divide-ink-100 dark:divide-ink-800">
          {books.map((b) => (
            <BookTile
              key={b.id}
              book={b}
              selecting={selecting}
              selected={selected.has(b.id)}
              onToggle={toggle}
              className={`flex w-full items-center gap-4 p-3 hover:bg-ink-50 dark:hover:bg-ink-800/50 ${selected.has(b.id) ? "bg-brand-50 dark:bg-brand-500/10" : ""}`}
            >
              {selecting && <Check selected={selected.has(b.id)} inline className="shrink-0" />}
              <BookCover
                src={b.has_cover ? coverUrl(b.id, b.updated_at) : null}
                title={b.title}
                className="w-10 shrink-0 !rounded"
              />
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-medium">{b.title}</h3>
                <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                  {b.authors.join(", ") || "Unknown author"}
                  {year(b.published_date) && ` · ${year(b.published_date)}`}
                </p>
              </div>
              <span className="badge hidden bg-ink-100 uppercase text-ink-600 sm:inline-flex dark:bg-ink-800 dark:text-ink-300">{b.file_format}</span>
              <span className="hidden w-16 text-right text-xs text-ink-400 md:block">{formatBytes(b.file_size)}</span>
            </BookTile>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-ink-400" />
        </div>
      )}
      {selecting && (
        <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 px-4 sm:bottom-6">
          <div className="mx-auto flex max-w-xl flex-wrap items-center gap-2 rounded-xl border border-ink-200 bg-white p-2 pl-4 shadow-xl dark:border-ink-700 dark:bg-ink-900">
            <span className="mr-auto text-sm font-medium">{selected.size} selected</span>
            <button
              className="btn-ghost px-2.5 text-xs"
              onClick={() => setSelected(allLoadedSelected ? new Set() : new Set(books.map((b) => b.id)))}
            >
              {allLoadedSelected ? "Select none" : `Select all${books.length < total ? ` ${books.length} shown` : ""}`}
            </button>
            <button className="btn-danger" onClick={deleteSelected} disabled={!selected.size || deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete
            </button>
          </div>
        </div>
      )}

      {!loading && books.length < total && (
        <div className="mt-8 flex justify-center">
          <button className="btn-secondary" onClick={() => setPage(page + 1)}>
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
