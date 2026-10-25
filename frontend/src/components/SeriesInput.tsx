import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Globe, Library } from "lucide-react";
import { api, SeriesSummary } from "../lib/api";

interface Option {
  name: string;
  detail: string;
  nextIndex: string | null;
  origin: "library" | "online";
}

interface Props {
  value: string;
  onChange: (series: string | null, nextIndex: string | null) => void;
  /** Series names found in the current online matches. */
  suggestions?: string[];
}

/** Text input with a dropdown of series already in the library plus series from online matches. */
export default function SeriesInput({ value, onChange, suggestions = [] }: Props) {
  const [library, setLibrary] = useState<SeriesSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<SeriesSummary[]>("/api/series").then(setLibrary).catch(() => undefined);
  }, []);

  useEffect(() => {
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const options = useMemo(() => {
    const q = value.trim().toLowerCase();
    const known = new Set(library.map((s) => s.name.toLowerCase()));
    const all: Option[] = [
      ...library.map((s) => ({
        name: s.name,
        detail: `${s.count} book${s.count === 1 ? "" : "s"}${s.authors[0] ? ` · ${s.authors[0]}` : ""}`,
        nextIndex: s.next_index,
        origin: "library" as const,
      })),
      ...[...new Set(suggestions.filter(Boolean))]
        .filter((n) => !known.has(n.toLowerCase()))
        .map((n) => ({ name: n, detail: "From online matches", nextIndex: null, origin: "online" as const })),
    ];
    return q ? all.filter((o) => o.name.toLowerCase().includes(q)) : all;
  }, [library, suggestions, value]);

  const pick = (o: Option) => {
    onChange(o.name, o.nextIndex);
    setOpen(false);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && open && options[active]) {
      e.preventDefault();
      pick(options[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={box} className="relative">
      <input
        className="input pr-9"
        value={value}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={library.length ? "Pick or type a series" : undefined}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        onChange={(e) => {
          onChange(e.target.value || null, null);
          setOpen(true);
          setActive(0);
        }}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Show series"
        onClick={() => setOpen(!open)}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-ink-400"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      {open && options.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-ink-200 bg-white py-1 shadow-lg dark:border-ink-700 dark:bg-ink-900"
        >
          {options.map((o, i) => {
            const Icon = o.origin === "library" ? Library : Globe;
            return (
              <li
                key={`${o.origin}-${o.name}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm ${
                  i === active ? "bg-brand-50 dark:bg-brand-500/10" : ""
                }`}
              >
                <Icon className="h-4 w-4 shrink-0 text-ink-400" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{o.name}</span>
                  <span className="block truncate text-xs text-ink-400">{o.detail}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
