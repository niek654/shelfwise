import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, ImagePlus, Loader2, Pencil, Search, Trash2, X } from "lucide-react";
import { api, authUrl, Book, BookMetadata, formatBytes, LookupResult, SOURCE_LABELS, year } from "../lib/api";
import { useToast } from "../lib/toast";
import BookCover from "../components/BookCover";
import MetadataForm from "../components/MetadataForm";

function Detail({ label, value, mono }: { label: string; value?: string | number | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className={`text-sm ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

export default function BookDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const coverInput = useRef<HTMLInputElement>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [editing, setEditing] = useState<BookMetadata | null>(null);
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [matches, setMatches] = useState<BookMetadata[]>([]);

  useEffect(() => {
    api<Book>(`/api/books/${id}`)
      .then(setBook)
      .catch((e) => {
        toast(e.message, "error");
        navigate("/");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!book) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-ink-400" />
      </div>
    );
  }

  const coverSrc = book.has_cover ? authUrl(`/api/books/${book.id}/cover?v=${book.updated_at}`) : null;

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const updated = await api<Book>(`/api/books/${book.id}`, { method: "PATCH", json: { ...editing, rename_file: true } });
      setBook(updated);
      setEditing(null);
      setMatches([]);
      toast("Saved");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const lookup = async () => {
    if (!editing) return;
    setLookingUp(true);
    try {
      const params = new URLSearchParams();
      if (editing.isbn13 || editing.isbn10) params.set("isbn", (editing.isbn13 || editing.isbn10)!);
      else {
        params.set("title", editing.title);
        if (editing.authors[0]) params.set("author", editing.authors[0]);
      }
      const res = await api<LookupResult>(`/api/metadata/lookup?${params}`);
      setMatches(res.candidates);
      if (!res.candidates.length) toast("No matches found", "error");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setLookingUp(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete “${book.title}”? The file will be removed from the library.`)) return;
    await api(`/api/books/${book.id}`, { method: "DELETE" });
    toast("Book deleted");
    navigate("/");
  };

  const uploadCover = async (file?: File) => {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    try {
      setBook(await api<Book>(`/api/books/${book.id}/cover`, { method: "POST", body: form }));
      toast("Cover updated");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/" className="btn-ghost -ml-3 mb-4">
        <ArrowLeft className="h-4 w-4" /> Library
      </Link>

      <div className="grid gap-8 md:grid-cols-[220px_minmax(0,1fr)]">
        <div className="mx-auto w-44 md:mx-0 md:w-full">
          <BookCover src={coverSrc} title={book.title} author={book.authors[0]} />
          <div className="mt-4 flex flex-col gap-2">
            <a href={authUrl(`/api/books/${book.id}/download`)} className="btn-primary" download>
              <Download className="h-4 w-4" /> Download {book.file_format.toUpperCase()}
            </a>
            <button className="btn-secondary" onClick={() => coverInput.current?.click()}>
              <ImagePlus className="h-4 w-4" /> Change cover
            </button>
            <input ref={coverInput} type="file" accept="image/*" className="hidden" onChange={(e) => uploadCover(e.target.files?.[0])} />
          </div>
        </div>

        <div className="min-w-0">
          {editing ? (
            <div className="card p-4 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="font-serif text-xl font-semibold">Edit metadata</h2>
                <button className="btn-secondary" onClick={lookup} disabled={lookingUp}>
                  {lookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Look up online
                </button>
              </div>
              {matches.length > 0 && (
                <div className="mb-6 flex gap-3 overflow-x-auto pb-2">
                  {matches.map((m, i) => (
                    <button
                      key={i}
                      onClick={() => setEditing({ ...m, cover_url: m.cover_url })}
                      className="card w-36 shrink-0 p-2 text-left hover:border-brand-400"
                    >
                      <BookCover src={m.cover_url} title={m.title} className="w-full" />
                      <p className="mt-2 line-clamp-2 text-xs font-medium">{m.title}</p>
                      <p className="truncate text-[11px] text-ink-500">{SOURCE_LABELS[m.source ?? ""] ?? m.source}</p>
                    </button>
                  ))}
                </div>
              )}
              <MetadataForm value={editing} onChange={setEditing} />
              <div className="mt-6 flex justify-end gap-2">
                <button className="btn-ghost" onClick={() => (setEditing(null), setMatches([]))}>
                  <X className="h-4 w-4" /> Cancel
                </button>
                <button className="btn-primary" onClick={save} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
                </button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="font-serif text-3xl font-semibold leading-tight sm:text-4xl">{book.title}</h1>
              {book.subtitle && <p className="mt-1 text-lg text-ink-600 dark:text-ink-300">{book.subtitle}</p>}
              <p className="mt-3 text-ink-700 dark:text-ink-200">
                {book.authors.length ? book.authors.join(", ") : "Unknown author"}
                {year(book.published_date) && <span className="text-ink-400"> · {year(book.published_date)}</span>}
              </p>
              {book.series && (
                <p className="mt-1 text-sm text-ink-500">
                  {book.series}
                  {book.series_index && ` #${book.series_index}`}
                </p>
              )}
              {book.categories.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {book.categories.map((c) => (
                    <span key={c} className="badge bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">{c}</span>
                  ))}
                </div>
              )}
              <div className="mt-6 flex gap-2">
                <button className="btn-secondary" onClick={() => setEditing({ ...book, cover_url: null })}>
                  <Pencil className="h-4 w-4" /> Edit
                </button>
                <button className="btn-ghost text-red-600 dark:text-red-400" onClick={remove}>
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              </div>
              {book.description && (
                <p className="mt-8 whitespace-pre-line text-sm leading-relaxed text-ink-700 dark:text-ink-300">{book.description}</p>
              )}
              <dl className="card mt-8 grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 sm:p-6">
                <Detail label="Publisher" value={book.publisher} />
                <Detail label="Published" value={book.published_date} />
                <Detail label="Language" value={book.language?.toUpperCase()} />
                <Detail label="Pages" value={book.page_count} />
                <Detail label="ISBN-13" value={book.isbn13} mono />
                <Detail label="ISBN-10" value={book.isbn10} mono />
                <Detail label="DOI" value={book.doi} mono />
                <Detail label="Format" value={`${book.file_format.toUpperCase()} · ${formatBytes(book.file_size)}`} />
                <Detail label="Metadata" value={SOURCE_LABELS[book.metadata_source ?? ""] ?? book.metadata_source} />
                <div className="col-span-2 sm:col-span-3">
                  <Detail label="File" value={book.file_name} mono />
                </div>
              </dl>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
