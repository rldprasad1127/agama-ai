import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useSchedule } from "@/hooks/useSchedule";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { cx, errMsg, fmtDateLong, fmtMinutes, MODE_META } from "@/lib/utils";
import type { Plan, PlanDay } from "@/lib/types";

const PHASE: Record<string, { label: string; cls: string }> = {
  theory: { label: "Theory", cls: "bg-tertiary-fixed text-on-tertiary-fixed-variant" },
  practice: { label: "Practice", cls: "bg-primary-fixed text-on-primary-fixed-variant" },
  review: { label: "Review", cls: "bg-secondary-container text-on-secondary-container" },
  mock: { label: "Mock", cls: "bg-error-container text-on-error-container" },
  extra: { label: "Extra", cls: "bg-surface-container-highest text-on-surface-variant" },
  session: { label: "Session", cls: "bg-secondary-container text-on-secondary-container" },
};

export default function Paths() {
  const { refresh } = useSchedule();
  const { toast } = useToast();
  const nav = useNavigate();
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);
  const [days, setDays] = useState<PlanDay[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [extend, setExtend] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const todayRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const p = await api.plans.active();
      setPlan(p); setErr(null);
      setDays(p ? await api.plans.days(p.id) : []);
    } catch (e) { setErr(errMsg(e)); setPlan(null); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (plan && plan.day_index > 3) todayRef.current?.scrollIntoView({ block: "center" }); }, [days.length, plan]);

  async function rebalance() {
    if (!plan) return;
    setBusy(true);
    try {
      const r = await api.plans.rebalance(plan.id, extend);
      toast(`Re-planned: ${r.moved} blocks moved${r.dropped.length ? `, ${r.dropped.length} low-priority dropped` : ""}.`, "success");
      await Promise.all([load(), refresh()]);
    } catch (e) { toast(errMsg(e), "error"); } finally { setBusy(false); }
  }
  async function stop() {
    if (!plan) return;
    setBusy(true);
    try { await api.plans.remove(plan.id); setConfirmStop(false); await Promise.all([load(), refresh()]); toast("Plan stopped. Your completed work is kept.", "success"); }
    catch (e) { toast(errMsg(e), "error"); } finally { setBusy(false); }
  }

  if (plan === undefined) return <div className="p-8 text-on-surface-variant font-label-code text-label-code">Loading your plan…</div>;
  if (err) return <div className="p-8"><div role="alert" className="rounded-lg bg-error-container text-on-error-container px-4 py-3">{err}</div></div>;

  if (!plan) return (
    <div className="max-w-2xl mx-auto mt-16 px-6 text-center">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-primary-fixed text-primary flex items-center justify-center"><Icon name="route" className="text-[34px]" /></div>
      <h1 className="font-headline-lg text-headline-lg mt-4">Let Agama plan your learning</h1>
      <p className="text-on-surface-variant mt-2">Pick a goal — learn DSA from zero, practise coding, prepare for an interview or speak better English — and get a day-by-day schedule that fits your deadline.</p>
      <Link to="/paths/new" className="inline-block mt-6 px-6 py-3 rounded-xl bg-primary text-on-primary font-semibold">Create my plan</Link>
    </div>);

  const ended = plan.day_index > plan.days || plan.days_left === 0;
  const done = plan.status === "completed" || plan.blocks_done === plan.blocks_total;
  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-8 flex flex-col gap-6">
      <header className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex-1 min-w-[240px]">
            <div className="font-label-micro text-label-micro uppercase tracking-wider text-primary">{plan.track === "DSA" ? (plan.mode === "LEARN" ? "Learning path" : "Practice plan") : plan.track === "INTERVIEW" ? "Interview prep" : "English speaking"}</div>
            <h1 className="font-headline-md text-headline-md">{plan.title}</h1>
            <p className="text-on-surface-variant">{done ? "All blocks complete — great work!" : ended ? "The planned period has ended — re-plan to finish what's left." : `Day ${Math.max(plan.day_index, 1)} of ${plan.days} · ${plan.days_left} day${plan.days_left === 1 ? "" : "s"} left · ends ${fmtDateLong(plan.end_date)}`}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {plan.next_task_id && !done && <button onClick={() => nav(`/focus/${plan.next_task_id}`)} className="px-5 py-2.5 rounded-xl bg-primary text-on-primary font-semibold flex items-center gap-1.5"><Icon name="play_arrow" fill />Continue</button>}
            <Link to="/paths/new" className="px-4 py-2.5 rounded-xl bg-surface-container font-semibold">New plan</Link>
          </div>
        </div>
        <div className="mt-4 h-2.5 rounded-full bg-surface-container overflow-hidden" role="progressbar" aria-valuenow={plan.progress_pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-primary-container rounded-full transition-all" style={{ width: `${plan.progress_pct}%` }} /></div>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-body-sm">
          {[["Progress", `${plan.progress_pct}%`], ["Blocks done", `${plan.blocks_done} / ${plan.blocks_total}`], ["Time done", `${fmtMinutes(plan.minutes_done)} / ${fmtMinutes(plan.minutes_total)}`], ["Today", `${plan.today_count} to do`]].map(([k, v]) =>
            <div key={k} className="rounded-lg bg-surface-container-low px-3 py-2"><div className="text-on-surface-variant font-label-micro text-label-micro uppercase">{k}</div><div className="font-semibold">{v}</div></div>)}
        </div>
      </header>

      {plan.missed_count > 0 && (
        <div role="alert" className="rounded-xl border border-tertiary-container/60 bg-tertiary-fixed/50 p-4 flex items-center gap-3 flex-wrap">
          <Icon name="event_busy" className="text-tertiary text-[26px]" />
          <div className="flex-1 min-w-[220px]"><div className="font-semibold">You have {plan.missed_count} missed block{plan.missed_count === 1 ? "" : "s"} ({fmtMinutes(plan.missed_minutes)})</div>
            <div className="text-body-sm text-on-surface-variant">Re-plan to spread everything left over the remaining days. If there isn't enough time, the least important blocks are dropped first.</div></div>
          <select aria-label="Extend plan" value={extend} onChange={(e) => setExtend(Number(e.target.value))} className="px-3 py-2 rounded-lg border border-outline-variant bg-surface-container-lowest">
            <option value={0}>Keep end date</option><option value={2}>Extend by 2 days</option><option value={3}>Extend by 3 days</option><option value={7}>Extend by 7 days</option></select>
          <button disabled={busy} onClick={() => void rebalance()} className="px-4 py-2 rounded-lg bg-primary text-on-primary font-semibold disabled:opacity-60">{busy ? "Re-planning…" : "Re-plan now"}</button>
        </div>)}
      {plan.trimmed_topics.length > 0 && <div role="note" className="rounded-xl bg-surface-container-low p-3 text-body-sm"><Icon name="info" className="align-middle mr-1 text-[18px]" />Not enough days for: {plan.trimmed_topics.join(", ")}.</div>}

      {plan.topics.length > 1 && (
        <section aria-label="Roadmap">
          <h2 className="font-headline-sm text-headline-sm mb-3">Roadmap</h2>
          <ol className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {plan.topics.map((t, i) => (
              <li key={t.key} className={cx("rounded-xl border p-3 flex gap-3", t.status === "current" ? "border-primary bg-primary-fixed/30" : "border-outline-variant/60 bg-surface-container-lowest")}>
                <span className={cx("w-8 h-8 rounded-full flex items-center justify-center shrink-0", t.status === "done" ? "bg-secondary text-on-secondary" : t.status === "current" ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant")}>
                  {t.status === "done" ? <Icon name="check" className="text-[18px]" /> : <span className="font-label-code text-label-code">{i + 1}</span>}</span>
                <div className="min-w-0 flex-1"><div className="font-semibold leading-tight">{t.name}</div>
                  <div className="text-body-sm text-on-surface-variant">Day {t.first_day}{t.last_day !== t.first_day ? `–${t.last_day}` : ""} · {t.blocks_done}/{t.blocks_total} blocks</div>
                  <div className="mt-1.5 flex gap-1.5 flex-wrap">{t.mastery !== null && <span className={cx("px-2 py-0.5 rounded-full text-[11px] font-semibold", t.mastery >= 75 ? "bg-secondary-container text-on-secondary-container" : t.mastery >= 55 ? "bg-tertiary-fixed text-on-tertiary-fixed-variant" : "bg-error-container text-on-error-container")}>Mastery {t.mastery}%</span>}
                    {t.help_requests > 2 && <span className="px-2 py-0.5 rounded-full text-[11px] bg-surface-container">needed help ×{t.help_requests}</span>}</div></div>
              </li>))}
          </ol>
        </section>)}

      <section aria-label="Schedule">
        <h2 className="font-headline-sm text-headline-sm mb-3">Day by day</h2>
        <div className="flex flex-col gap-2">
          {days.map((d) => {
            const allDone = d.blocks.every((b) => b.status === "completed");
            return (
              <div key={d.date} ref={d.is_today ? todayRef : undefined} className={cx("rounded-xl border p-3", d.is_today ? "border-primary ring-2 ring-primary/20 bg-surface-container-lowest" : "border-outline-variant/60 bg-surface-container-lowest", allDone && !d.is_today && "opacity-70")}>
                <div className="flex items-center gap-2 mb-1.5"><span className="font-label-code text-label-code font-semibold">Day {d.day}</span><span className="text-body-sm text-on-surface-variant">{fmtDateLong(d.date)}</span>
                  {d.is_today && <span className="px-2 py-0.5 rounded-full bg-primary text-on-primary text-[11px] font-semibold">TODAY</span>}{allDone && <Icon name="check_circle" fill className="text-secondary text-[18px]" />}</div>
                <ul className="flex flex-col gap-1">{d.blocks.map((b) => (
                  <li key={b.id}><button onClick={() => nav(`/focus/${b.id}`)} className="w-full flex items-center gap-2 text-left rounded-lg px-2 py-1.5 hover:bg-surface-container">
                    <Icon name={b.status === "completed" ? "check_circle" : b.missed ? "event_busy" : MODE_META[b.mode as keyof typeof MODE_META].icon} fill={b.status === "completed"} className={cx("text-[20px]", b.status === "completed" ? "text-secondary" : b.missed ? "text-error" : "text-on-surface-variant")} />
                    <span className={cx("flex-1 min-w-0 truncate", b.status === "completed" && "line-through text-on-surface-variant")}>{b.title}</span>
                    <span className={cx("px-2 py-0.5 rounded-full text-[11px] font-semibold", PHASE[b.phase]?.cls)}>{PHASE[b.phase]?.label ?? b.phase}</span>
                    {b.score !== null && <span className="font-label-code text-label-code text-secondary font-semibold">{b.score}</span>}
                    <span className="font-label-code text-label-code text-on-surface-variant w-10 text-right">{b.minutes}m</span></button></li>))}</ul>
              </div>);
          })}
        </div>
      </section>

      <div className="flex justify-end">{confirmStop ? <div className="flex items-center gap-2"><span className="text-body-sm">Remove unfinished blocks?</span><button onClick={() => setConfirmStop(false)} className="px-3 py-1.5 rounded-lg bg-surface-container font-semibold">Cancel</button><button disabled={busy} onClick={() => void stop()} className="px-3 py-1.5 rounded-lg bg-error text-on-error font-semibold">Stop plan</button></div>
        : <button onClick={() => setConfirmStop(true)} className="text-body-sm text-on-surface-variant underline">Stop this plan</button>}</div>
    </div>
  );
}
