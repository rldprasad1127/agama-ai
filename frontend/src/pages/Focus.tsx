import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useSchedule } from "@/hooks/useSchedule";
import { useTimer } from "@/hooks/useTimer";
import { useAutosave } from "@/hooks/useAutosave";
import { useBinaural } from "@/hooks/useBinaural";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { errMsg, MODE_META } from "@/lib/utils";
import type { EvaluateMeta, EvaluateOut, Task } from "@/lib/types";
import { TopBar } from "@/components/focus/TopBar";
import { EvaluatingOverlay } from "@/components/focus/EvaluatingOverlay";
import { HelpPanel } from "@/components/focus/HelpPanel";
import { ReviewDrawer } from "@/components/focus/ReviewDrawer";
import { CodeWorkspace } from "@/components/focus/CodeWorkspace";
import { ProseWorkspace } from "@/components/focus/ProseWorkspace";
import { TheoryWorkspace } from "@/components/focus/TheoryWorkspace";
import { SpeechWorkspace } from "@/components/focus/SpeechWorkspace";

const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

/** Loads the block; generates its AI content first when it hasn't been prepared yet. */
export default function Focus() {
  const { taskId = "" } = useParams();
  const [task, setTask] = useState<Task | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [phase, setPhase] = useState<"loading" | "generating">("loading");
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let dead = false;
    setTask(null); setErr(null); setPhase("loading");
    (async () => {
      try {
        let t = await api.focus.get(taskId);
        if (!t.content_ready) { if (!dead) setPhase("generating"); t = await api.schedule.regenerate(taskId); }
        if (!dead) setTask(t);
      } catch (e) { if (!dead) setErr(errMsg(e)); }
    })();
    return () => { dead = true; };
  }, [taskId, tries]);

  if (err) return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background"><div className="max-w-md text-center">
      <Icon name="error" className="text-error text-[40px]" /><h1 className="font-headline-md text-headline-md mt-2">Couldn't open this block</h1>
      <p className="text-on-surface-variant mt-1 break-words">{err}</p>
      <div className="mt-4 flex gap-2 justify-center"><button onClick={() => setTries((n) => n + 1)} className="px-4 py-2 rounded-lg bg-primary text-on-primary font-semibold">Retry</button><Link to="/" className="px-4 py-2 rounded-lg bg-surface-container font-semibold">Dashboard</Link></div>
    </div></div>);
  if (!task) return (
    <div className="min-h-screen flex items-center justify-center bg-background text-on-surface-variant"><div className="text-center">
      <Icon name="progress_activity" className="animate-spin text-primary text-[32px]" />
      <div className="mt-2 font-label-code text-label-code">{phase === "generating" ? "Generating your personalised block with AI… this can take up to a minute." : "Loading block…"}</div></div></div>);
  if (task.practice_kind) return <Navigate to={`/practice/start?task=${task.id}&kind=${task.practice_kind}`} replace />;
  return <Workspace key={task.id + tries} initial={task} />;
}

function Workspace({ initial }: { initial: Task }) {
  const nav = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { refresh } = useSchedule();
  const [task, setTask] = useState(initial);
  const d = initial.draft;
  const [content, setContent] = useState(d?.content ?? (initial.task_mode === "CODE" ? initial.starter_code : ""));
  const [checklistDone, setChecklistDone] = useState<number[]>(d?.checklist_done ?? []);
  const [hintsUsed, setHintsUsed] = useState(d?.hints_used ?? 0);
  const [language, setLanguage] = useState(initial.language || user?.preferences.default_language || "python");
  const metaRef = useRef<Partial<EvaluateMeta>>({});
  const timer = useTimer(d?.elapsed_seconds ?? initial.time_spent_seconds ?? 0);
  const bin = useBinaural(!!user?.preferences.binaural_enabled);
  const autosave = useAutosave(task.id, { content, notes: "", checklistDone, hintsUsed }, timer.getElapsed, true);

  const [evaluating, setEvaluating] = useState(false);
  const [evalErr, setEvalErr] = useState<string | null>(null);
  const [result, setResult] = useState<EvaluateOut | null>(null);
  const [aiModel, setAiModel] = useState("AI");
  const [helpOpen, setHelpOpen] = useState(false);
  const [selected, setSelected] = useState("");
  function openHelp() { setSelected((window.getSelection()?.toString() ?? "").trim()); setHelpOpen(true); }
  useEffect(() => { api.system.aiStatus().then((s) => setAiModel(s.model)).catch(() => {}); }, []);

  const submit = useCallback(async () => {
    const mode = task.task_mode;
    const text = content.trim();
    if (mode === "CODE" && !text) return toast("Write some code before submitting.", "error");
    if (mode === "PROSE" && words(text) < 10) return toast("Write at least 10 words before submitting.", "error");
    if (mode === "THEORY" && words(text) < 5) return toast("Add your recall notes (at least 5 words) before submitting.", "error");
    if (mode === "SPEECH" && words(text) < 5) return toast("Record or type at least 5 words of speech first.", "error");
    timer.pause();
    setEvalErr(null); setEvaluating(true);
    try { await autosave.save(); } catch { /* evaluation carries the content anyway */ }
    try {
      const { failed_runs: _fr, ...clientMeta } = metaRef.current;   // client-only counter, not part of the API
      void _fr;
      const meta: EvaluateMeta = { ...clientMeta, checklist_done: checklistDone, hints_used: hintsUsed, duration_seconds: metaRef.current.duration_seconds ?? timer.getElapsed() };
      if (mode === "THEORY") meta.notes = text;
      const out = await api.focus.evaluate(task.id, { user_submission: content, time_spent_seconds: timer.getElapsed(), language: mode === "CODE" ? language : null, meta });
      setResult(out); setTask(out.task); setEvaluating(false);
      void refresh();
    } catch (e) { setEvalErr(errMsg(e)); }
  }, [task, content, checklistDone, hintsUsed, language, timer, autosave, toast, refresh]);

  async function plus5() {
    try { const t = await api.schedule.update(task.id, { duration_minutes: Math.min(240, task.duration_minutes + 5) }); setTask((p) => ({ ...p, duration_minutes: t.duration_minutes })); void refresh(); toast("Added 5 minutes.", "success"); }
    catch (e) { toast(errMsg(e), "error"); }
  }
  async function exit() { await autosave.save(); void refresh(); nav("/"); }
  function cont() { void refresh(); setResult(null); nav(result?.next_task_id ? `/focus/${result.next_task_id}` : "/"); }

  const props = { task, content, setContent, checklistDone, setChecklistDone, hintsUsed, setHintsUsed, language, setLanguage, elapsed: timer.elapsed, metaRef };
  return (
    <div className="h-screen flex flex-col bg-background text-on-surface">
      <TopBar task={task} elapsed={timer.elapsed} running={timer.running} onPause={timer.pause} onResume={timer.resume} onPlus5={plus5}
        binaural={bin.on} onBinaural={() => { bin.toggle(); }} onHelp={openHelp} save={autosave.state} onSave={() => void autosave.save()} onSubmit={() => void submit()} submitting={evaluating} onExit={() => void exit()} />
      {task.status === "completed" && !result && (
        <div className="bg-tertiary-fixed/40 text-on-surface px-4 py-2 text-body-sm flex items-center gap-2"><Icon name="check_circle" className="text-[18px] text-tertiary" />This block is already completed. Re-submitting re-evaluates it without awarding extra XP.
          {task.journal_id && <Link to="/journal" className="ml-auto underline font-semibold">View journal entry</Link>}</div>)}
      {!timer.running && !evaluating && <div className="bg-surface-container px-4 py-1.5 text-body-sm text-center text-on-surface-variant" role="status">Timer paused — <button className="underline font-semibold" onClick={timer.resume}>resume</button></div>}
      <main className="flex-1 min-h-0 flex flex-col [&>*]:flex-1 [&>*]:min-h-0" data-mode={MODE_META[task.task_mode].label}>
        {task.task_mode === "CODE" && <CodeWorkspace {...props} />}
        {task.task_mode === "PROSE" && <ProseWorkspace {...props} />}
        {task.task_mode === "THEORY" && <TheoryWorkspace {...props} />}
        {task.task_mode === "SPEECH" && <SpeechWorkspace {...props} />}
      </main>
      <HelpPanel task={task} open={helpOpen} onClose={() => setHelpOpen(false)} code={content} runOutput={metaRef.current.run_output ?? ""} elapsed={timer.elapsed}
        failedRuns={metaRef.current.failed_runs ?? 0} initialPassage={selected} onHintLevel={(n) => setTask((p) => ({ ...p, hint_level_used: Math.max(p.hint_level_used, n) }))} />
      {evaluating && <EvaluatingOverlay model={aiModel} error={evalErr} onRetry={() => void submit()} onBack={() => { setEvaluating(false); setEvalErr(null); timer.resume(); }} />}
      {result && <ReviewDrawer result={result} onClose={() => setResult(null)} onJournal={() => { void refresh(); nav("/journal"); }} onContinue={cont} />}
    </div>
  );
}
