import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useRecorder } from "@/hooks/useRecorder";
import { cx, fmtClock } from "@/lib/utils";
import { Markdown } from "./Markdown";
import { Checklist } from "./Checklist";
import type { WorkProps } from "./types";

const FILLERS = /\b(um+|uh+|er+m?|hmm+|basically|literally|honestly|you know)\b/gi;
const WORDS = /[A-Za-z0-9'’-]+/g;

function Spectrum({ getFreq, active }: { getFreq: () => Uint8Array | null; active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const g = c.getContext("2d"); if (!g) return;
    let raf = 0;
    const draw = () => {
      const w = c.width, h = c.height; g.clearRect(0, 0, w, h);
      const f = active ? getFreq() : null; const n = 48; const bw = w / n;
      for (let i = 0; i < n; i++) {
        const v = f ? f[Math.floor((i / n) * f.length * 0.6)] / 255 : 0.04;
        const bh = Math.max(3, v * h);
        g.fillStyle = `rgba(${99 + Math.round(v * 60)},102,241,${0.35 + v * 0.65})`;
        g.fillRect(i * bw + 1, h - bh, bw - 2, bh);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [getFreq, active]);
  return <canvas ref={ref} width={640} height={120} className="w-full h-28 rounded-lg bg-surface-container-low" aria-label="Audio spectrum" />;
}

export function SpeechWorkspace({ task, content, setContent, checklistDone, setChecklistDone, metaRef }: WorkProps) {
  const contentRef = useRef(content); contentRef.current = content;
  const rec = useRecorder((t) => setContent((contentRef.current ? contentRef.current + " " : "") + t));
  const [manualSeconds, setManualSeconds] = useState(60);
  const [speed, setSpeed] = useState<0 | 1 | 1.5 | 2>(0);
  const [fontSize, setFontSize] = useState(15);
  const script = useRef<HTMLDivElement>(null);
  const targetWpm = task.target_wpm || 135;
  const cap = 180;

  const recorded = rec.status !== "idle";
  const seconds = recorded ? rec.seconds : manualSeconds;
  const words = useMemo(() => (content.match(WORDS) || []).length, [content]);
  const fillers = useMemo(() => (content.match(FILLERS) || []).length, [content]);
  const wpm = seconds > 3 ? Math.round(words / (seconds / 60)) : 0;
  const scriptWords = useMemo(() => (task.prompt_context.match(WORDS) || []).length, [task.prompt_context]);

  useEffect(() => {
    metaRef.current.duration_seconds = Math.round(seconds);
    metaRef.current.speaking_seconds = recorded ? Math.round(rec.speaking * 10) / 10 : undefined;
  }, [seconds, rec.speaking, recorded, metaRef]);

  useEffect(() => {
    if (!speed) return;
    const id = setInterval(() => { script.current?.scrollBy({ top: speed * 1.1 }); }, 40);
    return () => clearInterval(id);
  }, [speed]);

  const live = rec.status === "recording";
  const paceOk = wpm === 0 ? null : Math.abs(wpm - targetWpm) <= targetWpm * 0.15;

  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2">
      <section className="flex flex-col min-h-0 bg-surface-container-lowest border-r border-outline-variant/40">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-surface-container flex-wrap">
          <span className="font-semibold flex items-center gap-1.5"><Icon name="description" className="text-primary text-[18px]" />Dialogue &amp; Pitch Script</span>
          <div className="ml-auto flex items-center gap-1 font-label-code text-label-code">
            <span className="text-on-surface-variant mr-1">SCROLL:</span>
            {([0, 1, 1.5, 2] as const).map((s) => <button key={s} onClick={() => setSpeed(s)} aria-pressed={speed === s} className={cx("px-2 py-1 rounded", speed === s ? "bg-primary-container text-on-primary-container" : "hover:bg-surface-container")}>{s === 0 ? "off" : `${s}x`}</button>)}
          </div>
        </div>
        <div ref={script} className="flex-1 overflow-y-auto p-6" style={{ fontSize }}>
          {task.prompt_context ? <Markdown className="!text-[1em] !leading-[1.7]">{task.prompt_context}</Markdown> : <p className="text-on-surface-variant">No script yet — regenerate this block with AI from the dashboard.</p>}
          {task.checklist.length > 0 && <div className="mt-6 text-[14px]"><Checklist title="Key points to land" items={task.checklist} done={checklistDone} onChange={setChecklistDone} /></div>}
        </div>
        <div className="flex items-center justify-between px-4 py-2 border-t border-surface-container font-label-code text-label-code text-on-surface-variant">
          <span>Reading speed: ~{targetWpm} WPM · Script: {scriptWords} words</span>
          <span className="flex items-center gap-1"><button aria-label="Smaller text" onClick={() => setFontSize((f) => Math.max(12, f - 1))} className="p-1 hover:bg-surface-container rounded"><Icon name="text_decrease" className="text-[18px]" /></button>
            <button aria-label="Larger text" onClick={() => setFontSize((f) => Math.min(28, f + 1))} className="p-1 hover:bg-surface-container rounded"><Icon name="text_increase" className="text-[18px]" /></button></span>
        </div>
      </section>

      <section className="flex flex-col min-h-0 bg-surface overflow-y-auto p-5 gap-4">
        <div className="grid grid-cols-3 gap-3">
          <Metric icon="timer" label="Duration / cap" value={`${fmtClock(seconds)} / ${fmtClock(cap)}`} warn={seconds > cap} />
          <Metric icon="graphic_eq" label="Pitch pacing" value={`${wpm || "—"} WPM`} sub={`Target ${targetWpm}`} warn={paceOk === false} ok={paceOk === true} />
          <Metric icon="record_voice_over" label="Filler words" value={String(fillers)} sub={fillers ? "detected" : "none yet"} warn={fillers > 3} />
        </div>

        <div className="rounded-xl bg-surface-container-lowest border border-outline-variant/50 p-4 flex flex-col items-center gap-3">
          <div className="w-full flex items-center justify-between font-label-micro text-label-micro uppercase text-on-surface-variant"><span>Live master recording</span><span>{rec.status === "idle" ? "Ready" : rec.status}</span></div>
          <button onClick={() => (live ? rec.pause() : rec.start())} aria-label={live ? "Pause recording" : "Start recording"}
            className={cx("w-28 h-28 rounded-full flex flex-col items-center justify-center shadow-md transition-colors", live ? "bg-error text-on-error animate-pulse" : "bg-primary-container text-on-primary-container hover:bg-primary")}>
            <Icon name={live ? "pause" : "mic"} className="text-[40px]" fill /><span className="font-label-micro text-label-micro mt-0.5">{live ? "REC LIVE" : rec.status === "paused" ? "RESUME" : "START"}</span></button>
          <Spectrum getFreq={rec.getFreq} active={live} />
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <button disabled={rec.status !== "recording" && rec.status !== "paused"} onClick={rec.stop} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary-container text-on-secondary-container font-semibold text-body-sm disabled:opacity-40"><Icon name="check_circle" className="text-[16px]" />Stop &amp; Save Take</button>
            <button disabled={rec.status === "idle"} onClick={rec.discard} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container font-semibold text-body-sm disabled:opacity-40"><Icon name="restart_alt" className="text-[16px]" />Discard / Re-record</button>
          </div>
          {rec.audioUrl && <audio controls src={rec.audioUrl} className="w-full h-10" aria-label="Preview of your take" />}
          {rec.micError && <Notice>{rec.micError}</Notice>}
          {!rec.micError && rec.srError && <Notice>{rec.srError}</Notice>}
          {!rec.srSupported && <Notice>Live transcription isn't supported by this browser (Chrome/Edge/Safari support it). Record if you like, then type or paste what you said below — the AI evaluates the transcript.</Notice>}
        </div>

        <div className="rounded-xl bg-surface-container-lowest border border-outline-variant/50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 border-b border-surface-container font-label-micro text-label-micro uppercase text-on-surface-variant">
            <span className="flex items-center gap-1.5"><Icon name="neurology" className="text-primary text-[16px]" />Transcript (editable)</span><span>{words} words</span></div>
          <textarea aria-label="Transcript" value={content} onChange={(e) => setContent(e.target.value)} placeholder="Your words appear here as you speak. Fix any recognition mistakes before you submit." className="min-h-[140px] resize-y bg-transparent p-4 outline-none text-body-md leading-6" />
          {rec.interim && <div className="px-4 pb-3 text-body-md text-outline italic">{rec.interim}…</div>}
          {!recorded && (
            <label className="flex items-center gap-2 px-4 py-2 border-t border-surface-container text-body-sm text-on-surface-variant">Speaking time (seconds, used for WPM when not recording):
              <input type="number" min={5} max={1800} value={manualSeconds} onChange={(e) => setManualSeconds(Math.max(5, Math.min(1800, Number(e.target.value) || 60)))} className="w-20 bg-surface-container-low rounded px-2 py-1 font-label-code text-label-code" /></label>
          )}
        </div>
      </section>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <div role="note" className="w-full flex items-start gap-2 rounded-lg bg-tertiary-fixed/60 text-on-tertiary-fixed-variant text-body-sm px-3 py-2"><Icon name="info" className="text-[16px] mt-0.5" />{children}</div>;
}
function Metric({ icon, label, value, sub, warn, ok }: { icon: string; label: string; value: string; sub?: string; warn?: boolean; ok?: boolean }) {
  return (
    <div className="rounded-xl bg-surface-container-lowest border border-outline-variant/50 p-3">
      <div className="flex items-center justify-between font-label-micro text-label-micro uppercase text-on-surface-variant"><span>{label}</span><Icon name={icon} className="text-[16px]" /></div>
      <div className={cx("font-label-metric text-[20px] leading-7 tabular mt-1", warn ? "text-tertiary" : ok ? "text-secondary" : "text-on-surface")}>{value}</div>
      {sub && <div className="font-label-micro text-label-micro text-on-surface-variant">{sub}</div>}
    </div>
  );
}
