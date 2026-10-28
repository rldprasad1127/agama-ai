import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { cx, errMsg, fmtClock } from "@/lib/utils";
import type { ExplainKind, HelpConfig, Task } from "@/lib/types";
import { Markdown } from "./Markdown";

type Tab = "explain" | "ask" | "check" | "hints";
const KINDS: { k: ExplainKind; label: string; icon: string; hint: string }[] = [
  { k: "simpler", label: "Explain simpler", icon: "child_care", hint: "Plain words, no jargon" },
  { k: "analogy", label: "Give me an analogy", icon: "extension", hint: "A real-life comparison" },
  { k: "example", label: "Show an example", icon: "calculate", hint: "Worked step by step" },
  { k: "diagram", label: "Draw it", icon: "schema", hint: "A small text diagram" },
  { k: "why", label: "Why does this matter?", icon: "help", hint: "Real-world use" },
];

interface Props {
  task: Task; open: boolean; onClose: () => void; code: string; runOutput: string; elapsed: number; failedRuns: number;
  initialPassage: string; onHintLevel: (n: number) => void;
}

export function HelpPanel({ task, open, onClose, code, runOutput, elapsed, failedRuns, initialPassage, onHintLevel }: Props) {
  const { toast } = useToast();
  const isCode = task.task_mode === "CODE";
  const [cfg, setCfg] = useState<HelpConfig | null>(null);
  const [tab, setTab] = useState<Tab>(isCode ? "hints" : "explain");
  const [left, setLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState<string>("");
  const [passage, setPassage] = useState("");
  const [answers, setAnswers] = useState<{ kind: string; passage: string; text: string; cached: boolean }[]>([]);
  const [chat, setChat] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [q, setQ] = useState("");
  const [check, setCheck] = useState<{ question: string; key_points: string[] } | null>(null);
  const [ans, setAns] = useState("");
  const [verdict, setVerdict] = useState<{ understood: boolean; feedback: string; reexplain: string } | null>(null);
  const [hints, setHints] = useState<Record<number, { text: string; solution?: string | null }>>({});
  const [confirm4, setConfirm4] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) { api.help.config().then((c) => { setCfg(c); setLeft(c.remaining_today); }).catch(() => {}); if (initialPassage) setPassage(initialPassage.slice(0, 1800)); } }, [open, initialPassage]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [answers.length, chat.length, verdict, check]);
  useEffect(() => { if (!open) return; const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [open, onClose]);

  const unlocked = useMemo(() => {
    let lvl = 0;
    for (const t of cfg?.thresholds ?? []) if (elapsed >= t.seconds || failedRuns >= t.failed_runs) lvl = t.level;
    return lvl;
  }, [cfg, elapsed, failedRuns]);

  async function guard<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
    setBusy(name);
    try { return await fn(); } catch (e) { toast(errMsg(e), "error"); return null; } finally { setBusy(""); }
  }
  async function explain(k: ExplainKind) {
    const r = await guard(k, () => api.help.explain(task.id, k, passage));
    if (r) { setAnswers((a) => [...a, { kind: k, passage, text: r.text, cached: r.cached }]); setLeft(r.remaining_today); }
  }
  async function ask() {
    const text = q.trim(); if (text.length < 2) return;
    const hist = chat.slice(-6);
    setChat((c) => [...c, { role: "user", content: text }]); setQ("");
    const r = await guard("ask", () => api.help.ask(task.id, text, hist));
    if (r) { setChat((c) => [...c, { role: "assistant", content: r.text }]); setLeft(r.remaining_today); }
    else setChat((c) => c.slice(0, -1));
  }
  async function startCheck() {
    setVerdict(null); setAns("");
    const r = await guard("check", () => api.help.check(task.id, passage));
    if (r) { setCheck({ question: r.question, key_points: r.key_points }); setLeft(r.remaining_today); }
  }
  async function sendCheck() {
    if (!check || !ans.trim()) return;
    const r = await guard("grade", () => api.help.checkAnswer({ task_id: task.id, question: check.question, key_points: check.key_points, answer: ans }));
    if (r) { setVerdict(r); setLeft(r.remaining_today); }
  }
  async function hint(level: number, confirm = false) {
    const r = await guard(`hint${level}`, () => api.help.hint({ task_id: task.id, level, code, run_output: runOutput, elapsed_seconds: elapsed, failed_runs: failedRuns, confirm_solution: confirm }));
    if (r) { setHints((h) => ({ ...h, [level]: { text: r.hint, solution: r.solution } })); setLeft(r.remaining_today); onHintLevel(level); setConfirm4(false); }
  }

  if (!open) return null;
  const tabs: { k: Tab; label: string; icon: string }[] = [
    ...(isCode && cfg?.hints_enabled !== false ? [{ k: "hints" as Tab, label: "Hints", icon: "lightbulb" }] : []),
    { k: "explain", label: "Explain", icon: "psychology_alt" }, { k: "ask", label: "Ask", icon: "forum" }, { k: "check", label: "Check me", icon: "quiz" },
  ];
  const out = left !== null && left <= 0;
  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/30" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside role="dialog" aria-modal="true" aria-label="AI help" className="slide-in w-full max-w-[440px] h-full bg-surface flex flex-col shadow-2xl">
        <div className="flex items-center gap-2 px-4 h-14 border-b border-outline-variant/60 bg-surface-container-lowest">
          <Icon name="auto_awesome" className="text-primary" /><div className="font-semibold flex-1">AI help</div>
          {left !== null && <span className={cx("font-label-code text-label-code", out ? "text-error" : "text-on-surface-variant")}>{left} left today</span>}
          <button onClick={onClose} aria-label="Close help" className="p-1.5 rounded-lg hover:bg-surface-container"><Icon name="close" /></button>
        </div>
        <div className="flex gap-1 px-3 py-2 border-b border-outline-variant/40 overflow-x-auto" role="tablist">
          {tabs.map((t) => <button key={t.k} role="tab" aria-selected={tab === t.k} onClick={() => setTab(t.k)} className={cx("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-body-sm font-semibold whitespace-nowrap", tab === t.k ? "bg-primary-fixed text-on-primary-fixed-variant" : "text-on-surface-variant hover:bg-surface-container")}><Icon name={t.icon} className="text-[18px]" />{t.label}</button>)}
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {out && <div role="alert" className="rounded-lg bg-error-container text-on-error-container px-3 py-2">You've used today's AI-help requests. Previously asked explanations still work; new ones reset tomorrow.</div>}

          {tab === "hints" && (<>
            <p className="text-body-sm text-on-surface-variant">Hints unlock as you work. Try first — struggling a little is how you learn. Time on block: <b>{fmtClock(elapsed)}</b> · failed runs: <b>{failedRuns}</b></p>
            {(cfg?.thresholds ?? []).map((t) => {
              const ok = unlocked >= t.level, got = hints[t.level];
              const prevOk = t.level === 1 || !!hints[t.level - 1] || task.hint_level_used >= t.level - 1;
              return (
                <div key={t.level} className={cx("rounded-xl border p-3", ok ? "border-outline-variant bg-surface-container-lowest" : "border-outline-variant/50 bg-surface-container-low opacity-80")}>
                  <div className="flex items-center gap-2"><span className={cx("w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-semibold", got ? "bg-secondary text-on-secondary" : ok ? "bg-primary text-on-primary" : "bg-surface-container")}>{got ? <Icon name="check" className="text-[14px]" /> : t.level}</span>
                    <span className="font-semibold flex-1">{t.label}</span>
                    {!ok && <span className="text-body-sm text-on-surface-variant flex items-center gap-1"><Icon name="lock" className="text-[16px]" />{Math.max(0, Math.ceil((t.seconds - elapsed) / 60))} min or {Math.max(0, t.failed_runs - failedRuns)} fails</span>}
                    {ok && !got && t.level < 4 && <button disabled={!!busy || out} onClick={() => void hint(t.level)} className="px-3 py-1 rounded-lg bg-primary text-on-primary font-semibold text-body-sm disabled:opacity-50">{busy === `hint${t.level}` ? "…" : "Reveal"}</button>}
                    {ok && !got && t.level === 4 && !confirm4 && <button disabled={!!busy || out} onClick={() => setConfirm4(true)} className="px-3 py-1 rounded-lg bg-error text-on-error font-semibold text-body-sm disabled:opacity-50">Show solution</button>}
                  </div>
                  {ok && !got && !prevOk && t.level < 4 && <p className="text-body-sm text-on-surface-variant mt-1">Tip: try the earlier hints first.</p>}
                  {t.level === 4 && confirm4 && !got && <div className="mt-2 rounded-lg bg-error-container/50 p-3 text-body-sm">Revealing the full solution <b>halves the XP</b> for this block. Sure?
                    <div className="mt-2 flex gap-2"><button onClick={() => setConfirm4(false)} className="px-3 py-1 rounded-lg bg-surface-container font-semibold">Keep trying</button><button disabled={!!busy} onClick={() => void hint(4, true)} className="px-3 py-1 rounded-lg bg-error text-on-error font-semibold">{busy === "hint4" ? "…" : "Show it"}</button></div></div>}
                  {got && <div className="mt-2"><Markdown>{got.text}</Markdown>{got.solution && <pre className="mt-2 rounded-lg bg-surface-container-low text-on-surface p-3 text-[12px] overflow-x-auto">{got.solution}</pre>}</div>}
                </div>);
            })}
          </>)}

          {(tab === "explain" || tab === "check") && (
            <label className="block"><span className="block font-label-micro text-label-micro uppercase tracking-wider text-on-surface-variant mb-1">{tab === "explain" ? "Part you don't understand (optional)" : "Focus the question on (optional)"}</span>
              <textarea value={passage} onChange={(e) => setPassage(e.target.value)} rows={3} maxLength={1800} placeholder="Select text in the lesson before opening help, or paste it here. Leave empty to cover the whole lesson."
                className="w-full resize-y rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-md outline-none focus:ring-2 focus:ring-primary/40" /></label>)}

          {tab === "explain" && (<>
            <div className="grid grid-cols-1 gap-2">{KINDS.map((k) => (
              <button key={k.k} disabled={!!busy} onClick={() => void explain(k.k)} className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-left hover:bg-surface-container-low disabled:opacity-60">
                <Icon name={busy === k.k ? "progress_activity" : k.icon} className={cx("text-primary", busy === k.k && "animate-spin")} /><span className="flex-1"><span className="font-semibold block">{k.label}</span><span className="text-body-sm text-on-surface-variant">{k.hint}</span></span></button>))}</div>
            {answers.map((a, i) => <div key={i} className="rounded-xl bg-primary-fixed/30 p-3 fade-up"><div className="font-label-micro text-label-micro uppercase text-primary mb-1">{KINDS.find((k) => k.k === a.kind)?.label}{a.cached && " · instant"}</div><Markdown>{a.text}</Markdown></div>)}
          </>)}

          {tab === "ask" && (<>
            {chat.length === 0 && <p className="text-on-surface-variant">Ask anything about this {isCode ? "problem" : "lesson"} — "why does this work?", "what does X mean?", "can you give another example?"{isCode && " I'll guide you without giving the answer away."}</p>}
            {chat.map((m, i) => <div key={i} className={cx("rounded-2xl px-3 py-2 max-w-[92%]", m.role === "user" ? "self-end bg-primary text-on-primary" : "self-start bg-surface-container-lowest border border-outline-variant/60")}>{m.role === "user" ? m.content : <Markdown>{m.content}</Markdown>}</div>)}
            {busy === "ask" && <div className="self-start text-on-surface-variant flex items-center gap-2"><Icon name="progress_activity" className="animate-spin" />Thinking…</div>}
          </>)}

          {tab === "check" && (<>
            {!check && <><p className="text-on-surface-variant">Explain it in your own words and the AI will tell you honestly whether you've got it — if not, you'll get a different explanation.</p>
              <button disabled={!!busy || out} onClick={() => void startCheck()} className="self-start px-4 py-2 rounded-xl bg-primary text-on-primary font-semibold disabled:opacity-60">{busy === "check" ? "Preparing…" : "Quiz me"}</button></>}
            {check && <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3"><div className="font-label-micro text-label-micro uppercase text-primary mb-1">Question</div><p className="font-semibold">{check.question}</p>
              {!verdict && <><textarea aria-label="Your answer" value={ans} onChange={(e) => setAns(e.target.value)} rows={4} maxLength={1800} className="mt-2 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 outline-none focus:ring-2 focus:ring-primary/40" placeholder="In your own words…" />
                <button disabled={!ans.trim() || !!busy || out} onClick={() => void sendCheck()} className="mt-2 px-4 py-2 rounded-lg bg-primary text-on-primary font-semibold disabled:opacity-50">{busy === "grade" ? "Checking…" : "Check my answer"}</button></>}</div>}
            {verdict && <div className={cx("rounded-xl p-3 fade-up", verdict.understood ? "bg-secondary-container/40" : "bg-tertiary-fixed/50")}>
              <div className="font-semibold flex items-center gap-2"><Icon name={verdict.understood ? "check_circle" : "lightbulb"} fill className={verdict.understood ? "text-secondary" : "text-tertiary"} />{verdict.understood ? "You've got it!" : "Not quite yet — here's another way to see it"}</div>
              <p className="mt-1">{verdict.feedback}</p>{verdict.reexplain && <div className="mt-2 rounded-lg bg-surface-container-lowest p-2"><Markdown>{verdict.reexplain}</Markdown></div>}
              <button onClick={() => void startCheck()} className="mt-3 px-3 py-1.5 rounded-lg bg-primary text-on-primary font-semibold text-body-sm">{verdict.understood ? "Another question" : "Try again"}</button></div>}
          </>)}
          <div ref={bottom} />
        </div>
        {tab === "ask" && (
          <form onSubmit={(e) => { e.preventDefault(); void ask(); }} className="p-3 border-t border-outline-variant/60 bg-surface-container-lowest flex gap-2">
            <input aria-label="Your question" value={q} onChange={(e) => setQ(e.target.value)} maxLength={800} placeholder="Type your question…" className="flex-1 rounded-lg border border-outline-variant bg-surface px-3 py-2 outline-none focus:ring-2 focus:ring-primary/40" />
            <button disabled={!q.trim() || !!busy || out} className="px-4 rounded-lg bg-primary text-on-primary font-semibold disabled:opacity-50" aria-label="Send"><Icon name="send" /></button></form>)}
      </aside>
    </div>
  );
}
