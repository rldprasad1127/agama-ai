import { useState } from "react";
import type { SeriesPoint } from "@/lib/types";

const W = 600, H = 220, PL = 40, PR = 36, PT = 14, PB = 28;

export function LineChart({ series }: { series: SeriesPoint[] }) {
  const [hi, setHi] = useState<number | null>(null);
  if (!series.length) return null;
  const maxMin = Math.max(10, ...series.map((s) => s.minutes));
  const yMax = Math.ceil(maxMin / 15) * 15;
  const iw = W - PL - PR, ih = H - PT - PB;
  const x = (i: number) => PL + (series.length === 1 ? iw / 2 : (i / (series.length - 1)) * iw);
  const yM = (v: number) => PT + ih - (v / yMax) * ih;
  const yS = (v: number) => PT + ih - (v / 100) * ih;
  const line = (f: (s: SeriesPoint) => number) => series.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${f(s).toFixed(1)}`).join(" ");
  const area = `${line((s) => yM(s.minutes))} L${x(series.length - 1)},${PT + ih} L${x(0)},${PT + ih} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const p = hi != null ? series[hi] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Recent sessions: minutes spent and score">
        {ticks.map((t) => (<g key={t}>
          <line x1={PL} x2={W - PR} y1={PT + ih - t * ih} y2={PT + ih - t * ih} stroke="rgb(var(--c-outline-variant))" strokeDasharray="3 4" />
          <text x={PL - 6} y={PT + ih - t * ih + 3} textAnchor="end" fontSize="10" fill="rgb(var(--c-outline))" fontFamily="JetBrains Mono">{Math.round(t * yMax)}m</text>
          <text x={W - PR + 6} y={PT + ih - t * ih + 3} fontSize="10" fill="rgb(var(--c-secondary))" fontFamily="JetBrains Mono">{Math.round(t * 100)}</text></g>))}
        <defs><linearGradient id="agArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgb(var(--c-primary-container))" stopOpacity=".25" /><stop offset="100%" stopColor="rgb(var(--c-primary-container))" stopOpacity="0" /></linearGradient></defs>
        <path d={area} fill="url(#agArea)" />
        <path d={line((s) => yS(s.score))} fill="none" stroke="rgb(var(--c-secondary))" strokeWidth="1.5" strokeDasharray="4 3" />
        <path d={line((s) => yM(s.minutes))} fill="none" stroke="rgb(var(--c-primary-container))" strokeWidth="2.5" strokeLinejoin="round" />
        {series.map((s, i) => (<g key={i}>
          <circle cx={x(i)} cy={yM(s.minutes)} r={hi === i ? 5 : 3.5} fill="rgb(var(--c-primary-container))" stroke="rgb(var(--c-surface-container-lowest))" strokeWidth="1.5" />
          <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill={hi === i ? "rgb(var(--c-primary))" : "rgb(var(--c-outline))"} fontFamily="JetBrains Mono">{s.label}</text>
          <rect x={x(i) - iw / series.length / 2} y={PT} width={Math.max(14, iw / series.length)} height={ih + PB} fill="transparent" tabIndex={0}
            aria-label={`${s.label}: ${s.minutes} minutes, score ${s.score}`} onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)} onFocus={() => setHi(i)} onBlur={() => setHi(null)} /></g>))}
      </svg>
      {p && hi != null && (
        <div className="absolute pointer-events-none rounded-lg bg-inverse-surface text-inverse-on-surface px-3 py-1.5 font-label-micro text-label-micro shadow-lg"
          style={{ left: `${(x(hi) / W) * 100}%`, top: 0, transform: `translateX(${hi > series.length / 2 ? "-100%" : "0"})` }}>
          <div className="font-semibold">{p.label} · {new Date(p.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
          <div>{p.minutes}m · score {p.score}</div><div>{p.hints_used} hint{p.hints_used === 1 ? "" : "s"}</div></div>)}
      <div className="flex items-center gap-4 mt-1 font-label-micro text-label-micro text-on-surface-variant">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-0.5 bg-primary-container" />Duration (min)</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 border-t border-dashed border-secondary" />Score</span></div>
    </div>
  );
}
