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
  good: "border-secondary/30 bg-secondary/5 text-secondary", warn: "border-tertiary/40 bg-tertiary/5 text-tertiary",
  info: "border-primary/30 bg-primary/5 text-primary", neutral: "border-outline-variant bg-surface-container text-on-surface-variant",
};
const kindIcon = (k: Insight["kind"]) => k === "strength" ? { i: "check", c: "bg-secondary/15 text-secondary", t: "text-on-surface" } : k === "warning" ? { i: "warning", c: "bg-tertiary/15 text-tertiary", t: "text-tertiary" } : { i: "lightbulb", c: "bg-primary/15 text-primary", t: "text-primary" };

export function ReviewDrawer({ result, onClose, onJournal, onContinue }: { result: EvaluateOut; onClose: () => void; onJournal: () => void; onContinue: () => void }) {
  const { toast } = useToast();
  const [raw, setRaw] = useState(false);
  const e = result.entry, m = e.metrics;
  useEffect(() => { const h = (ev: KeyboardEvent) => { if (ev.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  const json = JSON.stringify(m, null, 2);
  const copy = async () => { try { await navigator.clipboard.writeText(json); toast("Metrics JSON copied.", "success"); } catch { toast("Copy isn't available in this browser.", "error"); } };
  const mins = Math.max(1, Math.round(e.time_spent_seconds / 60));

  return (
    <div className="fixed inset-0 z-[65] flex justify-end bg-on-surface/30 backdrop-blur-[2px]" onMouseDown={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <aside role="dialog" aria-modal="true" aria-label="Session complete: AI evaluation" className="slide-in w-full max-w-[760px] h-full bg-surface-container-lowest text-on-surface flex flex-col shadow-2xl">
        <div className="p-6 pb-3">
          <div className="flex items-start justify-between"><h2 className="text-2xl font-bold text-on-surface">Session Complete: AI Evaluation</h2>
            <button onClick={onClose} aria-label="Close" className="p-1 text-on-surface-variant hover:text-on-surface"><Icon name="close" /></button></div>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 font-label-code text-label-code text-primary"><span className="w-1.5 h-1.5 rounded-full bg-indigo-300" />{e.ai_model} · Verified</div>
          <div className="mt-2 font-label-code text-label-code text-on-surface-variant flex gap-3 flex-wrap"><span>{e.task_title} ({mins}m)</span><span>·</span><span>COMPLETED {new Date(e.created_at).toLocaleTimeString()}</span><span>·</span><span className="text-primary">BLOCK #{e.task_id.slice(-4).toUpperCase()}</span></div>
          <div className="mt-4 font-label-micro text-label-micro uppercase tracking-wider text-primary">Modality review:</div>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1 rounded-xl border border-outline-variant bg-surface-container-low p-1">
            {TABS.map((t) => <div key={t.m} aria-current={t.m === e.task_mode} className={cx("flex items-center justify-center gap-1.5 py-2 rounded-lg text-body-sm font-semibold", t.m === e.task_mode ? "bg-primary text-on-primary" : "text-outline")}><Icon name={t.icon} className="text-[16px]" />{t.label}</div>)}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6 flex flex-col gap-5">
          <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-5">
            <div className="flex items-end gap-4 flex-wrap">
              <div className="text-6xl font-bold text-on-surface tabular leading-none">{e.score}<span className="text-xl text-primary font-medium">/100</span></div>
              <div><div className="text-xl font-semibold text-on-surface">{m.verdict || "Evaluation complete"}</div>
                <div className="font-label-code text-label-code text-on-surface-variant">{e.xp_earned > 0 ? `+${e.xp_earned} XP` : "Re-run: no XP awarded"} · {result.streak_count}-day streak · {result.total_xp} XP total</div></div>
            </div>
            <div className="mt-4 pt-3 border-t border-outline-variant flex justify-between font-label-code text-label-code text-outline flex-wrap gap-2"><span>SHA-256 {e.submission_sha.slice(0, 8)}…{e.submission_sha.slice(-4)}</span><span>Saved to your MongoDB journal</span></div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {tiles(m).map((t) => (
              <div key={t.label} className={cx("rounded-xl border p-3", toneCls[t.tone])}>
                <div className="font-label-micro text-label-micro uppercase tracking-wider">{t.label}</div>
                <div className="mt-1.5 flex items-center gap-1.5 text-on-surface font-semibold break-words"><Icon name={t.icon} className="text-[18px]" />{t.value}</div>
                {t.sub && <div className="mt-1 font-label-micro text-label-micro opacity-80 break-words">{t.sub}</div>}
              </div>))}
          </div>

          {m.mode === "SPEECH" && m.speaking_ratio !== null && (
            <div className="rounded-xl border border-outline-variant bg-surface-container p-4">
              <div className="flex justify-between text-body-sm"><span>Speaking vs deliberate pause</span><span className="text-error">{Math.round(m.speaking_ratio * 100)}% / {Math.round((1 - m.speaking_ratio) * 100)}%</span></div>
              <div className="mt-2 h-2 rounded-full bg-surface-container-high overflow-hidden"><div className="h-full bg-error" style={{ width: `${m.speaking_ratio * 100}%` }} /></div></div>)}

          <section>
            <div className="flex items-center justify-between font-label-micro text-label-micro uppercase tracking-wider text-on-surface-variant mb-2"><span className="flex items-center gap-1.5"><Icon name="insights" className="text-[16px] text-primary" />Diagnostic &amp; invariant analysis</span><span>Model: {e.ai_model}</span></div>
            <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4 flex flex-col gap-4">
              {m.insights.map((i, k) => { const s = kindIcon(i.kind); return (
                <div key={k} className="flex gap-3"><span className={cx("w-8 h-8 rounded-full flex items-center justify-center shrink-0", s.c)}><Icon name={s.i} className="text-[18px]" /></span>
                  <div><div className={cx("font-semibold", s.t)}>{i.title}</div><p className="text-body-md text-on-surface-variant mt-0.5">{i.detail}</p></div></div>); })}
              {m.feedback_bullets.length > 0 && <ul className="list-disc pl-5 text-body-md text-on-surface-variant flex flex-col gap-1">{m.feedback_bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
              {!m.insights.length && !m.feedback_bullets.length && <p className="text-outline">No written feedback was returned.</p>}
            </div>
          </section>

          {m.takeaway && <div className="rounded-xl border-l-4 border-primary bg-primary/10 p-4"><div className="font-label-micro text-label-micro uppercase tracking-wider text-primary">Actionable takeaway</div><p className="mt-1 text-on-surface italic">“{m.takeaway}”</p></div>}

          {m.mode === "THEORY" && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-secondary/20 bg-secondary/5 p-4"><div className="font-label-micro text-label-micro uppercase text-secondary mb-2">What you captured well</div><ul className="text-body-md flex flex-col gap-1.5">{m.captured_concepts.length ? m.captured_concepts.map((c, i) => <li key={i} className="flex gap-2"><Icon name="check" className="text-secondary text-[16px] mt-1" />{c}</li>) : <li className="text-outline">—</li>}</ul></div>
              <div className="rounded-xl border border-error/20 bg-error/5 p-4"><div className="font-label-micro text-label-micro uppercase text-error mb-2">Crucial concepts omitted</div><ul className="text-body-md flex flex-col gap-1.5">{m.missed_concepts.length ? m.missed_concepts.map((c, i) => <li key={i} className="flex gap-2"><Icon name="close" className="text-error text-[16px] mt-1" />{c}</li>) : <li className="text-outline">Nothing missed 🎉</li>}</ul></div>
            </div>)}
          {result.flashcards.length > 0 && (
            <section><div className="font-label-micro text-label-micro uppercase tracking-wider text-on-surface-variant mb-2 flex items-center gap-1.5"><Icon name="style" className="text-[16px] text-primary" />Auto-generated flashcards for next session ({result.flashcards.length})</div>
              <div className="grid sm:grid-cols-2 gap-3">{result.flashcards.map((c) => <div key={c.id} className="rounded-xl border border-outline-variant bg-surface-container-low p-3"><div className="font-label-micro text-label-micro text-primary uppercase">{c.topic} · due {c.due_date}</div><div className="mt-1 font-semibold text-on-surface">{c.front}</div><div className="mt-1 text-body-sm text-on-surface-variant">{c.back}</div></div>)}</div></section>)}

          <button onClick={() => setRaw((r) => !r)} className="self-start text-body-sm text-on-surface-variant hover:text-on-surface flex items-center gap-1.5"><Icon name={raw ? "expand_less" : "expand_more"} className="text-[18px]" />Review telemetry (raw JSON)</button>
          {raw && <div className="relative"><button onClick={copy} className="absolute right-2 top-2 px-2 py-1 rounded bg-surface-container hover:bg-surface-container-high text-body-sm">Copy</button><pre className="rounded-xl bg-surface-container-low border border-outline-variant p-4 text-[12px] leading-5 overflow-x-auto text-on-surface-variant">{json}</pre></div>}
        </div>

        <div className="border-t border-outline-variant bg-surface-container-lowest p-4 flex items-center gap-3 flex-wrap">
          <button onClick={onJournal} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-outline-variant hover:bg-surface-container-high font-semibold text-on-surface"><Icon name="bookmark" className="text-[18px]" />Save to Journal</button>
          <div className="hidden sm:block ml-auto font-label-micro text-label-micro text-outline"><kbd className="px-1.5 py-0.5 rounded bg-surface-container">Esc</kbd> to dismiss</div>
          <button onClick={onContinue} className="ml-auto sm:ml-0 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:opacity-90 text-on-primary font-semibold">{result.next_task_id ? "Save & Continue" : "Save & Finish"}<Icon name="arrow_forward" className="text-[18px]" /></button>
        </div>
      </aside>
    </div>
  );
}
