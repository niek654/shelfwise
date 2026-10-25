import { X } from "lucide-react";
import { Facets } from "../lib/api";

export const FILTER_KEYS = [
  "language", "author", "series", "category", "publisher", "format", "year_from", "year_to", "missing",
] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
export type Filters = Record<FilterKey, string>;

const MISSING: Record<string, string> = {
  cover: "Cover",
  isbn: "ISBN",
  description: "Description",
  series: "Series",
  language: "Language",
};

const LABELS: Record<FilterKey, string> = {
  language: "Language",
  author: "Author",
  series: "Series",
  category: "Category",
  publisher: "Publisher",
  format: "Format",
  year_from: "From",
  year_to: "Until",
  missing: "Missing",
};

let languageNames: Intl.DisplayNames | null = null;
try {
  // English, like the rest of the interface.
  languageNames = new Intl.DisplayNames(["en"], { type: "language" });
} catch {
  /* very old browsers */
}

export function languageName(code: string): string {
  try {
    const name = languageNames?.of(code);
    return name && name !== code ? name : code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

/** Human-readable value of an active filter, for its chip. */
function chipValue(key: FilterKey, value: string): string {
  if (key === "language") return languageName(value);
  if (key === "format") return value.toUpperCase();
  if (key === "missing") return MISSING[value] ?? value;
  return value;
}

export function activeFilters(filters: Filters): FilterKey[] {
  return FILTER_KEYS.filter((k) => filters[k]);
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; count: number }[];
}) {
  // Keep a filter that came from the URL selectable even if no book currently has it.
  const all = value && !options.some((o) => o.value === value) ? [{ value, label: value, count: 0 }, ...options] : options;
  return (
    <label className="block min-w-0">
      <span className="label">{label}</span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)} disabled={!all.length}>
        <option value="">{all.length ? "Any" : "None in library"}</option>
        {all.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label} ({o.count})
          </option>
        ))}
      </select>
    </label>
  );
}

export function FilterPanel({
  facets,
  filters,
  onChange,
  onClear,
}: {
  facets: Facets | null;
  filters: Filters;
  onChange: (key: FilterKey, value: string) => void;
  onClear: () => void;
}) {
  if (!facets) return null;
  const opts = (list: { value: string; count: number }[], label = (v: string) => v) =>
    list.map((f) => ({ value: f.value, label: label(f.value), count: f.count }));
  const missing = Object.entries(MISSING)
    .map(([value, label]) => ({ value, label, count: facets.missing[value] ?? 0 }))
    .filter((o) => o.count > 0);
  const languages = opts(facets.languages, languageName).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return (
    <div className="card mb-6 grid grid-cols-2 gap-3 p-4 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
      <Select label="Language" value={filters.language} onChange={(v) => onChange("language", v)} options={languages} />
      <Select label="Author" value={filters.author} onChange={(v) => onChange("author", v)} options={opts(facets.authors)} />
      <Select label="Series" value={filters.series} onChange={(v) => onChange("series", v)} options={opts(facets.series)} />
      <Select label="Category" value={filters.category} onChange={(v) => onChange("category", v)} options={opts(facets.categories)} />
      <Select label="Publisher" value={filters.publisher} onChange={(v) => onChange("publisher", v)} options={opts(facets.publishers)} />
      <Select
        label="Format"
        value={filters.format}
        onChange={(v) => onChange("format", v)}
        options={opts(facets.formats, (v) => v.toUpperCase())}
      />
      <div className="col-span-2 min-w-0 md:col-span-1">
        <span className="label">Published</span>
        <div className="flex items-center gap-2">
          <input
            className="input"
            type="number"
            inputMode="numeric"
            placeholder={facets.years ? String(facets.years.min) : "From"}
            aria-label="Published from year"
            value={filters.year_from}
            onChange={(e) => onChange("year_from", e.target.value)}
          />
          <span className="text-ink-400">–</span>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            placeholder={facets.years ? String(facets.years.max) : "Until"}
            aria-label="Published until year"
            value={filters.year_to}
            onChange={(e) => onChange("year_to", e.target.value)}
          />
        </div>
      </div>
      <Select label="Missing metadata" value={filters.missing} onChange={(v) => onChange("missing", v)} options={missing} />
      {activeFilters(filters).length > 0 && (
        <div className="col-span-2 flex items-end md:col-span-3 lg:col-span-4">
          <button className="btn-ghost -ml-2 text-sm" onClick={onClear}>
            <X className="h-4 w-4" /> Clear all filters
          </button>
        </div>
      )}
    </div>
  );
}

export function FilterChips({ filters, onRemove }: { filters: Filters; onRemove: (key: FilterKey) => void }) {
  const active = activeFilters(filters);
  if (!active.length) return null;
  return (
    <div className="-mt-3 mb-6 flex flex-wrap gap-2">
      {active.map((k) => (
        <button
          key={k}
          onClick={() => onRemove(k)}
          className="badge gap-1 bg-brand-50 py-1 pl-2.5 pr-1.5 text-brand-700 hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-300 dark:hover:bg-brand-500/20"
          aria-label={`Remove filter ${LABELS[k]}: ${chipValue(k, filters[k])}`}
        >
          <span className="text-brand-500 dark:text-brand-400">{LABELS[k]}:</span>
          <span className="max-w-[12rem] truncate">{chipValue(k, filters[k])}</span>
          <X className="h-3 w-3" />
        </button>
      ))}
    </div>
  );
}
