import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Layers, Loader2, Search } from "lucide-react";
import { api, coverUrl, SeriesSummary } from "../lib/api";
import BookCover from "../components/BookCover";

/** Up to three covers fanned out like a stack of books. */
function CoverStack({ series }: { series: SeriesSummary }) {
  const covers = series.covers;
  if (!covers.length) return <BookCover title={series.name} author={series.authors[0]} className="w-full" />;
  return (
    <div className="relative aspect-[2/3]">
      {covers
        .slice()
        .reverse()
        .map((cover, i, all) => {
          const depth = all.length - 1 - i;
          return (
            <div
              key={cover.book_id}
              className="absolute inset-0 transition group-hover:translate-x-0"
              style={{ transform: `translate(${depth * 8}%, ${-depth * 3}%) scale(${1 - depth * 0.06})`, zIndex: i }}
            >
              <BookCover src={coverUrl(cover.book_id, cover.version)} title={series.name} className="w-full" />
            </div>
          );
        })}
    </div>
  );
}

export default function Series() {
  const [series, setSeries] = useState<SeriesSummary[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    api<SeriesSummary[]>("/api/series").then(setSeries);
  }, []);

  if (!series) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-ink-400" />
      </div>
    );
  }

  const needle = q.trim().toLowerCase();
  const shown = needle
    ? series.filter((s) => s.name.toLowerCase().includes(needle) || s.authors.some((a) => a.toLowerCase().includes(needle)))
    : series;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold sm:text-3xl">Series</h1>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
          {series.length} {series.length === 1 ? "series" : "series"} ·{" "}
          {series.reduce((n, s) => n + s.count, 0)} books
        </p>
      </div>

      {series.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-16 text-center">
          <Layers className="h-10 w-10 text-ink-300 dark:text-ink-600" />
          <h2 className="mt-4 font-medium">No series yet</h2>
          <p className="mt-1 max-w-sm text-sm text-ink-500 dark:text-ink-400">
            Books show up here once they have a series. Set it while reviewing an upload or when editing a book.
          </p>
        </div>
      ) : (
        <>
          <div className="relative mb-6 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input className="input pl-9" type="search" placeholder="Search series or author…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 min-[480px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {shown.map((s) => (
              <Link key={s.name} to={`/series/${encodeURIComponent(s.name)}`} className="group">
                <div className="pr-[14%] pt-[6%]">
                  <CoverStack series={s} />
                </div>
                <h3 className="mt-3 line-clamp-2 text-sm font-medium leading-snug">{s.name}</h3>
                <p className="line-clamp-1 text-xs text-ink-500 dark:text-ink-400">
                  {s.count} {s.count === 1 ? "book" : "books"}
                  {s.authors[0] && ` · ${s.authors[0]}`}
                </p>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
