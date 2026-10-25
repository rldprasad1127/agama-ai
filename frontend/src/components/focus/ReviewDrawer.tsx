import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { cx } from "@/lib/utils";
import type { EvaluateOut, Insight, Metrics, TaskMode } from "@/lib/types";

const TABS: { m: TaskMode; label: string; icon: string }[] = [
  { m: "CODE", label: "[Code Review]", icon: "code" }, { m: "PROSE", label: "[Prose / Script]", icon: "edit_note" },
  { m: "THEORY", label: "[Theory / Recall]", icon: "menu_book" }, { m: "SPEECH", label: "[Speech Studio]", icon: "mic" },
];
type Tone = "good" | "warn" | "info" | "neutral";
interface Tile { label: string; value: string; sub?: string; tone: Tone; icon: string }

function tiles(m: Metrics): Tile[] {
  switch (m.mode) {
    case "CODE": return [
      { label: "Logic", value: m.logic_status, sub: m.tests_total ? `${m.tests_passed}/${m.tests_total} tests` : "AI-judged", tone: m.logic_status === "PASS" ? "good" : m.logic_status === "FAIL" ? "warn" : "info", icon: m.logic_status === "PASS" ? "check_circle" : "warning" },
      { label: "Time complexity", value: m.time_complexity, sub: m.target_time_complexity ? `Target ${m.target_time_complexity}` : undefined, tone: m.target_time_complexity && m.time_complexity.replace(/\s/g, "") !== m.target_time_complexity.replace(/\s/g, "") ? "warn" : "good", icon: "schedule" },
      { label: "Space", value: m.space_complexity, sub: m.target_space_complexity ? `Target ${m.target_space_complexity}` : undefined, tone: m.target_space_complexity && m.space_complexity.replace(/\s/g, "") !== m.target_space_complexity.replace(/\s/g, "") ? "warn" : "good", icon: "memory" },
      { label: "Tests", value: m.tests_total ? `${m.tests_passed}/${m.tests_total}` : "n/a", sub: m.tests_total ? (m.tests_passed === m.tests_total ? "All green" : "Failures") : "No runner", tone: m.tests_total ? (m.tests_passed === m.tests_total ? "good" : "warn") : "neutral", icon: "fact_check" }];
    case "PROSE": return [
      { label: "Tone", value: m.tone || "—", tone: "info", icon: "chat" },
      { label: "Pacing", value: m.pacing || "—", sub: `Narrative ${m.narrative_pacing}/100`, tone: "good", icon: "bolt" },
      { label: "Word count", value: `${m.word_count} words`, sub: m.word_target_min && m.word_target_max ? `Target ${m.word_target_min}-${m.word_target_max}` : undefined, tone: m.word_target_min && m.word_target_max && (m.word_count < m.word_target_min || m.word_count > m.word_target_max) ? "warn" : "good", icon: "description" },
      { label: "Voice / Readability", value: m.voice_texture || "—", sub: m.readability_grade !== null ? `Grade ${m.readability_grade} · Accuracy ${m.technical_accuracy}` : `Accuracy ${m.technical_accuracy}`, tone: "info", icon: "person" }];
    case "THEORY": return [
      { label: "Comprehension", value: `${m.comprehension_score}%`, tone: m.comprehension_score >= 70 ? "good" : "warn", icon: "check_circle" },
      { label: "Concepts missed", value: String(m.missed_concepts.length), sub: m.missed_concepts.length ? "see below" : "None", tone: m.missed_concepts.length ? "warn" : "good", icon: "warning" },
      { label: "Next review", value: `${m.next_review_days}-Day`, sub: "Leitner interval", tone: "info", icon: "event" },
      { label: "Concepts captured", value: String(m.captured_concepts.length), tone: "good", icon: "task_alt" }];
    case "SPEECH": return [
      { label: "Pace", value: `${m.wpm} WPM`, sub: `Target ${m.target_wpm}`, tone: Math.abs(m.wpm - m.target_wpm) <= m.target_wpm * 0.15 ? "good" : "warn", icon: "speed" },
      { label: "Filler words", value: `${m.filler_total}`, sub: m.filler_words.map((f) => `${f.word}×${f.count}`).join(", ") || "None detected", tone: m.filler_total > 3 ? "warn" : "good", icon: "warning" },
      { label: "Fluency", value: m.fluency_grade || `${m.fluency_score}`, sub: `${m.fluency_score}/100`, tone: "good", icon: "check_circle" },
      { label: "Tone clarity", value: `${m.clarity_score}%`, sub: m.speaking_ratio !== null ? `${Math.round(m.speaking_ratio * 100)}% speaking` : undefined, tone: "info", icon: "graphic_eq" }];
  }
}
const toneCls: Record<Tone, string> = {
  good: "border-emerald-400/30 bg-emerald-500/5 text-emerald-300", warn: "border-amber-400/40 bg-amber-500/5 text-amber-300",
  info: "border-indigo-400/30 bg-indigo-500/5 text-indigo-300", neutral: "border-white/10 bg-white/5 text-slate-300",
};
const kindIcon = (k: Insight["kind"]) => k === "strength" ? { i: "check", c: "bg-emerald-500/15 text-emerald-300", t: "text-white" } : k === "warning" ? { i: "warning", c: "bg-amber-500/15 text-amber-300", t: "text-amber-300" } : { i: "lightbulb", c: "bg-indigo-500/15 text-indigo-300", t: "text-indigo-200" };

export function ReviewDrawer({ result, onClose, onJournal, onContinue }: { result: EvaluateOut; onClose: () => void; onJournal: () => void; onContinue: () => void }) {
  const { toast } = useToast();
  const [raw, setRaw] = useState(false);
  const e = result.entry, m = e.metrics;
  useEffect(() => { const h = (ev: KeyboardEvent) => { if (ev.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  const json = JSON.stringify(m, null, 2);
  const copy = async () => { try { await navigator.clipboard.writeText(json); toast("Metrics JSON copied.", "success"); } catch { toast("Copy isn't available in this browser.", "error"); } };
  const mins = Math.max(1, Math.round(e.time_spent_seconds / 60));

  return (
    <div className="fixed inset-0 z-[65] flex justify-end bg-[#070b17]/60 backdrop-blur-[2px]" onMouseDown={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <aside role="dialog" aria-modal="true" aria-label="Session complete: AI evaluation" className="slide-in w-full max-w-[760px] h-full bg-[#0b1020] text-slate-200 flex flex-col shadow-2xl">
        <div className="p-6 pb-3">
          <div className="flex items-start justify-between"><h2 className="text-2xl font-bold text-white">Session Complete: AI Evaluation</h2>
            <button onClick={onClose} aria-label="Close" className="p-1 text-slate-400 hover:text-white"><Icon name="close" /></button></div>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-indigo-400/40 bg-indigo-500/10 px-3 py-1 font-label-code text-label-code text-indigo-200"><span className="w-1.5 h-1.5 rounded-full bg-indigo-300" />{e.ai_model} · Verified</div>
          <div className="mt-2 font-label-code text-label-code text-slate-400 flex gap-3 flex-wrap"><span>{e.task_title} ({mins}m)</span><span>·</span><span>COMPLETED {new Date(e.created_at).toLocaleTimeString()}</span><span>·</span><span className="text-indigo-300">BLOCK #{e.task_id.slice(-4).toUpperCase()}</span></div>
          <div className="mt-4 font-label-micro text-label-micro uppercase tracking-wider text-indigo-300">Modality review:</div>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1 rounded-xl border border-white/10 bg-[#080c19] p-1">
            {TABS.map((t) => <div key={t.m} aria-current={t.m === e.task_mode} className={cx("flex items-center justify-center gap-1.5 py-2 rounded-lg text-body-sm font-semibold", t.m === e.task_mode ? "bg-indigo-500 text-white" : "text-slate-600")}><Icon name={t.icon} className="text-[16px]" />{t.label}</div>)}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6 flex flex-col gap-5">
          <div className="rounded-2xl border border-indigo-400/30 bg-gradient-to-br from-indigo-500/10 to-transparent p-5">
            <div className="flex items-end gap-4 flex-wrap">
              <div className="text-6xl font-bold text-white tabular leading-none">{e.score}<span className="text-xl text-indigo-300 font-medium">/100</span></div>
              <div><div className="text-xl font-semibold text-white">{m.verdict || "Evaluation complete"}</div>
                <div className="font-label-code text-label-code text-slate-400">{e.xp_earned > 0 ? `+${e.xp_earned} XP` : "Re-run: no XP awarded"} · {result.streak_count}-day streak · {result.total_xp} XP total</div></div>
            </div>
            <div className="mt-4 pt-3 border-t border-white/10 flex justify-between font-label-code text-label-code text-slate-500 flex-wrap gap-2"><span>SHA-256 {e.submission_sha.slice(0, 8)}…{e.submission_sha.slice(-4)}</span><span>Saved to your MongoDB journal</span></div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {tiles(m).map((t) => (
              <div key={t.label} className={cx("rounded-xl border p-3", toneCls[t.tone])}>
                <div className="font-label-micro text-label-micro uppercase tracking-wider">{t.label}</div>
                <div className="mt-1.5 flex items-center gap-1.5 text-white font-semibold break-words"><Icon name={t.icon} className="text-[18px]" />{t.value}</div>
                {t.sub && <div className="mt-1 font-label-micro text-label-micro opacity-80 break-words">{t.sub}</div>}
              </div>))}
          </div>

          {m.mode === "SPEECH" && m.speaking_ratio !== null && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex justify-between text-body-sm"><span>Speaking vs deliberate pause</span><span className="text-rose-300">{Math.round(m.speaking_ratio * 100)}% / {Math.round((1 - m.speaking_ratio) * 100)}%</span></div>
              <div className="mt-2 h-2 rounded-full bg-indigo-900/60 overflow-hidden"><div className="h-full bg-rose-400" style={{ width: `${m.speaking_ratio * 100}%` }} /></div></div>)}

          <section>
            <div className="flex items-center justify-between font-label-micro text-label-micro uppercase tracking-wider text-slate-400 mb-2"><span className="flex items-center gap-1.5"><Icon name="insights" className="text-[16px] text-indigo-300" />Diagnostic &amp; invariant analysis</span><span>Model: {e.ai_model}</span></div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-4">
              {m.insights.map((i, k) => { const s = kindIcon(i.kind); return (
                <div key={k} className="flex gap-3"><span className={cx("w-8 h-8 rounded-full flex items-center justify-center shrink-0", s.c)}><Icon name={s.i} className="text-[18px]" /></span>
                  <div><div className={cx("font-semibold", s.t)}>{i.title}</div><p className="text-body-md text-slate-400 mt-0.5">{i.detail}</p></div></div>); })}
              {m.feedback_bullets.length > 0 && <ul className="list-disc pl-5 text-body-md text-slate-300 flex flex-col gap-1">{m.feedback_bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
              {!m.insights.length && !m.feedback_bullets.length && <p className="text-slate-500">No written feedback was returned.</p>}
            </div>
          </section>

          {m.takeaway && <div className="rounded-xl border-l-4 border-indigo-400 bg-indigo-500/10 p-4"><div className="font-label-micro text-label-micro uppercase tracking-wider text-indigo-300">Actionable takeaway</div><p className="mt-1 text-white italic">“{m.takeaway}”</p></div>}

          {m.mode === "THEORY" && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-4"><div className="font-label-micro text-label-micro uppercase text-emerald-300 mb-2">What you captured well</div><ul className="text-body-md flex flex-col gap-1.5">{m.captured_concepts.length ? m.captured_concepts.map((c, i) => <li key={i} className="flex gap-2"><Icon name="check" className="text-emerald-400 text-[16px] mt-1" />{c}</li>) : <li className="text-slate-500">—</li>}</ul></div>
              <div className="rounded-xl border border-rose-400/20 bg-rose-500/5 p-4"><div className="font-label-micro text-label-micro uppercase text-rose-300 mb-2">Crucial concepts omitted</div><ul className="text-body-md flex flex-col gap-1.5">{m.missed_concepts.length ? m.missed_concepts.map((c, i) => <li key={i} className="flex gap-2"><Icon name="close" className="text-rose-400 text-[16px] mt-1" />{c}</li>) : <li className="text-slate-500">Nothing missed 🎉</li>}</ul></div>
            </div>)}
          {result.flashcards.length > 0 && (
            <section><div className="font-label-micro text-label-micro uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5"><Icon name="style" className="text-[16px] text-indigo-300" />Auto-generated flashcards for next session ({result.flashcards.length})</div>
              <div className="grid sm:grid-cols-2 gap-3">{result.flashcards.map((c) => <div key={c.id} className="rounded-xl border border-white/10 bg-[#0e1428] p-3"><div className="font-label-micro text-label-micro text-indigo-300 uppercase">{c.topic} · due {c.due_date}</div><div className="mt-1 font-semibold text-white">{c.front}</div><div className="mt-1 text-body-sm text-slate-400">{c.back}</div></div>)}</div></section>)}

          <button onClick={() => setRaw((r) => !r)} className="self-start text-body-sm text-slate-400 hover:text-white flex items-center gap-1.5"><Icon name={raw ? "expand_less" : "expand_more"} className="text-[18px]" />Review telemetry (raw JSON)</button>
          {raw && <div className="relative"><button onClick={copy} className="absolute right-2 top-2 px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-body-sm">Copy</button><pre className="rounded-xl bg-[#080c19] border border-white/10 p-4 text-[12px] leading-5 overflow-x-auto text-slate-300">{json}</pre></div>}
        </div>

        <div className="border-t border-white/10 bg-[#0b1020] p-4 flex items-center gap-3 flex-wrap">
          <button onClick={onJournal} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/15 hover:bg-white/5 font-semibold text-white"><Icon name="bookmark" className="text-[18px]" />Save to Journal</button>
          <div className="hidden sm:block ml-auto font-label-micro text-label-micro text-slate-500"><kbd className="px-1.5 py-0.5 rounded bg-white/10">Esc</kbd> to dismiss</div>
          <button onClick={onContinue} className="ml-auto sm:ml-0 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-semibold">{result.next_task_id ? "Save & Continue" : "Save & Finish"}<Icon name="arrow_forward" className="text-[18px]" /></button>
        </div>
      </aside>
    </div>
  );
}
