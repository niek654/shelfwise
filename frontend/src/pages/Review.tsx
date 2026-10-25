import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Check, ExternalLink, FileText, Loader2 } from "lucide-react";
import { api, authUrl, BookMetadata, SOURCE_LABELS, Upload, year } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import BookCover from "../components/BookCover";
import MetadataForm, { previewFilename } from "../components/MetadataForm";
import LookupPanel from "../components/LookupPanel";
import ProviderStatusList from "../components/ProviderStatusList";
import { Steps } from "./UploadPage";

function fromFile(u: Upload): BookMetadata {
  const e = u.extracted;
  return {
    title: e.title ?? "",
    authors: e.authors ?? [],
    publisher: e.publisher ?? null,
    published_date: e.published_date ?? null,
    language: e.language ?? null,
    description: e.description ?? null,
    isbn13: e.isbns?.[0] ?? null,
    doi: e.doi ?? null,
    series: e.series ?? null,
    series_index: e.series_index ?? null,
    categories: [],
    cover_url: e.embedded_cover ? "embedded" : null,
    source: "file",
  };
}

export default function Review() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { config } = useAuth();
  const [upload, setUpload] = useState<Upload | null>(null);
  const [selected, setSelected] = useState(0);
  const [meta, setMeta] = useState<BookMetadata | null>(null);
  const [saving, setSaving] = useState(false);

  const options = (u: Upload): BookMetadata[] => [...u.candidates, fromFile(u)];

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      const u = await api<Upload>(`/api/uploads/${id}`);
      if (u.status === "processing") {
        timer = setTimeout(load, 1500);
        return;
      }
      setUpload(u);
      setSelected(0);
      setMeta(options(u)[0]);
    };
    load().catch((e) => toast(e.message, "error"));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!upload || !meta) {
    return (
      <div className="flex flex-col items-center py-24 text-ink-500">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="mt-3 text-sm">Reading file and looking up metadata…</p>
      </div>
    );
  }

  const choices = options(upload);
  const embeddedCover = upload.extracted.embedded_cover ? authUrl(`/api/uploads/${upload.id}/cover`) : null;
  const coverSrc = (m: BookMetadata) => (m.cover_url === "embedded" ? embeddedCover : m.cover_url || null);

  const choose = (i: number) => {
    setSelected(i);
    setMeta({ ...choices[i] });
  };

  const relookup = async (query: { isbn?: string; title?: string; author?: string }) => {
    try {
      const u = await api<Upload>(`/api/uploads/${upload.id}/lookup`, { method: "POST", json: query });
      setUpload(u);
      if (u.candidates.length) {
        setSelected(0);
        setMeta(u.candidates[0]);
      } else toast("No matches found", "error");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  const confirm = async () => {
    if (!meta.title.trim()) return toast("A title is required", "error");
    setSaving(true);
    try {
      // Keep the embedded cover when a provider didn't offer one.
      const cover_url = meta.cover_url && meta.cover_url !== "embedded" ? meta.cover_url : null;
      const book = await api<{ id: number; title: string }>(`/api/uploads/${upload.id}/confirm`, {
        method: "POST",
        json: { ...meta, cover_url },
      });
      toast(`“${book.title}” added to your library`);
      const rest = await api<Upload[]>("/api/uploads");
      const next = rest.find((u) => u.status === "review");
      navigate(next ? `/upload/${next.id}` : `/books/${book.id}`);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const discard = async () => {
    await api(`/api/uploads/${upload.id}`, { method: "DELETE" });
    toast("Upload discarded");
    navigate("/upload");
  };

  const filename = previewFilename(config?.filename_template ?? "{author} - {title} ({year})", meta, upload.file_format);

  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/upload" className="btn-ghost -ml-3 mb-2">
        <ArrowLeft className="h-4 w-4" /> Uploads
      </Link>
      <div className="mb-6 flex flex-col gap-3">
        <h1 className="font-serif text-2xl font-semibold sm:text-3xl">Review metadata</h1>
        <Steps current={3} />
        <p className="flex items-center gap-2 text-sm text-ink-500 dark:text-ink-400">
          <FileText className="h-4 w-4 shrink-0" />
          <span className="truncate">{upload.original_filename}</span>
        </p>
        {upload.duplicate_of && (
          <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            This exact file is already in your library.
            <Link className="font-medium underline" to={`/books/${upload.duplicate_of}`}>
              View it
            </Link>
          </p>
        )}
        {upload.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
            Processing problem: {upload.error}
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* Candidates */}
        <div className="min-w-0 space-y-4">
          <LookupPanel
            initial={{
              isbn: upload.extracted.isbns?.[0] ?? "",
              title: upload.extracted.title ?? "",
              author: upload.extracted.authors?.[0] ?? "",
            }}
            onSearch={relookup}
          />

          <div className="space-y-2" role="radiogroup" aria-label="Metadata matches">
            <p className="text-sm font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">
              {upload.candidates.length ? `${upload.candidates.length} matches` : "No online matches"}
            </p>
            <div className="pb-2">
              <ProviderStatusList providers={upload.extracted.lookup} />
            </div>
            {choices.map((c, i) => (
              <button
                key={i}
                role="radio"
                aria-checked={selected === i}
                onClick={() => choose(i)}
                className={`card flex w-full gap-3 p-3 text-left transition ${
                  selected === i ? "border-brand-500 ring-2 ring-brand-500/30 dark:border-brand-500" : "hover:border-ink-300 dark:hover:border-ink-700"
                }`}
              >
                <BookCover src={coverSrc(c)} title={c.title} className="w-14 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium">{c.title || "Untitled"}</p>
                  <p className="truncate text-xs text-ink-500 dark:text-ink-400">{c.authors.join(", ") || "Unknown author"}</p>
                  <p className="mt-1 truncate text-xs text-ink-400">
                    {[c.publisher, year(c.published_date), c.isbn13].filter(Boolean).join(" · ")}
                  </p>
                  <span className="badge mt-1.5 bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                    {SOURCE_LABELS[c.source ?? ""] ?? c.source}
                  </span>
                </div>
                {selected === i && <Check className="h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400" />}
              </button>
            ))}
          </div>
        </div>

        {/* Editor */}
        <div className="card p-4 sm:p-6">
          <div className="mb-6 flex gap-4">
            <BookCover src={coverSrc(meta)} title={meta.title} author={meta.authors[0]} className="w-24 shrink-0 sm:w-28" />
            <div className="min-w-0">
              <p className="label">Will be stored as</p>
              <p className="break-all font-mono text-sm">{filename}</p>
              {meta.source_url && (
                <a href={meta.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline dark:text-brand-400">
                  View on {SOURCE_LABELS[meta.source ?? ""] ?? "source"} <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
          <MetadataForm value={meta} onChange={setMeta} seriesSuggestions={choices.map((c) => c.series ?? "")} />
          <div className="sticky bottom-20 mt-6 flex flex-col-reverse gap-2 border-t border-ink-100 bg-white pt-4 sm:bottom-0 sm:flex-row sm:justify-end dark:border-ink-800 dark:bg-ink-900">
            <button className="btn-ghost text-red-600 dark:text-red-400" onClick={discard}>
              Discard
            </button>
            <button className="btn-primary" onClick={confirm} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Confirm &amp; store
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
