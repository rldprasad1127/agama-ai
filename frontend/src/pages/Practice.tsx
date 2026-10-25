import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useSchedule } from "@/hooks/useSchedule";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { cx, errMsg } from "@/lib/utils";
import type { Mistake, PSession, SessionCreate } from "@/lib/types";

const inp = "w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/40";
const CEFR = ["A1", "A2", "B1", "B2", "C1"];
const STYLES = ["answer everyday questions", "describe and explain", "tell a short story", "give and justify an opinion"];
const ROUNDS = [["hr", "HR round"], ["behavioral", "Behavioural (STAR)"], ["technical", "Technical"], ["mixed", "Mixed"]] as const;

/** /practice/start?task=ID&kind=… — resumes or creates the session behind a scheduled block, then opens it. */
export function PracticeStart() {
  const [sp] = useSearchParams();
  const task = sp.get("task") || undefined;
  const kind = (sp.get("kind") as "INTERVIEW" | "ENGLISH") || "ENGLISH";
  const [id, setId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { refresh } = useSchedule();
  useEffect(() => {
    let dead = false;
    api.practice.start({ kind, task_id: task }).then((s) => { if (!dead) { setId(s.id); void refresh(); } }).catch((e) => { if (!dead) setErr(errMsg(e)); });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task, kind]);
  if (id) return <Navigate to={`/practice/run/${id}`} replace />;
  if (err) return <div className="p-8 max-w-md mx-auto text-center"><Icon name="error" className="text-error text-[36px]" /><p className="mt-2 break-words">{err}</p><Link to="/practice" className="underline">Back</Link></div>;
  return <div className="p-16 text-center text-on-surface-variant"><Icon name="progress_activity" className="animate-spin text-primary text-[32px]" /><div className="mt-2 font-label-code text-label-code">Your AI coach is writing questions… this can take up to a minute.</div></div>;
}

export default function Practice() {
  const nav = useNavigate();
  const { toast } = useToast();
  const [kind, setKind] = useState<"INTERVIEW" | "ENGLISH">("INTERVIEW");
  const [iv, setIv] = useState({ role: "", round: "mixed" as "hr" | "behavioral" | "technical" | "mixed", experience: "fresher" as "fresher" | "junior" | "senior", company_type: "", n: 5, instant: false });
  const [en, setEn] = useState({ cefr: "B1", topic: "Introduce yourself", style: STYLES[0], n: 5, instant: true });
  const [topics, setTopics] = useState<string[]>([]);
  const [hist, setHist] = useState<PSession[]>([]);
  const [mist, setMist] = useState<Mistake[]>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { api.practice.list().then(setHist).catch(() => {}); api.practice.mistakes().then(setMist).catch(() => {}); }, []);
  useEffect(() => { load(); api.plans.curriculum().then((c) => setTopics(c.english_topics)).catch(() => {}); }, [load]);

  async function start() {
    if (kind === "INTERVIEW" && iv.role.trim().length < 2) { toast("Tell us which role you are practising for.", "error"); return; }
    const b: SessionCreate = kind === "INTERVIEW"
      ? { kind, role: iv.role.trim(), round: iv.round, experience: iv.experience, company_type: iv.company_type, num_questions: iv.n, instant_feedback: iv.instant }
      : { kind, cefr: en.cefr, topic: en.topic.trim() || "Introduce yourself", style: en.style, num_questions: en.n, instant_feedback: en.instant };
    setBusy(true);
    try { const s = await api.practice.start(b); nav(`/practice/run/${s.id}`); } catch (e) { toast(errMsg(e), "error"); setBusy(false); }
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-8 flex flex-col gap-6">
      <div><h1 className="font-headline-lg text-headline-lg">Speaking practice</h1><p className="text-on-surface-variant">The AI asks the questions, you answer out loud, and you get a full review at the end.</p></div>
      <div className="grid grid-cols-2 gap-3 max-w-md">
        {([["INTERVIEW", "Interview", "work"], ["ENGLISH", "English speaking", "record_voice_over"]] as const).map(([k, t, ic]) => (
          <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k} className={cx("rounded-xl border p-3 flex items-center gap-2 font-semibold", kind === k ? "border-primary bg-primary-fixed/50 ring-2 ring-primary/30" : "border-outline-variant bg-surface-container-lowest")}><Icon name={ic} className="text-primary" />{t}</button>))}
      </div>

      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 flex flex-col gap-4">
        {kind === "INTERVIEW" ? (<>
          <label><span className="block text-body-sm font-semibold mb-1">Role</span><input className={inp} value={iv.role} onChange={(e) => setIv({ ...iv, role: e.target.value })} placeholder="e.g. Backend Developer" maxLength={80} /></label>
          <div><span className="block text-body-sm font-semibold mb-1">Round</span><div className="flex gap-2 flex-wrap">{ROUNDS.map(([k, t]) => <button key={k} onClick={() => setIv({ ...iv, round: k })} aria-pressed={iv.round === k} className={cx("px-3 py-1.5 rounded-full border text-body-sm font-semibold", iv.round === k ? "bg-primary text-on-primary border-primary" : "border-outline-variant")}>{t}</button>)}</div></div>
          <div className="grid sm:grid-cols-2 gap-4">
            <label><span className="block text-body-sm font-semibold mb-1">Experience</span><select className={inp} value={iv.experience} onChange={(e) => setIv({ ...iv, experience: e.target.value as typeof iv.experience })}><option value="fresher">Fresher (0–1 yrs)</option><option value="junior">Junior (1–4 yrs)</option><option value="senior">Senior (5+ yrs)</option></select></label>
            <label><span className="block text-body-sm font-semibold mb-1">Company type (optional)</span><input className={inp} value={iv.company_type} onChange={(e) => setIv({ ...iv, company_type: e.target.value })} placeholder="startup, bank, product…" maxLength={60} /></label>
          </div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={iv.instant} onChange={(e) => setIv({ ...iv, instant: e.target.checked })} />Show feedback after each answer <span className="text-on-surface-variant">(off = realistic, review at the end)</span></label>
        </>) : (<>
          <div><span className="block text-body-sm font-semibold mb-1">Your level</span><div className="flex gap-2">{CEFR.map((c) => <button key={c} onClick={() => setEn({ ...en, cefr: c })} aria-pressed={en.cefr === c} className={cx("px-4 py-1.5 rounded-full border font-semibold", en.cefr === c ? "bg-primary text-on-primary border-primary" : "border-outline-variant")}>{c}</button>)}</div></div>
          <label><span className="block text-body-sm font-semibold mb-1">Topic</span><input className={inp} value={en.topic} onChange={(e) => setEn({ ...en, topic: e.target.value })} maxLength={120} list="en-topics" /><datalist id="en-topics">{topics.map((t) => <option key={t} value={t} />)}</datalist></label>
          <label><span className="block text-body-sm font-semibold mb-1">Activity</span><select className={inp} value={en.style} onChange={(e) => setEn({ ...en, style: e.target.value })}>{STYLES.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={en.instant} onChange={(e) => setEn({ ...en, instant: e.target.checked })} />Show corrections after each answer</label>
        </>)}
        <label className="flex items-center gap-3"><span className="text-body-sm font-semibold w-32">Questions: {kind === "INTERVIEW" ? iv.n : en.n}</span>
          <input type="range" min={3} max={10} value={kind === "INTERVIEW" ? iv.n : en.n} onChange={(e) => kind === "INTERVIEW" ? setIv({ ...iv, n: Number(e.target.value) }) : setEn({ ...en, n: Number(e.target.value) })} className="flex-1" />
          <span className="text-body-sm text-on-surface-variant">~{(kind === "INTERVIEW" ? iv.n : en.n) * 3} min</span></label>
        <div className="flex justify-end"><button disabled={busy} onClick={() => void start()} className="px-6 py-2.5 rounded-xl bg-primary text-on-primary font-semibold disabled:opacity-60 flex items-center gap-2">{busy ? <><Icon name="progress_activity" className="animate-spin" />Writing questions…</> : <>Start session<Icon name="arrow_forward" className="text-[18px]" /></>}</button></div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section><h2 className="font-headline-sm text-headline-sm mb-2">Recent sessions</h2>
          {hist.length === 0 ? <p className="text-on-surface-variant">No sessions yet — your first one takes about 10 minutes.</p> :
            <ul className="flex flex-col gap-2">{hist.slice(0, 8).map((h) => (
              <li key={h.id}><Link to={`/practice/run/${h.id}`} className="flex items-center gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest px-3 py-2.5 hover:bg-surface-container-low">
                <Icon name={h.kind === "INTERVIEW" ? "work" : "record_voice_over"} className="text-primary" />
                <div className="flex-1 min-w-0"><div className="font-semibold truncate">{h.kind === "INTERVIEW" ? String(h.config.role) : String(h.config.topic)}</div><div className="text-body-sm text-on-surface-variant">{new Date(h.created_at).toLocaleDateString()} · {h.answered}/{h.total} answered · {h.status}</div></div>
                {h.status === "completed" && <span className="font-semibold text-secondary">{h.score}</span>}{h.status === "active" && <span className="text-primary font-semibold text-body-sm">Resume</span>}</Link></li>))}</ul>}
        </section>
        <section><h2 className="font-headline-sm text-headline-sm mb-2">Mistakes to fix</h2>
          {mist.length === 0 ? <p className="text-on-surface-variant">Your recurring English mistakes will show up here after a few sessions.</p> :
            <ul className="flex flex-col gap-2">{mist.slice(0, 8).map((m) => (
              <li key={m.id} className="flex items-center gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest px-3 py-2.5">
                <div className="flex-1 min-w-0"><div><span className="line-through text-error">{m.wrong}</span> → <b className="text-secondary">{m.right}</b></div>{m.rule && <div className="text-body-sm text-on-surface-variant">{m.rule}</div>}</div>
                <span className="px-2 py-0.5 rounded-full bg-surface-container text-[11px]">×{m.times}</span>
                <button title="I've got this" aria-label="Mark as mastered" onClick={() => void api.practice.setMastered(m.id, true).then(load)} className="p-1 rounded hover:bg-surface-container"><Icon name="check_circle" className="text-secondary" /></button></li>))}</ul>}
        </section>
      </div>
    </div>
  );
}
