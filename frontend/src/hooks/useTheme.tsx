import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import type { ThemePref } from "@/lib/types";

const KEY = "agama.theme";
const read = (): ThemePref => {
  try { const v = localStorage.getItem(KEY); if (v === "light" || v === "dark" || v === "system") return v; } catch { /* storage blocked */ }
  return "light";                                    // light first, for everyone
};
const systemDark = () => typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;

interface ThemeCtx { pref: ThemePref; resolved: "light" | "dark"; setPref: (p: ThemePref) => void }
const Ctx = createContext<ThemeCtx>({ pref: "light", resolved: "light", setPref: () => undefined });
export const useTheme = () => useContext(Ctx);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, setUser } = useAuth();
  const [pref, setPrefState] = useState<ThemePref>(read);
  const [sysDark, setSysDark] = useState(systemDark);
  const resolved: "light" | "dark" = pref === "system" ? (sysDark ? "dark" : "light") : pref;

  // follow the OS while "system" is selected
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => setSysDark(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // a signed-in user's saved choice wins over this browser's last choice
  const saved = user?.preferences.theme;
  useEffect(() => { if (saved && saved !== pref) setPrefState(saved); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [saved]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark");
    document.documentElement.dataset.theme = resolved;
    try { localStorage.setItem(KEY, pref); } catch { /* ignore */ }
  }, [pref, resolved]);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    if (user && !user.is_demo) api.auth.update({ preferences: { theme: p } }).then(setUser).catch(() => undefined);
  }, [user, setUser]);

  const value = useMemo(() => ({ pref, resolved, setPref }), [pref, resolved, setPref]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
