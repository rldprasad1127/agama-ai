import { Link, Navigate } from "react-router-dom";
import { useSchedule } from "@/hooks/useSchedule";
import { Icon } from "@/components/Icon";

/** /focus → jump straight into the next pending block, or explain what to do. */
export default function FocusRedirect() {
  const { schedule, loading, openNewBlock } = useSchedule();
  if (loading) return <div className="p-8 text-on-surface-variant font-label-code text-label-code">Finding your next block…</div>;
  if (schedule?.next_task_id) return <Navigate to={`/focus/${schedule.next_task_id}`} replace />;
  const done = (schedule?.total_count ?? 0) > 0;
  return (
    <div className="max-w-md mx-auto mt-24 text-center px-6">
      <div className="w-14 h-14 mx-auto rounded-xl bg-primary-fixed text-primary flex items-center justify-center mb-4"><Icon name={done ? "emoji_events" : "timer"} className="text-[28px]" /></div>
      <h1 className="font-headline-md text-headline-md">{done ? "All blocks complete" : "Nothing scheduled yet"}</h1>
      <p className="text-on-surface-variant mt-1">{done ? "Great work today. Add another block or review your journal." : "Add a block to today's schedule to start a focus session."}</p>
      <div className="mt-5 flex justify-center gap-3">
        <button onClick={() => openNewBlock()} className="px-4 py-2 rounded-lg bg-primary text-on-primary font-semibold">New Block</button>
        <Link to="/journal" className="px-4 py-2 rounded-lg bg-surface-container font-semibold">Journal</Link>
      </div>
    </div>
  );
}
