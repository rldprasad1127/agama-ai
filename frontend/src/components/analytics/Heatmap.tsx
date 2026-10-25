import { useMemo, useState } from "react";
import type { Heatmap as HeatmapData, HeatmapDay } from "@/lib/types";
import { cx } from "@/lib/utils";

const LEVELS = ["", "rgba(79,70,229,.25)", "rgba(79,70,229,.45)", "rgba(79,70,229,.70)", "rgba(79,70,229,1)"];
const DOW = ["Mon", "", "Wed", "", "Fri", "", "Sun"];

function level(min: number, max: number): number {
  if (min <= 0 || max <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((min / max) * 4)));
}
const fmtDay = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });

export function Heatmap({ data }: { data: HeatmapData }) {
  const [hover, setHover] = useState<{ d: HeatmapDay; col: number; row: number } | null>(null);
  const cols = useMemo(() => {
    const cells: (HeatmapDay | null)[] = [];
    if (data.days.length) {
      const first = new Date(data.days[0].date + "T00:00:00");
      for (let i = 0; i < (first.getDay() + 6) % 7; i++) cells.push(null);
    }
    cells.push(...data.days);
    while (cells.length % 7) cells.push(null);
    const out: (HeatmapDay | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [data.days]);

  return (
    <div className="relative">
      <div className="flex gap-2 overflow-x-auto pb-1">
        <div className="flex flex-col gap-[3px] pt-5 shrink-0">{DOW.map((l, i) => <div key={i} className="h-[16px] font-label-micro text-label-micro text-on-surface-variant leading-[16px]">{l}</div>)}</div>
        <div className="flex gap-[3px]">
          {cols.map((col, ci) => {
            const firstReal = col.find(Boolean);
            const mon = firstReal ? new Date(firstReal.date + "T00:00:00") : null;
            const showMonth = mon && (ci === 0 || mon.getDate() <= 7) ? mon.toLocaleDateString(undefined, { month: "short" }) : "";
            return (
              <div key={ci} className="flex flex-col gap-[3px]">
                <div className="h-4 font-label-micro text-label-micro text-on-surface-variant whitespace-nowrap">{showMonth}</div>
                {col.map((d, ri) => d ? (
                  <button key={d.date} type="button" onMouseEnter={() => setHover({ d, col: ci, row: ri })} onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover({ d, col: ci, row: ri })} onBlur={() => setHover(null)}
                    aria-label={`${fmtDay(d.date)}: ${d.minutes} focus minutes in ${d.sessions} session${d.sessions === 1 ? "" : "s"}`}
                    className={cx("w-[16px] h-[16px] rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-primary", level(d.minutes, data.max_minutes) === 0 && "bg-surface-container")}
                    style={level(d.minutes, data.max_minutes) ? { background: LEVELS[level(d.minutes, data.max_minutes)] } : undefined} />
                ) : <div key={ri} className="w-[16px] h-[16px]" />)}
              </div>);
          })}
        </div>
      </div>
      {hover && (
        <div role="tooltip" className="absolute z-20 pointer-events-none min-w-[210px] max-w-[280px] rounded-lg bg-inverse-surface text-inverse-on-surface shadow-xl px-3 py-2 font-label-micro text-label-micro"
          style={{ left: Math.min(hover.col * 19 + 40, 9999), top: Math.max(0, hover.row * 19 - 8 - hover.d.items.length * 16 - 36), transform: hover.col > cols.length - 8 ? "translateX(-85%)" : undefined }}>
          <div className="font-semibold text-body-sm">{fmtDay(hover.d.date)}</div>
          <div className="text-secondary-fixed">{hover.d.minutes > 0 ? `${hover.d.minutes}m focused · ${hover.d.sessions} session${hover.d.sessions === 1 ? "" : "s"}` : "No focus logged"}</div>
          {hover.d.items.map((it, i) => <div key={i} className="flex justify-between gap-3 mt-0.5"><span className="truncate">{it.title}</span><span className="tabular text-secondary-fixed">{it.minutes}m</span></div>)}
        </div>)}
      <div className="flex items-center justify-end gap-1.5 mt-3 font-label-micro text-label-micro text-on-surface-variant">
        Less{[0, 1, 2, 3, 4].map((l) => <span key={l} className={cx("w-3.5 h-3.5 rounded-[3px]", l === 0 && "bg-surface-container")} style={l ? { background: LEVELS[l] } : undefined} />)}
        More ({Math.max(0, data.max_minutes)}m+)
      </div>
    </div>
  );
}
