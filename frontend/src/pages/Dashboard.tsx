import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useSchedule } from "@/hooks/useSchedule";
import { useAiStatus } from "@/hooks/useAiStatus";
import { Icon } from "@/components/Icon";
import { PlanBanner } from "@/components/paths/PlanBanner";
import { useToast } from "@/components/Toast";
import { MODES, MODE_META, cx, errMsg, fmtMinutes, greeting, planColor } from "@/lib/utils";
import type { FlashcardStats, Preset, Task } from "@/lib/types";

const QUOTES = [
  ["Simple things should be simple, complex things should be possible.", "Alan Kay"],
  ["Programs must be written for people to read, and only incidentally for machines to execute.", "Harold Abelson"],
  ["Make it work, make it right, make it fast.", "Kent Beck"],
  ["The best way to predict the future is to invent it.", "Alan Kay"],
  ["First, solve the problem. Then, write the code.", "John Johnson"],
];

function Ring({ pct }: { pct: number }) {
  return (
    <div className="relative w-14 h-14 flex-shrink-0 flex items-center justify-center" role="img" aria-label={`${pct}% of today's plan complete`}>
      <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
        <path className="text-surface-container" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3.5" />
        <path className="text-primary-container" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeDasharray={`${pct}, 100`} strokeLinecap="round" strokeWidth="3.5" />
      </svg>
      <span className="absolute font-label-code text-label-micro text-on-surface font-semibold">{pct}%</span>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { schedule, loading, error, refresh, setSchedule, openNewBlock } = useSchedule();
  const { toast } = useToast();
  const nav = useNavigate();
  const ai = useAiStatus();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [backlog, setBacklog] = useState<Task[]>([]);
  const [cards, setCards] = useState<FlashcardStats | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const quote = useRef(QUOTES[new Date().getDate() % QUOTES.length]).current;

  const loadSide = useCallback(() => {
    api.schedule.backlog().then(setBacklog).catch(() => {});
    api.flashcards.stats().then(setCards).catch(() => {});
  }, []);
  useEffect(() => { api.schedule.presets().then(setPresets).catch(() => {}); }, []);
  useEffect(() => { loadSide(); }, [loadSide, schedule?.total_count, schedule?.completed_count]);
  useEffect(() => {
    if (!menuFor) return;
    const h = () => setMenuFor(null);
    window.addEventListener("click", h);
    return () => window.removeEventListener("click", h);
  }, [menuFor]);

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try { await fn(); if (ok) toast(ok, "success"); } catch (e) { toast(errMsg(e), "error"); } finally { setBusy(null); }
  };

  if (loading && !schedule) return <div className="p-8 font-label-code text-label-code text-on-surface-variant">Loading your day…</div>;
  if (!schedule) return (
    <div className="p-8 max-w-lg"><div className="rounded-xl bg-error-container text-on-error-container p-4"><b>Couldn't load your schedule.</b><div className="text-body-sm mt-1">{error}</div>
      <button onClick={refresh} className="mt-3 px-3 py-1.5 rounded-lg bg-error text-on-error font-semibold text-body-sm">Retry</button></div></div>
  );

  const tasks = schedule.tasks;
  const nextId = schedule.next_task_id;
  const pending = tasks.filter((t) => t.status === "pending");

  async function drop(targetId: string) {
    if (!dragId || dragId === targetId || !schedule) { setDragId(null); setOverId(null); return; }
    const ids = schedule.tasks.map((t) => t.id);
    const from = ids.indexOf(dragId), to = ids.indexOf(targetId);
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setDragId(null); setOverId(null);
    const byId = new Map(schedule.tasks.map((t) => [t.id, t]));
    setSchedule({ ...schedule, tasks: ids.map((id) => byId.get(id)!) }); // optimistic
    try { setSchedule(await api.schedule.reorder(ids, schedule.date)); } catch (e) { toast(errMsg(e), "error"); refresh(); }
  }
  const changeDuration = (t: Task, delta: number) => run(`d${t.id}`, async () => {
    await api.schedule.update(t.id, { duration_minutes: Math.max(5, Math.min(480, t.duration_minutes + delta)) }); await refresh();
  });
  const toggleDone = (t: Task) => run(`s${t.id}`, async () => {
    await api.schedule.setStatus(t.id, t.status === "completed" ? "pending" : "completed"); await refresh();
  });
  const remove = (t: Task) => { if (!window.confirm(`Delete “${t.title}”?`)) return; run(`x${t.id}`, async () => { await api.schedule.remove(t.id); await refresh(); }, "Block deleted."); };
  const regenerate = (t: Task) => run(`g${t.id}`, async () => { await api.schedule.regenerate(t.id); await refresh(); }, "Workspace regenerated with AI.");
  const toBacklog = (t: Task) => run(`b${t.id}`, async () => { await api.schedule.update(t.id, { move_to_backlog: true }); await refresh(); loadSide(); }, "Moved to backlog.");
  const scheduleBacklog = (t: Task) => run(`sb${t.id}`, async () => { await api.schedule.update(t.id, { date: schedule.date }); await refresh(); loadSide(); }, "Scheduled for today.");
  const applyPreset = (p: Preset) => run(`p${p.key}`, async () => { setSchedule(await api.schedule.applyPreset(p.key, schedule.date)); }, `${p.name} added.`);
  const shape = (m: 15 | 30 | 60) => run(`sh${m}`, async () => { setSchedule(await api.schedule.shape(m, schedule.date)); }, `Next block extended by ${m}m.`);

  const totalMode = Math.max(1, schedule.total_planned_minutes);

  return (
    <div className="flex flex-col w-full">
      <section className="px-gutter-expanded py-space-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md bg-surface-container-lowest rounded-xl p-space-lg shadow-sm">
          <div className="flex items-center gap-space-md">
            <Ring pct={schedule.progress_pct} />
            <div className="flex flex-col">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-headline-md text-headline-md text-on-surface tracking-tight">{greeting()}, {user?.name.split(" ")[0]}</h1>
                <span className="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-label-micro text-label-micro font-semibold uppercase">Streak Day {schedule.streak_count}</span>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span>Today's Target:</span><span className="font-label-code text-label-code text-on-surface font-semibold">{fmtMinutes(schedule.total_planned_minutes)} planned</span>
                <span className="text-outline">·</span><span>{schedule.total_count} block{schedule.total_count === 1 ? "" : "s"} scheduled</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-space-sm">
            <div className="hidden sm:flex items-center gap-space-sm px-3 py-1.5 rounded-lg bg-surface-container text-on-surface">
              <div className="flex items-center gap-1"><Icon name="local_fire_department" fill className="text-[16px] text-tertiary-container" /><span className="font-label-code text-label-code font-semibold">{schedule.streak_count}d</span></div>
              <span className="text-outline-variant">|</span>
              <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-secondary" /><span className="font-label-micro text-label-micro text-on-surface-variant">{user?.xp ?? 0} XP</span></div>
            </div>
            <button onClick={() => openNewBlock()} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-surface-container-low text-on-surface hover:bg-surface-container shadow-sm font-semibold">
              <Icon name="add_circle" className="text-[18px] text-primary" />Add Task</button>
            <button disabled={!nextId} onClick={() => nextId && nav(`/focus/${nextId}`)} className="relative inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary hover:brightness-110 shadow-md font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
              <Icon name="play_arrow" fill className="text-[20px]" />{nextId ? `Start Session (${fmtMinutes(schedule.remaining_minutes)})` : "No pending blocks"}</button>
          </div>
        </div>
      </section>

      <PlanBanner />
      <div className="px-gutter-expanded grid grid-cols-1 lg:grid-cols-12 gap-gutter-expanded pb-space-2xl">
        <div className="lg:col-span-8 flex flex-col gap-space-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><Icon name="view_timeline" className="text-primary text-[20px]" /><h2 className="font-headline-sm text-headline-sm">Today's Stage Pipeline</h2>
              <span className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-micro text-label-micro">{tasks.length} Blocks</span></div>
            <div className="hidden sm:flex items-center gap-2 text-on-surface-variant font-label-micro text-label-micro"><Icon name="drag_indicator" className="text-[16px] text-outline" />Drag to rearrange agenda</div>
          </div>

          <div className="flex flex-col gap-3">
            {tasks.length === 0 && (
              <div className="rounded-xl bg-surface-container-lowest p-8 text-center shadow-sm">
                <Icon name="event_available" className="text-[36px] text-primary" />
                <h3 className="font-headline-sm mt-2">Your day is a blank canvas</h3>
                <p className="text-on-surface-variant text-body-md mt-1">Add a block, or start from a sprint preset on the right.</p>
                <button onClick={() => openNewBlock()} className="mt-4 px-4 py-2 rounded-lg bg-primary text-on-primary font-semibold">New Block</button>
              </div>
            )}
            {tasks.map((t) => {
              const done = t.status === "completed", isNext = t.id === nextId, m = MODE_META[t.task_mode];
              return (
                <div key={t.id} draggable onDragStart={() => setDragId(t.id)} onDragEnd={() => { setDragId(null); setOverId(null); }}
                  onDragOver={(e) => { e.preventDefault(); setOverId(t.id); }} onDrop={() => drop(t.id)}
                  className={cx("group relative flex items-center justify-between gap-3 p-space-md rounded-xl bg-surface-container-lowest shadow-sm hover:shadow-md transition-all border",
                    isNext ? "border-primary-container border-2" : "border-transparent hover:border-surface-variant", dragId === t.id && "opacity-40", overId === t.id && dragId && dragId !== t.id && "ring-2 ring-primary-container/40")}>
                  {isNext && <span className="absolute -top-2.5 left-14 px-2 py-0.5 rounded bg-primary-container text-on-primary-container font-label-micro text-label-micro uppercase flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-secondary-fixed" />Next Up</span>}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="cursor-grab text-outline hover:text-on-surface-variant" title="Drag to reorder"><Icon name="drag_indicator" /></span>
                    <button onClick={() => toggleDone(t)} disabled={busy === `s${t.id}`} aria-label={done ? "Mark as pending" : "Mark as completed"} title={done ? "Mark as pending" : "Mark complete without AI review"}
                      className={cx("w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors", done ? "bg-secondary-container text-secondary" : isNext ? "bg-primary-fixed text-primary" : "bg-surface-container text-outline hover:bg-surface-container-high")}>
                      <Icon name={done ? "check_circle" : isNext ? "play_circle" : "radio_button_unchecked"} fill={done || isNext} />
                    </button>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className={cx("font-headline-sm text-headline-sm", done && "line-through text-on-surface-variant")}>{t.title}</h3>
                        <span className={cx("px-2 py-0.5 rounded font-label-micro text-label-micro", m.chip)}>{m.label}{t.task_mode === "CODE" && t.language ? `: ${t.language}` : ""}</span>
                        {t.plan_name && <span className={cx("px-2 py-0.5 rounded font-label-micro text-label-micro inline-flex items-center gap-1", planColor(t.plan_color).chip)}><span className={cx("w-1.5 h-1.5 rounded-full", planColor(t.plan_color).dot)} />{t.plan_name}</span>}
                        <span className="font-label-code text-label-code text-primary">{t.start_time} - {t.end_time}</span>
                        {done && <span className="font-label-micro text-label-micro text-secondary uppercase">Completed</span>}
                        {!t.content_ready && !done && <span className="font-label-micro text-label-micro text-tertiary uppercase px-1.5 py-0.5 rounded bg-tertiary-fixed">AI preps on start</span>}
                      </div>
                      {(t.description || t.category) && <p className="text-body-sm text-on-surface-variant truncate mt-0.5">{t.description || t.category}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!done ? (
                      <div className="hidden sm:inline-flex items-center rounded-lg bg-surface-container-low">
                        <button aria-label="Shorten by 5 minutes" disabled={busy === `d${t.id}`} onClick={() => changeDuration(t, -5)} className="px-2 py-1 hover:bg-surface-container rounded-l-lg">-</button>
                        <span className="px-2 font-label-code text-label-code tabular min-w-[44px] text-center">{t.duration_minutes}m</span>
                        <button aria-label="Extend by 5 minutes" disabled={busy === `d${t.id}`} onClick={() => changeDuration(t, 5)} className="px-2 py-1 hover:bg-surface-container rounded-r-lg">+</button>
                      </div>
                    ) : <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-container-low font-label-code text-label-code"><Icon name="lock" className="text-[14px]" />{t.duration_minutes}m</span>}
                    {!done && <Link to={`/focus/${t.id}`} className={cx("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-body-sm", isNext ? "bg-primary text-on-primary hover:brightness-110" : "bg-surface-container text-on-surface hover:bg-surface-container-high")}><Icon name="timer" className="text-[16px]" />Focus</Link>}
                    {done && <Link to="/journal" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-container text-on-surface font-semibold text-body-sm hover:bg-surface-container-high"><Icon name="menu_book" className="text-[16px]" />Review</Link>}
                    <div className="relative">
                      <button aria-label="Block options" onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === t.id ? null : t.id); }} className="p-1 rounded hover:bg-surface-container text-on-surface-variant"><Icon name="more_vert" /></button>
                      {menuFor === t.id && (
                        <div className="absolute right-0 top-8 w-52 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-lg py-1 z-20 fade-up" onClick={(e) => e.stopPropagation()}>
                          <MenuItem icon="edit" label="Edit block" onClick={() => { setMenuFor(null); openNewBlock(t); }} />
                          <MenuItem icon="auto_awesome" label="Regenerate with AI" onClick={() => { setMenuFor(null); regenerate(t); }} />
                          <MenuItem icon="inbox" label="Move to backlog" onClick={() => { setMenuFor(null); toBacklog(t); }} />
                          <MenuItem icon="delete" label="Delete" danger onClick={() => { setMenuFor(null); remove(t); }} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <button onClick={() => openNewBlock()} className="flex items-center justify-center gap-2 py-4 rounded-xl border-2 border-dashed border-outline-variant text-on-surface-variant hover:border-primary-container hover:text-primary transition-colors">
              <Icon name="add" className="text-[18px]" />Click to append quick block or drag to reorder</button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <InfoCard icon="flag" tint="bg-primary-fixed text-primary" label="Daily target" value={`${fmtMinutes(schedule.total_planned_minutes)} / ${fmtMinutes(schedule.daily_target_minutes)}`}
              sub={schedule.total_planned_minutes >= schedule.daily_target_minutes ? "Target reached" : `${fmtMinutes(schedule.daily_target_minutes - schedule.total_planned_minutes)} to plan`} />
            <InfoCard icon="memory" tint="bg-secondary-container text-secondary" label="AI engine" value={ai?.model ?? "…"} sub={ai ? (ai.reachable ? `${ai.is_cloud ? "Ollama Cloud" : "Local Ollama"} connected` : ai.error ?? "Not reachable") : "Checking…"} />
            <InfoCard icon="style" tint="bg-tertiary-fixed text-tertiary" label="Flashcards due" value={`${cards?.due ?? 0} card${cards?.due === 1 ? "" : "s"}`} sub={cards ? `${cards.total} in your Leitner box` : "…"} />
          </div>
        </div>

        <aside className="lg:col-span-4 flex flex-col gap-space-md">
          <Panel title="Time Allocation" icon="donut_large" meta={`${schedule.total_planned_minutes}m Total`}>
            <div className="flex h-2.5 rounded-full overflow-hidden bg-surface-container">
              {MODES.map((m) => schedule.mode_minutes[m] > 0 && <div key={m} className={MODE_META[m].bar} style={{ width: `${(schedule.mode_minutes[m] / totalMode) * 100}%` }} />)}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3">
              {MODES.map((m) => <div key={m} className="flex items-center gap-2 text-body-sm"><span className={cx("w-2.5 h-2.5 rounded-sm", MODE_META[m].bar)} />{MODE_META[m].label.split(" ")[0]} ({schedule.mode_minutes[m]}m)</div>)}
            </div>
          </Panel>

          <Panel title="Sprint Presets" micro>
            <div className="flex flex-col gap-2">
              {presets.map((p) => (
                <button key={p.key} disabled={busy === `p${p.key}`} onClick={() => applyPreset(p)} className="flex items-center justify-between gap-3 text-left p-3 rounded-lg bg-primary-fixed/50 hover:bg-primary-fixed transition-colors disabled:opacity-60">
                  <div><div className="font-semibold text-body-md">{p.name}</div><div className="font-label-micro text-label-micro text-on-surface-variant">{p.subtitle}</div></div>
                  <span className="font-label-code text-label-code font-semibold">{(p.total_minutes / 60).toFixed(1)}h</span>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Upcoming Backlog" icon="low_priority" meta="Unscheduled">
            <div className="flex flex-col gap-2">
              {backlog.length === 0 && <p className="text-body-sm text-on-surface-variant">Nothing parked. Add blocks to your backlog from “New Block”.</p>}
              {backlog.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-surface-container-low">
                  <div className="min-w-0"><div className="font-semibold text-body-md truncate">{t.title}</div><div className="font-label-micro text-label-micro text-on-surface-variant truncate">{t.description || MODE_META[t.task_mode].label} · {t.duration_minutes}m</div></div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button title="Schedule for today" aria-label="Schedule for today" disabled={busy === `sb${t.id}`} onClick={() => scheduleBacklog(t)} className="p-1 rounded hover:bg-surface-container text-primary"><Icon name="event_available" className="text-[18px]" /></button>
                    <button title="Delete" aria-label="Delete" onClick={() => remove(t)} className="p-1 rounded hover:bg-surface-container text-on-surface-variant"><Icon name="close" className="text-[18px]" /></button>
                  </div>
                </div>
              ))}
              <button onClick={() => openNewBlock()} className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary-fixed/50 text-primary font-semibold text-body-sm hover:bg-primary-fixed"><Icon name="add" className="text-[16px]" />Add Custom Sprint Block</button>
            </div>
          </Panel>

          <Panel title="Schedule Shaper">
            <p className="text-body-sm text-on-surface-variant mb-3">Lengthen the next pending block without touching completed ones.</p>
            <div className="grid grid-cols-3 gap-2">
              {([15, 30, 60] as const).map((m) => (
                <button key={m} disabled={!pending.length || busy === `sh${m}`} onClick={() => shape(m)} className="py-2.5 rounded-lg bg-surface-container-low hover:bg-surface-container disabled:opacity-50 text-center">
                  <div className="font-label-code text-label-code font-semibold">+{m}m</div><div className="font-label-micro text-label-micro text-on-surface-variant">{m === 15 ? "Buffer" : m === 30 ? "Extension" : "Macro Sprint"}</div></button>
              ))}
            </div>
          </Panel>

          <div className="rounded-xl bg-primary-container text-on-primary-container p-space-md shadow-sm">
            <div className="flex items-center justify-between"><span className="font-label-micro text-label-micro uppercase tracking-wider text-on-primary-container">Focus Mode</span><Icon name="visibility_off" className="text-[18px]" /></div>
            <h3 className="font-headline-sm mt-2">Distraction-Free Zen Mode</h3>
            <p className="text-body-sm text-on-primary-container mt-1">Full-screen workspace with timer, binaural audio and autosave. Starts your next pending block.</p>
            <button disabled={!nextId} onClick={() => nextId && nav(`/focus/${nextId}`)} className="mt-3 w-full py-2 rounded-lg bg-surface-container-lowest text-primary font-semibold flex items-center justify-center gap-2 disabled:opacity-60"><Icon name="fullscreen" className="text-[18px]" />Engage Zen Focus</button>
          </div>

          <figure className="rounded-xl bg-surface-container-lowest shadow-sm p-space-md">
            <figcaption className="inline-block px-2 py-0.5 rounded bg-primary-fixed text-on-primary-fixed-variant font-label-micro text-label-micro mb-2">Daily Focus Quote</figcaption>
            <blockquote className="italic text-body-md text-on-surface">“{quote[0]}”</blockquote>
            <div className="text-body-sm text-on-surface-variant mt-1">— {quote[1]}</div>
          </figure>
        </aside>
      </div>
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return <button onClick={onClick} className={cx("w-full text-left px-3 py-2 text-body-sm hover:bg-surface-container flex items-center gap-2", danger && "text-error")}><Icon name={icon} className="text-[16px]" />{label}</button>;
}
function Panel({ title, icon, meta, micro, children }: { title: string; icon?: string; meta?: string; micro?: boolean; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-surface-container-lowest shadow-sm p-space-md">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">{icon && <Icon name={icon} className="text-primary text-[20px]" />}
          <h3 className={micro ? "font-label-micro text-label-micro uppercase tracking-wider text-outline" : "font-headline-sm text-headline-sm"}>{title}</h3></div>
        {meta && <span className="font-label-code text-label-code text-on-surface-variant">{meta}</span>}
      </div>{children}
    </section>
  );
}
function InfoCard({ icon, tint, label, value, sub }: { icon: string; tint: string; label: string; value: string; sub: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-container-lowest shadow-sm min-w-0">
      <div className={cx("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", tint)}><Icon name={icon} /></div>
      <div className="min-w-0"><div className="font-label-micro text-label-micro uppercase tracking-wider text-on-surface-variant">{label}</div>
        <div className="font-semibold text-body-md truncate">{value}</div><div className="text-body-sm text-on-surface-variant truncate">{sub}</div></div>
    </div>
  );
}
