import type { TaskMode } from "./types";

export const MODE_META: Record<TaskMode, { label: string; short: string; icon: string; chip: string; bar: string; hex: string; sub: string }> = {
  CODE: { label: "Code", short: "[Code] Monaco IDE", icon: "code", chip: "bg-primary-fixed text-on-primary-fixed-variant", bar: "bg-primary-container", hex: "#4f46e5", sub: "Code Editor" },
  PROSE: { label: "Prose / Script", short: "[Prose] Creative Writer", icon: "edit_note", chip: "bg-secondary-container text-on-secondary-container", bar: "bg-secondary", hex: "#006c4a", sub: "Markdown drafts" },
  THEORY: { label: "Theory / Recall", short: "[Theory] Active Recall", icon: "menu_book", chip: "bg-tertiary-fixed text-on-tertiary-fixed-variant", bar: "bg-tertiary-container", hex: "#934e00", sub: "Concept breakdown" },
  SPEECH: { label: "Speech", short: "[Speech] Studio Mic", icon: "mic", chip: "bg-surface-container-highest text-on-surface-variant", bar: "bg-outline", hex: "#777587", sub: "Speech pitch" },
};
export const MODES: TaskMode[] = ["CODE", "PROSE", "THEORY", "SPEECH"];

export function fmtMinutes(total: number): string {
  const m = Math.max(0, Math.round(total));
  const h = Math.floor(m / 60), r = m % 60;
  if (h && r) return `${h}h ${r}m`;
  if (h) return `${h}h`;
  return `${r}m`;
}
export function fmtClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60), r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}
export function fmtDateLong(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}
export function greeting(d = new Date()): string {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
export function cx(...p: (string | false | null | undefined)[]): string { return p.filter(Boolean).join(" "); }
export function downloadFile(name: string, content: string, mime = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function errMsg(e: unknown): string { return e instanceof Error ? e.message : "Something went wrong"; }
export const LANGUAGES = [
  { key: "python", label: "Python 3" }, { key: "javascript", label: "JavaScript" }, { key: "typescript", label: "TypeScript" },
  { key: "cpp", label: "C++ 20" }, { key: "go", label: "Go" }, { key: "rust", label: "Rust" },
];
export const CATEGORIES = [
  "Algorithms & Complexity", "Data Structures", "Dynamic Programming", "Systems Design", "Distributed Systems",
  "Databases", "Operating Systems", "Technical Writing", "Technical Communication", "Frontend", "Machine Learning", "General",
];

/** Colour per plan (index stored on the plan) — used for dots, chips and borders so several plans stay distinguishable. */
export const PLAN_COLORS = [
  { dot: "bg-indigo-500", chip: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300", border: "border-indigo-500", bar: "bg-indigo-500" },
  { dot: "bg-emerald-500", chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", border: "border-emerald-500", bar: "bg-emerald-500" },
  { dot: "bg-amber-500", chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300", border: "border-amber-500", bar: "bg-amber-500" },
  { dot: "bg-rose-500", chip: "bg-rose-500/15 text-rose-700 dark:text-rose-300", border: "border-rose-500", bar: "bg-rose-500" },
  { dot: "bg-sky-500", chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300", border: "border-sky-500", bar: "bg-sky-500" },
  { dot: "bg-violet-500", chip: "bg-violet-500/15 text-violet-700 dark:text-violet-300", border: "border-violet-500", bar: "bg-violet-500" },
] as const;
export const planColor = (i: number | null | undefined) => PLAN_COLORS[((i ?? 0) % PLAN_COLORS.length + PLAN_COLORS.length) % PLAN_COLORS.length];
