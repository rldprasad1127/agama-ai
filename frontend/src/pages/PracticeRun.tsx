import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useRecorder } from "@/hooks/useRecorder";
import { useSchedule } from "@/hooks/useSchedule";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { FeedbackCard, ReportView } from "@/components/practice/Report";
import { cx, errMsg, fmtClock } from "@/lib/utils";
import type { Fb, PSession } from "@/lib/types";

const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

export default function PracticeRun() {
  const { sessionId = "" } = useParams();
  const nav = useNavigate();
  const { toast } = useToast();
  const { refresh } = useSchedule();
  const { refresh: refreshUser } = useAuth();
  const [s, setS] = useState<PSession | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState("");
  const textRef = useRef(text); textRef.current = text;
  const rec = useRecorder((t) => setText((textRef.current ? textRef.current + " " : "") + t));
  const [busy, setBusy] = useState<"" | "answer" | "finish">("");
  const [fb, setFb] = useState<Fb | null>(null);
  const [pending, setPending] = useState(false);          // answered, waiting to move to the next question
  const [done, setDone] = useState(false);
  const shownAt = useRef(Date.now());
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try { const x = await api.practice.get(sessionId); setS(x); setDone(x.status === "active" && x.current_index === null && x.answered > 0); } catch (e) { setErr(errMsg(e)); }
  }, [sessionId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(id); }, []);

  const cur = s && s.status === "active" && s.current_index !== null ? s.turns.find((t) => t.index === s.current_index) ?? null : null;
  useEffect(() => { shownAt.current = Date.now(); setText(""); rec.discard(); /* eslint-disable-next-line */ }, [cur?.index, s?.turns.length]);

  const recorded = rec.status !== "idle";
  const secs = recorded ? rec.seconds : Math.round((now - shownAt.current) / 1000);
  const english = s?.kind === "ENGLISH";

  async function submit(skip = false) {
    if (!s || busy) return;
    if (!skip && words(text) < 3) { toast("Say or type a few words first — or skip this question.", "error"); return; }
    if (rec.status === "recording") rec.pause();
    setBusy("answer");
    try {
      const r = await api.practice.answer(s.id, { answer: text, duration_seconds: recorded ? Math.max(1, secs) : 0, speaking_seconds: recorded ? rec.speaking : null, skip });
      setS(r.session); setDone(r.done);
      if (r.feedback) { setFb(r.feedback); setPending(true); } else if (!r.done) { setText(""); rec.discard(); }
    } catch (e) { toast(errMsg(e), "error"); } finally { setBusy(""); }
  }
  async function finish() {
    if (!s) return;
    setBusy("finish");
    try { const r = await api.practice.finish(s.id); setS(r.session); await Promise.all([refresh(), refreshUser()]); window.scrollTo({ top: 0 }); }
    catch (e) { toast(errMsg(e), "error"); } finally { setBusy(""); }
  }
  async function leave() {
    if (s && s.status === "active" && s.answered === 0) { try { await api.practice.abandon(s.id); await refresh(); } catch { /* ignore */ } }
    nav(s?.task_id && s.status === "active" ? "/" : "/practice");
  }

  if (err) return <div className="p-8 max-w-md mx-auto text-center"><Icon name="error" className="text-error text-[36px]" /><p className="mt-2">{err}</p><Link to="/practice" className="underline">Back to practice</Link></div>;
  if (!s) return <div className="p-8 text-on-surface-variant font-label-code text-label-code">Loading session…</div>;
  if (s.status === "completed" && s.report) return (
    <div className="max-w-3xl mx-auto p-4 sm:p-8"><ReportView s={s} />
      <div className="mt-6 flex gap-3 flex-wrap"><Link to="/practice" className="px-5 py-2.5 rounded-xl bg-primary text-on-primary font-semibold">Practise again</Link><Link to="/" className="px-5 py-2.5 rounded-xl bg-surface-container font-semibold">Dashboard</Link></div></div>);

  const total = s.total;
  const idx = s.answered + (cur ? 1 : 0);
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-8 flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <button onClick={() => void leave()} className="p-2 rounded-lg hover:bg-surface-container" aria-label="Leave session"><Icon name="close" /></button>
        <div className="flex-1"><div className="font-semibold">{english ? `English speaking · ${s.config.topic}` : `${s.config.role} · ${String(s.config.round).toUpperCase()} round`}</div>
          <div className="h-1.5 rounded-full bg-surface-container mt-1.5"><div className="h-full rounded-full bg-primary-container transition-all" style={{ width: `${(s.answered / Math.max(total, 1)) * 100}%` }} /></div></div>
        <span className="font-label-code text-label-code text-on-surface-variant">{Math.min(idx, total)} / {total}</span>
      </header>

      {cur && !pending && (<>
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 fade-up">
          <div className="flex items-center gap-2 mb-2 text-on-surface-variant"><Icon name={english ? "record_voice_over" : "person"} />
            <span className="font-label-micro text-label-micro uppercase tracking-wider">{cur.kind === "followup" ? "Follow-up question" : english ? "Your coach asks" : "Interviewer"}</span></div>
          <p className="text-headline-sm font-semibold leading-snug">{cur.question}</p>
        </div>
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 flex flex-col gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={() => (rec.status === "recording" ? rec.pause() : void rec.start())} aria-label={rec.status === "recording" ? "Pause recording" : "Start recording"}
              className={cx("w-14 h-14 rounded-full flex items-center justify-center text-on-primary shadow", rec.status === "recording" ? "bg-error animate-pulse" : "bg-primary-container hover:bg-primary")}><Icon name={rec.status === "recording" ? "pause" : "mic"} fill /></button>
            <div><div className="font-label-code text-label-code">{fmtClock(secs)}</div><div className="text-body-sm text-on-surface-variant">{rec.status === "recording" ? "Listening… speak naturally" : rec.srSupported ? "Tap the mic and answer out loud" : "Your browser can't transcribe speech — type your answer"}</div></div>
            <span className="ml-auto text-body-sm text-on-surface-variant">{words(text)} words</span>
          </div>
          {rec.micError && <div role="note" className="text-body-sm rounded-lg bg-tertiary-fixed/60 px-3 py-2">{rec.micError}</div>}
          {!rec.micError && rec.srError && <div role="note" className="text-body-sm rounded-lg bg-tertiary-fixed/60 px-3 py-2">{rec.srError}</div>}
          <textarea aria-label="Your answer" value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="Your spoken words appear here. You can also type, and fix any recognition mistakes before submitting."
            className="w-full resize-y rounded-xl border border-outline-variant bg-surface px-4 py-3 outline-none focus:ring-2 focus:ring-primary/40 leading-6" />
          {rec.interim && <div className="text-outline italic text-body-md">{rec.interim}…</div>}
          <div className="flex justify-between gap-2 flex-wrap">
            <button disabled={!!busy} onClick={() => void submit(true)} className="px-4 py-2 rounded-lg bg-surface-container font-semibold disabled:opacity-50">Skip question</button>
            <button disabled={!!busy} onClick={() => void submit()} className="px-6 py-2.5 rounded-xl bg-primary text-on-primary font-semibold disabled:opacity-60 flex items-center gap-2">
              {busy === "answer" ? <><Icon name="progress_activity" className="animate-spin" />Reviewing…</> : <>Submit answer<Icon name="arrow_forward" className="text-[18px]" /></>}</button>
          </div>
        </div>
        {!s.instant_feedback && <p className="text-body-sm text-on-surface-variant text-center">Like a real interview, you'll get feedback for every answer in your final review.</p>}
      </>)}

      {pending && fb && (<>
        <FeedbackCard fb={fb} english={!!english} />
        <div className="flex justify-end"><button onClick={() => { setPending(false); setFb(null); setText(""); rec.discard(); }} className="px-6 py-2.5 rounded-xl bg-primary text-on-primary font-semibold">{done ? "Continue" : "Next question"}</button></div>
      </>)}

      {!cur && !pending && done && (
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 text-center">
          <Icon name="emoji_events" className="text-primary text-[44px]" />
          <h2 className="font-headline-md text-headline-md mt-2">All questions answered</h2>
          <p className="text-on-surface-variant">Ready for your full review?</p>
          <button disabled={busy === "finish"} onClick={() => void finish()} className="mt-4 px-6 py-3 rounded-xl bg-primary text-on-primary font-semibold disabled:opacity-60">{busy === "finish" ? "Writing your review…" : "Get my review"}</button>
        </div>)}
      {s.answered > 0 && !done && cur && !pending && <div className="text-center"><button disabled={busy === "finish"} onClick={() => void finish()} className="text-body-sm underline text-on-surface-variant">Finish early and get my review</button></div>}
    </div>
  );
}
