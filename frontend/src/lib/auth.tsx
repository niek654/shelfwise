import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { api, AppConfig, token, Token, User } from "./api";

interface AuthState {
  user: User | null;
  config: AppConfig | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshConfig: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshConfig = useCallback(async () => {
    setConfig(await api<AppConfig>("/api/config"));
  }, []);

  const loadUser = useCallback(async () => {
    if (!token.get()) return setUser(null);
    try {
      setUser(await api<User>("/api/auth/me"));
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    Promise.all([refreshConfig().catch(() => undefined), loadUser()]).finally(() => setLoading(false));
    const onLogout = () => setUser(null);
    window.addEventListener("shelfwise:logout", onLogout);
    return () => window.removeEventListener("shelfwise:logout", onLogout);
  }, [refreshConfig, loadUser]);

  const login = async (username: string, password: string) => {
    const res = await api<Token>("/api/auth/login", { method: "POST", json: { username, password } });
    token.set(res.access_token);
    await loadUser();
  };

  const register = async (username: string, email: string, password: string) => {
    const res = await api<Token>("/api/auth/register", { method: "POST", json: { username, email, password } });
    token.set(res.access_token);
    await Promise.all([loadUser(), refreshConfig()]);
  };

  const logout = () => {
    token.clear();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, config, loading, login, register, logout, refreshConfig }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
