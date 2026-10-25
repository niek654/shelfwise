import { ProviderStatus } from "../lib/api";

const STYLES: Record<ProviderStatus["status"], string> = {
  ok: "bg-emerald-500",
  no_results: "bg-ink-300 dark:bg-ink-600",
  error: "bg-red-500",
  disabled: "bg-ink-200 dark:bg-ink-700",
};

/** Shows what each metadata source returned, so empty results are explainable. */
export default function ProviderStatusList({ providers }: { providers?: ProviderStatus[] }) {
  if (!providers?.length) return null;
  return (
    <ul className="space-y-1.5 text-xs">
      {providers.map((p) => (
        <li key={p.name} className="flex items-start gap-2">
          <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${STYLES[p.status]}`} aria-hidden />
          {/* Inline text so the message wraps under the label on narrow screens. */}
          <span className="min-w-0 [overflow-wrap:anywhere]">
            <span className="font-medium">{p.label}</span>{" "}
            <span className={p.status === "error" ? "text-red-600 dark:text-red-400" : "text-ink-500 dark:text-ink-400"}>
              {p.status === "disabled" ? `Off${p.message ? ` · ${p.message}` : ""}` : p.message}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
