import { useCallback, useEffect, useRef, useState } from "react";

/** 40 Hz binaural beat (200 Hz left / 240 Hz right). Audio only starts after a user gesture. */
export function useBinaural(initialOn: boolean) {
  const [on, setOn] = useState(initialOn);
  const [unlocked, setUnlocked] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const nodes = useRef<{ oscs: OscillatorNode[]; gain: GainNode } | null>(null);

  useEffect(() => {
    if (unlocked) return;
    const unlock = () => setUnlocked(true);
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  }, [unlocked]);

  const stop = useCallback(() => {
    const n = nodes.current; const ctx = ctxRef.current;
    if (!n || !ctx) return;
    nodes.current = null;
    try {
      n.gain.gain.cancelScheduledValues(ctx.currentTime);
      n.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
      window.setTimeout(() => { n.oscs.forEach((o) => { try { o.stop(); } catch { /* already stopped */ } }); n.gain.disconnect(); }, 600);
    } catch { /* ignore */ }
  }, []);

  const start = useCallback(() => {
    if (nodes.current) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = ctxRef.current ?? new AC();
    ctxRef.current = ctx;
    void ctx.resume();
    const merger = ctx.createChannelMerger(2);
    const l = ctx.createOscillator(); const r = ctx.createOscillator();
    l.frequency.value = 200; r.frequency.value = 240;
    l.connect(merger, 0, 0); r.connect(merger, 0, 1);
    const gain = ctx.createGain(); gain.gain.value = 0;
    merger.connect(gain); gain.connect(ctx.destination);
    l.start(); r.start();
    gain.gain.setTargetAtTime(0.06, ctx.currentTime, 0.4);
    nodes.current = { oscs: [l, r], gain };
  }, []);

  useEffect(() => { if (on && unlocked) start(); else stop(); }, [on, unlocked, start, stop]);
  useEffect(() => () => { stop(); window.setTimeout(() => { void ctxRef.current?.close().catch(() => {}); ctxRef.current = null; }, 800); }, [stop]);

  const toggle = useCallback((): boolean => {
    setUnlocked(true);
    const next = !on; setOn(next); return next;
  }, [on]);
  return { on, toggle };
}
