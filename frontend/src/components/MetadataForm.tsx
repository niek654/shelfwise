import { ReactNode, useEffect, useRef, useState } from "react";
import { ChevronDown, Wand2 } from "lucide-react";
import { BookMetadata, SOURCE_LABELS } from "../lib/api";
import SeriesInput from "./SeriesInput";

interface Props {
  value: BookMetadata;
  onChange: (value: BookMetadata) => void;
  /** Online matches. Each field then offers the values the other sources have, so a record can be combined by hand. */
  alternatives?: BookMetadata[];
}

type FieldKey =
  | "title" | "subtitle" | "authors" | "published_date" | "publisher" | "language" | "page_count"
  | "isbn13" | "isbn10" | "doi" | "series" | "series_index" | "categories" | "description";

const COMBINABLE: FieldKey[] = [
  "title", "subtitle", "authors", "published_date", "publisher", "language", "page_count",
  "isbn13", "isbn10", "doi", "series", "series_index", "categories", "description",
];

interface Alternative {
  display: string;
  value: BookMetadata[FieldKey];
  sources: string[];
}

function display(v: unknown): string {
  if (Array.isArray(v)) return v.join(", ");
  return v === null || v === undefined ? "" : String(v);
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Distinct values for a field across the matches, excluding the one already in the form. */
function alternativesFor(key: FieldKey, current: BookMetadata, matches: BookMetadata[]): Alternative[] {
  const byValue = new Map<string, Alternative>();
  const currentKey = norm(display(current[key]));
  for (const m of matches) {
    const shown = display(m[key]);
    const k = norm(shown);
    if (!k || k === currentKey) continue;
    const label = SOURCE_LABELS[m.source ?? ""] ?? m.source ?? "";
    const existing = byValue.get(k);
    if (existing) {
      if (label && !existing.sources.includes(label)) existing.sources.push(label);
    } else {
      byValue.set(k, { display: shown, value: m[key], sources: label ? [label] : [] });
    }
  }
  return [...byValue.values()];
}

function AltMenu({ options, onPick }: { options: Alternative[]; onPick: (a: Alternative) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={box} className="absolute right-0 top-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="inline-flex items-center gap-0.5 rounded px-1 text-[11px] font-medium text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10"
      >
        {options.length} other {options.length === 1 ? "value" : "values"}
        <ChevronDown className={`h-3 w-3 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="absolute right-0 z-30 mt-1 max-h-80 w-80 max-w-[calc(100vw-3rem)] overflow-auto rounded-lg border border-ink-200 bg-white py-1 shadow-lg dark:border-ink-700 dark:bg-ink-900">
          {options.map((o) => (
            <li key={o.display}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left hover:bg-brand-50 dark:hover:bg-brand-500/10"
                onClick={() => {
                  onPick(o);
                  setOpen(false);
                }}
              >
                <span className="line-clamp-3 text-sm">{o.display}</span>
                <span className="mt-0.5 block text-[11px] text-ink-400">{o.sources.join(", ")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Defined at module level: a component declared inside the form would remount its inputs on every keystroke.
function Field({
  label,
  alts = [],
  onPick,
  children,
  className = "",
}: {
  label: string;
  alts?: Alternative[];
  onPick?: (a: Alternative) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <label className="block">
        <span className={`label ${alts.length ? "pr-28" : ""}`}>{label}</span>
        {children}
      </label>
      {onPick && alts.length > 0 && <AltMenu options={alts} onPick={onPick} />}
    </div>
  );
}

const list = (s: string) => s.split(/[;,]/).map((x) => x.trim()).filter(Boolean);

/** Editable metadata form shared by the upload review and the book editor. */
export default function MetadataForm({ value, onChange, alternatives = [] }: Props) {
  const set = <K extends keyof BookMetadata>(key: K, v: BookMetadata[K]) => onChange({ ...value, [key]: v });
  const text = (key: keyof BookMetadata) => ({
    value: (value[key] as string | null | undefined) ?? "",
    onChange: (e: { target: { value: string } }) => set(key, (e.target.value || null) as never),
  });

  const alts = (field: FieldKey) => ({
    alts: alternativesFor(field, value, alternatives),
    onPick: (a: Alternative) => set(field, a.value as never),
  });

  // Empty fields that at least one match can fill.
  const fillable = COMBINABLE.filter((k) => !display(value[k]).trim() && alternatives.some((m) => display(m[k]).trim()));
  const fillEmpty = () => {
    const next = { ...value };
    for (const k of fillable) {
      const source = alternatives.find((m) => display(m[k]).trim());
      if (source) (next as Record<string, unknown>)[k] = source[k];
    }
    onChange(next);
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
      {fillable.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm sm:col-span-6 dark:bg-brand-500/10">
          <span className="text-brand-800 dark:text-brand-200">
            {fillable.length} empty {fillable.length === 1 ? "field" : "fields"} can be filled from other matches.
          </span>
          <button type="button" className="btn-secondary py-1 text-xs" onClick={fillEmpty}>
            <Wand2 className="h-3.5 w-3.5" /> Fill empty fields
          </button>
        </div>
      )}
      <Field label="Title *" {...alts("title")} className="sm:col-span-6">
        <input className="input" required value={value.title} onChange={(e) => set("title", e.target.value)} />
      </Field>
      <Field label="Subtitle" {...alts("subtitle")} className="sm:col-span-6">
        <input className="input" {...text("subtitle")} />
      </Field>
      <Field label="Authors (comma separated)" {...alts("authors")} className="sm:col-span-4">
        <input
          className="input"
          defaultValue={value.authors.join(", ")}
          key={value.authors.join("|")}
          onBlur={(e) => set("authors", list(e.target.value))}
        />
      </Field>
      <Field label="Published" {...alts("published_date")} className="sm:col-span-2">
        <input className="input" placeholder="YYYY or YYYY-MM-DD" {...text("published_date")} />
      </Field>
      <Field label="Publisher" {...alts("publisher")} className="sm:col-span-3">
        <input className="input" {...text("publisher")} />
      </Field>
      <Field label="Language" {...alts("language")} className="sm:col-span-1">
        <input className="input" placeholder="en" {...text("language")} />
      </Field>
      <Field label="Pages" {...alts("page_count")} className="sm:col-span-2">
        <input
          className="input"
          type="number"
          min={0}
          value={value.page_count ?? ""}
          onChange={(e) => set("page_count", e.target.value ? Number(e.target.value) : null)}
        />
      </Field>
      <Field label="ISBN-13" {...alts("isbn13")} className="sm:col-span-2">
        <input className="input font-mono" inputMode="numeric" {...text("isbn13")} />
      </Field>
      <Field label="ISBN-10" {...alts("isbn10")} className="sm:col-span-2">
        <input className="input font-mono" {...text("isbn10")} />
      </Field>
      <Field label="DOI" {...alts("doi")} className="sm:col-span-2">
        <input className="input font-mono" {...text("doi")} />
      </Field>
      <Field label="Series" className="sm:col-span-4">
        <SeriesInput
          value={value.series ?? ""}
          suggestions={alternatives.map((m) => m.series ?? "")}
          onChange={(series, nextIndex) =>
            // Picking a known series suggests the next number in it, unless one is already set.
            onChange({ ...value, series, series_index: value.series_index || nextIndex || null })
          }
        />
      </Field>
      <Field label="# in series" {...alts("series_index")} className="sm:col-span-2">
        <input className="input" {...text("series_index")} />
      </Field>
      <Field label="Categories (comma separated)" {...alts("categories")} className="sm:col-span-6">
        <input
          className="input"
          defaultValue={value.categories.join(", ")}
          key={value.categories.join("|")}
          onBlur={(e) => set("categories", list(e.target.value))}
        />
      </Field>
      <Field label="Cover image URL" className="sm:col-span-6">
        <input className="input" placeholder="https://…" {...text("cover_url")} />
      </Field>
      <Field label="Description" {...alts("description")} className="sm:col-span-6">
        <textarea className="input min-h-[120px]" {...text("description")} />
      </Field>
    </div>
  );
}

/** Apply a match to the form, keeping current values for fields the match leaves empty. */
export function applyMatch(current: BookMetadata, match: BookMetadata): BookMetadata {
  const next = { ...current, source: match.source, source_id: match.source_id, source_url: match.source_url };
  for (const [k, v] of Object.entries(match)) {
    if (display(v).trim()) (next as Record<string, unknown>)[k] = v;
  }
  return next;
}

/** Client-side preview of the server's filename template. */
export function previewFilename(template: string, meta: BookMetadata, ext: string): string {
  const author = meta.authors[0] || "Unknown Author";
  const fields: Record<string, string> = {
    author,
    authors: meta.authors.slice(0, 3).join(", ") + (meta.authors.length > 3 ? " et al." : "") || author,
    title: meta.title || "Untitled",
    subtitle: meta.subtitle || "",
    year: meta.published_date?.match(/\d{4}/)?.[0] ?? "",
    isbn: meta.isbn13 || meta.isbn10 || "",
    publisher: meta.publisher || "",
    series: meta.series || "",
  };
  const rendered = template
    .replace(/\{(\w+)\}/g, (_, k) => (fields[k] ?? "").replace(/\//g, "-"))
    .replace(/\s*[([]\s*[)\]]/g, "");
  return (
    rendered
      .split("/")
      .filter((p) => p.trim())
      .map((p) => p.replace(/[<>:"\\|?*]/g, "").replace(/\s+/g, " ").trim())
      .join("/") + `.${ext}`
  );
}
