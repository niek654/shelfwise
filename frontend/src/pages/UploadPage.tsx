import { DragEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronRight, CloudUpload, FileText, Loader2, Trash2 } from "lucide-react";
import { api, formatBytes, Upload, uploadFiles } from "../lib/api";
import { useToast } from "../lib/toast";

const ACCEPT = ".epub,.pdf,.mobi,.azw,.azw3,.fb2,.djvu,.cbz,.cbr,.txt,.rtf,.docx";

const STEPS = ["Upload", "Process", "Metadata", "Confirm", "Store"];

export function Steps({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-1 overflow-x-auto text-xs font-medium sm:gap-2">
      {STEPS.map((s, i) => (
        <li key={s} className="flex shrink-0 items-center gap-1 sm:gap-2">
          <span
            className={`flex h-6 items-center gap-1.5 rounded-full px-2.5 ${
              i < current
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                : i === current
                  ? "bg-brand-600 text-white"
                  : "bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400"
            }`}
          >
            {i + 1}. {s}
          </span>
          {i < STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-ink-300 dark:text-ink-600" />}
        </li>
      ))}
    </ol>
  );
}

export default function UploadPage() {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const refresh = useCallback(() => api<Upload[]>("/api/uploads").then(setUploads), []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll while anything is still being processed.
  useEffect(() => {
    if (!uploads.some((u) => u.status === "processing")) return;
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, [uploads, refresh]);

  const send = async (files: File[]) => {
    if (!files.length) return;
    setProgress(0);
    try {
      await uploadFiles(files, setProgress);
      toast(`${files.length} file${files.length > 1 ? "s" : ""} uploaded — processing…`);
      await refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    send(Array.from(e.dataTransfer.files));
  };

  const discard = async (u: Upload) => {
    await api(`/api/uploads/${u.id}`, { method: "DELETE" });
    toast(`Discarded ${u.original_filename}`);
    refresh();
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-serif text-2xl font-semibold sm:text-3xl">Add books</h1>
      <div className="mb-6 mt-3">
        <Steps current={progress !== null ? 0 : uploads.length ? 3 : 0} />
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => progress === null && input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        className={`card flex cursor-pointer flex-col items-center border-2 border-dashed px-6 py-12 text-center transition ${
          dragging ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-ink-300 hover:border-brand-400 dark:border-ink-700"
        }`}
      >
        {progress !== null ? (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-brand-500" />
            <p className="mt-4 font-medium">Uploading… {Math.round(progress * 100)}%</p>
            <div className="mt-3 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800">
              <div className="h-full bg-brand-500 transition-all" style={{ width: `${progress * 100}%` }} />
            </div>
          </>
        ) : (
          <>
            <CloudUpload className="h-10 w-10 text-brand-500" />
            <p className="mt-4 font-medium">
              <span className="hidden sm:inline">Drop files here or </span>
              <span className="text-brand-600 dark:text-brand-400">browse</span>
            </p>
            <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">EPUB, PDF, MOBI, AZW3, FB2, DJVU, CBZ and more</p>
          </>
        )}
        <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => send(Array.from(e.target.files ?? []))} />
      </div>

      {uploads.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">Waiting for review</h2>
          <ul className="card divide-y divide-ink-100 dark:divide-ink-800">
            {uploads.map((u) => {
              const best = u.candidates[0];
              return (
                <li key={u.id} className="flex items-center gap-3 p-3 sm:p-4">
                  <FileText className="h-8 w-8 shrink-0 text-ink-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{best?.title || u.extracted.title || u.original_filename}</p>
                    <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                      {u.original_filename} · {formatBytes(u.file_size)}
                    </p>
                    {u.duplicate_of && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-3 w-3" /> Already in your library
                      </p>
                    )}
                  </div>
                  {u.status === "processing" ? (
                    <span className="badge gap-1 bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                      <Loader2 className="h-3 w-3 animate-spin" /> Processing
                    </span>
                  ) : (
                    <>
                      <span className="badge hidden bg-emerald-100 text-emerald-700 sm:inline-flex dark:bg-emerald-500/15 dark:text-emerald-400">
                        {u.candidates.length ? `${u.candidates.length} matches` : "No matches"}
                      </span>
                      <button className="btn-ghost h-9 w-9 p-0" onClick={() => discard(u)} aria-label="Discard">
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <Link to={`/upload/${u.id}`} className="btn-primary">
                        Review
                      </Link>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
