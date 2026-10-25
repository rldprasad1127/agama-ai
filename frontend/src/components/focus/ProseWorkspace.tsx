import { useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { cx } from "@/lib/utils";
import { Markdown } from "./Markdown";
import { Checklist } from "./Checklist";
import type { WorkProps } from "./types";

const WORD = /[A-Za-z0-9'’-]+/g;
function syllables(w: string): number {
  const s = w.toLowerCase().replace(/[^a-z]/g, "");
  if (!s) return 0;
  let n = (s.match(/[aeiouy]+/g) || []).length;
  if (s.endsWith("e") && !/(le|ee)$/.test(s) && n > 1) n--;
  return Math.max(1, n);
}
function stats(text: string, elapsed: number) {
  const plain = text.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ").replace(/[#>*_~\-]+/g, " ");
  const words = plain.match(WORD) || [];
  const sentences = Math.max(1, (plain.match(/[.!?]+(\s|$)/g) || []).length);
  const syl = words.reduce((a, w) => a + syllables(w), 0);
  const grade = words.length >= 10 ? Math.max(0, 0.39 * (words.length / sentences) + 11.8 * (syl / words.length) - 15.59) : null;
  return { words: words.length, chars: text.length, readMin: words.length / 200, grade, wpm: elapsed > 20 ? Math.round(words.length / (elapsed / 60)) : null };
}

export function ProseWorkspace({ task, content, setContent, checklistDone, setChecklistDone, elapsed }: WorkProps) {
  const [tab, setTab] = useState<"prompt" | "constraints" | "outline">("prompt");
  const ta = useRef<HTMLTextAreaElement>(null);
  const [wide, setWide] = useState(false);
  const s = useMemo(() => stats(content, elapsed), [content, elapsed]);
  const max = task.word_target_max, min = task.word_target_min;
  const pct = max ? Math.min(100, Math.round((s.words / max) * 100)) : null;

  function wrap(before: string, after = before, placeholder = "text") {
    const el = ta.current; if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const sel = content.slice(a, b) || placeholder;
    const next = content.slice(0, a) + before + sel + after + content.slice(b);
    setContent(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + before.length, a + before.length + sel.length); });
  }
  function linePrefix(prefix: string) {
    const el = ta.current; if (!el) return;
    const a = el.selectionStart; const start = content.lastIndexOf("\n", a - 1) + 1;
    setContent(content.slice(0, start) + prefix + content.slice(start));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + prefix.length, a + prefix.length); });
  }
  const tools = [
    { icon: "format_bold", label: "Bold", run: () => wrap("**") }, { icon: "format_italic", label: "Italic", run: () => wrap("*") },
    { icon: "format_h1", label: "Heading 1", run: () => linePrefix("# ") }, { icon: "format_h2", label: "Heading 2", run: () => linePrefix("## ") },
    { icon: "format_quote", label: "Quote", run: () => linePrefix("> ") }, { icon: "code_blocks", label: "Code block", run: () => wrap("\n```\n", "\n```\n", "code") },
  ];

  return (
    <div className={cx("flex-1 min-h-0 grid grid-cols-1", wide ? "" : "lg:grid-cols-2")}>
      {!wide && (
        <section className="flex flex-col min-h-0 border-r border-outline-variant/40 bg-surface-container-lowest">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-surface-container overflow-x-auto">
            <span className="font-label-micro text-label-micro uppercase text-outline mr-1 whitespace-nowrap">Mission blueprint</span>
            {([["prompt", "Prompt"], ["constraints", "Constraints"], ["outline", `Outline ${task.checklist.length || ""}`]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={cx("px-3 py-1.5 rounded-lg text-body-sm font-semibold", tab === k ? "bg-primary-fixed text-on-primary-fixed-variant" : "text-on-surface-variant hover:bg-surface-container")}>{l}</button>))}
          </div>
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
            {tab === "prompt" && (<>
              <h2 className="font-headline-lg text-headline-lg">{task.title}</h2>
              {(min || max || task.tags.length > 0) && <div className="flex gap-2 flex-wrap">
                {min && max && <span className="px-2 py-1 rounded bg-secondary-container text-on-secondary-container font-label-code text-label-code">Target {min}–{max} words</span>}
                {task.tags.map((t) => <span key={t} className="px-2 py-1 rounded bg-surface-container font-label-code text-label-code">{t}</span>)}</div>}
              {task.prompt_context ? <Markdown>{task.prompt_context}</Markdown> : <p className="text-on-surface-variant">No brief yet — regenerate this block with AI from the dashboard.</p>}
            </>)}
            {tab === "constraints" && (task.constraints.length
              ? <div className="flex flex-col gap-2"><h3 className="font-semibold">Editorial Precision Guidelines</h3>{task.constraints.map((c, i) => <div key={i} className="rounded-lg bg-surface-container-low p-3 text-body-md"><b className="text-primary mr-1">{i + 1}.</b>{c}</div>)}
                {task.hints.length > 0 && <><h3 className="font-semibold mt-3">Craft tips</h3><ul className="list-disc pl-5 text-body-md">{task.hints.map((h, i) => <li key={i}>{h}</li>)}</ul></>}</div>
              : <p className="text-on-surface-variant">No constraints set.</p>)}
            {tab === "outline" && <Checklist title="Mandatory Invariants to Embed" items={task.checklist} done={checklistDone} onChange={setChecklistDone} />}
            {tab !== "outline" && task.checklist.length > 0 && <Checklist title="Mandatory Invariants to Embed" items={task.checklist} done={checklistDone} onChange={setChecklistDone} />}
          </div>
        </section>
      )}
      <section className="flex flex-col min-h-0 bg-surface">
        <div className="flex items-center gap-1 px-3 py-2 border-b border-surface-container bg-surface-container-lowest flex-wrap">
          <span className="font-label-micro text-label-micro uppercase text-outline mr-2 flex items-center gap-1"><Icon name="edit_note" className="text-[16px]" />Prose / Script</span>
          {tools.map((t) => <button key={t.icon} aria-label={t.label} title={t.label} onClick={t.run} className="p-1.5 rounded hover:bg-surface-container text-on-surface-variant"><Icon name={t.icon} className="text-[20px]" /></button>)}
          <button aria-label="Toggle wide editor" title="Toggle wide editor" onClick={() => setWide((w) => !w)} className="p-1.5 rounded hover:bg-surface-container text-on-surface-variant ml-auto"><Icon name={wide ? "fullscreen_exit" : "fullscreen"} className="text-[20px]" /></button>
        </div>
        <div className="flex items-center gap-4 px-4 py-2 font-label-code text-label-code text-on-surface-variant border-b border-surface-container flex-wrap bg-surface-container-lowest/60">
          <span>Words: <b className="text-on-surface tabular">{s.words}</b>{max ? ` / ${max}` : ""}</span><span>Chars: <b className="text-on-surface tabular">{s.chars.toLocaleString()}</b></span>
          <span>Read: <b className="text-on-surface tabular">{s.readMin < 0.1 ? "0" : s.readMin.toFixed(1)}m</b></span>
          {s.grade !== null && <span>Grade {Math.round(s.grade)}</span>}
          {s.wpm !== null && <span>Pacing: <b className="text-on-surface">{s.wpm} wpm</b></span>}
          {pct !== null && <span className="ml-auto flex items-center gap-2"><span className="w-24 h-1.5 rounded-full bg-surface-container overflow-hidden"><span className={cx("block h-full", min && s.words >= min ? "bg-secondary" : "bg-primary-container")} style={{ width: `${pct}%` }} /></span>{pct}%</span>}
        </div>
        <textarea ref={ta} aria-label="Writing area" value={content} onChange={(e) => setContent(e.target.value)} spellCheck
          placeholder="Type for blocks, citations, and inline invariants…" className="flex-1 w-full resize-none bg-transparent px-8 py-6 outline-none text-[16px] leading-[28px] text-on-surface placeholder:text-outline" />
      </section>
    </div>
  );
}
