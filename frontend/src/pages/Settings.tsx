import { FormEvent, useState } from "react";
import { Check, Monitor, Moon, Sun, X } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Theme, useTheme } from "../lib/theme";
import { useToast } from "../lib/toast";

export default function Settings() {
  const { user, config } = useAuth();
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  const [pw, setPw] = useState({ current_password: "", new_password: "" });

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
        <ul className="mt-3 space-y-2">
          {config?.providers.map((p) => (
            <li key={p.name} className="flex items-center justify-between text-sm">
              {p.label}
              {p.enabled ? (
                <span className="badge gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                  <Check className="h-3 w-3" /> Enabled
                </span>
              ) : (
                <span className="badge gap-1 bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400">
                  <X className="h-3 w-3" /> Needs API credentials
                </span>
              )}
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
