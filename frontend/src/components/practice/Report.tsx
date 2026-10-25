import { useState } from "react";
import { Icon } from "@/components/Icon";
import { cx } from "@/lib/utils";
import type { Fb, PSession } from "@/lib/types";

export const scoreTone = (n: number) => (n >= 75 ? "text-secondary" : n >= 55 ? "text-tertiary" : "text-error");

export function ScoreRing({ value, size = 72 }: { value: number; size?: number }) {
  const r = 15.9155;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Score ${value} out of 100`}>
      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3.4" className="stroke-surface-container" />
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3.4" strokeLinecap="round" strokeDasharray={`${value}, 100`} className={cx(value >= 75 ? "stroke-secondary" : value >= 55 ? "stroke-tertiary" : "stroke-error")} />
      </svg>
      <span className={cx("absolute inset-0 flex items-center justify-center font-semibold", scoreTone(value))} style={{ fontSize: size / 3.2 }}>{value}</span>
    </div>
  );
}

export function FeedbackCard({ fb, english }: { fb: Fb; english: boolean }) {
  return (
    <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 flex flex-col gap-4 fade-up">
      <div className="flex items-center gap-4"><ScoreRing value={fb.score} /><div className="font-semibold text-title-md">{fb.score >= 75 ? "Strong answer" : fb.score >= 55 ? "Good start — room to grow" : "Needs more work"}</div></div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div><div className="font-label-micro text-label-micro uppercase text-secondary mb-1">What worked</div><ul className="flex flex-col gap-1">{fb.strengths.map((s, i) => <li key={i} className="flex gap-2"><Icon name="check" className="text-secondary text-[18px] mt-0.5" />{s}</li>)}</ul></div>
        <div><div className="font-label-micro text-label-micro uppercase text-tertiary mb-1">Improve</div><ul className="flex flex-col gap-1">{fb.improvements.map((s, i) => <li key={i} className="flex gap-2"><Icon name="arrow_upward" className="text-tertiary text-[18px] mt-0.5" />{s}</li>)}</ul></div>
      </div>
      {english && fb.grammar_fixes.length > 0 && <div><div className="font-label-micro text-label-micro uppercase text-on-surface-variant mb-1">Corrections</div>
        <ul className="flex flex-col gap-1.5">{fb.grammar_fixes.map((g, i) => <li key={i} className="rounded-lg bg-surface-container-low px-3 py-2"><span className="line-through text-error">{g.wrong}</span> <Icon name="arrow_forward" className="text-[14px] align-middle" /> <span className="font-semibold text-secondary">{g.right}</span>{g.rule && <span className="text-body-sm text-on-surface-variant"> — {g.rule}</span>}</li>)}</ul></div>}
      {fb.better_answer && <div className="rounded-xl bg-primary-fixed/40 p-3"><div className="font-label-micro text-label-micro uppercase text-primary mb-1">A stronger way to say it</div><p className="italic">{fb.better_answer}</p></div>}
      {english && fb.new_vocabulary.length > 0 && <div className="flex gap-2 flex-wrap items-center"><span className="font-label-micro text-label-micro uppercase text-on-surface-variant">Try using:</span>{fb.new_vocabulary.map((v) => <span key={v} className="px-2.5 py-1 rounded-full bg-secondary-container text-on-secondary-container text-body-sm">{v}</span>)}</div>}
    </div>
  );
}

export function ReportView({ s }: { s: PSession }) {
  const r = s.report!;
  const english = s.kind === "ENGLISH";
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-outline-variant bg-gradient-to-br from-primary-fixed/50 to-surface-container-lowest p-6">
        <div className="flex items-center gap-5 flex-wrap"><ScoreRing value={s.score} size={96} />
          <div className="flex-1 min-w-[200px]"><div className="font-label-micro text-label-micro uppercase tracking-wider text-primary">{english ? "English speaking review" : "Interview review"}</div>
            <div className="font-headline-md text-headline-md">{english ? `Estimated level: ${r.cefr_estimate || "—"}` : `Readiness: ${r.readiness || "—"}`}</div>
            <p className="text-on-surface-variant mt-1">{r.summary}</p></div>
          <div className="text-right font-label-code text-label-code"><div className="text-secondary font-semibold">+{s.xp_earned} XP</div><div className="text-on-surface-variant">{r.answered} answered{r.skipped ? ` · ${r.skipped} skipped` : ""}</div></div></div>
      </div>
      <div className="grid sm:grid-cols-4 gap-3">{Object.entries(r.category_scores).map(([k, v]) => (
        <div key={k} className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-3"><div className="font-label-micro text-label-micro uppercase text-on-surface-variant capitalize">{k}</div>
          <div className={cx("text-title-lg font-semibold", scoreTone(v))}>{v}</div><div className="h-1.5 rounded-full bg-surface-container mt-1"><div className={cx("h-full rounded-full", v >= 75 ? "bg-secondary" : v >= 55 ? "bg-tertiary-container" : "bg-error")} style={{ width: `${v}%` }} /></div></div>))}</div>
      <div className="grid sm:grid-cols-3 gap-3 text-body-sm">
        <div className="rounded-xl bg-surface-container-low p-3"><b>{r.wpm || "—"}</b> words per minute<div className="text-on-surface-variant">{r.wpm ? (r.wpm < 110 ? "A little slow — aim for 120–150" : r.wpm > 170 ? "Quite fast — slow down for clarity" : "Good speaking pace") : "No timing recorded"}</div></div>
        <div className="rounded-xl bg-surface-container-low p-3"><b>{r.filler_total}</b> filler words<div className="text-on-surface-variant">{r.fillers.slice(0, 4).map((f) => `${f.word}×${f.count}`).join(", ") || "None detected"}</div></div>
        <div className="rounded-xl bg-surface-container-low p-3"><b>{r.avg_answer_score}</b> average answer score</div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-secondary/30 bg-secondary-container/20 p-4"><div className="font-semibold mb-2 text-secondary">Strengths</div><ul className="flex flex-col gap-1.5">{r.top_strengths.map((x, i) => <li key={i} className="flex gap-2"><Icon name="check_circle" fill className="text-secondary text-[18px] mt-0.5" />{x}</li>)}</ul></div>
        <div className="rounded-xl border border-tertiary/30 bg-tertiary-fixed/30 p-4"><div className="font-semibold mb-2 text-tertiary">Work on</div><ul className="flex flex-col gap-1.5">{r.top_improvements.map((x, i) => <li key={i} className="flex gap-2"><Icon name="flag" className="text-tertiary text-[18px] mt-0.5" />{x}</li>)}</ul></div>
      </div>
      <div className="rounded-xl border border-primary/30 bg-primary-fixed/30 p-4"><div className="font-semibold mb-2 text-primary">Your next 3 practice steps</div><ol className="list-decimal pl-5 flex flex-col gap-1">{r.action_plan.map((x, i) => <li key={i}>{x}</li>)}</ol></div>
      <section><h3 className="font-headline-sm text-headline-sm mb-2">Question by question</h3>
        <div className="flex flex-col gap-2">{s.turns.filter((t) => t.answer !== null).map((t) => (
          <div key={t.index} className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest">
            <button onClick={() => setOpen(open === t.index ? null : t.index)} aria-expanded={open === t.index} className="w-full flex items-center gap-3 p-3 text-left">
              <span className={cx("font-label-code text-label-code font-semibold w-8", scoreTone(t.feedback?.score ?? 0))}>{t.answer ? t.feedback?.score ?? "–" : "skip"}</span>
              <span className="flex-1">{t.kind === "followup" && <span className="mr-2 px-1.5 py-0.5 rounded bg-surface-container text-[11px]">follow-up</span>}{t.question}</span><Icon name={open === t.index ? "expand_less" : "expand_more"} /></button>
            {open === t.index && <div className="px-3 pb-3 flex flex-col gap-3">
              {t.answer ? <div className="rounded-lg bg-surface-container-low p-3 text-body-md"><div className="font-label-micro text-label-micro uppercase text-on-surface-variant mb-1">Your answer · {t.words} words{t.wpm ? ` · ${t.wpm} wpm` : ""}</div>{t.answer}</div> : <p className="text-on-surface-variant">Skipped.</p>}
              {t.rubric && <div className="text-body-sm text-on-surface-variant"><b>A strong answer covers:</b> {t.rubric}</div>}
              {t.feedback && t.answer && <FeedbackCard fb={t.feedback} english={english} />}</div>}
          </div>))}</div></section>
    </div>
  );
}
