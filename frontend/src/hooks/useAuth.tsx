import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setUnauthorizedHandler, tokenStore } from "@/lib/api";
import type { User } from "@/lib/types";

interface AuthCtx {
  user: User | null; loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  demo: () => Promise<void>;
  logout: () => void;
  setUser: (u: User) => void;
  refresh: () => Promise<void>;
}
const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(!!tokenStore.get());

  const logout = useCallback(() => { tokenStore.clear(); setUser(null); }, []);
  const refresh = useCallback(async () => { try { setUser(await api.auth.me()); } catch { /* handled by 401 handler */ } }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!tokenStore.get()) return;
    api.auth.me().then(setUser).catch(() => tokenStore.clear()).finally(() => setLoading(false));
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const accept = (t: { access_token: string; user: User }) => { tokenStore.set(t.access_token); setUser(t.user); };
  const value = useMemo<AuthCtx>(() => ({
    user, loading, logout, refresh, setUser,
    login: async (email, password) => accept(await api.auth.login({ email, password })),
    register: async (name, email, password) => accept(await api.auth.register({ name, email, password })),
    demo: async () => accept(await api.auth.demo()),
  }), [user, loading, logout, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
