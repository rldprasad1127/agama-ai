import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api, localDate } from "@/lib/api";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { Heatmap } from "@/components/analytics/Heatmap";
import { LineChart } from "@/components/analytics/LineChart";
import { cx, downloadFile, errMsg, fmtMinutes } from "@/lib/utils";
import type { FlashcardStats, Heatmap as HeatmapData, Performance, Stats, TaskMode } from "@/lib/types";

const TABS: { mode: TaskMode; label: string; icon: string; sub: string }[] = [
  { mode: "CODE", label: "Code Performance", icon: "terminal", sub: "Algorithmic pattern mastery" },
  { mode: "PROSE", label: "Writing Velocity", icon: "edit_note", sub: "Drafting speed and readability" },
  { mode: "THEORY", label: "Theory & Recall", icon: "menu_book", sub: "Comprehension across concepts" },
  { mode: "SPEECH", label: "Speaking", icon: "mic", sub: "Delivery, pacing and fluency" },
];

const levelTone = (l: string) => l === "Mastered" ? { bar: "bg-secondary", txt: "text-secondary" } : l === "Proficient" ? { bar: "bg-primary-container", txt: "text-primary" }
  : l === "Developing" ? { bar: "bg-tertiary-container", txt: "text-tertiary" } : { bar: "bg-orange-300", txt: "text-tertiary-container" };

function Skeleton({ h = "h-32" }: { h?: string }) { return <div className={cx("rounded-xl bg-surface-container animate-pulse", h)} aria-busy="true" />; }
function ErrorBox({ msg, retry }: { msg: string; retry: () => void }) {
  return <div className="rounded-xl bg-error-container text-on-error-container p-4 flex items-center justify-between gap-3"><span className="text-body-sm">{msg}</span>
    <button onClick={retry} className="px-3 py-1.5 rounded-lg bg-error text-on-error font-semibold text-body-sm shrink-0">Retry</button></div>;
}
function Card({ title, sub, right, children }: { title: string; sub?: string; right?: ReactNode; children: ReactNode }) {
  return <section className="rounded-xl bg-surface-container-lowest shadow-sm p-space-lg"><div className="flex items-start justify-between gap-3 mb-4">
    <div><h3 className="font-headline-sm text-headline-sm">{title}</h3>{sub && <p className="text-body-sm text-on-surface-variant">{sub}</p>}</div>{right}</div>{children}</section>;
}
function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="rounded-lg bg-primary-fixed/30 p-3"><div className="font-label-micro text-label-micro uppercase tracking-wider text-on-surface-variant">{label}</div>
    <div className="font-label-metric text-label-metric text-primary tabular">{value}</div>{sub && <div className="font-label-micro text-label-micro text-on-surface-variant">{sub}</div>}</div>;
}
const n = (v: number | null | undefined, suffix = "", d = 1) => v == null ? "—" : `${Number.isInteger(v) ? v : v.toFixed(d)}${suffix}`;

export default function Analytics() {
  const { toast } = useToast();
  const [range, setRange] = useState(30);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsErr, setStatsErr] = useState<string | null>(null);
  const [heat, setHeat] = useState<HeatmapData | null>(null);
  const [heatErr, setHeatErr] = useState<string | null>(null);
  const [tab, setTab] = useState<TaskMode>("CODE");
  const cache = useRef<Partial<Record<TaskMode, Performance>>>({});
  const [perf, setPerf] = useState<Performance | null>(null);
  const [perfErr, setPerfErr] = useState<string | null>(null);
  const [perfLoading, setPerfLoading] = useState(true);
  const [cards, setCards] = useState<FlashcardStats | null>(null);

  const loadStats = useCallback(() => { setStatsErr(null); setStats(null); api.metrics.stats(range).then(setStats).catch((e) => setStatsErr(errMsg(e))); }, [range]);
  const loadHeat = useCallback(() => { setHeatErr(null); api.metrics.heatmap(90).then(setHeat).catch((e) => setHeatErr(errMsg(e))); }, []);
  const loadPerf = useCallback((m: TaskMode, force = false) => {
    setPerfErr(null);
    if (!force && cache.current[m]) { setPerf(cache.current[m]!); setPerfLoading(false); return; }
    setPerfLoading(true);
    api.metrics.performance(m).then((p) => { cache.current[m] = p; setPerf(p); }).catch((e) => setPerfErr(errMsg(e))).finally(() => setPerfLoading(false));
  }, []);
  useEffect(loadStats, [loadStats]);
  useEffect(loadHeat, [loadHeat]);
  useEffect(() => { loadPerf(tab); }, [tab, loadPerf]);
  useEffect(() => { api.flashcards.stats().then(setCards).catch(() => {}); }, []);

  function exportJson() {
    downloadFile(`agama-analytics-${localDate()}.json`, JSON.stringify({ exported_at: new Date().toISOString(), range_days: range, stats, heatmap: heat, performance: cache.current }, null, 2));
    toast("Analytics exported.", "success");
  }
  const activeTab = TABS.find((t) => t.mode === tab)!;

  return (
    <div className="px-gutter-expanded py-space-lg flex flex-col gap-space-lg">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5 font-label-micro text-label-micro text-primary uppercase tracking-wider"><Icon name="insights" className="text-[14px]" />Cognitive telemetry</div>
          <h1 className="font-headline-lg text-headline-lg">Analytics &amp; Mastery</h1>
          <p className="text-body-md text-on-surface-variant max-w-xl">Granular telemetry on focus consistency, skill progression and deterministic execution metrics.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-container-lowest shadow-sm font-semibold"><Icon name="calendar_month" className="text-[18px] text-primary" />
            <select aria-label="Range" value={range} onChange={(e) => setRange(Number(e.target.value))} className="bg-transparent outline-none cursor-pointer">
              <option value={7}>Last 7 Days</option><option value={30}>Last 30 Days</option><option value={90}>Last 90 Days</option></select></label>
          <button onClick={exportJson} disabled={!stats} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-fixed text-on-primary-fixed-variant font-semibold hover:bg-primary-fixed-dim disabled:opacity-60"><Icon name="download" className="text-[18px]" />Export JSON</button>
        </div>
      </div>

      {statsErr ? <ErrorBox msg={statsErr} retry={loadStats} /> : !stats ? <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} />)}</div> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="rounded-xl bg-surface-container-lowest shadow-sm p-space-md flex flex-col justify-between min-h-[150px]">
            <div className="flex justify-between"><span className="font-label-micro text-label-micro uppercase tracking-wider text-on-surface-variant">Total focus time</span><Icon name="timelapse" className="text-primary" /></div>
            <div className="font-label-metric text-[30px] leading-tight font-semibold tabular">{fmtMinutes(stats.total_focus_minutes)}</div>
            <div className="flex items-center justify-between text-body-sm"><span className="px-2 py-0.5 rounded bg-secondary-container text-on-secondary-container font-label-micro text-label-micro font-semibold">+{fmtMinutes(stats.focus_minutes_this_week)} this week</span><span className="text-on-surface-variant">{stats.sessions} sessions logged</span></div></div>
          <div className="rounded-xl bg-surface-container-lowest shadow-sm p-space-md flex flex-col justify-between min-h-[150px]">
            <div className="flex justify-between items-start"><span className="font-label-micro text-label-micro uppercase tracking-wider text-on-surface-variant">Block completion rate</span>
              <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90" role="img" aria-label={`${stats.completion_rate}%`}><circle cx="18" cy="18" r="15.9" fill="none" stroke="rgb(var(--c-surface-container))" strokeWidth="3.5" /><circle cx="18" cy="18" r="15.9" fill="none" stroke="rgb(var(--c-primary-container))" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${stats.completion_rate},100`} /></svg></div>
            <div className="font-label-metric text-[30px] leading-tight font-semibold tabular">{Math.round(stats.completion_rate)}%</div>
            <div className="text-body-sm text-on-surface-variant">{stats.blocks_completed} / {stats.blocks_total} finished cleanly</div></div>
          <div className="rounded-xl bg-surface-container-lowest shadow-sm p-space-md flex flex-col justify-between min-h-[150px]">
            <div className="flex justify-between items-center"><span className="font-label-micro text-label-micro uppercase tracking-wider text-on-surface-variant">Active cadence</span>
              <div className="flex gap-1" aria-label="Last 7 days activity">{stats.active_last_7.map((a, i) => <span key={i} className={cx("w-2.5 h-2.5 rounded-full", a ? "bg-secondary" : "bg-surface-container-high")} />)}</div></div>
            <div className="font-label-metric text-[30px] leading-tight font-semibold tabular flex items-center gap-2">{stats.streak_count} Days<Icon name="local_fire_department" fill className="text-tertiary-container text-[26px]" /></div>
            <div className="text-body-sm text-on-surface-variant">Best: {stats.longest_streak} Days</div></div>
          <div className="rounded-xl bg-surface-container-lowest shadow-sm p-space-md flex flex-col justify-between min-h-[150px]">
            <div className="flex justify-between"><span className="font-label-micro text-label-micro uppercase tracking-wider text-on-surface-variant">Mean block pace</span><Icon name="speed" className="text-primary" /></div>
            <div className="font-label-metric text-[30px] leading-tight font-semibold tabular">{Math.round(stats.mean_block_minutes)}m<span className="text-body-md text-on-surface-variant font-normal"> /block</span></div>
            <div className="flex items-center justify-between text-body-sm">
              <span className={cx("inline-flex items-center gap-1 px-2 py-0.5 rounded font-label-micro text-label-micro font-semibold", stats.pace_delta_minutes <= 0 ? "bg-secondary-container text-on-secondary-container" : "bg-tertiary-fixed text-on-tertiary-fixed-variant")}>
                <Icon name={stats.pace_delta_minutes <= 0 ? "trending_down" : "trending_up"} className="text-[14px]" />{stats.pace_delta_minutes > 0 ? "+" : ""}{Math.round(stats.pace_delta_minutes)}m vs planned</span>
              <span className="text-on-surface-variant">{stats.pace_delta_minutes <= 0 ? "Flow state" : "Running long"}</span></div></div>
        </div>)}

      <Card title="90-Day Focus Consistency" sub="Daily recorded deep-work duration across your sessions"
        right={heat && <div className="flex gap-2 flex-wrap justify-end"><span className="px-2.5 py-1 rounded bg-primary-fixed/50 font-label-code text-label-code">{(heat.total_minutes / 60).toFixed(1)} active hrs logged</span>
          <span className="px-2.5 py-1 rounded bg-secondary-container text-on-secondary-container font-label-code text-label-code">{heat.longest_streak}d peak sequence</span></div>}>
        {heatErr ? <ErrorBox msg={heatErr} retry={loadHeat} /> : !heat ? <Skeleton h="h-44" /> : <Heatmap data={heat} />}
      </Card>

      <div>
        <div className="flex items-center gap-1 flex-wrap bg-primary-fixed/30 rounded-xl p-1 w-fit max-w-full" role="tablist">
          {TABS.map((t) => (<button key={t.mode} role="tab" aria-selected={tab === t.mode} onClick={() => setTab(t.mode)}
            className={cx("inline-flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold text-body-sm", tab === t.mode ? "bg-surface-container-lowest text-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface")}><Icon name={t.icon} className="text-[18px]" />{t.label}</button>))}
        </div>
        <div className="mt-4">
          {perfErr ? <ErrorBox msg={perfErr} retry={() => loadPerf(tab, true)} /> : perfLoading || !perf ? <div className="grid grid-cols-1 lg:grid-cols-2 gap-4"><Skeleton h="h-72" /><Skeleton h="h-72" /></div>
            : perf.attempts === 0 ? (
              <div className="rounded-xl bg-surface-container-lowest p-10 text-center shadow-sm"><Icon name={activeTab.icon} className="text-[40px] text-primary" />
                <h3 className="font-headline-sm mt-2">Nothing to chart yet</h3><p className="text-on-surface-variant mt-1">Complete a {activeTab.label.split(" ")[0].toLowerCase()} block to unlock {activeTab.label.toLowerCase()} analytics.</p></div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card title="Mastery by topic" sub={activeTab.sub}>
                  <div className="flex flex-col gap-4">
                    {perf.topics.map((t) => { const tone = levelTone(t.level); return (
                      <div key={t.category}>
                        <div className="flex items-baseline justify-between gap-2"><span className="font-semibold text-body-md">{t.category}</span>
                          <span className="flex items-center gap-2 shrink-0"><span className="px-1.5 rounded bg-primary-fixed/60 font-label-micro text-label-micro">{t.passed}/{t.attempts} solved</span><span className={cx("font-label-code text-label-code font-semibold", tone.txt)}>{t.mastery_pct}% {t.level}</span></span></div>
                        <div className="h-2 rounded-full bg-surface-container mt-1.5 overflow-hidden" role="progressbar" aria-valuenow={t.mastery_pct} aria-valuemin={0} aria-valuemax={100}><div className={cx("h-full rounded-full", tone.bar)} style={{ width: `${t.mastery_pct}%` }} /></div>
                        <div className="font-label-micro text-label-micro text-on-surface-variant mt-1">Pass rate: {Math.round((t.passed / Math.max(1, t.attempts)) * 100)}% · Avg score {t.avg_score}</div></div>); })}
                  </div>
                  <div className="mt-5 pt-3 border-t border-surface-container flex items-center gap-2 text-body-sm"><Icon name="verified" className="text-secondary text-[18px]" />Mean score: <b className="tabular">{perf.mean_score}</b><span className="text-on-surface-variant">across {perf.attempts} attempts</span></div>
                </Card>
                <Card title={tab === "CODE" ? "Solve velocity & hint autonomy" : tab === "PROSE" ? "Drafting velocity" : tab === "THEORY" ? "Retention & comprehension" : "Delivery trend"} sub={`Last ${perf.series.length} sessions`}>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {tab === "CODE" && <><Stat label="No-hint solves" value={n(perf.no_hint_rate, "%", 0)} /><Stat label="Avg / block" value={n(perf.avg_minutes, "m", 0)} /><Stat label="Test pass rate" value={n(perf.extras.test_pass_rate, "%", 0)} /><Stat label="Optimal complexity" value={n(perf.extras.optimal_complexity_rate, "%", 0)} /></>}
                    {tab === "PROSE" && <><Stat label="Avg words" value={n(perf.extras.avg_words, "", 0)} /><Stat label="Words / min" value={n(perf.extras.words_per_minute)} /><Stat label="Avg FK grade" value={n(perf.extras.avg_readability_grade)} /><Stat label="Avg score" value={n(perf.avg_score)} /></>}
                    {tab === "THEORY" && <><Stat label="Avg comprehension" value={n(perf.extras.avg_comprehension, "%", 0)} /><Stat label="Cards due" value={cards ? String(cards.due) : "—"} sub={cards ? `${cards.total} total` : undefined} /><Stat label="Recall accuracy" value={cards?.accuracy != null ? `${cards.accuracy}%` : "—"} /><Stat label="Avg / block" value={n(perf.avg_minutes, "m", 0)} /></>}
                    {tab === "SPEECH" && <><Stat label="Avg pace" value={n(perf.extras.avg_wpm, " wpm", 0)} /><Stat label="Avg fluency" value={n(perf.extras.avg_fluency, "", 0)} /><Stat label="Avg fillers" value={n(perf.extras.avg_fillers)} /><Stat label="Avg / block" value={n(perf.avg_minutes, "m", 0)} /></>}
                  </div>
                  <LineChart series={perf.series} />
                </Card>
              </div>)}
        </div>
      </div>
    </div>
  );
}
