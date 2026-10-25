import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { Schedule, Task } from "@/lib/types";
import { useAuth } from "./useAuth";

interface Ctx {
  schedule: Schedule | null; loading: boolean; error: string | null;
  refresh: () => Promise<void>;
  /** Replace the cached schedule with a fresh server response (e.g. after reorder). */
  setSchedule: (s: Schedule) => void;
  /** Bumps whenever any block changes; pages with their own lists can depend on it. */
  version: number;
  newBlockOpen: boolean; editing: Task | null; openNewBlock: (task?: Task) => void; closeNewBlock: () => void;
}
const C = createContext<Ctx>(null as unknown as Ctx);
export const useSchedule = () => useContext(C);

export function ScheduleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [schedule, setS] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [newBlockOpen, setOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const refresh = useCallback(async () => {
    try { setS(await api.schedule.today()); setError(null); setVersion((v) => v + 1); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (user) refresh(); }, [user?.id, refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<Ctx>(() => ({
    schedule, loading, error, refresh, version, newBlockOpen, editing,
    setSchedule: (s) => { setS(s); setVersion((v) => v + 1); },
    openNewBlock: (t) => { setEditing(t ?? null); setOpen(true); }, closeNewBlock: () => { setOpen(false); setEditing(null); },
  }), [schedule, loading, error, refresh, version, newBlockOpen, editing]);
  return <C.Provider value={value}>{children}</C.Provider>;
}
