import { useState } from "react";
import { Check } from "lucide-react";
import { BookMetadata, SOURCE_LABELS } from "../lib/api";

export interface CoverOption {
  /** Value stored in the form's cover_url ("embedded", a URL, or null to keep the current cover). */
  value: string | null;
  /** Image to display. */
  src: string;
  label: string;
}

/** Distinct covers offered by metadata matches, labelled with the source that supplied them. */
export function coverOptions(candidates: BookMetadata[]): CoverOption[] {
  const seen = new Map<string, CoverOption>();
  // Name covers after the source that supplied them, not the merged "Combined" record.
  const ordered = [...candidates.filter((c) => c.source !== "combined"), ...candidates.filter((c) => c.source === "combined")];
  for (const c of ordered) {
    if (c.cover_url && c.cover_url !== "embedded" && !seen.has(c.cover_url)) {
      seen.set(c.cover_url, { value: c.cover_url, src: c.cover_url, label: SOURCE_LABELS[c.source ?? ""] ?? c.source ?? "Online" });
    }
  }
  return [...seen.values()];
}

function Thumb({ option, selected, onPick }: { option: CoverOption; selected: boolean; onPick: () => void }) {
  const [size, setSize] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      className={`w-20 shrink-0 rounded-lg p-1 text-left transition sm:w-24 ${
        selected ? "bg-brand-50 ring-2 ring-brand-500 dark:bg-brand-500/10" : "hover:bg-ink-100 dark:hover:bg-ink-800"
      }`}
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded bg-ink-200 dark:bg-ink-800">
        <img
          src={option.src}
          alt={`Cover from ${option.label}`}
          className="h-full w-full object-cover"
          onLoad={(e) => setSize(`${e.currentTarget.naturalWidth}×${e.currentTarget.naturalHeight}`)}
          onError={() => setFailed(true)}
        />
        {selected && (
          <span className="absolute right-1 top-1 rounded-full bg-brand-600 p-0.5 text-white">
            <Check className="h-3 w-3" />
          </span>
        )}
      </div>
      <p className="mt-1 truncate text-[11px] font-medium">{option.label}</p>
      <p className="text-[10px] text-ink-400">{size ?? "…"}</p>
    </button>
  );
}

export default function CoverPicker({
  options,
  value,
  onChange,
}: {
  options: CoverOption[];
  value: string | null | undefined;
  onChange: (value: string | null) => void;
}) {
  if (options.length < 2) return null;
  return (
    <div>
      <p className="label">Cover · choose from {options.length} sources</p>
      <div className="-mx-1 flex gap-2 overflow-x-auto pb-1">
        {options.map((o) => (
          <Thumb key={o.value ?? "current"} option={o} selected={(value ?? null) === o.value} onPick={() => onChange(o.value)} />
        ))}
      </div>
    </div>
  );
}
