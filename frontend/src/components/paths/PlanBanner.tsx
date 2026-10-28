import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useSchedule } from "@/hooks/useSchedule";
import { Icon } from "@/components/Icon";
import { cx, planColor } from "@/lib/utils";
import type { Plan } from "@/lib/types";

/** Dashboard strip: one row per running plan (so several plans stay visible), or "make me a plan" when there is none. */
export function PlanBanner() {
  const { schedule } = useSchedule();
  const [plans, setPlans] = useState<Plan[] | undefined>(undefined);
  const nav = useNavigate();
  useEffect(() => { api.plans.list().then(setPlans).catch(() => setPlans([])); }, [schedule?.completed_count, schedule?.total_count]);
  if (plans === undefined) return null;
  const active = plans.filter((p) => p.status === "active");
  const paused = plans.filter((p) => p.status === "paused");
  if (active.length === 0) return (
    <Link to={paused.length ? `/paths?plan=${paused[0].id}` : "/paths/new"} className="mx-gutter-expanded mb-4 flex items-center gap-3 rounded-xl border border-dashed border-primary/50 bg-primary-fixed/30 px-4 py-3 hover:bg-primary-fixed/50">
      <Icon name={paused.length ? "pause_circle" : "route"} className="text-primary text-[26px]" />
      <div className="flex-1"><div className="font-semibold">{paused.length ? `${paused.length === 1 ? "Your plan is" : "Your plans are"} paused` : "Don't know what to study? Let Agama plan it."}</div>
        <div className="text-body-sm text-on-surface-variant">{paused.length ? "Open Learning Path to resume where you left off." : "Pick a subject and a deadline — get a day-by-day schedule."}</div></div><Icon name="arrow_forward" className="text-primary" /></Link>);
  return (
    <section className="mx-gutter-expanded mb-4 flex flex-col gap-2" aria-label="Learning plans">
      {active.map((plan) => {
        const done = plan.blocks_done === plan.blocks_total;
        const c = planColor(plan.color);
        return (
          <div key={plan.id} className={cx("rounded-xl border border-l-4 border-outline-variant bg-surface-container-lowest px-4 py-3 flex items-center gap-4 flex-wrap", c.border)}>
            <Icon name={plan.icon} className="text-primary text-[24px]" />
            <div className="flex-1 min-w-[220px]">
              <div className="font-semibold flex items-center gap-2">{plan.title}{plan.custom && <span className="px-1.5 py-0.5 rounded bg-tertiary-fixed text-on-tertiary-fixed-variant text-[10px] font-semibold uppercase">AI</span>}</div>
              <div className="text-body-sm text-on-surface-variant">{done ? "Plan complete 🎉" : `Day ${Math.min(Math.max(plan.day_index, 1), plan.days)} of ${plan.days} · ${plan.progress_pct}% done`}
                {plan.missed_count > 0 && <span className="text-error font-semibold"> · {plan.missed_count} missed</span>}</div>
              <div className="mt-1.5 h-1.5 rounded-full bg-surface-container overflow-hidden"><div className={cx("h-full", c.bar)} style={{ width: `${plan.progress_pct}%` }} /></div>
            </div>
            {plan.missed_count > 0 && <Link to={`/paths?plan=${plan.id}`} className="px-3 py-2 rounded-lg bg-tertiary-fixed text-on-tertiary-fixed-variant font-semibold text-body-sm">Re-plan</Link>}
            <Link to={`/paths?plan=${plan.id}`} className="px-3 py-2 rounded-lg bg-surface-container font-semibold text-body-sm">Roadmap</Link>
            {plan.next_task_id && !done && <button onClick={() => nav(`/focus/${plan.next_task_id}`)} className="px-4 py-2 rounded-lg bg-primary text-on-primary font-semibold text-body-sm">Continue</button>}
          </div>);
      })}
      <div className="flex justify-end gap-4 text-body-sm">
        {paused.length > 0 && <Link to={`/paths?plan=${paused[0].id}`} className="text-on-surface-variant underline">{paused.length} paused</Link>}
        <Link to="/paths/new" className="text-primary font-semibold flex items-center gap-1"><Icon name="add" className="text-[16px]" />Add another plan</Link>
      </div>
    </section>
  );
}
