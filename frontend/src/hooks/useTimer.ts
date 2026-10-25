import { useCallback, useEffect, useRef, useState } from "react";

/** Count-up session timer based on Date.now deltas (robust to background-tab throttling). */
export function useTimer(initialSeconds: number) {
  const base = useRef(initialSeconds * 1000);
  const startedAt = useRef<number | null>(Date.now());
  const read = useCallback(() => Math.floor((base.current + (startedAt.current ? Date.now() - startedAt.current : 0)) / 1000), []);
  const [elapsed, setElapsed] = useState(initialSeconds);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    const id = setInterval(() => setElapsed(read()), 500);
    return () => clearInterval(id);
  }, [read]);

  const pause = useCallback(() => {
    if (startedAt.current) { base.current += Date.now() - startedAt.current; startedAt.current = null; }
    setRunning(false); setElapsed(read());
  }, [read]);
  const resume = useCallback(() => {
    if (!startedAt.current) startedAt.current = Date.now();
    setRunning(true);
  }, []);
  return { elapsed, running, pause, resume, getElapsed: read };
}
