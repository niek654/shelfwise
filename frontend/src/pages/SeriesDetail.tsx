import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { api, authUrl, Book, year } from "../lib/api";
import { useToast } from "../lib/toast";
import BookCover from "../components/BookCover";

export default function SeriesDetail() {
  const { name = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [books, setBooks] = useState<Book[] | null>(null);

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
      <h1 className="font-serif text-3xl font-semibold leading-tight sm:text-4xl">{name}</h1>
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
                src={b.has_cover ? authUrl(`/api/books/${b.id}/cover?v=${b.updated_at}`) : null}
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
