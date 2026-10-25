import { Link } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { cx, fmtClock, MODE_META } from "@/lib/utils";
import type { SaveState } from "@/hooks/useAutosave";
import type { Task, TaskMode } from "@/lib/types";

const MODES: TaskMode[] = ["CODE", "PROSE", "THEORY", "SPEECH"];
const saveLabel: Record<SaveState, string> = { idle: "Draft", saving: "Saving…", saved: "Saved", unsaved: "Unsaved", error: "Save failed" };

export function TopBar(p: {
  task: Task; elapsed: number; running: boolean; onPause: () => void; onResume: () => void; onPlus5: () => void;
  binaural: boolean; onBinaural: () => void; onHelp: () => void; save: SaveState; onSave: () => void; onSubmit: () => void; submitting: boolean; onExit: () => void;
}) {
  const { task } = p;
  const planned = task.duration_minutes * 60;
  const over = p.elapsed > planned;
  return (
    <header className="shrink-0 bg-surface-container-lowest border-b border-outline-variant">
      <div className="flex items-center gap-3 px-4 h-14 flex-wrap">
        <button onClick={p.onExit} className="p-1.5 rounded-lg hover:bg-surface-container text-on-surface-variant" aria-label="Exit focus mode"><Icon name="arrow_back" /></button>
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate">{task.title}</div>
          <div className="font-label-micro text-label-micro text-on-surface-variant uppercase tracking-wider">{task.category || MODE_META[task.task_mode].label} · {task.duration_minutes}m block</div>
        </div>
        <div className={cx("font-label-code text-headline-md tabular px-3 py-1 rounded-lg", over ? "text-error bg-error-container/40" : "text-on-surface bg-surface-container")} aria-label="Elapsed time" role="timer">
          {fmtClock(p.elapsed)} <span className="text-on-surface-variant text-body-sm">/ {fmtClock(planned)}</span>
        </div>
        <button onClick={p.running ? p.onPause : p.onResume} className="p-2 rounded-lg hover:bg-surface-container" aria-label={p.running ? "Pause timer" : "Resume timer"} title={p.running ? "Pause" : "Resume"}><Icon name={p.running ? "pause" : "play_arrow"} /></button>
        <button onClick={p.onPlus5} className="px-2.5 py-1.5 rounded-lg hover:bg-surface-container font-semibold text-body-sm" title="Extend this block by 5 minutes">+5m</button>
        <button onClick={p.onHelp} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary-container text-on-secondary-container font-semibold" title="Stuck? Get an explanation, analogy or hint"><Icon name="lightbulb" fill className="text-[18px]" /><span className="hidden sm:inline">AI help</span></button>
        <button onClick={p.onBinaural} aria-pressed={p.binaural} className={cx("p-2 rounded-lg", p.binaural ? "bg-primary-fixed text-primary" : "hover:bg-surface-container text-on-surface-variant")} title="40Hz binaural focus tone"><Icon name="headphones" fill={p.binaural} /></button>
        <button onClick={p.onSave} className={cx("hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg font-label-micro text-label-micro", p.save === "error" ? "text-error" : "text-on-surface-variant")} title="Save draft now"><Icon name={p.save === "saved" ? "cloud_done" : p.save === "error" ? "cloud_off" : "cloud_sync"} className="text-[16px]" />{saveLabel[p.save]}</button>
        <button onClick={p.onSubmit} disabled={p.submitting} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-on-primary font-semibold disabled:opacity-60"><Icon name="auto_awesome" className="text-[18px]" />{task.status === "completed" ? "Re-submit" : "Submit for AI Review"}</button>
      </div>
      <div className="flex items-center gap-1 px-4 pb-2 overflow-x-auto" aria-label="Modality">
        {MODES.map((m) => (
          <span key={m} aria-current={m === task.task_mode} title={m === task.task_mode ? "Current block mode" : "Mode is fixed per block; edit the block to change it"}
            className={cx("flex items-center gap-1.5 px-3 py-1 rounded-full text-body-sm font-semibold whitespace-nowrap", m === task.task_mode ? "bg-primary text-on-primary" : "text-outline opacity-60")}>
            <Icon name={MODE_META[m].icon} className="text-[16px]" />{MODE_META[m].short}
          </span>))}
      </div>
    </header>
  );
}
