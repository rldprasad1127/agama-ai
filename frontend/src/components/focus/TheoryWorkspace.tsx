import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { cx, errMsg } from "@/lib/utils";
import type { Flashcard } from "@/lib/types";
import { Markdown } from "./Markdown";
import { Checklist } from "./Checklist";
import type { WorkProps } from "./types";

export function TheoryWorkspace({ task, content, setContent, checklistDone, setChecklistDone }: WorkProps) {
  const { toast } = useToast();
  const [right, setRight] = useState<"cards" | "notes">("cards");
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [stat, setStat] = useState({ seen: 0, good: 0 });
  const [busy, setBusy] = useState(false);
  const [read, setRead] = useState(0);
  const [sel, setSel] = useState<{ text: string; x: number; y: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const loadCards = useCallback(async () => {
    try {
      const [mine, due] = await Promise.all([api.flashcards.list({ task_id: task.id }), api.flashcards.list({ due: true })]);
      const seen = new Set<string>(); const all: Flashcard[] = [];
      [...mine, ...due].forEach((c) => { if (!seen.has(c.id)) { seen.add(c.id); all.push(c); } });
      setCards(all); setIdx(0); setRevealed(false);
    } catch { /* leave empty */ }
  }, [task.id]);
  useEffect(() => { void loadCards(); }, [loadCards]);

  function onScroll() {
    const el = scroller.current; if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    setRead(max <= 0 ? 100 : Math.round((el.scrollTop / max) * 100));
  }
  function onMouseUp() {
    const s = window.getSelection(); const text = s?.toString().trim() ?? "";
    if (text.length < 15 || !s?.rangeCount) { setSel(null); return; }
    const r = s.getRangeAt(0).getBoundingClientRect();
    setSel({ text, x: Math.min(window.innerWidth - 190, Math.max(8, r.left)), y: Math.max(8, r.top - 44) });
  }
  async function generate(text: string, count: number) {
    setBusy(true); setSel(null);
    try {
      const made = await api.flashcards.generate({ task_id: task.id, text, count });
      setCards((c) => [...made, ...c]); setIdx(0); setRevealed(false); setRight("cards");
      toast(`${made.length} flashcards drafted.`, "success");
    } catch (e) { toast(errMsg(e), "error"); } finally { setBusy(false); }
  }
  async function rate(r: "hard" | "good" | "easy") {
    const c = cards[idx]; if (!c) return;
    try {
      const upd = await api.flashcards.review(c.id, r);
      setStat((s) => ({ seen: s.seen + 1, good: s.good + (r === "hard" ? 0 : 1) }));
      setCards((cs) => cs.map((x, i) => (i === idx ? upd : x)));
      setRevealed(false); setIdx((i) => (i + 1 < cards.length ? i + 1 : 0));
      if (idx + 1 >= cards.length) toast("Deck complete — nice recall session.", "success");
    } catch (e) { toast(errMsg(e), "error"); }
  }
  const card = cards[idx];
  const acc = stat.seen ? Math.round((stat.good / stat.seen) * 100) : null;

  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2">
      <section className="flex flex-col min-h-0 bg-surface-container-lowest border-r border-outline-variant/40 relative">
        <div className="flex items-center justify-between px-6 py-2.5 border-b border-surface-container font-label-code text-label-code text-on-surface-variant">
          <span className="truncate">{task.category || "Reading"} / {task.title}</span><span className="shrink-0 font-semibold text-on-surface">{read}% READ</span>
        </div>
        <div className="h-0.5 bg-surface-container"><div className="h-full bg-primary-container transition-all" style={{ width: `${read}%` }} /></div>
        <div ref={scroller} onScroll={onScroll} onMouseUp={onMouseUp} className="flex-1 overflow-y-auto px-8 py-6">
          {task.prompt_context ? <Markdown className="max-w-prose mx-auto text-[15px] leading-7">{task.prompt_context}</Markdown> : <p className="text-on-surface-variant">No reading material yet — regenerate this block with AI from the dashboard.</p>}
        </div>
        <div className="flex items-center justify-between gap-3 px-6 py-2.5 border-t border-surface-container text-body-sm text-on-surface-variant">
          <span className="flex items-center gap-1.5"><Icon name="psychology" className="text-primary text-[18px]" />Highlight any passage to draft an instant recall flashcard.</span>
          <button disabled={busy || !task.prompt_context} onClick={() => generate("", 3)} className="px-3 py-1.5 rounded-lg bg-primary-fixed text-on-primary-fixed-variant font-semibold disabled:opacity-50">{busy ? "Drafting…" : "Synthesize cards"}</button>
        </div>
        {sel && <button style={{ position: "fixed", left: sel.x, top: sel.y }} onMouseDown={(e) => e.preventDefault()} onClick={() => generate(sel.text, 2)} className="z-50 px-3 py-2 rounded-lg bg-inverse-surface text-inverse-on-surface shadow-lg flex items-center gap-1.5 text-body-sm font-semibold fade-up"><Icon name="auto_awesome" className="text-[16px]" />Draft flashcard</button>}
      </section>

      <section className="flex flex-col min-h-0 bg-surface">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-surface-container bg-surface-container-lowest">
          <span className="font-semibold flex items-center gap-1.5 mr-2"><Icon name="neurology" className="text-primary text-[20px]" />Active Recall &amp; Cornell Vault</span>
          {([["cards", "Spaced Flashcards", "quiz"], ["notes", "Freeform Notes", "edit_note"]] as const).map(([k, l, ic]) => (
            <button key={k} onClick={() => setRight(k)} className={cx("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-body-sm font-semibold", right === k ? "bg-primary-fixed text-on-primary-fixed-variant" : "text-on-surface-variant hover:bg-surface-container")}><Icon name={ic} className="text-[16px]" />{l}</button>))}
        </div>
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {right === "cards" ? (
            <div className="rounded-xl bg-surface-container-lowest border border-outline-variant/50 p-5">
              <div className="flex items-center justify-between font-label-micro text-label-micro text-on-surface-variant uppercase mb-3">
                <span>{cards.length ? `Card ${idx + 1} of ${cards.length} in session` : "No cards yet"}</span>{acc !== null && <span>Accuracy: {acc}%</span>}</div>
              {card ? (<>
                <div className="flex items-center justify-between font-label-micro text-label-micro text-primary uppercase"><span>Leitner Box {card.box} • {card.interval_days}-day interval</span><span className="text-on-surface-variant">{card.topic}</span></div>
                <h3 className="font-headline-sm text-headline-sm mt-3">{card.front}</h3>
                {revealed ? (
                  <div className="mt-4 fade-up">
                    <div className="rounded-lg bg-secondary-container/50 border border-secondary/20 p-3"><div className="font-label-micro text-label-micro text-secondary uppercase mb-1">Canonical answer</div><p className="text-body-md">{card.back}</p></div>
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      <button onClick={() => rate("hard")} className="py-2 rounded-lg bg-error-container text-on-error-container font-semibold text-body-sm">Hard (&lt; 1d)</button>
                      <button onClick={() => rate("good")} className="py-2 rounded-lg bg-primary-fixed text-on-primary-fixed-variant font-semibold text-body-sm">Good ({card.next_intervals.good}d)</button>
                      <button onClick={() => rate("easy")} className="py-2 rounded-lg bg-secondary-container text-on-secondary-container font-semibold text-body-sm">Easy ({card.next_intervals.easy}d)</button></div>
                  </div>
                ) : <button onClick={() => setRevealed(true)} className="mt-4 w-full py-2.5 rounded-lg bg-surface-container hover:bg-surface-container-high font-semibold flex items-center justify-center gap-2"><Icon name="visibility" className="text-[18px]" />Reveal Solution &amp; Rate Recall</button>}
              </>) : <p className="text-on-surface-variant text-body-md">Highlight text on the left or press <b>Draft 3 Questions</b> to generate recall cards with AI.</p>}
              <button onClick={() => generate("", 3)} disabled={busy || !task.prompt_context} className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-fixed text-on-primary-fixed-variant font-semibold text-body-sm disabled:opacity-50"><Icon name="auto_awesome" className={cx("text-[16px]", busy && "animate-spin")} />{busy ? "Drafting…" : "Draft 3 Questions"}</button>
            </div>
          ) : (
            <div className="rounded-xl bg-surface-container-lowest border border-outline-variant/50 flex flex-col min-h-[260px]">
              <div className="flex items-center justify-between px-4 py-2 border-b border-surface-container font-label-micro text-label-micro uppercase text-on-surface-variant"><span>Markdown enclave</span><span className="text-secondary">Autosave activated</span></div>
              <textarea aria-label="Freeform notes" value={content} onChange={(e) => setContent(e.target.value)} placeholder={"# Key insights\n- Write what you understood in your own words…"} className="flex-1 min-h-[240px] resize-none bg-transparent p-4 outline-none font-label-code text-label-code leading-6" />
            </div>
          )}
          <Checklist title="Mastery Verification Checklist" items={task.checklist} done={checklistDone} onChange={setChecklistDone} />
          <p className="text-body-sm text-on-surface-variant">Your <b>Freeform Notes</b> are what the AI tutor evaluates against the reading and checklist when you submit.</p>
        </div>
      </section>
    </div>
  );
}
