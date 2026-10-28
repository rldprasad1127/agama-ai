import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, localDate } from "@/lib/api";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { EntryCard } from "@/components/journal/EntryCard";
import { cx, downloadFile, errMsg, fmtMinutes } from "@/lib/utils";
import type { JournalEntry, JournalPage, TaskMode } from "@/lib/types";

type Range = "all" | "7" | "30" | "month";
const PAGE = 15;
const TABS: { key: "" | TaskMode; label: string; icon: string; count: "ALL" | TaskMode }[] = [
  { key: "", label: "All", icon: "", count: "ALL" },
  { key: "CODE", label: "Code", icon: "code", count: "CODE" },
  { key: "PROSE", label: "Writing", icon: "edit_note", count: "PROSE" },
  { key: "THEORY", label: "Theory & Recall", icon: "menu_book", count: "THEORY" },
  { key: "SPEECH", label: "Speech & Voice", icon: "mic", count: "SPEECH" },
];

function rangeDates(r: Range): { date_from?: string; date_to?: string } {
  const now = new Date();
  if (r === "all") return {};
  if (r === "month") return { date_from: localDate(new Date(now.getFullYear(), now.getMonth(), 1)), date_to: localDate(now) };
  const from = new Date(now); from.setDate(now.getDate() - (Number(r) - 1));
  return { date_from: localDate(from), date_to: localDate(now) };
}
function dayHeader(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const long = d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  const today = localDate(), y = new Date(); y.setDate(y.getDate() - 1);
  return iso === today ? `Today — ${long}` : iso === localDate(y) ? `Yesterday — ${long}` : long;
}

export default function Journal() {
  const { toast } = useToast();
  const [range, setRange] = useState<Range>("all");
  const [mode, setMode] = useState<"" | TaskMode>("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [compact, setCompact] = useState(false);
  const [items, setItems] = useState<JournalEntry[]>([]);
  const [meta, setMeta] = useState<JournalPage | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const seq = useRef(0);
  const autoOpened = useRef(false);

  useEffect(() => { const t = setTimeout(() => setQ(qInput), 300); return () => clearTimeout(t); }, [qInput]);

  const load = useCallback(async (p: number) => {
    const id = ++seq.current;
    p === 1 ? setLoading(true) : setMore(true);
    setError(null);
    try {
      const res = await api.metrics.journal({ page: p, page_size: PAGE, mode, q, ...rangeDates(range) });
      if (id !== seq.current) return;
      setMeta(res); setPage(p);
      setItems((prev) => (p === 1 ? res.items : [...prev, ...res.items.filter((x) => !prev.some((o) => o.id === x.id))]));
      if (p === 1 && !autoOpened.current && res.items.length) {
        autoOpened.current = true;
        setOpen(new Set([res.items[0].id]));
      }
    } catch (e) { if (id === seq.current) setError(errMsg(e)); }
    finally { if (id === seq.current) { setLoading(false); setMore(false); } }
  }, [mode, q, range]);
  useEffect(() => { load(1); }, [load]);

  const groups = useMemo(() => {
    const g = new Map<string, JournalEntry[]>();
    items.forEach((e) => g.set(e.date, [...(g.get(e.date) ?? []), e]));
    return [...g.entries()];
  }, [items]);

  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  async function exportAll() {
    setExporting(true);
    try { downloadFile(`agama-journal-${localDate()}.json`, JSON.stringify(await api.metrics.export(), null, 2)); toast("Journal exported.", "success"); }
    catch (e) { toast(errMsg(e), "error"); } finally { setExporting(false); }
  }
  const sum = meta?.summary;
  const counts = meta?.counts_by_mode;

  return (
    <div className="px-gutter-expanded py-space-lg flex flex-col gap-space-lg">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="font-label-micro text-label-micro text-primary uppercase tracking-wider">Agama / Journal &amp; Archive</div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">Journal &amp; Archive</h1>
          <p className="text-body-md text-on-surface-variant max-w-xl">Chronological ledger of completed learning blocks, AI evaluations, and retention telemetry.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-fixed/60 text-on-primary-fixed-variant font-semibold">
            <Icon name="calendar_month" className="text-[18px]" />
            <select aria-label="Date range" value={range} onChange={(e) => setRange(e.target.value as Range)} className="bg-transparent outline-none cursor-pointer">
              <option value="all">All Time{meta && range === "all" ? ` (${meta.counts_by_mode.ALL} Blocks)` : ""}</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="month">This month</option>
            </select>
          </label>
          <button onClick={exportAll} disabled={exporting} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary font-semibold hover:bg-primary-container disabled:opacity-60"><Icon name="download" className="text-[18px]" />{exporting ? "Exporting…" : "Export Journal"}</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { l: "Blocks logged", v: sum ? String(sum.blocks_logged) : "—", i: "inventory_2" },
          { l: "Aggregate focus", v: sum ? fmtMinutes(sum.focus_seconds / 60) : "—", i: "timelapse" },
          { l: "Contract pass rate", v: sum ? `${sum.pass_rate}%` : "—", i: "verified" },
          { l: "Average score", v: sum ? `${sum.avg_score}` : "—", i: "grade" },
        ].map((k) => (
          <div key={k.l} className="rounded-xl bg-surface-container-lowest shadow-sm p-3 flex items-center justify-between">
            <div><div className="font-label-micro text-label-micro uppercase tracking-wider text-on-surface-variant">{k.l}</div><div className="font-label-metric text-label-metric text-on-surface tabular">{k.v}</div></div>
            <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary"><Icon name={k.i} /></div>
          </div>))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Icon name="search" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-outline text-[18px]" />
          <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Search blocks…" aria-label="Search journal" className="pl-9 pr-3 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant/60 outline-none focus:border-primary-container w-52" />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap" role="tablist">
          {TABS.map((t) => (
            <button key={t.label} role="tab" aria-selected={mode === t.key} onClick={() => setMode(t.key)}
              className={cx("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-body-sm font-semibold", mode === t.key ? "bg-primary-container text-on-primary-container" : "bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container")}>
              {t.icon && <Icon name={t.icon} className="text-[16px]" />}{t.label}
              <span className={cx("px-1.5 rounded-full font-label-micro text-label-micro", mode === t.key ? "bg-white/20" : "bg-surface-container")}>{counts?.[t.count] ?? 0}</span></button>))}
        </div>
        <div className="ml-auto inline-flex rounded-lg bg-surface-container-lowest p-0.5 border border-outline-variant/50">
          {(["Feed", "Compact"] as const).map((v) => (
            <button key={v} onClick={() => setCompact(v === "Compact")} className={cx("px-3 py-1 rounded-md text-body-sm font-semibold", (v === "Compact") === compact ? "bg-primary-fixed text-primary" : "text-on-surface-variant")}>{v}</button>))}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-xl bg-surface-container animate-pulse" />)}</div>
      ) : error ? (
        <div className="rounded-xl bg-error-container text-on-error-container p-4 flex items-center justify-between gap-3"><span>{error}</span>
          <button onClick={() => load(1)} className="px-3 py-1.5 rounded-lg bg-error text-on-error font-semibold text-body-sm">Retry</button></div>
      ) : items.length === 0 ? (
        <div className="rounded-xl bg-surface-container-lowest p-10 text-center shadow-sm">
          <Icon name="menu_book" className="text-[40px] text-primary" /><h3 className="font-headline-sm mt-2">{q || mode || range !== "all" ? "No entries match these filters" : "Your journal is empty"}</h3>
          <p className="text-on-surface-variant mt-1">{q || mode || range !== "all" ? "Try clearing the search or widening the date range." : "Finish a focus block and its AI review will appear here."}</p></div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map(([date, es]) => {
            const secs = es.reduce((a, e) => a + e.time_spent_seconds, 0), xp = es.reduce((a, e) => a + e.xp_earned, 0);
            return (
              <section key={date} aria-label={dayHeader(date)}>
                <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                  <div className="flex items-center gap-2"><span className="w-4 h-4 rounded-full border-4 border-primary-container bg-surface-container-lowest" />
                    <h2 className="font-headline-sm text-headline-sm">{dayHeader(date)}</h2></div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-fixed/50 text-on-primary-fixed-variant font-label-micro text-label-micro">
                    <Icon name="bolt" className="text-[14px]" />Focused: {fmtMinutes(secs / 60)} · {es.length} Block{es.length === 1 ? "" : "s"} Verified · +{xp} XP</div>
                </div>
                <div className="ml-2 pl-5 border-l-2 border-surface-variant flex flex-col gap-3">
                  {es.map((e) => <EntryCard key={e.id} e={e} compact={compact} expanded={open.has(e.id)} onToggle={() => toggle(e.id)}
                    onDeleted={(id) => { setItems((p) => p.filter((x) => x.id !== id)); load(1); }} />)}
                </div>
              </section>);
          })}
          {meta && page < meta.pages && (
            <button onClick={() => load(page + 1)} disabled={more} className="self-center px-5 py-2 rounded-lg bg-surface-container-lowest shadow-sm font-semibold hover:bg-surface-container disabled:opacity-60">{more ? "Loading…" : `Load more (${meta.total - items.length} left)`}</button>)}
        </div>
      )}
    </div>
  );
}
