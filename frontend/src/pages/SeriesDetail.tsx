import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Loader2, Pencil, X } from "lucide-react";
import { api, coverUrl, Book, SeriesSummary, year } from "../lib/api";
import { useToast } from "../lib/toast";
import BookCover from "../components/BookCover";

export default function SeriesDetail() {
  const { name = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [books, setBooks] = useState<Book[] | null>(null);
  const [newName, setNewName] = useState<string | null>(null);
  const [others, setOthers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const startRename = () => {
    setNewName(name);
    // Other series names, to warn when a rename would merge two series.
    api<SeriesSummary[]>("/api/series").then((all) => setOthers(all.map((x) => x.name).filter((n) => n !== name)));
  };

  const trimmed = newName?.trim() ?? "";
  const mergeTarget = others.find((o) => o.toLowerCase() === trimmed.toLowerCase());

  const rename = async (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed || trimmed === name) return setNewName(null);
    // Use the existing spelling when merging, so the two series become one.
    const target = mergeTarget ?? trimmed;
    setSaving(true);
    try {
      const res = await api<{ name: string; updated: number; merged: boolean }>("/api/series", {
        method: "PATCH",
        json: { name, new_name: target },
      });
      toast(res.merged ? `Merged ${res.updated} books into “${res.name}”` : `Renamed series on ${res.updated} books`);
      setNewName(null);
      navigate(`/series/${encodeURIComponent(res.name)}`, { replace: true });
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    setBooks(null);
    api<Book[]>(`/api/series/books?${new URLSearchParams({ name })}`)
      .then(setBooks)
      .catch((e) => {
        toast(e.message, "error");
        navigate("/series", { replace: true });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  if (!books) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-ink-400" />
      </div>
    );
  }

  const authors = [...new Set(books.flatMap((b) => b.authors.slice(0, 1)))];
  const years = books.map((b) => year(b.published_date)).filter(Boolean).sort();

  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/series" className="btn-ghost -ml-3 mb-2">
        <ArrowLeft className="h-4 w-4" /> Series
      </Link>
      {newName === null ? (
        <div className="flex items-start gap-2">
          <h1 className="min-w-0 font-serif text-3xl font-semibold leading-tight sm:text-4xl">{name}</h1>
          <button className="btn-ghost mt-1 h-9 w-9 shrink-0 p-0" onClick={startRename} aria-label="Rename series" title="Rename series">
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <form onSubmit={rename} className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              className="input font-serif text-xl font-semibold sm:text-2xl"
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setNewName(null)}
              aria-label="Series name"
            />
            <button className="btn-primary h-10 w-10 shrink-0 p-0" disabled={saving || !trimmed} aria-label="Save series name">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
            <button type="button" className="btn-ghost h-10 w-10 shrink-0 p-0" onClick={() => setNewName(null)} aria-label="Cancel">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className={`text-xs ${mergeTarget ? "text-amber-600 dark:text-amber-400" : "text-ink-500 dark:text-ink-400"}`}>
            {mergeTarget
              ? `“${mergeTarget}” already exists. Saving merges these ${books.length} books into it.`
              : `Updates the series on all ${books.length} ${books.length === 1 ? "book" : "books"}.`}
          </p>
        </form>
      )}
      <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
        {authors.slice(0, 3).join(", ")}
        {authors.length ? " · " : ""}
        {books.length} {books.length === 1 ? "book" : "books"}
        {years.length > 0 && ` · ${years[0]}${years[years.length - 1] !== years[0] ? `–${years[years.length - 1]}` : ""}`}
      </p>

      <ol className="mt-8 space-y-3">
        {books.map((b) => (
          <li key={b.id}>
            <Link to={`/books/${b.id}`} className="card flex items-center gap-4 p-3 transition hover:border-ink-300 sm:p-4 dark:hover:border-ink-700">
              <span className="w-10 shrink-0 text-center font-serif text-2xl font-semibold text-ink-300 dark:text-ink-600">
                {b.series_index || "–"}
              </span>
              <BookCover
                src={b.has_cover ? coverUrl(b.id, b.updated_at) : null}
                title={b.title}
                className="w-12 shrink-0 sm:w-14"
              />
              <div className="min-w-0 flex-1">
                <h2 className="line-clamp-2 font-medium leading-snug">{b.title}</h2>
                <p className="truncate text-sm text-ink-500 dark:text-ink-400">
                  {b.authors.join(", ") || "Unknown author"}
                  {year(b.published_date) && ` · ${year(b.published_date)}`}
                </p>
              </div>
              <span className="badge hidden bg-ink-100 uppercase text-ink-600 sm:inline-flex dark:bg-ink-800 dark:text-ink-300">{b.file_format}</span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
