import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "../lib/auth";
import { Logo, ThemeToggle } from "../components/Layout";

export default function Login() {
  const { user, config, login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">(config?.needs_setup ? "register" : "login");
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;
  const setup = config?.needs_setup;
  const canRegister = config?.allow_registration;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "login") await login(form.username, form.password);
      else await register(form.username, form.email, form.password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center">
            <Logo className="text-2xl" />
            <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
              {setup ? "Create the first account — it becomes the administrator." : "Your personal digital library."}
            </p>
          </div>
          <form onSubmit={submit} className="card space-y-4 p-6">
            <label className="block">
              <span className="label">{mode === "login" ? "Username or email" : "Username"}</span>
              <input
                className="input"
                autoComplete="username"
                autoFocus
                required
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </label>
            {mode === "register" && (
              <label className="block">
                <span className="label">Email</span>
                <input
                  className="input"
                  type="email"
                  autoComplete="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>
            )}
            <label className="block">
              <span className="label">Password</span>
              <input
                className="input"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={mode === "register" ? 8 : undefined}
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </label>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">{error}</p>}
            <button className="btn-primary w-full" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "login" ? "Sign in" : setup ? "Create admin account" : "Create account"}
            </button>
          </form>
          {canRegister && !setup && (
            <p className="mt-4 text-center text-sm text-ink-500 dark:text-ink-400">
              {mode === "login" ? "No account yet? " : "Already have an account? "}
              <button
                className="font-medium text-brand-600 hover:underline dark:text-brand-400"
                onClick={() => setMode(mode === "login" ? "register" : "login")}
              >
                {mode === "login" ? "Create one" : "Sign in"}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
