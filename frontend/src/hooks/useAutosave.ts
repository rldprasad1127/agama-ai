import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export type SaveState = "idle" | "saving" | "saved" | "unsaved" | "error";
export interface WorkState { content: string; notes: string; checklistDone: number[]; hintsUsed: number }

/** Debounced (2.5s) draft autosave + periodic elapsed persistence + flush on unmount / page hide. */
export function useAutosave(taskId: string, work: WorkState, getElapsed: () => number, enabled: boolean) {
  const [state, setState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const latest = useRef(work); latest.current = work;
  const enabledRef = useRef(enabled); enabledRef.current = enabled;
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const inflight = useRef<Promise<void> | null>(null);

  const save = useCallback(async () => {
    if (!enabledRef.current) return;
    window.clearTimeout(timer.current);
    const w = latest.current;
    setState("saving");
    const p = api.focus.saveDraft(taskId, { content: w.content, notes: w.notes, checklist_done: w.checklistDone, hints_used: w.hintsUsed, elapsed_seconds: getElapsed() })
      .then(() => { dirty.current = false; setSavedAt(Date.now()); setState("saved"); })
      .catch(() => setState("error"))
      .finally(() => { inflight.current = null; });
    inflight.current = p;
    await p;
  }, [taskId, getElapsed]);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    dirty.current = true; setState("unsaved");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void save(); }, 2500);
    return () => window.clearTimeout(timer.current);
  }, [work.content, work.notes, work.checklistDone, work.hintsUsed, save]);

  useEffect(() => {
    const iv = window.setInterval(() => { if (enabledRef.current) void save(); }, 30000);
    const hide = () => { if (dirty.current && enabledRef.current) void save(); };
    window.addEventListener("pagehide", hide);
    window.addEventListener("beforeunload", hide);
    return () => {
      window.clearInterval(iv);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("beforeunload", hide);
      if (dirty.current && enabledRef.current) void save();
    };
  }, [save]);

  return { state, savedAt, save };
}
