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
