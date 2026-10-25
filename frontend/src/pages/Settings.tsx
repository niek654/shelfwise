import { FormEvent, useState } from "react";
import { Check, Monitor, Moon, Power, Sun, X } from "lucide-react";
import { api, Provider } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Theme, useTheme } from "../lib/theme";
import { useToast } from "../lib/toast";

function StatusBadge({ provider: p }: { provider: Provider }) {
  if (!p.enabled) {
    return (
      <span className="badge gap-1 bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400">
        <X className="h-3 w-3" /> Needs API credentials
      </span>
    );
  }
  if (!p.active) {
    return (
      <span className="badge gap-1 bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400">
        <Power className="h-3 w-3" /> Turned off
      </span>
    );
  }
  return (
    <span className="badge gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
      <Check className="h-3 w-3" /> Enabled
    </span>
  );
}

function Switch({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-brand-600" : "bg-ink-300 dark:bg-ink-700"
      }`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`} />
    </button>
  );
}

export default function Settings() {
  const { user, config, refreshConfig } = useAuth();
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const [busy, setBusy] = useState<string | null>(null);

  const toggleProvider = async (name: string, enabled: boolean) => {
    setBusy(name);
    try {
      await api("/api/settings/providers", { method: "PUT", json: { name, enabled } });
      await refreshConfig();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api("/api/auth/me/password", { method: "POST", json: pw });
      setPw({ current_password: "", new_password: "" });
      toast("Password changed");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  const themes: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-serif text-2xl font-semibold sm:text-3xl">Settings</h1>

      <section className="card p-4 sm:p-6">
        <h2 className="font-medium">Appearance</h2>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {themes.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={`flex flex-col items-center gap-2 rounded-lg border p-3 text-sm transition ${
                theme === value
                  ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                  : "border-ink-200 hover:border-ink-300 dark:border-ink-700"
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="card p-4 sm:p-6">
        <h2 className="font-medium">Account</h2>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
          {user?.username} · {user?.email}
          {user?.is_admin && " · Administrator"}
        </p>
        <form onSubmit={changePassword} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input className="input" type="password" placeholder="Current password" autoComplete="current-password" required value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} />
          <input className="input" type="password" placeholder="New password" autoComplete="new-password" minLength={8} required value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} />
          <button className="btn-primary">Change</button>
        </form>
      </section>

      <section className="card p-4 sm:p-6">
        <h2 className="font-medium">Metadata sources</h2>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
          {user?.is_admin ? "Choose which sources are searched for every user." : "Only an administrator can change these."}
        </p>
        <ul className="mt-4 divide-y divide-ink-100 dark:divide-ink-800">
          {config?.providers.map((p) => (
            <li key={p.name} className="flex items-start justify-between gap-3 py-3 text-sm sm:items-center">
              <span className="min-w-0">
                {p.label}
                {/* On phones the status sits under the name; on wider screens next to the switch. */}
                <span className="mt-1 flex sm:hidden">
                  <StatusBadge provider={p} />
                </span>
                {!p.enabled ? (
                  <span className="mt-1 block text-xs text-ink-500 dark:text-ink-400">{p.note}</span>
                ) : (
                  p.active && p.note && <span className="mt-1 block text-xs text-amber-600 dark:text-amber-400">{p.note}</span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="hidden sm:flex">
                  <StatusBadge provider={p} />
                </span>
                <Switch
                  checked={p.active}
                  disabled={!user?.is_admin || !p.enabled || busy === p.name}
                  label={`${p.label} ${p.active ? "on" : "off"}`}
                  onChange={(on) => toggleProvider(p.name, on)}
                />
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-ink-500 dark:text-ink-400">
          File naming template: <code className="font-mono">{config?.filename_template}</code>
        </p>
      </section>

      <p className="text-center text-xs text-ink-400">
        Shelfwise v{config?.version} ·{" "}
        <a className="hover:underline" href="https://github.com/niek654/shelfwise" target="_blank" rel="noreferrer">
          Source on GitHub
        </a>
      </p>
    </div>
  );
}
