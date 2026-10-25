import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, localDate } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useSchedule } from "@/hooks/useSchedule";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { cx, errMsg, fmtDateLong, fmtMinutes, LANGUAGES, MODE_META } from "@/lib/utils";
import type { CurriculumInfo, Level, PlacementQ, PlacementResult, Plan, PlanCreate, PlanPreview } from "@/lib/types";

type GoalKey = "dsa-learn" | "dsa-practice" | "interview" | "english";
const GOALS: { key: GoalKey; icon: string; title: string; text: string }[] = [
  { key: "dsa-learn", icon: "school", title: "Learn DSA from scratch", text: "Theory first, then coding, topic by topic, on a daily schedule." },
  { key: "dsa-practice", icon: "fitness_center", title: "I know DSA — I want to practise", text: "Coding problems only, tuned to your level, with timed mock rounds." },
  { key: "interview", icon: "work", title: "Prepare for an interview", text: "Daily mock Q&A for your role: HR, behavioural and technical, with a final review." },
  { key: "english", icon: "record_voice_over", title: "Improve my spoken English", text: "Daily speaking practice with instant corrections and a mistakes tracker." },
];
const CEFR = [["A1", "Beginner — simple words and phrases"], ["A2", "Elementary — everyday topics"], ["B1", "Intermediate — can explain opinions"], ["B2", "Upper-intermediate — fluent on most topics"], ["C1", "Advanced — natural and precise"]] as const;
const ROLES = ["Software Engineer", "Backend Developer", "Frontend Developer", "Data Analyst", "Data Scientist", "DevOps Engineer", "Product Manager", "QA Engineer"];

const base = (): PlanCreate => ({
  track: "DSA", mode: "LEARN", days: 30, minutes_per_day: 60, level: "beginner", difficulty: "adaptive", topics: [], known_topics: [], weak_topics: [],
  language: "python", skip_weekends: false, role: "", experience: "fresher", company_type: "", cefr: "B1", focus_topics: [],
});

function Choice({ active, onClick, children, className }: { active: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return <button type="button" onClick={onClick} aria-pressed={active}
    className={cx("text-left rounded-xl border p-4 transition-colors", active ? "border-primary bg-primary-fixed/50 ring-2 ring-primary/30" : "border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low", className)}>{children}</button>;
}
function Label({ children }: { children: ReactNode }) { return <div className="font-label-micro text-label-micro uppercase tracking-wider text-on-surface-variant mb-2">{children}</div>; }
const inp = "w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/40";

export default function PathNew() {
  const { user, setUser, refresh: refreshUser } = useAuth();
  const { refresh: refreshSchedule } = useSchedule();
  const { toast } = useToast();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const welcome = sp.get("welcome") === "1";
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<GoalKey | null>(null);
  const [f, setF] = useState<PlanCreate>(base());
  const [curr, setCurr] = useState<CurriculumInfo | null>(null);
  const [existing, setExisting] = useState<Plan | null>(null);
  const [quiz, setQuiz] = useState<{ qs: PlacementQ[]; ans: Record<string, number> } | null>(null);
  const [placed, setPlaced] = useState<PlacementResult | null>(null);
  const [pickTopics, setPickTopics] = useState(false);
  const [preview, setPreview] = useState<PlanPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<PlanCreate>) => setF((x) => ({ ...x, ...p }));

  useEffect(() => { api.plans.curriculum().then(setCurr).catch(() => {}); api.plans.active().then(setExisting).catch(() => {}); }, []);
  useEffect(() => { if (user?.preferences.default_language) set({ language: user.preferences.default_language }); /* eslint-disable-next-line */ }, [user?.id]);

  function chooseGoal(g: GoalKey) {
    setGoal(g);
    if (g === "dsa-learn") set({ track: "DSA", mode: "LEARN", level: "beginner" });
    if (g === "dsa-practice") set({ track: "DSA", mode: "PRACTICE", level: "intermediate", minutes_per_day: 60, days: 21 });
    if (g === "interview") set({ track: "INTERVIEW", days: 14, minutes_per_day: 30 });
    if (g === "english") set({ track: "ENGLISH", days: 30, minutes_per_day: 20 });
    setStep(1);
  }
  async function skip() {
    try { setUser(await api.auth.update({ onboarded: true })); nav("/"); } catch (e) { toast(errMsg(e), "error"); }
  }
  async function startQuiz() {
    try { setQuiz({ qs: await api.plans.placement(), ans: {} }); } catch (e) { toast(errMsg(e), "error"); }
  }
  async function submitQuiz() {
    if (!quiz) return;
    try {
      const r = await api.plans.grade(quiz.ans);
      setPlaced(r); setQuiz(null);
      set({ level: r.level, known_topics: f.mode === "LEARN" ? r.known_topics : [], weak_topics: r.weak_topics });
    } catch (e) { toast(errMsg(e), "error"); }
  }
  const body = useMemo<PlanCreate>(() => ({ ...f, start_date: localDate() }), [f]);
  async function toReview() {
    setBusy(true); setErr(null);
    try { setPreview(await api.plans.preview(body)); setStep(3); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }
  async function create() {
    setBusy(true); setErr(null);
    try {
      await api.plans.create(body);
      await Promise.all([refreshUser(), refreshSchedule()]);
      toast("Your plan is ready — day 1 is on your dashboard.", "success");
      nav("/paths");
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }

  const aboutOk = f.track === "INTERVIEW" ? f.role.trim().length > 1 : true;
  const steps = ["Goal", "About you", "Time", "Review"];
  const hours = (f.days * f.minutes_per_day) / 60;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="font-headline-lg text-headline-lg">{welcome ? `Welcome${user ? ", " + user.name.split(" ")[0] : ""}! Let's build your plan` : "Create a learning plan"}</h1>
        <p className="text-on-surface-variant">Tell us your goal and how many days you have — we'll schedule every lesson and problem for you.</p>
      </div>
      <ol className="flex items-center gap-2 mb-6 overflow-x-auto" aria-label="Progress">
        {steps.map((s, i) => (
          <li key={s} className={cx("flex items-center gap-2 text-body-sm font-semibold whitespace-nowrap", i === step ? "text-primary" : i < step ? "text-on-surface" : "text-outline")}>
            <span className={cx("w-6 h-6 rounded-full flex items-center justify-center text-[12px]", i <= step ? "bg-primary text-on-primary" : "bg-surface-container")}>{i < step ? <Icon name="check" className="text-[14px]" /> : i + 1}</span>{s}{i < 3 && <span className="w-6 h-px bg-outline-variant" />}
          </li>))}
      </ol>

      {step === 0 && (
        <div className="grid sm:grid-cols-2 gap-3">
          {GOALS.map((g) => <Choice key={g.key} active={goal === g.key} onClick={() => chooseGoal(g.key)}>
            <Icon name={g.icon} className="text-primary text-[28px]" /><div className="font-semibold mt-2">{g.title}</div><p className="text-body-sm text-on-surface-variant mt-1">{g.text}</p></Choice>)}
          <button onClick={skip} className="sm:col-span-2 text-body-md text-on-surface-variant underline py-2">No thanks — I'll plan my own blocks</button>
        </div>)}

      {step === 1 && (
        <div className="flex flex-col gap-6">
          {f.track === "DSA" && <>
            <div><Label>Your level</Label>
              <div className="grid sm:grid-cols-3 gap-3">
                {([["beginner", "Complete beginner", "I'm new to data structures"], ["intermediate", "I know the basics", "Comfortable with arrays and loops"], ["advanced", "Quite experienced", "I just need hard practice"]] as [Level, string, string][]).map(([k, t, d]) =>
                  <Choice key={k} active={f.level === k && !placed} onClick={() => { setPlaced(null); set({ level: k, known_topics: [], weak_topics: [] }); }}><div className="font-semibold">{t}</div><div className="text-body-sm text-on-surface-variant">{d}</div></Choice>)}
              </div>
              <div className="mt-3 rounded-xl border border-outline-variant p-4 bg-surface-container-low">
                {placed ? <div>
                  <div className="font-semibold flex items-center gap-2"><Icon name="verified" className="text-secondary" />Level check: {placed.score}/{placed.total} — {placed.level}</div>
                  {f.mode === "LEARN" && placed.known_topics.length > 0 && <p className="text-body-sm text-on-surface-variant mt-1">You already know {placed.known_topics.length} topics; we'll skip them in your plan.</p>}
                  {placed.suggested_mode === "PRACTICE" && f.mode === "LEARN" && <button className="mt-2 text-primary font-semibold underline text-body-sm" onClick={() => { chooseGoal("dsa-practice"); setPlaced(placed); set({ level: placed.level, weak_topics: placed.weak_topics, known_topics: [] }); }}>You scored high — switch to practice mode</button>}
                  <button className="mt-2 ml-0 text-body-sm underline text-on-surface-variant block" onClick={() => { setPlaced(null); void startQuiz(); }}>Retake</button>
                </div> : quiz ? null : <div className="flex items-center gap-3 flex-wrap"><div className="flex-1 min-w-[200px]"><div className="font-semibold">Not sure? Take the 3-minute level check</div><div className="text-body-sm text-on-surface-variant">14 quick questions. We use it to skip what you know and focus on what you don't.</div></div>
                  <button onClick={() => void startQuiz()} className="px-4 py-2 rounded-lg bg-primary text-on-primary font-semibold">Start</button></div>}
              </div>
            </div>
            {quiz && <div className="rounded-xl border border-outline-variant p-4 bg-surface-container-lowest flex flex-col gap-5">
              {quiz.qs.map((q, i) => <fieldset key={q.id}><legend className="font-semibold mb-2">{i + 1}. {q.prompt}</legend>
                <div className="grid sm:grid-cols-2 gap-2">{q.options.map((o, oi) => <label key={oi} className={cx("flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer", quiz.ans[q.id] === oi ? "border-primary bg-primary-fixed/40" : "border-outline-variant")}>
                  <input type="radio" name={q.id} checked={quiz.ans[q.id] === oi} onChange={() => setQuiz({ ...quiz, ans: { ...quiz.ans, [q.id]: oi } })} />{o}</label>)}</div></fieldset>)}
              <div className="flex justify-between items-center"><span className="text-body-sm text-on-surface-variant">{Object.keys(quiz.ans).length}/{quiz.qs.length} answered — skipping a question counts as "don't know".</span>
                <div className="flex gap-2"><button onClick={() => setQuiz(null)} className="px-3 py-2 rounded-lg bg-surface-container font-semibold">Cancel</button><button onClick={() => void submitQuiz()} className="px-4 py-2 rounded-lg bg-primary text-on-primary font-semibold">See result</button></div></div>
            </div>}
            {f.mode === "PRACTICE" && <>
              <div><Label>Difficulty</Label><div className="flex gap-2 flex-wrap">{([["adaptive", "Adaptive (recommended)"], ["mixed", "Mixed"], ["easy", "Easy"], ["medium", "Medium"], ["hard", "Hard"]] as const).map(([k, t]) =>
                <button key={k} onClick={() => set({ difficulty: k })} aria-pressed={f.difficulty === k} className={cx("px-3 py-1.5 rounded-full text-body-sm font-semibold border", f.difficulty === k ? "bg-primary text-on-primary border-primary" : "border-outline-variant")}>{t}</button>)}</div></div>
              <div><Label>Topics</Label>
                <label className="flex items-center gap-2 mb-2"><input type="checkbox" checked={pickTopics} onChange={(e) => { setPickTopics(e.target.checked); if (!e.target.checked) set({ topics: [] }); }} />Only practise specific topics</label>
                {pickTopics && <div className="flex flex-wrap gap-2">{curr?.topics.map((t) => { const on = f.topics.includes(t.key); return <button key={t.key} onClick={() => set({ topics: on ? f.topics.filter((x) => x !== t.key) : [...f.topics, t.key] })} aria-pressed={on}
                  className={cx("px-3 py-1.5 rounded-full text-body-sm border", on ? "bg-primary-fixed border-primary font-semibold" : "border-outline-variant")}>{t.name}</button>; })}</div>}
              </div></>}
            <div><Label>Coding language</Label><select className={inp} value={f.language} onChange={(e) => set({ language: e.target.value })}>{LANGUAGES.filter((l) => ["python", "javascript"].includes(l.key)).map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}</select>
              <p className="text-body-sm text-on-surface-variant mt-1">Python and JavaScript have automatic test running.</p></div>
          </>}
          {f.track === "INTERVIEW" && <>
            <div><Label>Role you're preparing for</Label><input className={inp} value={f.role} onChange={(e) => set({ role: e.target.value })} placeholder="e.g. Backend Developer" maxLength={80} list="roles" />
              <datalist id="roles">{ROLES.map((r) => <option key={r} value={r} />)}</datalist></div>
            <div><Label>Your experience</Label><div className="grid grid-cols-3 gap-3">{(["fresher", "junior", "senior"] as const).map((k) => <Choice key={k} active={f.experience === k} onClick={() => set({ experience: k })}><span className="font-semibold capitalize">{k}</span><div className="text-body-sm text-on-surface-variant">{k === "fresher" ? "0–1 years" : k === "junior" ? "1–4 years" : "5+ years"}</div></Choice>)}</div></div>
            <div><Label>Company type (optional)</Label><input className={inp} value={f.company_type} onChange={(e) => set({ company_type: e.target.value })} placeholder="e.g. startup, product company, bank" maxLength={60} /></div>
          </>}
          {f.track === "ENGLISH" && <>
            <div><Label>Your English level</Label><div className="flex flex-col gap-2">{CEFR.map(([k, d]) => <Choice key={k} active={f.cefr === k} onClick={() => set({ cefr: k })} className="!p-3"><span className="font-semibold">{k}</span> <span className="text-on-surface-variant">— {d}</span></Choice>)}</div></div>
            <div><Label>Topics to focus on (optional, comma-separated)</Label><input className={inp} placeholder="e.g. job interviews, travel, small talk" onChange={(e) => set({ focus_topics: e.target.value.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 15) })} /></div>
          </>}
          <div className="flex justify-between"><button onClick={() => setStep(0)} className="px-4 py-2 rounded-lg bg-surface-container font-semibold">Back</button>
            <button disabled={!aboutOk} onClick={() => setStep(2)} className="px-5 py-2 rounded-lg bg-primary text-on-primary font-semibold disabled:opacity-50">Next</button></div>
        </div>)}

      {step === 2 && (
        <div className="flex flex-col gap-6">
          <div><Label>How many days do you have?</Label>
            <div className="flex gap-2 flex-wrap items-center">{[7, 14, 30, 60, 90].map((d) => <button key={d} onClick={() => set({ days: d })} aria-pressed={f.days === d} className={cx("px-4 py-2 rounded-full font-semibold border", f.days === d ? "bg-primary text-on-primary border-primary" : "border-outline-variant")}>{d} days</button>)}
              <label className="flex items-center gap-2 text-body-sm">Custom <input type="number" min={3} max={120} className="w-20 px-2 py-1.5 rounded-lg border border-outline-variant" value={f.days} onChange={(e) => set({ days: Math.max(3, Math.min(120, Number(e.target.value) || 3)) })} /></label></div></div>
          <div><Label>Time per day</Label>
            <div className="flex gap-2 flex-wrap">{[20, 30, 45, 60, 90, 120].map((m) => <button key={m} onClick={() => set({ minutes_per_day: m })} aria-pressed={f.minutes_per_day === m} className={cx("px-4 py-2 rounded-full font-semibold border", f.minutes_per_day === m ? "bg-primary text-on-primary border-primary" : "border-outline-variant")}>{fmtMinutes(m)}</button>)}</div></div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.skip_weekends} onChange={(e) => set({ skip_weekends: e.target.checked })} />Rest on weekends (Saturday and Sunday)</label>
          <div className="rounded-xl bg-primary-fixed/40 p-4 text-body-md"><b>{f.days} days × {fmtMinutes(f.minutes_per_day)}</b> = about <b>{hours.toFixed(hours < 10 ? 1 : 0)} hours</b> of focused learning.</div>
          {err && <div role="alert" className="rounded-lg bg-error-container text-on-error-container px-3 py-2">{err}</div>}
          <div className="flex justify-between"><button onClick={() => setStep(1)} className="px-4 py-2 rounded-lg bg-surface-container font-semibold">Back</button>
            <button disabled={busy} onClick={() => void toReview()} className="px-5 py-2 rounded-lg bg-primary text-on-primary font-semibold disabled:opacity-60">{busy ? "Planning…" : "Preview my plan"}</button></div>
        </div>)}

      {step === 3 && preview && (
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
            <h2 className="font-headline-md text-headline-md">{preview.title}</h2>
            <p className="text-on-surface-variant">{fmtDateLong(preview.start_date)} → {fmtDateLong(preview.end_date)} · {preview.total_blocks} blocks · {fmtMinutes(preview.total_minutes)} in total</p>
            <div className="mt-3 flex flex-wrap gap-2">{Object.entries(preview.by_phase).map(([k, n]) => <span key={k} className="px-2.5 py-1 rounded-full bg-surface-container text-body-sm capitalize">{n} × {k}</span>)}</div>
          </div>
          {preview.trimmed_topics.length > 0 && <div role="note" className="rounded-xl bg-tertiary-fixed/60 p-4 text-body-md"><Icon name="info" className="align-middle mr-1" />With {preview.days} days we had to leave out: <b>{preview.trimmed_topics.join(", ")}</b>. Add more days to include them.</div>}
          {preview.topics.length > 1 && <div><Label>Roadmap</Label><ol className="flex flex-col gap-1.5">{preview.topics.map((t) => <li key={t.key} className="flex items-center gap-3 rounded-lg bg-surface-container-lowest border border-outline-variant/60 px-3 py-2"><span className="font-label-code text-label-code text-primary w-20">Day {t.first_day}{t.last_day !== t.first_day ? `–${t.last_day}` : ""}</span><span className="font-semibold">{t.name}</span></li>)}</ol></div>}
          <div><Label>Your first week</Label>
            <div className="flex flex-col gap-2">{preview.sample_days.map((d) => <div key={d.day} className="rounded-lg border border-outline-variant/60 bg-surface-container-lowest p-3">
              <div className="font-semibold text-body-sm mb-1">Day {d.day} · {fmtDateLong(d.date)}</div>
              {d.blocks.map((b, i) => <div key={i} className="flex items-center gap-2 text-body-md"><Icon name={MODE_META[b.mode].icon} className="text-[16px] text-on-surface-variant" /><span className="flex-1 truncate">{b.title}</span><span className="font-label-code text-label-code text-on-surface-variant">{b.minutes}m</span></div>)}</div>)}</div></div>
          {existing && <div role="note" className="rounded-xl bg-error-container/50 p-4 text-body-md"><Icon name="warning" className="align-middle mr-1" />This replaces your current plan "<b>{existing.title}</b>". Its unfinished blocks will be removed; completed work stays in your journal.</div>}
          {err && <div role="alert" className="rounded-lg bg-error-container text-on-error-container px-3 py-2">{err}</div>}
          <div className="flex justify-between"><button onClick={() => setStep(2)} className="px-4 py-2 rounded-lg bg-surface-container font-semibold">Change</button>
            <button disabled={busy} onClick={() => void create()} className="px-6 py-2.5 rounded-lg bg-primary text-on-primary font-semibold disabled:opacity-60">{busy ? "Creating…" : "Create my plan"}</button></div>
        </div>)}
    </div>
  );
}
