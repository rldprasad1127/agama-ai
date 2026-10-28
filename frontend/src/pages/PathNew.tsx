import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, localDate } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useSchedule } from "@/hooks/useSchedule";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { cx, errMsg, fmtDateLong, fmtMinutes, LANGUAGES, MODE_META, planColor } from "@/lib/utils";
import type { Level, Outline, PlacementQ, PlacementResult, Plan, PlanCreate, PlanPreview, SubjectCatalog, SubjectInfo } from "@/lib/types";

type Pick = { k: "subject"; s: SubjectInfo } | { k: "interview" } | { k: "english" } | { k: "custom" };

const CEFR = [["A1", "Beginner — simple words and phrases"], ["A2", "Elementary — everyday topics"], ["B1", "Intermediate — can explain opinions"], ["B2", "Upper-intermediate — fluent on most topics"], ["C1", "Advanced — natural and precise"]] as const;
const ROLES = ["Software Engineer", "Backend Developer", "Frontend Developer", "Data Analyst", "Data Scientist", "DevOps Engineer", "Product Manager", "QA Engineer"];
const EXTRA_CARDS = {
  interview: { icon: "work", title: "Interview prep", text: "Daily mock Q&A for your role: HR, behavioural and technical, with a final review." },
  english: { icon: "record_voice_over", title: "Spoken English", text: "Daily speaking practice with instant corrections and a mistakes tracker." },
};

const base = (): PlanCreate => ({
  track: "DSA", subject: "dsa", mode: "LEARN", days: 30, minutes_per_day: 60, level: "beginner", difficulty: "adaptive", topics: [], known_topics: [], weak_topics: [],
  language: "python", skip_weekends: false, role: "", experience: "fresher", company_type: "", cefr: "B1", focus_topics: [],
});

function Choice({ active, onClick, children, className }: { active: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return <button type="button" onClick={onClick} aria-pressed={active}
    className={cx("text-left rounded-xl border p-4 transition-colors", active ? "border-primary bg-primary-fixed/50 ring-2 ring-primary/30" : "border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low", className)}>{children}</button>;
}
function Label({ children }: { children: ReactNode }) { return <div className="font-label-micro text-label-micro uppercase tracking-wider text-on-surface-variant mb-2">{children}</div>; }
const inp = "w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/40";

function SubjectCard({ icon, title, text, tag, onClick, dashed }: { icon: string; title: string; text: string; tag?: string; onClick: () => void; dashed?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={cx("text-left rounded-xl border p-4 transition-colors bg-surface-container-lowest hover:bg-surface-container-low hover:border-primary/60 flex flex-col",
        dashed ? "border-dashed border-primary/60" : "border-outline-variant")}>
      <div className="flex items-center justify-between"><Icon name={icon} className="text-primary text-[28px]" />{tag && <span className="font-label-micro text-label-micro uppercase px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant">{tag}</span>}</div>
      <div className="font-semibold mt-2">{title}</div>
      <p className="text-body-sm text-on-surface-variant mt-1">{text}</p>
    </button>
  );
}

export default function PathNew() {
  const { user, setUser, refresh: refreshUser } = useAuth();
  const { refresh: refreshSchedule } = useSchedule();
  const { toast } = useToast();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const welcome = sp.get("welcome") === "1";
  const [step, setStep] = useState(0);
  const [pick, setPick] = useState<Pick | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [f, setF] = useState<PlanCreate>(base());
  const [catalog, setCatalog] = useState<SubjectCatalog | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [quiz, setQuiz] = useState<{ qs: PlacementQ[]; ans: Record<string, number> } | null>(null);
  const [placed, setPlaced] = useState<PlacementResult | null>(null);
  const [pickTopics, setPickTopics] = useState(false);
  const [cust, setCust] = useState({ name: "", goal: "", known: "" });
  const [outline, setOutline] = useState<Outline | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [preview, setPreview] = useState<PlanPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<PlanCreate>) => setF((x) => ({ ...x, ...p }));

  useEffect(() => {
    api.plans.subjects().then(setCatalog).catch(() => {});
    api.plans.list().then(setPlans).catch(() => {});
  }, []);

  const active = plans.filter((p) => p.status === "active");
  const maxPlans = catalog?.max_plans ?? 5;
  const live = plans.filter((p) => p.status === "active" || p.status === "paused").length;
  const atLimit = live >= maxPlans;
  const featured = catalog?.subjects.filter((s) => s.featured) ?? [];
  const more = catalog?.subjects.filter((s) => !s.featured) ?? [];
  const subject = pick?.k === "subject" ? pick.s : null;
  const isSubjectLike = pick?.k === "subject" || pick?.k === "custom";
  const isDsa = subject?.key === "dsa";

  function choose(p: Pick) {
    setPick(p); setPlaced(null); setQuiz(null); setOutline(null); setPickTopics(false); setErr(null);
    const dl = user?.preferences.default_language ?? "python";
    if (p.k === "subject" && p.s.key === "dsa") setF({ ...base(), track: "DSA", subject: "dsa", language: dl });
    else if (p.k === "subject") setF({ ...base(), track: "SUBJECT", subject: p.s.key, days: 21, minutes_per_day: 45, language: p.s.language ?? dl });
    else if (p.k === "custom") setF({ ...base(), track: "SUBJECT", subject: "custom", days: 21, minutes_per_day: 45 });
    else if (p.k === "interview") setF({ ...base(), track: "INTERVIEW", days: 14, minutes_per_day: 30 });
    else setF({ ...base(), track: "ENGLISH", days: 30, minutes_per_day: 20 });
    setStep(1);
  }
  function setMode(mode: "LEARN" | "PRACTICE") {
    setPlaced(null);
    set({ mode, known_topics: [], weak_topics: [], level: mode === "PRACTICE" && f.level === "beginner" ? "intermediate" : f.level, ...(mode === "PRACTICE" && isDsa ? { days: 21 } : {}) });
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
  async function draft() {
    setDrafting(true); setErr(null);
    try { setOutline(await api.plans.outline({ subject: cust.name.trim(), level: f.level, goal: cust.goal.trim(), known: cust.known.trim() })); }
    catch (e) { setErr(errMsg(e)); } finally { setDrafting(false); }
  }
  const body = useMemo<PlanCreate>(() => ({
    ...f, start_date: localDate(),
    ...(pick?.k === "custom" && outline ? { custom_name: outline.subject, custom_topics: outline.topics } : {}),
  }), [f, pick, outline]);
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

  const aboutOk = f.track === "INTERVIEW" ? f.role.trim().length > 1 : pick?.k === "custom" ? !!outline && outline.topics.length >= 2 : true;
  const steps = ["Subject", "About you", "Time", "Review"];
  const hours = (f.days * f.minutes_per_day) / 60;
  const otherMinutes = active.reduce((n, p) => n + p.minutes_per_day, 0);
  const combined = otherMinutes + f.minutes_per_day;
  const overBudget = combined > (catalog?.over_budget_minutes ?? 180);
  const pickTitle = pick?.k === "subject" ? pick.s.name : pick?.k === "custom" ? (outline?.subject || cust.name || "Custom subject") : pick?.k === "interview" ? "Interview prep" : "Spoken English";

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="font-headline-lg text-headline-lg">{welcome ? `Welcome${user ? ", " + user.name.split(" ")[0] : ""}! Let's build your plan` : "Create a learning plan"}</h1>
        <p className="text-on-surface-variant">Pick what you want to learn and how many days you have — we'll schedule every lesson and exercise for you.{active.length > 0 && " Your other plans keep running alongside this one."}</p>
      </div>
      <ol className="flex items-center gap-2 mb-6 overflow-x-auto" aria-label="Progress">
        {steps.map((s, i) => (
          <li key={s} className={cx("flex items-center gap-2 text-body-sm font-semibold whitespace-nowrap", i === step ? "text-primary" : i < step ? "text-on-surface" : "text-outline")}>
            <span className={cx("w-6 h-6 rounded-full flex items-center justify-center text-[12px]", i <= step ? "bg-primary text-on-primary" : "bg-surface-container")}>{i < step ? <Icon name="check" className="text-[14px]" /> : i + 1}</span>{s}{i < 3 && <span className="w-6 h-px bg-outline-variant" />}
          </li>))}
      </ol>

      {step === 0 && (
        <div className="flex flex-col gap-4">
          {atLimit && <div role="note" className="rounded-xl bg-tertiary-fixed/60 text-on-tertiary-fixed p-4 text-body-md"><Icon name="info" className="align-middle mr-1" />You already have {maxPlans} plans. Stop or finish one on the Learning Path page to add another.</div>}
          {active.length > 0 && !atLimit && <div className="text-body-sm text-on-surface-variant flex items-center gap-2 flex-wrap">Running now:
            {active.map((p) => <span key={p.id} className={cx("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-semibold", planColor(p.color).chip)}><span className={cx("w-2 h-2 rounded-full", planColor(p.color).dot)} />{p.subject_name || p.title}</span>)}</div>}
          <fieldset disabled={atLimit} className={cx("grid sm:grid-cols-2 lg:grid-cols-3 gap-3", atLimit && "opacity-60")}>
            <legend className="sr-only">Choose a subject</legend>
            {!catalog && Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[120px] rounded-xl bg-surface-container animate-pulse" />)}
            {featured.map((s) => <SubjectCard key={s.key} icon={s.icon} title={s.name} text={s.blurb} onClick={() => choose({ k: "subject", s })} tag={s.key === "dsa" ? "Popular" : undefined} />)}
            {catalog && <SubjectCard icon={EXTRA_CARDS.interview.icon} title={EXTRA_CARDS.interview.title} text={EXTRA_CARDS.interview.text} onClick={() => choose({ k: "interview" })} />}
            {catalog && <SubjectCard icon={EXTRA_CARDS.english.icon} title={EXTRA_CARDS.english.title} text={EXTRA_CARDS.english.text} onClick={() => choose({ k: "english" })} />}
            {showMore && more.map((s) => <SubjectCard key={s.key} icon={s.icon} title={s.name} text={s.blurb} onClick={() => choose({ k: "subject", s })} tag={s.kind === "exercise" ? "Written" : undefined} />)}
            {catalog && <SubjectCard dashed icon="auto_awesome" title="Custom plan" text="Learn anything — type a subject and AI drafts the roadmap for you to review." tag="AI" onClick={() => choose({ k: "custom" })} />}
          </fieldset>
          {more.length > 0 && (
            <button type="button" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}
              className="self-center inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-outline-variant font-semibold text-on-surface hover:bg-surface-container">
              <Icon name={showMore ? "expand_less" : "expand_more"} className="text-[20px]" />{showMore ? "Show fewer" : `View more subjects (${more.length})`}</button>)}
          {plans.length === 0 && <button onClick={skip} className="text-body-md text-on-surface-variant underline py-2">No thanks — I'll plan my own blocks</button>}
        </div>)}

      {step === 1 && pick && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-2 text-on-surface-variant"><Icon name={subject?.icon ?? (pick.k === "custom" ? "auto_awesome" : EXTRA_CARDS[pick.k as "interview" | "english"].icon)} className="text-primary" /><span className="font-semibold text-on-surface">{pickTitle}</span></div>

          {isSubjectLike && (
            <div><Label>What do you need?</Label>
              <div className="grid sm:grid-cols-2 gap-3">
                <Choice active={f.mode === "LEARN"} onClick={() => setMode("LEARN")}><div className="font-semibold">Learn from scratch</div><div className="text-body-sm text-on-surface-variant">Theory first, then practice, topic by topic.</div></Choice>
                <Choice active={f.mode === "PRACTICE"} onClick={() => setMode("PRACTICE")}><div className="font-semibold">I know it — practise</div><div className="text-body-sm text-on-surface-variant">Exercises only, tuned to your level, with a final challenge.</div></Choice>
              </div></div>)}

          {pick.k === "custom" && (
            <div className="flex flex-col gap-4">
              <div><Label>What do you want to learn?</Label><input className={inp} value={cust.name} maxLength={60} placeholder="e.g. Power BI for HR dashboards, Tableau, Docker basics" onChange={(e) => { setCust({ ...cust, name: e.target.value }); setOutline(null); }} /></div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div><Label>Your goal (optional)</Label><input className={inp} value={cust.goal} maxLength={200} placeholder="e.g. build dashboards at work" onChange={(e) => setCust({ ...cust, goal: e.target.value })} /></div>
                <div><Label>What you already know (optional)</Label><input className={inp} value={cust.known} maxLength={200} placeholder="e.g. basic Excel" onChange={(e) => setCust({ ...cust, known: e.target.value })} /></div>
              </div>
              {!outline && <div className="flex items-center gap-3 flex-wrap"><button disabled={drafting || cust.name.trim().length < 2} onClick={() => void draft()} className="px-4 py-2 rounded-lg bg-primary text-on-primary font-semibold disabled:opacity-50 flex items-center gap-2"><Icon name="auto_awesome" className={cx("text-[18px]", drafting && "animate-pulse")} />{drafting ? "Drafting your roadmap…" : "Draft my roadmap"}</button>
                <span className="text-body-sm text-on-surface-variant">Uses 1 of your daily AI requests. Nothing is saved until you create the plan.</span></div>}
              {outline && (
                <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 flex flex-col gap-3">
                  <div className="flex items-start gap-2 rounded-lg bg-tertiary-fixed/60 text-on-tertiary-fixed px-3 py-2 text-body-sm"><Icon name="info" className="text-[18px] mt-px" /><span><b>AI-generated roadmap — not reviewed by a human.</b> Rename or remove anything that doesn't fit, and check important facts against an official source.</span></div>
                  {outline.summary && <p className="text-on-surface-variant">{outline.summary}</p>}
                  <ol className="flex flex-col gap-2">
                    {outline.topics.map((t, i) => (
                      <li key={i} className="rounded-lg border border-outline-variant/70 p-3 flex gap-3">
                        <span className="font-label-code text-label-code text-primary w-6 pt-2">{i + 1}.</span>
                        <div className="flex-1 min-w-0">
                          <input aria-label={`Topic ${i + 1} name`} className={cx(inp, "!py-1.5 font-semibold")} value={t.name} maxLength={80} onChange={(e) => setOutline({ ...outline, topics: outline.topics.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} />
                          <ul className="mt-1.5 text-body-sm text-on-surface-variant list-disc pl-5">{t.exercises.slice(0, 3).map((x, j) => <li key={j}>{x.title}</li>)}</ul>
                        </div>
                        <button aria-label={`Remove topic ${t.name}`} disabled={outline.topics.length <= 2} onClick={() => setOutline({ ...outline, topics: outline.topics.filter((_, j) => j !== i) })} className="self-start p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container disabled:opacity-30"><Icon name="delete" className="text-[20px]" /></button>
                      </li>))}
                  </ol>
                  <button onClick={() => setOutline(null)} className="self-start text-body-sm underline text-on-surface-variant">Start over with a different subject</button>
                </div>)}
            </div>)}

          {isSubjectLike && (isDsa ? (
            <div><Label>Your level</Label>
              <div className="grid sm:grid-cols-3 gap-3">
                {([["beginner", "Complete beginner", "I'm new to data structures"], ["intermediate", "I know the basics", "Comfortable with arrays and loops"], ["advanced", "Quite experienced", "I just need hard practice"]] as [Level, string, string][]).map(([k, t, d]) =>
                  <Choice key={k} active={f.level === k && !placed} onClick={() => { setPlaced(null); set({ level: k, known_topics: [], weak_topics: [] }); }}><div className="font-semibold">{t}</div><div className="text-body-sm text-on-surface-variant">{d}</div></Choice>)}
              </div>
              <div className="mt-3 rounded-xl border border-outline-variant p-4 bg-surface-container-low">
                {placed ? <div>
                  <div className="font-semibold flex items-center gap-2"><Icon name="verified" className="text-secondary" />Level check: {placed.score}/{placed.total} — {placed.level}</div>
                  {f.mode === "LEARN" && placed.known_topics.length > 0 && <p className="text-body-sm text-on-surface-variant mt-1">You already know {placed.known_topics.length} topics; we'll skip them in your plan.</p>}
                  {placed.suggested_mode === "PRACTICE" && f.mode === "LEARN" && <button className="mt-2 text-primary font-semibold underline text-body-sm" onClick={() => { setMode("PRACTICE"); set({ level: placed.level, weak_topics: placed.weak_topics, known_topics: [] }); setPlaced(placed); }}>You scored high — switch to practice mode</button>}
                  <button className="mt-2 ml-0 text-body-sm underline text-on-surface-variant block" onClick={() => { setPlaced(null); void startQuiz(); }}>Retake</button>
                </div> : quiz ? null : <div className="flex items-center gap-3 flex-wrap"><div className="flex-1 min-w-[200px]"><div className="font-semibold">Not sure? Take the 3-minute level check</div><div className="text-body-sm text-on-surface-variant">14 quick questions. We use it to skip what you know and focus on what you don't.</div></div>
                  <button onClick={() => void startQuiz()} className="px-4 py-2 rounded-lg bg-primary text-on-primary font-semibold">Start</button></div>}
              </div>
            </div>) : (
            <div><Label>Your level</Label>
              <div className="grid sm:grid-cols-3 gap-3">
                {([["beginner", "Complete beginner", "I'm new to this"], ["intermediate", "I know the basics", "I've used it a little"], ["advanced", "Experienced", "I want advanced practice"]] as [Level, string, string][]).map(([k, t, d]) =>
                  <Choice key={k} active={f.level === k} onClick={() => { set({ level: k }); if (pick.k === "custom") setOutline(null); }}><div className="font-semibold">{t}</div><div className="text-body-sm text-on-surface-variant">{d}</div></Choice>)}
              </div></div>))}

          {quiz && <div className="rounded-xl border border-outline-variant p-4 bg-surface-container-lowest flex flex-col gap-5">
            {quiz.qs.map((q, i) => <fieldset key={q.id}><legend className="font-semibold mb-2">{i + 1}. {q.prompt}</legend>
              <div className="grid sm:grid-cols-2 gap-2">{q.options.map((o, oi) => <label key={oi} className={cx("flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer", quiz.ans[q.id] === oi ? "border-primary bg-primary-fixed/40" : "border-outline-variant")}>
                <input type="radio" name={q.id} checked={quiz.ans[q.id] === oi} onChange={() => setQuiz({ ...quiz, ans: { ...quiz.ans, [q.id]: oi } })} />{o}</label>)}</div></fieldset>)}
            <div className="flex justify-between items-center"><span className="text-body-sm text-on-surface-variant">{Object.keys(quiz.ans).length}/{quiz.qs.length} answered — skipping a question counts as "don't know".</span>
              <div className="flex gap-2"><button onClick={() => setQuiz(null)} className="px-3 py-2 rounded-lg bg-surface-container font-semibold">Cancel</button><button onClick={() => void submitQuiz()} className="px-4 py-2 rounded-lg bg-primary text-on-primary font-semibold">See result</button></div></div>
          </div>}

          {isSubjectLike && f.mode === "PRACTICE" && <>
            <div><Label>Difficulty</Label><div className="flex gap-2 flex-wrap">{([["adaptive", "Adaptive (recommended)"], ["mixed", "Mixed"], ["easy", "Easy"], ["medium", "Medium"], ["hard", "Hard"]] as const).map(([k, t]) =>
              <button key={k} onClick={() => set({ difficulty: k })} aria-pressed={f.difficulty === k} className={cx("px-3 py-1.5 rounded-full text-body-sm font-semibold border", f.difficulty === k ? "bg-primary text-on-primary border-primary" : "border-outline-variant")}>{t}</button>)}</div></div>
            {subject && <div><Label>Topics</Label>
              <label className="flex items-center gap-2 mb-2"><input type="checkbox" checked={pickTopics} onChange={(e) => { setPickTopics(e.target.checked); if (!e.target.checked) set({ topics: [] }); }} />Only practise specific topics</label>
              {pickTopics && <div className="flex flex-wrap gap-2">{subject.topics.map((t) => { const on = f.topics.includes(t.key); return <button key={t.key} onClick={() => set({ topics: on ? f.topics.filter((x) => x !== t.key) : [...f.topics, t.key] })} aria-pressed={on}
                className={cx("px-3 py-1.5 rounded-full text-body-sm border", on ? "bg-primary-fixed border-primary font-semibold" : "border-outline-variant")}>{t.name}</button>; })}</div>}
            </div>}</>}

          {isDsa && <div><Label>Coding language</Label><select className={inp} value={f.language} onChange={(e) => set({ language: e.target.value })}>{LANGUAGES.filter((l) => ["python", "javascript"].includes(l.key)).map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}</select>
            <p className="text-body-sm text-on-surface-variant mt-1">Python and JavaScript have automatic test running.</p></div>}
          {subject && !isDsa && subject.note && <div className="rounded-xl bg-surface-container-low border border-outline-variant p-3 flex gap-2 text-body-sm text-on-surface-variant"><Icon name={subject.executable ? "play_circle" : "edit_note"} className="text-primary text-[20px]" /><span>{subject.note}</span></div>}
          {subject && subject.topics.length > 0 && step === 1 && f.mode === "LEARN" && !isDsa && <div><Label>What you'll cover</Label><div className="flex flex-wrap gap-1.5">{subject.topics.map((t) => <span key={t.key} className="px-2.5 py-1 rounded-full bg-surface-container text-body-sm">{t.name}</span>)}</div></div>}

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
          {err && <div role="alert" className="rounded-lg bg-error-container text-on-error-container px-3 py-2">{err}</div>}
          <div className="flex justify-between"><button onClick={() => setStep(0)} className="px-4 py-2 rounded-lg bg-surface-container font-semibold">Back</button>
            <button disabled={!aboutOk} onClick={() => setStep(2)} className="px-5 py-2 rounded-lg bg-primary text-on-primary font-semibold disabled:opacity-50">Next</button></div>
        </div>)}

      {step === 2 && (
        <div className="flex flex-col gap-6">
          <div><Label>How many days do you have?</Label>
            <div className="flex gap-2 flex-wrap items-center">{[7, 14, 30, 60, 90].map((d) => <button key={d} onClick={() => set({ days: d })} aria-pressed={f.days === d} className={cx("px-4 py-2 rounded-full font-semibold border", f.days === d ? "bg-primary text-on-primary border-primary" : "border-outline-variant")}>{d} days</button>)}
              <label className="flex items-center gap-2 text-body-sm">Custom <input type="number" min={3} max={120} className="w-20 px-2 py-1.5 rounded-lg border border-outline-variant bg-surface-container-lowest" value={f.days} onChange={(e) => set({ days: Math.max(3, Math.min(120, Number(e.target.value) || 3)) })} /></label></div></div>
          <div><Label>Time per day for this plan</Label>
            <div className="flex gap-2 flex-wrap">{[20, 30, 45, 60, 90, 120].map((m) => <button key={m} onClick={() => set({ minutes_per_day: m })} aria-pressed={f.minutes_per_day === m} className={cx("px-4 py-2 rounded-full font-semibold border", f.minutes_per_day === m ? "bg-primary text-on-primary border-primary" : "border-outline-variant")}>{fmtMinutes(m)}</button>)}</div></div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.skip_weekends} onChange={(e) => set({ skip_weekends: e.target.checked })} />Rest on weekends (Saturday and Sunday)</label>
          <div className="rounded-xl bg-primary-fixed/40 text-on-primary-fixed-variant p-4 text-body-md"><b>{f.days} days × {fmtMinutes(f.minutes_per_day)}</b> = about <b>{hours.toFixed(hours < 10 ? 1 : 0)} hours</b> of focused learning.</div>
          {otherMinutes > 0 && <div role="note" className={cx("rounded-xl p-4 text-body-md flex gap-2", overBudget ? "bg-tertiary-fixed/60 text-on-tertiary-fixed" : "bg-surface-container-low border border-outline-variant")}>
            <Icon name={overBudget ? "warning" : "layers"} className="mt-0.5" />
            <span>Your other plans already use <b>{fmtMinutes(otherMinutes)}</b> a day. With this one you'd study <b>{fmtMinutes(combined)}</b> a day{overBudget ? " — that's a lot. Consider fewer minutes here, or pause another plan." : "."}</span></div>}
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
          {pick?.k === "custom" && <div role="note" className="rounded-xl bg-tertiary-fixed/60 text-on-tertiary-fixed p-4 text-body-md"><Icon name="info" className="align-middle mr-1" />This roadmap and its lessons are AI-generated and not reviewed by a human.</div>}
          {preview.trimmed_topics.length > 0 && <div role="note" className="rounded-xl bg-tertiary-fixed/60 text-on-tertiary-fixed p-4 text-body-md"><Icon name="info" className="align-middle mr-1" />With {preview.days} days we had to leave out: <b>{preview.trimmed_topics.join(", ")}</b>. Add more days to include them.</div>}
          {preview.topics.length > 1 && <div><Label>Roadmap</Label><ol className="flex flex-col gap-1.5">{preview.topics.map((t) => <li key={t.key} className="flex items-center gap-3 rounded-lg bg-surface-container-lowest border border-outline-variant/60 px-3 py-2"><span className="font-label-code text-label-code text-primary w-20">Day {t.first_day}{t.last_day !== t.first_day ? `–${t.last_day}` : ""}</span><span className="font-semibold">{t.name}</span></li>)}</ol></div>}
          <div><Label>Your first week</Label>
            <div className="flex flex-col gap-2">{preview.sample_days.map((d) => <div key={d.day} className="rounded-lg border border-outline-variant/60 bg-surface-container-lowest p-3">
              <div className="font-semibold text-body-sm mb-1">Day {d.day} · {fmtDateLong(d.date)}</div>
              {d.blocks.map((b, i) => <div key={i} className="flex items-center gap-2 text-body-md"><Icon name={MODE_META[b.mode].icon} className="text-[16px] text-on-surface-variant" /><span className="flex-1 truncate">{b.title}</span><span className="font-label-code text-label-code text-on-surface-variant">{b.minutes}m</span></div>)}</div>)}</div></div>
          {preview.other_minutes_per_day > 0 && <div role="note" className={cx("rounded-xl p-4 text-body-md flex gap-2", preview.over_budget ? "bg-tertiary-fixed/60 text-on-tertiary-fixed" : "bg-surface-container-low border border-outline-variant")}>
            <Icon name={preview.over_budget ? "warning" : "layers"} className="mt-0.5" />
            <span>This is added <b>alongside</b> your {active.length} other plan{active.length === 1 ? "" : "s"} — nothing is replaced. Together that's <b>{fmtMinutes(preview.combined_minutes_per_day)}</b> a day{preview.over_budget ? ". If that's too much, go back and lower the minutes, or pause another plan later." : "."}</span></div>}
          {err && <div role="alert" className="rounded-lg bg-error-container text-on-error-container px-3 py-2">{err}</div>}
          <div className="flex justify-between"><button onClick={() => setStep(2)} className="px-4 py-2 rounded-lg bg-surface-container font-semibold">Change</button>
            <button disabled={busy} onClick={() => void create()} className="px-6 py-2.5 rounded-lg bg-primary text-on-primary font-semibold disabled:opacity-60">{busy ? "Creating…" : "Create my plan"}</button></div>
        </div>)}
    </div>
  );
}
