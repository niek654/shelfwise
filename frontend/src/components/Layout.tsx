import { ReactNode } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Layers, Library, LogOut, Monitor, Moon, Settings, Sun, Upload, Users } from "lucide-react";
import { useAuth } from "../lib/auth";
import { Theme, useTheme } from "../lib/theme";

const THEMES: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Monitor, label: "System" },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const current = THEMES.find((t) => t.value === theme) ?? THEMES[2];
  const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
  const Icon = current.icon;
  return (
    <button
      className="btn-ghost h-9 w-9 p-0"
      onClick={() => setTheme(next.value)}
      title={`Theme: ${current.label} (switch to ${next.label})`}
      aria-label={`Theme: ${current.label}. Switch to ${next.label}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 font-serif text-lg font-semibold tracking-tight ${className}`}>
      <img src="/favicon.svg" alt="" className="h-7 w-7" />
      Shelfwise
    </span>
  );
}

function NavItem({ to, icon: Icon, children }: { to: string; icon: typeof Sun; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] sm:px-3 font-medium transition sm:flex-none sm:flex-row sm:gap-2 sm:text-sm ${
          isActive
            ? "text-brand-600 sm:bg-brand-50 dark:text-brand-400 sm:dark:bg-brand-500/10"
            : "text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-ink-100"
        }`
      }
    >
      <Icon className="h-5 w-5 sm:h-4 sm:w-4" />
      {children}
    </NavLink>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = (
    <>
      <NavItem to="/" icon={Library}>Library</NavItem>
      <NavItem to="/series" icon={Layers}>Series</NavItem>
      <NavItem to="/upload" icon={Upload}>Upload</NavItem>
      {user?.is_admin && <NavItem to="/admin" icon={Users}>Users</NavItem>}
      <NavItem to="/settings" icon={Settings}>Settings</NavItem>
    </>
  );

  return (
    <div className="min-h-screen pb-20 sm:pb-0">
      <header className="sticky top-0 z-30 border-b border-ink-200/80 bg-white/80 backdrop-blur dark:border-ink-800/80 dark:bg-ink-950/80">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link to="/">
            <Logo />
          </Link>
          <nav className="hidden flex-1 items-center gap-1 sm:flex">{nav}</nav>
          <div className="ml-auto flex items-center gap-1">
            <span className="mr-2 hidden text-sm text-ink-500 md:inline dark:text-ink-400">{user?.username}</span>
            <ThemeToggle />
            <button className="btn-ghost h-9 w-9 p-0" onClick={logout} title="Sign out" aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-ink-200 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1.5 backdrop-blur sm:hidden dark:border-ink-800 dark:bg-ink-950/95">
        {nav}
      </nav>
    </div>
  );
}
