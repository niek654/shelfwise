import { FormEvent, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, Shield, Trash2, UserPlus } from "lucide-react";
import { api, User } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";

export default function Admin() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState({ username: "", email: "", password: "", is_admin: false });
  const [busy, setBusy] = useState(false);

  const load = () => api<User[]>("/api/users").then(setUsers);
  useEffect(() => {
    if (me?.is_admin) load();
  }, [me]);

  if (!me?.is_admin) return <Navigate to="/" replace />;

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/users", { method: "POST", json: form });
      toast(`Created ${form.username}`);
      setForm({ username: "", email: "", password: "", is_admin: false });
      load();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const patch = async (u: User, body: Partial<User>) => {
    try {
      await api(`/api/users/${u.id}`, { method: "PATCH", json: body });
      load();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  const remove = async (u: User) => {
    if (!confirm(`Delete ${u.username} and all of their books? This cannot be undone.`)) return;
    try {
      await api(`/api/users/${u.id}`, { method: "DELETE" });
      toast(`Deleted ${u.username}`);
      load();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <h1 className="font-serif text-2xl font-semibold sm:text-3xl">Users</h1>

      <form onSubmit={create} className="card grid gap-3 p-4 sm:grid-cols-2 sm:p-6">
        <h2 className="flex items-center gap-2 font-medium sm:col-span-2">
          <UserPlus className="h-4 w-4" /> Add user
        </h2>
        <input className="input" placeholder="Username" required minLength={3} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <input className="input" type="email" placeholder="Email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="input" type="password" placeholder="Password (min. 8)" required minLength={8} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 rounded accent-brand-600" checked={form.is_admin} onChange={(e) => setForm({ ...form, is_admin: e.target.checked })} />
            Administrator
          </label>
          <button className="btn-primary" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create
          </button>
        </div>
      </form>

      <ul className="card divide-y divide-ink-100 dark:divide-ink-800">
        {users.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold uppercase text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
              {u.username[0]}
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-medium">
                {u.username}
                {u.is_admin && <Shield className="h-3.5 w-3.5 text-brand-500" aria-label="Administrator" />}
                {!u.is_active && <span className="badge bg-ink-100 text-ink-500 dark:bg-ink-800">Disabled</span>}
              </p>
              <p className="truncate text-xs text-ink-500 dark:text-ink-400">{u.email}</p>
            </div>
            {u.id !== me.id && (
              <div className="flex items-center gap-1">
                <button className="btn-ghost text-xs" onClick={() => patch(u, { is_admin: !u.is_admin })}>
                  {u.is_admin ? "Remove admin" : "Make admin"}
                </button>
                <button className="btn-ghost text-xs" onClick={() => patch(u, { is_active: !u.is_active })}>
                  {u.is_active ? "Disable" : "Enable"}
                </button>
                <button className="btn-ghost h-9 w-9 p-0 text-red-600 dark:text-red-400" onClick={() => remove(u)} aria-label={`Delete ${u.username}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
