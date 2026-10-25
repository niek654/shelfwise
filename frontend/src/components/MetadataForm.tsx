import { ReactNode } from "react";
import { BookMetadata } from "../lib/api";
import SeriesInput from "./SeriesInput";

interface Props {
  value: BookMetadata;
  onChange: (value: BookMetadata) => void;
  /** Series names from online matches, offered in the series dropdown. */
  seriesSuggestions?: string[];
}

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

const list = (s: string) => s.split(/[;,]/).map((x) => x.trim()).filter(Boolean);

/** Editable metadata form shared by the upload review and the book editor. */
export default function MetadataForm({ value, onChange, seriesSuggestions }: Props) {
  const set = <K extends keyof BookMetadata>(key: K, v: BookMetadata[K]) => onChange({ ...value, [key]: v });
  const text = (key: keyof BookMetadata) => ({
    value: (value[key] as string | null | undefined) ?? "",
    onChange: (e: { target: { value: string } }) => set(key, (e.target.value || null) as never),
  });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
      <Field label="Title *" className="sm:col-span-6">
        <input className="input" required value={value.title} onChange={(e) => set("title", e.target.value)} />
      </Field>
      <Field label="Subtitle" className="sm:col-span-6">
        <input className="input" {...text("subtitle")} />
      </Field>
      <Field label="Authors (comma separated)" className="sm:col-span-4">
        <input
          className="input"
          defaultValue={value.authors.join(", ")}
          key={value.authors.join("|")}
          onBlur={(e) => set("authors", list(e.target.value))}
        />
      </Field>
      <Field label="Published" className="sm:col-span-2">
        <input className="input" placeholder="YYYY or YYYY-MM-DD" {...text("published_date")} />
      </Field>
      <Field label="Publisher" className="sm:col-span-3">
        <input className="input" {...text("publisher")} />
      </Field>
      <Field label="Language" className="sm:col-span-1">
        <input className="input" placeholder="en" {...text("language")} />
      </Field>
      <Field label="Pages" className="sm:col-span-2">
        <input
          className="input"
          type="number"
          min={0}
          value={value.page_count ?? ""}
          onChange={(e) => set("page_count", e.target.value ? Number(e.target.value) : null)}
        />
      </Field>
      <Field label="ISBN-13" className="sm:col-span-2">
        <input className="input font-mono" inputMode="numeric" {...text("isbn13")} />
      </Field>
      <Field label="ISBN-10" className="sm:col-span-2">
        <input className="input font-mono" {...text("isbn10")} />
      </Field>
      <Field label="DOI" className="sm:col-span-2">
        <input className="input font-mono" {...text("doi")} />
      </Field>
      <Field label="Series" className="sm:col-span-4">
        <SeriesInput
          value={value.series ?? ""}
          suggestions={seriesSuggestions}
          onChange={(series, nextIndex) =>
            // Picking a known series suggests the next number in it, unless one is already set.
            onChange({ ...value, series, series_index: value.series_index || nextIndex || null })
          }
        />
      </Field>
      <Field label="# in series" className="sm:col-span-2">
        <input className="input" {...text("series_index")} />
      </Field>
      <Field label="Categories (comma separated)" className="sm:col-span-6">
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
      <Field label="Description" className="sm:col-span-6">
        <textarea className="input min-h-[120px]" {...text("description")} />
      </Field>
    </div>
  );
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
