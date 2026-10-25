import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useSchedule } from "@/hooks/useSchedule";
import { Icon } from "@/components/Icon";
import type { Plan } from "@/lib/types";

/** Dashboard strip: where am I in my learning plan, what did I miss, or "make me a plan". */
export function PlanBanner() {
  const { schedule } = useSchedule();
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);
  const nav = useNavigate();
  useEffect(() => { api.plans.active().then(setPlan).catch(() => setPlan(null)); }, [schedule?.completed_count, schedule?.total_count]);
  if (plan === undefined) return null;
  if (!plan) return (
    <Link to="/paths/new" className="mx-gutter-expanded mb-4 flex items-center gap-3 rounded-xl border border-dashed border-primary/50 bg-primary-fixed/30 px-4 py-3 hover:bg-primary-fixed/50">
      <Icon name="route" className="text-primary text-[26px]" /><div className="flex-1"><div className="font-semibold">Don't know what to study? Let Agama plan it.</div><div className="text-body-sm text-on-surface-variant">Pick a goal and a deadline — get a day-by-day schedule.</div></div><Icon name="arrow_forward" className="text-primary" /></Link>);
  const done = plan.blocks_done === plan.blocks_total;
  return (
    <section className="mx-gutter-expanded mb-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 flex items-center gap-4 flex-wrap" aria-label="Learning plan">
      <Icon name="route" className="text-primary text-[26px]" />
      <div className="flex-1 min-w-[220px]">
        <div className="font-semibold">{plan.title}</div>
        <div className="text-body-sm text-on-surface-variant">{done ? "Plan complete 🎉" : `Day ${Math.min(Math.max(plan.day_index, 1), plan.days)} of ${plan.days} · ${plan.progress_pct}% done`}
          {plan.missed_count > 0 && <span className="text-error font-semibold"> · {plan.missed_count} missed</span>}</div>
        <div className="mt-1.5 h-1.5 rounded-full bg-surface-container overflow-hidden"><div className="h-full bg-primary-container" style={{ width: `${plan.progress_pct}%` }} /></div>
      </div>
      {plan.missed_count > 0 && <Link to="/paths" className="px-3 py-2 rounded-lg bg-tertiary-fixed text-on-tertiary-fixed-variant font-semibold text-body-sm">Re-plan</Link>}
      <Link to="/paths" className="px-3 py-2 rounded-lg bg-surface-container font-semibold text-body-sm">Roadmap</Link>
      {plan.next_task_id && !done && <button onClick={() => nav(`/focus/${plan.next_task_id}`)} className="px-4 py-2 rounded-lg bg-primary text-on-primary font-semibold text-body-sm">Continue</button>}
    </section>
  );
}
