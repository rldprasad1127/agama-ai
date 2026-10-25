import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { cx, errMsg, LANGUAGES } from "@/lib/utils";
import type { RunOut, RuntimeInfo } from "@/lib/types";
import { Markdown } from "./Markdown";
import type { WorkProps } from "./types";

const Monaco = lazy(() => import("@monaco-editor/react"));
const EXT: Record<string, string> = { python: "py", javascript: "js", typescript: "ts", cpp: "cpp", go: "go", rust: "rs" };

export function CodeWorkspace({ task, content, setContent, hintsUsed, setHintsUsed, language, setLanguage, metaRef }: WorkProps) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"objective" | "constraints" | "hints">("objective");
  const [runtimes, setRuntimes] = useState<RuntimeInfo[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunOut | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [stdin, setStdin] = useState("");
  const [showStdin, setShowStdin] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [cursor, setCursor] = useState({ ln: 1, col: 1 });
  const contentRef = useRef(content); contentRef.current = content;

  useEffect(() => { api.focus.runtimes().then(setRuntimes).catch(() => {}); }, []);
  useEffect(() => { if (mounted) return; const t = setTimeout(() => setFallback(true), 9000); return () => clearTimeout(t); }, [mounted]);

  const rt = runtimes.find((r) => r.key === language);
  const monacoLang = rt?.monaco ?? language;
  const canRun = !rt || rt.available;
  const hints = task.hints;

  async function run() {
    if (running) return;
    if (!contentRef.current.trim()) { toast("Write some code first.", "error"); return; }
    setRunning(true); setRunError(null);
    try {
      const r = await api.focus.run(task.id, { code: contentRef.current, language, stdin, run_tests: true });
      setResult(r);
      if (r.exit_code !== 0 || r.timed_out || (r.tests_total > 0 && r.tests_passed < r.tests_total)) metaRef.current.failed_runs = (metaRef.current.failed_runs ?? 0) + 1;
      metaRef.current.run_output = [r.stdout && `stdout:\n${r.stdout}`, r.stderr && `stderr:\n${r.stderr}`, r.tests_total ? `tests: ${r.tests_passed}/${r.tests_total}` : ""].filter(Boolean).join("\n\n");
    } catch (e) { setRunError(errMsg(e)); }
    finally { setRunning(false); }
  }
  const runRef = useRef(run); runRef.current = run;

  const tabs = useMemo(() => ([
    { k: "objective" as const, label: "Objective", icon: "description" },
    { k: "constraints" as const, label: "Constraints & Notes", icon: "rule", n: task.constraints.length },
    { k: "hints" as const, label: "Hints", icon: "lightbulb", n: hints.length },
  ]), [task.constraints.length, hints.length]);

  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2">
      <section className="flex flex-col min-h-0 border-r border-outline-variant/40 bg-surface-container-lowest">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-surface-container overflow-x-auto">
          {tabs.map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)} className={cx("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-body-sm font-semibold whitespace-nowrap",
              tab === t.k ? "bg-primary-fixed text-on-primary-fixed-variant" : "text-on-surface-variant hover:bg-surface-container")}>
              <Icon name={t.icon} className="text-[16px]" />{t.label}{t.n ? <span className="ml-1 px-1.5 rounded-full bg-surface-container text-on-surface-variant font-label-micro">{t.n}</span> : null}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {task.difficulty && <span className={cx("px-2 py-1 rounded font-label-code text-label-code", /hard/i.test(task.difficulty) ? "bg-error-container text-on-error-container" : /easy/i.test(task.difficulty) ? "bg-secondary-container text-on-secondary-container" : "bg-tertiary-fixed text-on-tertiary-fixed-variant")}>Difficulty: {task.difficulty}</span>}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {tab === "objective" && (
            <>
              <div className="flex items-center gap-2 flex-wrap mb-2"><h2 className="font-headline-lg text-headline-lg">{task.title}</h2>
                {task.tags.map((t) => <span key={t} className="px-2 py-0.5 rounded bg-primary-fixed text-primary font-label-micro">{t}</span>)}</div>
              {task.prompt_context ? <Markdown>{task.prompt_context}</Markdown> : <p className="text-on-surface-variant">No problem statement yet. Use “Regenerate with AI” on the dashboard.</p>}
            </>
          )}
          {tab === "constraints" && (
            task.constraints.length ? <ul className="flex flex-col gap-2">{task.constraints.map((c, i) => <li key={i} className="flex gap-2 text-body-md"><span className="text-primary">•</span><span className="font-label-code text-label-code">{c}</span></li>)}</ul>
              : <p className="text-on-surface-variant">No explicit constraints for this block.</p>
          )}
          {tab === "hints" && (
            <div className="flex flex-col gap-3">
              <p className="text-body-sm text-on-surface-variant">Hints are revealed one at a time. Using hints lowers your “no-hint solve” rate in Analytics.</p>
              {hints.slice(0, hintsUsed).map((h, i) => <div key={i} className="rounded-lg bg-tertiary-fixed/50 p-3 text-body-md flex gap-2"><Icon name="lightbulb" className="text-tertiary text-[18px]" /><span>{h}</span></div>)}
              {hintsUsed < hints.length
                ? <button onClick={() => setHintsUsed(hintsUsed + 1)} className="self-start px-3 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high font-semibold text-body-sm">Reveal next hint ({hintsUsed}/{hints.length})</button>
                : hints.length === 0 && <p className="text-on-surface-variant">No hints available.</p>}
            </div>
          )}
        </div>
      </section>

      <section className="flex flex-col min-h-0 bg-[#0b1020] text-slate-200">
        <div className="flex items-center gap-2 px-3 py-2 bg-[#0e1428] border-b border-white/10 flex-wrap">
          <select aria-label="Language" value={language} onChange={(e) => setLanguage(e.target.value)} className="bg-[#161d38] text-slate-200 text-label-code font-label-code rounded px-2 py-1 border border-white/10">
            {LANGUAGES.map((l) => { const r = runtimes.find((x) => x.key === l.key); const off = !!r && !r.available; return <option key={l.key} value={l.key}>{l.label}{off ? " (not installed)" : ""}</option>; })}
          </select>
          <span className="font-label-code text-label-code px-2 py-1 rounded bg-[#161d38] flex items-center gap-1.5"><Icon name="code" className="text-[14px]" />solution.{EXT[language] ?? "txt"}</span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setShowStdin((s) => !s)} className={cx("px-2 py-1 rounded font-label-code text-label-code", showStdin ? "bg-white/15" : "hover:bg-white/10")}>stdin</button>
            <button onClick={run} disabled={running || !canRun} title={canRun ? "Run (Ctrl/⌘+Enter)" : `${rt?.label} is not installed on the server`} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 font-semibold text-body-sm disabled:opacity-50">
              <Icon name={running ? "progress_activity" : "play_arrow"} className={cx("text-[16px] text-emerald-400", running && "animate-spin")} />{running ? "Running…" : "Run Code"}</button>
          </div>
        </div>
        <div className="flex-1 min-h-[280px] relative">
          {fallback && !mounted ? (
            <textarea aria-label="Code editor" spellCheck={false} value={content} onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); runRef.current(); } }}
              className="absolute inset-0 w-full h-full bg-[#0b1020] text-slate-200 font-label-code text-[13px] leading-5 p-4 outline-none resize-none" />
          ) : (
            <Suspense fallback={<div className="p-4 font-label-code text-label-code text-slate-400">Loading editor…</div>}>
              <Monaco height="100%" theme="vs-dark" language={monacoLang} value={content} onChange={(v) => setContent(v ?? "")}
                loading={<div className="p-4 font-label-code text-label-code text-slate-400">Loading Monaco editor…</div>}
                onMount={(ed, monaco) => {
                  setMounted(true);
                  ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current());
                  ed.onDidChangeCursorPosition((e) => setCursor({ ln: e.position.lineNumber, col: e.position.column }));
                }}
                options={{ minimap: { enabled: false }, fontFamily: "JetBrains Mono, monospace", fontSize: 13, lineHeight: 20, scrollBeyondLastLine: false, padding: { top: 12 }, tabSize: 4, automaticLayout: true }} />
            </Suspense>
          )}
        </div>
        {showStdin && <textarea aria-label="Program input" value={stdin} onChange={(e) => setStdin(e.target.value)} placeholder="Standard input for “Run Code” (optional)" className="h-16 bg-[#0e1428] border-t border-white/10 px-3 py-2 font-label-code text-label-code text-slate-200 outline-none resize-none" />}
        {(result || runError || running) && (
          <div className="max-h-[42%] overflow-y-auto border-t border-white/10 bg-[#080c19] p-3 font-label-code text-label-code" aria-live="polite">
            {runError && <div className="text-rose-300">{runError}</div>}
            {result && (
              <>
                <div className="flex items-center gap-3 text-slate-400 mb-2 flex-wrap">
                  <span>exit {result.exit_code ?? "—"}</span><span>{result.duration_ms} ms</span>
                  {result.timed_out && <span className="text-amber-300">⏱ TIME LIMIT</span>}
                  {result.tests_total > 0 && <span className={cx("px-2 rounded", result.tests_passed === result.tests_total ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300")}>{result.tests_passed}/{result.tests_total} tests passed</span>}
                </div>
                {result.stdout && <pre className="whitespace-pre-wrap text-slate-200">{result.stdout}</pre>}
                {result.stderr && <pre className="whitespace-pre-wrap text-rose-300">{result.stderr}</pre>}
                {result.tests.length > 0 && (
                  <table className="w-full mt-2 text-left"><thead className="text-slate-500"><tr><th className="py-1 pr-2">Test</th><th className="pr-2">Call</th><th className="pr-2">Expected</th><th className="pr-2">Actual</th><th /></tr></thead>
                    <tbody>{result.tests.map((t, i) => (
                      <tr key={i} className="border-t border-white/5 align-top"><td className="py-1 pr-2">{t.name}</td><td className="pr-2 text-slate-400 break-all">{t.call}</td><td className="pr-2">{t.expected}</td>
                        <td className={cx("pr-2 break-all", t.passed ? "text-slate-300" : "text-rose-300")}>{t.error ?? t.actual ?? "—"}</td>
                        <td className={t.passed ? "text-emerald-400" : "text-rose-400"}>{t.passed ? "✓" : "✗"}</td></tr>))}</tbody></table>
                )}
                {!result.stdout && !result.stderr && !result.tests.length && <span className="text-slate-500">(no output)</span>}
              </>
            )}
          </div>
        )}
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#0e1428] border-t border-white/10 font-label-code text-label-code text-slate-400">
          <span>Ln {cursor.ln}, Col {cursor.col} &nbsp;|&nbsp; Spaces: 4 &nbsp;|&nbsp; UTF-8</span>
          <span className="flex items-center gap-1.5"><span className={cx("w-1.5 h-1.5 rounded-full", canRun ? "bg-emerald-400" : "bg-amber-400")} />{rt ? (rt.available ? `${rt.label} runner ready` : "runner unavailable") : "…"}</span>
        </div>
      </section>
    </div>
  );
}
