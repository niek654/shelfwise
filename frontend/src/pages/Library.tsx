import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BookOpen, LayoutGrid, List, Loader2, Search, Upload } from "lucide-react";
import { api, authUrl, Book, BookPage, formatBytes, year } from "../lib/api";
import BookCover from "../components/BookCover";

const PAGE_SIZE = 48;
const VIEW_KEY = "shelfwise-view";

export default function Library() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const sort = params.get("sort") ?? "added";
  const format = params.get("format") ?? "";
  const [query, setQuery] = useState(q);
  const [books, setBooks] = useState<Book[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [formats, setFormats] = useState<string[]>([]);
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

  useEffect(() => {
    api<{ formats: Record<string, number> }>("/api/books/stats").then((s) => setFormats(Object.keys(s.formats).sort()));
  }, []);

  useEffect(() => {
    setPage(1);
  }, [q, sort, format]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const search = new URLSearchParams({ sort, page: String(page), page_size: String(PAGE_SIZE) });
    if (q) search.set("q", q);
    if (format) search.set("format", format);
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
  }, [q, sort, format, page]);

  const setViewMode = (v: "grid" | "list") => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold sm:text-3xl">Library</h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            {total} {total === 1 ? "book" : "books"}
            {q && ` matching “${q}”`}
          </p>
        </div>
        <Link to="/upload" className="btn-primary hidden sm:inline-flex">
          <Upload className="h-4 w-4" /> Add books
        </Link>
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
        {formats.length > 1 && (
          <select className="input w-auto flex-1 sm:flex-none" value={format} onChange={(e) => update("format", e.target.value)} aria-label="Format">
            <option value="">All formats</option>
            {formats.map((f) => (
              <option key={f} value={f}>
                {f.toUpperCase()}
              </option>
            ))}
          </select>
        )}
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

      {!loading && books.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-16 text-center">
          <BookOpen className="h-10 w-10 text-ink-300 dark:text-ink-600" />
          <h2 className="mt-4 font-medium">{q || format ? "No books match your filters" : "Your shelf is empty"}</h2>
          <p className="mt-1 max-w-sm text-sm text-ink-500 dark:text-ink-400">
            {q || format ? "Try a different search." : "Upload EPUB, PDF, MOBI and other e-book files to get started."}
          </p>
          {!q && !format && (
            <Link to="/upload" className="btn-primary mt-6">
              <Upload className="h-4 w-4" /> Upload books
            </Link>
          )}
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 min-[480px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7">
          {books.map((b) => (
            <Link key={b.id} to={`/books/${b.id}`} className="group">
              <BookCover
                src={b.has_cover ? authUrl(`/api/books/${b.id}/cover?v=${b.updated_at}`) : null}
                title={b.title}
                author={b.authors[0]}
                className="transition group-hover:-translate-y-1 group-hover:shadow-lg"
              />
              <h3 className="mt-2 line-clamp-2 text-sm font-medium leading-snug">{b.title}</h3>
              <p className="line-clamp-1 text-xs text-ink-500 dark:text-ink-400">{b.authors.join(", ") || "Unknown author"}</p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="card divide-y divide-ink-100 dark:divide-ink-800">
          {books.map((b) => (
            <Link key={b.id} to={`/books/${b.id}`} className="flex items-center gap-4 p-3 hover:bg-ink-50 dark:hover:bg-ink-800/50">
              <BookCover
                src={b.has_cover ? authUrl(`/api/books/${b.id}/cover?v=${b.updated_at}`) : null}
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
            </Link>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-ink-400" />
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
