import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useSchedule } from "@/hooks/useSchedule";
import { useAuth } from "@/hooks/useAuth";
import type { RuntimeInfo, TaskContent, TaskMode } from "@/lib/types";
import { CATEGORIES, LANGUAGES, MODES, MODE_META, cx, errMsg, fmtMinutes } from "@/lib/utils";
import { Icon } from "./Icon";
import { useToast } from "./Toast";

const TEMPLATES: Record<string, string> = {
  LeetCode: "### Problem Specification\n1. Describe the problem in one paragraph.\n2. State the input / output contract.\n3. Maintain O(1) auxiliary space complexity.\n\n### Examples\n```\nInput:  ...\nOutput: ...\n```\n\n### Complexity goal\nTarget **O(n)** time.",
  "ADR Spec": "### Context\nWhat forces are at play?\n\n### Decision\nWhat are we choosing and why?\n\n### Consequences\n- Positive:\n- Negative:\n- Risks / mitigations:",
};
const DURATIONS = [15, 30, 45, 60, 90, 120];
const MODE_HELP: Record<TaskMode, string> = {
  CODE: "Monaco editor + sandboxed runner", PROSE: "Markdown drafts", THEORY: "Concept breakdown", SPEECH: "Mic + live transcript",
};
const MODE_ICON: Record<TaskMode, string> = { CODE: "code", PROSE: "description", THEORY: "menu_book", SPEECH: "mic" };

export function NewBlockModal() {
  const { newBlockOpen, editing, closeNewBlock, schedule, refresh } = useSchedule();
  const { user } = useAuth();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [mode, setMode] = useState<TaskMode>("CODE");
  const [language, setLanguage] = useState("python");
  const [duration, setDuration] = useState(45);
  const [prompt, setPrompt] = useState("");
  const [when, setWhen] = useState<"today" | "backlog">("today");
  const [content, setContent] = useState<Partial<TaskContent>>({});
  const [busy, setBusy] = useState(false);
  const [gen, setGen] = useState(false);
  const [runtimes, setRuntimes] = useState<RuntimeInfo[]>([]);

  useEffect(() => {
    if (!newBlockOpen) return;
    api.focus.runtimes().then(setRuntimes).catch(() => {});
    if (editing) {
      setTitle(editing.title); setCategory(editing.category); setMode(editing.task_mode); setLanguage(editing.language ?? "python");
      setDuration(editing.duration_minutes); setPrompt(editing.prompt_context); setWhen(editing.date ? "today" : "backlog");
      setContent({ constraints: editing.constraints, hints: editing.hints, checklist: editing.checklist, starter_code: editing.starter_code,
        test_cases: editing.test_cases, word_target_min: editing.word_target_min, word_target_max: editing.word_target_max, target_wpm: editing.target_wpm,
        description: editing.description, difficulty: editing.difficulty, tags: editing.tags });
    } else {
      setTitle(""); setCategory(""); setMode("CODE"); setLanguage(user?.preferences.default_language ?? "python"); setDuration(45);
      setPrompt(""); setWhen("today"); setContent({});
    }
  }, [newBlockOpen, editing, user?.preferences.default_language]);

  useEffect(() => {
    if (!newBlockOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") closeNewBlock(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [newBlockOpen, closeNewBlock]);

  const total = schedule?.total_planned_minutes ?? 0;
  const delta = useMemo(() => (editing && editing.date ? duration - editing.duration_minutes : when === "today" ? duration : 0), [editing, duration, when]);
  if (!newBlockOpen) return null;

  async function generate() {
    if (!title.trim()) { toast("Give the block a title first.", "error"); return; }
    setGen(true);
    try {
      const c = await api.schedule.generate({ title: title.trim(), task_mode: mode, category, language: mode === "CODE" ? language : null, duration_minutes: duration, instructions: prompt });
      setContent(c); setPrompt(c.prompt_context);
      toast("Workspace drafted by AI — review it, then save.", "success");
    } catch (e) { toast(errMsg(e), "error"); }
    finally { setGen(false); }
  }

  async function save() {
    if (!title.trim()) { toast("Block title is required.", "error"); return; }
    setBusy(true);
    try {
      const body = {
        title: title.trim(), task_mode: mode, duration_minutes: duration, category: category.trim(), language: mode === "CODE" ? language : null,
        prompt_context: prompt, description: content.description ?? "", difficulty: content.difficulty ?? null, tags: content.tags ?? [],
        constraints: content.constraints ?? [], hints: content.hints ?? [], checklist: content.checklist ?? [], starter_code: content.starter_code ?? "",
        test_cases: content.test_cases ?? [], word_target_min: content.word_target_min ?? null, word_target_max: content.word_target_max ?? null,
        target_wpm: content.target_wpm ?? null,
      };
      if (editing) {
        await api.schedule.update(editing.id, { ...body, ...(when === "backlog" && editing.date ? { move_to_backlog: true } : {}), ...(when === "today" && !editing.date ? { date: schedule?.date } : {}) });
        toast("Block updated.", "success");
      } else {
        await api.schedule.create({ ...body, backlog: when === "backlog" });
        toast(when === "backlog" ? "Added to backlog." : "Block scheduled.", "success");
      }
      await refresh();
      closeNewBlock();
    } catch (e) { toast(errMsg(e), "error"); }
    finally { setBusy(false); }
  }

  const label = "font-label-code text-label-code text-on-surface font-semibold";
  const input = "w-full bg-surface-container-low rounded-lg px-3 py-2.5 text-body-md text-on-surface outline-none border border-transparent focus:border-primary-container focus:bg-surface-container-lowest";

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-inverse-surface/40 backdrop-blur-[2px] p-4 sm:p-8" onMouseDown={(e) => { if (e.target === e.currentTarget) closeNewBlock(); }}>
      <div role="dialog" aria-modal="true" aria-label="Configure task block" className="fade-up w-full max-w-3xl bg-surface-container-lowest rounded-xl shadow-2xl my-auto">
        <div className="flex items-start justify-between gap-4 p-6 pb-2">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary-container text-on-primary-container flex items-center justify-center shrink-0"><Icon name="terminal" /></div>
            <div>
              <div className="flex items-center gap-2"><h2 className="font-headline-md text-headline-md text-on-surface">{editing ? "Edit Task Block" : "Configure Task Block"}</h2>
                <span className="px-2 py-0.5 rounded bg-primary-fixed text-on-primary-fixed-variant font-label-micro text-label-micro uppercase">Focus Session</span></div>
              <p className="text-body-md text-on-surface-variant">Configure session parameters, workspace mode, and cognitive objectives.</p>
            </div>
          </div>
          <button onClick={closeNewBlock} aria-label="Close" className="p-1 text-on-surface-variant hover:text-on-surface"><Icon name="close" /></button>
        </div>

        <div className="p-6 pt-4 flex flex-col gap-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <div className="flex justify-between mb-1.5"><label className={label} htmlFor="nb-title">Block Title</label><span className="font-label-micro text-label-micro text-on-surface-variant">Primary objective</span></div>
              <input id="nb-title" autoFocus className={input} placeholder="DSA: Two Pointers & Binary Search Partitioning" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label className={cx(label, "block mb-1.5")} htmlFor="nb-cat">Domain / Category</label>
              <input id="nb-cat" list="nb-cats" className={input} placeholder="Algorithms & Complexity" value={category} onChange={(e) => setCategory(e.target.value)} />
              <datalist id="nb-cats">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
          </div>

          <div>
            <div className="flex justify-between mb-1.5"><span className={label}>Workspace Mode</span><span className="font-label-micro text-label-micro text-on-surface-variant uppercase">Select execution environment</span></div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" role="radiogroup">
              {MODES.map((m) => (
                <button key={m} role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                  className={cx("relative text-left rounded-lg p-3 transition-colors", mode === m ? "bg-primary-container text-on-primary-container" : "bg-surface-container-low hover:bg-surface-container text-on-surface")}>
                  <div className="flex items-center justify-between"><Icon name={MODE_ICON[m]} />{mode === m && <Icon name="check_circle" fill className="text-[18px]" />}</div>
                  <div className="mt-3 font-body-md font-semibold text-body-md">{m === "CODE" ? "Code Editor" : m === "PROSE" ? "Prose / Script" : m === "THEORY" ? "Theory & Recall" : "Speech Pitch"}</div>
                  <div className={cx("text-body-sm", mode === m ? "text-on-primary-container" : "text-on-surface-variant")}>{MODE_HELP[m]}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {mode === "CODE" && (
              <div>
                <label className={cx(label, "block mb-1.5")} htmlFor="nb-lang">Target Language / Runtime</label>
                <select id="nb-lang" className={input} value={language} onChange={(e) => setLanguage(e.target.value)}>
                  {LANGUAGES.map((l) => {
                    const rt = runtimes.find((r) => r.key === l.key);
                    return <option key={l.key} value={l.key}>{l.label}{rt ? (rt.available ? " (Ready)" : " (not installed on server)") : ""}</option>;
                  })}
                </select>
              </div>
            )}
            <div className={mode === "CODE" ? "" : "sm:col-span-2"}>
              <label className={cx(label, "block mb-1.5")}>Session Duration</label>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="inline-flex items-center bg-surface-container-low rounded-lg">
                  <button aria-label="Decrease" className="px-3 py-2 hover:bg-surface-container rounded-l-lg" onClick={() => setDuration((d) => Math.max(5, d - 5))}><Icon name="remove" className="text-[18px]" /></button>
                  <span className="px-2 font-label-code text-label-code font-semibold min-w-[64px] text-center tabular">{duration} <span className="text-on-surface-variant">min</span></span>
                  <button aria-label="Increase" className="px-3 py-2 hover:bg-surface-container rounded-r-lg" onClick={() => setDuration((d) => Math.min(480, d + 5))}><Icon name="add" className="text-[18px]" /></button>
                </div>
                {DURATIONS.map((d) => (
                  <button key={d} onClick={() => setDuration(d)} className={cx("px-2.5 py-1.5 rounded-lg font-label-code text-label-code", duration === d ? "bg-primary-container text-on-primary-container" : "bg-surface-container-low hover:bg-surface-container text-on-surface-variant")}>{d}m</button>
                ))}
              </div>
              {when === "today" && <p className="mt-2 flex items-center gap-1.5 text-body-sm text-on-surface-variant"><Icon name="trending_up" className="text-[16px] text-primary" />Impact: {fmtMinutes(total)} → {fmtMinutes(Math.max(0, total + delta))} total today</p>}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
              <span className={label}>Task Objectives &amp; Markdown Prompt</span>
              <div className="flex items-center gap-1 text-body-sm text-on-surface-variant"><Icon name="auto_stories" className="text-[16px]" />Template:
                {Object.keys(TEMPLATES).map((t, i) => (<span key={t}>{i > 0 && <span className="mx-1">/</span>}<button className="text-primary font-semibold hover:underline" onClick={() => setPrompt(TEMPLATES[t])}>{t}</button></span>))}
              </div>
            </div>
            <textarea className={cx(input, "font-label-code text-label-code min-h-[160px] resize-y")} value={prompt} onChange={(e) => setPrompt(e.target.value)}
              placeholder={"### Problem Specification\n1. ...\n\nLeave empty and press “Generate with AI”, or save and let AI prepare it when you start."} />
            <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 text-body-sm text-on-surface-variant"><Icon name="neurology" className="text-[18px] text-primary" />
                <span>{content.test_cases?.length ? `${content.test_cases.length} tests · ` : ""}{content.hints?.length ? `${content.hints.length} hints · ` : ""}{content.checklist?.length ? `${content.checklist.length} checklist items · ` : ""}Markdown supported</span></div>
              <button onClick={generate} disabled={gen} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-fixed text-on-primary-fixed-variant font-semibold text-body-sm hover:bg-primary-fixed-dim disabled:opacity-60">
                <Icon name="auto_awesome" className={cx("text-[16px]", gen && "animate-spin")} />{gen ? "Drafting…" : "Generate with AI"}</button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-body-sm">
            <span className={label}>Add to</span>
            {(["today", "backlog"] as const).map((w) => (
              <button key={w} onClick={() => setWhen(w)} className={cx("px-3 py-1 rounded-lg font-semibold", when === w ? "bg-primary-container text-on-primary-container" : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container")}>{w === "today" ? "Today's schedule" : "Backlog"}</button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4 bg-surface-container-low rounded-b-xl">
          <div className="hidden sm:flex items-center gap-1.5 text-body-sm text-on-surface-variant"><Icon name="schedule" className="text-[16px]" />Daily Timeline Target: {fmtMinutes(total)} → {fmtMinutes(Math.max(0, total + delta))}</div>
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={closeNewBlock} className="px-4 py-2 rounded-lg text-on-surface-variant font-semibold hover:bg-surface-container">Cancel</button>
            <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-on-primary font-semibold hover:bg-primary-container disabled:opacity-60">
              <Icon name="add_task" className="text-[18px]" />{busy ? "Saving…" : editing ? "Save Changes" : "Save & Schedule Block"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
