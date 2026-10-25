import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useSchedule } from "@/hooks/useSchedule";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { MODE_META, cx, downloadFile, errMsg, fmtMinutes } from "@/lib/utils";
import type { Insight, JournalEntry } from "@/lib/types";

export function scoreTone(score: number): string {
  return score >= 85 ? "bg-secondary-container text-on-secondary-container" : score >= 70 ? "bg-primary-fixed text-on-primary-fixed-variant" : "bg-tertiary-fixed text-on-tertiary-fixed-variant";
}
export function ScoreChip({ score }: { score: number }) {
  return <span className={cx("px-2 py-0.5 rounded font-label-micro text-label-micro font-semibold tabular", scoreTone(score))}>{score}/100</span>;
}

async function copyText(text: string, ok: string, toast: (m: string, k?: "success" | "error" | "info") => void) {
  try { await navigator.clipboard.writeText(text); toast(ok, "success"); }
  catch { toast("Clipboard is unavailable in this browser context.", "error"); }
}

function Tile({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: string; tone?: "ok" | "warn" | "neutral" }) {
  return (
    <div className={cx("rounded-lg p-2.5 border", tone === "warn" ? "bg-tertiary-fixed/40 border-tertiary-fixed-dim" : tone === "ok" ? "bg-secondary-container/30 border-secondary-fixed-dim" : "bg-surface-container-low border-outline-variant/40")}>
      <div className="font-label-micro text-label-micro uppercase tracking-wider text-on-surface-variant">{label}</div>
      <div className="font-label-code text-label-code font-semibold text-on-surface mt-0.5 break-words">{value}</div>
      {sub && <div className="font-label-micro text-label-micro text-on-surface-variant mt-0.5">{sub}</div>}
    </div>
  );
}

function Tiles({ e }: { e: JournalEntry }) {
  const m = e.metrics;
  switch (m.mode) {
    case "CODE":
      return (<>
        <Tile label="Logic" value={m.logic_status} tone={m.logic_status === "PASS" ? "ok" : "warn"} />
        <Tile label="Time" value={m.time_complexity} sub={m.target_time_complexity ? `Target ${m.target_time_complexity}` : undefined} />
        <Tile label="Space" value={m.space_complexity} sub={m.target_space_complexity ? `Target ${m.target_space_complexity}` : undefined} />
        <Tile label="Tests" value={m.tests_total ? `${m.tests_passed ?? 0}/${m.tests_total}` : "n/a"} tone={m.tests_total && m.tests_passed === m.tests_total ? "ok" : undefined} />
      </>);
    case "PROSE":
      return (<>
        <Tile label="Tone" value={m.tone || "—"} />
        <Tile label="Pacing" value={m.pacing || "—"} />
        <Tile label="Words" value={m.word_count} sub={m.word_target_min && m.word_target_max ? `Target ${m.word_target_min}-${m.word_target_max}` : undefined} />
        <Tile label="Readability" value={m.readability_grade != null ? `Grade ${m.readability_grade}` : "—"} sub={m.flesch_reading_ease != null ? `Flesch ${m.flesch_reading_ease}` : undefined} />
      </>);
    case "THEORY":
      return (<>
        <Tile label="Comprehension" value={`${m.comprehension_score}%`} tone={m.comprehension_score >= 80 ? "ok" : undefined} />
        <Tile label="Concepts met" value={`${m.captured_concepts.length} / ${m.captured_concepts.length + m.missed_concepts.length}`} />
        <Tile label="Missed" value={m.missed_concepts.length} tone={m.missed_concepts.length ? "warn" : "ok"} />
        <Tile label="Next review" value={`${m.next_review_days}d`} />
      </>);
    case "SPEECH":
      return (<>
        <Tile label="Pace" value={`${m.wpm} WPM`} sub={`Target ${m.target_wpm}`} />
        <Tile label="Filler words" value={m.filler_total} tone={m.filler_total > 3 ? "warn" : "ok"} sub={m.filler_words.slice(0, 2).map((f) => `${f.word}×${f.count}`).join(", ") || undefined} />
        <Tile label="Fluency" value={m.fluency_grade || `${m.fluency_score}`} sub={`${m.fluency_score}/100`} />
        <Tile label="Clarity" value={`${m.clarity_score}%`} />
      </>);
  }
}

function InsightRow({ i }: { i: Insight }) {
  const k = i.kind;
  return (
    <div className={cx("flex gap-2 rounded-lg p-2.5 border", k === "strength" ? "border-secondary-fixed-dim bg-secondary-container/20" : k === "warning" ? "border-tertiary-fixed-dim bg-tertiary-fixed/30" : "border-primary-fixed-dim bg-primary-fixed/30")}>
      <Icon name={k === "strength" ? "check_circle" : k === "warning" ? "warning" : "lightbulb"} fill className={cx("text-[18px] mt-px", k === "strength" ? "text-secondary" : k === "warning" ? "text-tertiary-container" : "text-primary")} />
      <div><div className="font-semibold text-body-sm">{i.title}</div><div className="text-body-sm text-on-surface-variant">{i.detail}</div></div>
    </div>
  );
}

function Snapshot({ e, toast }: { e: JournalEntry; toast: (m: string, k?: "success" | "error" | "info") => void }) {
  if (e.task_mode === "CODE") {
    const lines = e.user_submission.replace(/\n$/, "").split("\n");
    return (
      <div className="rounded-lg overflow-hidden border border-outline-variant/50 bg-[#0b1020]">
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#131a33] text-slate-300 font-label-micro text-label-micro">
          <span>SUBMISSION SNAPSHOT · {e.language ?? "code"}</span>
          <button className="inline-flex items-center gap-1 hover:text-white" onClick={() => copyText(e.user_submission, "Code copied.", toast)}><Icon name="content_copy" className="text-[14px]" />Copy Code</button>
        </div>
        <pre className="max-h-80 overflow-auto py-2 text-[12.5px] leading-5 font-label-code text-slate-100">
          {lines.map((l, i) => (<div key={i} className="flex"><span className="w-10 shrink-0 text-right pr-3 text-slate-500 select-none tabular">{i + 1}</span><code className="whitespace-pre pr-3">{l || " "}</code></div>))}
        </pre>
      </div>
    );
  }
  const head = e.task_mode === "PROSE" ? `Submission snapshot · ${e.metrics.mode === "PROSE" ? e.metrics.word_count : 0} words` : e.task_mode === "THEORY" ? "Cornell notes" : "Transcript";
  return (
    <div className="rounded-lg border border-outline-variant/50 bg-surface-container-lowest">
      <div className="px-3 py-1.5 bg-surface-container-low font-label-micro text-label-micro uppercase tracking-wider text-on-surface-variant rounded-t-lg">{head}</div>
      <div className="p-3 max-h-80 overflow-auto">
        {e.task_mode === "SPEECH"
          ? <p className="text-body-md whitespace-pre-wrap">{e.user_submission}</p>
          : <div className="prose-agama"><ReactMarkdown remarkPlugins={[remarkGfm]}>{e.user_submission}</ReactMarkdown></div>}
      </div>
    </div>
  );
}

export function dayLabelTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function EntryCard({ e, expanded, onToggle, compact, onDeleted }: { e: JournalEntry; expanded: boolean; onToggle: () => void; compact: boolean; onDeleted: (id: string) => void }) {
  const { toast } = useToast();
  const nav = useNavigate();
  const { refresh } = useSchedule();
  const [busy, setBusy] = useState<string | null>(null);
  const meta = MODE_META[e.task_mode];
  const m = e.metrics;

  async function rerun() {
    setBusy("rerun");
    try { const t = await api.metrics.rerun(e.id); await refresh(); nav(`/focus/${t.id}`); }
    catch (err) { toast(errMsg(err), "error"); setBusy(null); }
  }
  async function del() {
    if (!window.confirm(`Delete the journal entry “${e.task_title}”? This cannot be undone.`)) return;
    setBusy("del");
    try { await api.metrics.remove(e.id); toast("Entry deleted.", "success"); onDeleted(e.id); }
    catch (err) { toast(errMsg(err), "error"); setBusy(null); }
  }
  function exportCornell() {
    if (m.mode !== "THEORY") return;
    const md = [`# ${e.task_title}`, `*${e.date} · ${e.category || "Theory"} · score ${e.score}/100*`, "", "## Cornell notes", e.user_submission || "_(none)_",
      ...(e.notes ? ["", "## Freeform notes", e.notes] : []),
      "", "## Captured concepts", ...(m.captured_concepts.map((c) => `- ${c}`) || []), "", "## Concepts to revisit", ...(m.missed_concepts.map((c) => `- ${c}`)),
      "", "## Flashcards", ...m.flashcards.map((f, i) => `${i + 1}. **Q:** ${f.front}\n   **A:** ${f.back}`)].join("\n");
    downloadFile(`cornell-${e.task_title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${e.date}.md`, md, "text/markdown");
  }

  const header = (
    <button onClick={onToggle} aria-expanded={expanded} className="w-full flex items-center justify-between gap-3 text-left">
      <div className="flex items-center gap-3 min-w-0">
        <div className={cx("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", meta.chip)}><Icon name={meta.icon} className="text-[20px]" /></div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={cx("font-semibold text-on-surface truncate", compact ? "text-body-md" : "text-headline-sm")}>{e.task_title}</h3>
            {e.category && <span className="px-2 py-0.5 rounded bg-surface-container font-label-micro text-label-micro text-on-surface-variant">{e.category}</span>}
          </div>
          <div className="flex items-center gap-2 text-body-sm text-on-surface-variant flex-wrap">
            <Icon name="schedule" className="text-[14px]" /><span>{fmtMinutes(e.time_spent_seconds / 60)} Session</span><span>·</span><span className="tabular">{dayLabelTime(e.created_at)}</span><span>·</span><ScoreChip score={e.score} />
            {e.xp_earned > 0 && <span className="font-label-micro text-label-micro text-secondary">+{e.xp_earned} XP</span>}
          </div>
        </div>
      </div>
      <span className="hidden sm:inline-flex items-center gap-1 font-label-micro text-label-micro text-on-surface-variant shrink-0">{expanded ? "Collapse" : "Expand"} Details<Icon name={expanded ? "expand_less" : "expand_more"} className="text-[20px]" /></span>
      <Icon name={expanded ? "expand_less" : "expand_more"} className="sm:hidden text-[20px] text-on-surface-variant" />
    </button>
  );

  return (
    <article className={cx("rounded-xl bg-surface-container-lowest shadow-sm border border-transparent", compact ? "p-2.5" : "p-space-md", expanded && "border-surface-variant")}>
      {header}
      {expanded && (
        <div className="fade-up mt-4">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Snapshot e={e} toast={toast} />
            <div className="flex flex-col gap-3 min-w-0">
              <div className="flex items-center justify-between font-label-micro text-label-micro text-on-surface-variant uppercase tracking-wider">
                <span>AI evaluation · {m.verdict || "Reviewed"}</span><span className="normal-case truncate ml-2">{e.ai_model}</span></div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2"><Tiles e={e} /></div>
              {m.insights.map((i, k) => <InsightRow key={k} i={i} />)}
              {m.insights.length === 0 && m.feedback_bullets.length > 0 && (
                <ul className="list-disc pl-5 text-body-sm text-on-surface-variant">{m.feedback_bullets.map((b, k) => <li key={k}>{b}</li>)}</ul>)}
              {m.takeaway && (
                <div className="rounded-lg border-l-4 border-primary-container bg-primary-fixed/30 p-3">
                  <div className="font-label-micro text-label-micro uppercase tracking-wider text-primary">Actionable takeaway</div>
                  <p className="text-body-sm mt-0.5">{m.takeaway}</p></div>)}
              {m.insights.length > 0 && m.feedback_bullets.length > 0 && (
                <ul className="list-disc pl-5 text-body-sm text-on-surface-variant">{m.feedback_bullets.map((b, k) => <li key={k}>{b}</li>)}</ul>)}
              {m.mode === "THEORY" && m.flashcards.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="font-label-micro text-label-micro uppercase tracking-wider text-on-surface-variant">Comprehension &amp; Leitner cards</div>
                  {m.flashcards.map((f, k) => (
                    <div key={k} className="rounded-lg bg-surface-container-low p-2.5 border border-outline-variant/40">
                      <div className="font-label-micro text-label-micro text-outline">FLASHCARD #{String(k + 1).padStart(2, "0")}{f.topic ? ` · ${f.topic}` : ""}</div>
                      <div className="font-semibold text-body-sm">{f.front}</div><div className="text-body-sm text-on-surface-variant">{f.back}</div></div>))}
                </div>)}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-surface-container flex items-center justify-between gap-3 flex-wrap">
            <div className="font-label-code text-label-code text-on-surface-variant">Linked Block: #{e.task_id.slice(-4)} · SHA-256: {e.submission_sha.slice(0, 8)}</div>
            <div className="flex items-center gap-2 flex-wrap">
              <button disabled={!!busy} onClick={rerun} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-fixed text-on-primary-fixed-variant font-semibold text-body-sm hover:bg-primary-fixed-dim disabled:opacity-60"><Icon name="replay" className="text-[16px]" />{busy === "rerun" ? "Opening…" : "Re-run Review in Focus"}</button>
              <button onClick={() => copyText(JSON.stringify(e.metrics, null, 2), "Metrics JSON copied.", toast)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container text-on-surface font-semibold text-body-sm hover:bg-surface-container-high"><Icon name="data_object" className="text-[16px]" />Copy JSON</button>
              {m.mode === "THEORY" && <button onClick={exportCornell} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container text-on-surface font-semibold text-body-sm hover:bg-surface-container-high"><Icon name="ios_share" className="text-[16px]" />Export Cornell Notes</button>}
              <button disabled={!!busy} onClick={del} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-error-container text-on-error-container font-semibold text-body-sm hover:opacity-90 disabled:opacity-60"><Icon name="delete" className="text-[16px]" />Delete</button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
