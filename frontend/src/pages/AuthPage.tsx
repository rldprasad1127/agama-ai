import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Icon } from "@/components/Icon";
import { cx, errMsg } from "@/lib/utils";

function strength(pw: string): { score: number; label: string } {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return { score: s, label: ["Too short", "Weak", "Fair", "Good", "Strong"][s] };
}

export default function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { login, register, demo } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isLogin = mode === "login";
  const st = useMemo(() => strength(password), [password]);
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!isLogin && password.length < 8) { setErr("Password must be at least 8 characters."); return; }
    if (!isLogin && !name.trim()) { setErr("Please enter a display name."); return; }
    setBusy(true);
    try { isLogin ? await login(email.trim(), password) : await register(name.trim(), email.trim(), password); nav("/", { replace: true }); }
    catch (e2) { setErr(errMsg(e2)); }
    finally { setBusy(false); }
  }
  async function quickDemo() {
    setErr(null); setBusy(true);
    try { await demo(); nav("/", { replace: true }); } catch (e2) { setErr(errMsg(e2)); } finally { setBusy(false); }
  }

  const field = "w-full bg-[#0b0f1f] border border-white/10 rounded-xl pl-10 pr-10 py-3 text-white placeholder:text-slate-500 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400";
  return (
    <div className="min-h-screen bg-[#070b17] text-slate-200 relative overflow-hidden flex flex-col"
      style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px)", backgroundSize: "32px 32px" }}>
      <header className="flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl border border-indigo-400/40 bg-indigo-500/10 flex items-center justify-center text-indigo-300"><Icon name="code" /></div>
          <span className="text-white font-semibold text-lg">Agama AI</span>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-400/30 text-emerald-300 font-label-micro text-label-micro uppercase"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Personal learning vault</span>
        </div>
        <button onClick={quickDemo} disabled={busy} className="font-label-code text-label-code text-slate-300 underline underline-offset-4 hover:text-white">Quick Demo</button>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-6">
        <div className="w-full max-w-[560px] rounded-3xl border border-white/10 bg-[#0e1328]/90 shadow-[0_0_60px_rgba(79,70,229,.15)] p-8 sm:p-10 fade-up">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-indigo-500/15 border border-indigo-400/30 flex items-center justify-center text-indigo-300 mb-5"><Icon name={isLogin ? "auto_awesome" : "key"} className="text-[28px]" /></div>
          <h1 className="text-center text-3xl font-bold text-white tracking-tight">{isLogin ? "Welcome Back" : "Create your account"}</h1>
          <p className="text-center text-slate-400 mt-2">{isLogin ? "Continue your daily mastery routine & focus blocks" : "Start building your daily mastery routine."}</p>

          <div className="mt-7 grid grid-cols-2 rounded-xl border border-white/10 bg-[#0b0f1f] p-1">
            <Link to="/login" className={cx("flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold", isLogin ? "bg-indigo-500 text-white shadow" : "text-slate-400 hover:text-white")}><Icon name="login" className="text-[18px]" />Sign In</Link>
            <Link to="/register" className={cx("flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold", !isLogin ? "bg-indigo-500 text-white shadow" : "text-slate-400 hover:text-white")}><Icon name="person_add" className="text-[18px]" />Create Account</Link>
          </div>

          <form onSubmit={submit} className="mt-6 flex flex-col gap-4" noValidate>
            {!isLogin && (
              <label className="block"><span className="text-sm font-semibold text-white">Display Name</span>
                <div className="relative mt-1.5"><Icon name="person" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[20px]" />
                  <input className={field} placeholder="e.g. Ram" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} /></div></label>
            )}
            <label className="block"><span className="text-sm font-semibold text-white">Email Address</span>
              <div className="relative mt-1.5"><Icon name="alternate_email" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[20px]" />
                <input className={cx(field, emailOk && "border-emerald-400/60")} type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
                {emailOk && <Icon name="check" className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 text-[20px]" />}</div></label>
            <label className="block"><span className="flex justify-between text-sm font-semibold text-white">Password{!isLogin && <span className="font-label-micro text-label-micro text-slate-500 uppercase">min 8 characters</span>}</span>
              <div className="relative mt-1.5"><Icon name="lock" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[20px]" />
                <input className={field} type={show ? "text" : "password"} placeholder={isLogin ? "••••••••" : "Create a strong password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isLogin ? "current-password" : "new-password"} required />
                <button type="button" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"><Icon name={show ? "visibility" : "visibility_off"} className="text-[20px]" /></button></div></label>
            {!isLogin && (
              <div>
                <div className="grid grid-cols-4 gap-1.5">{[1, 2, 3, 4].map((i) => <div key={i} className={cx("h-1.5 rounded-full", st.score >= i ? (st.score >= 3 ? "bg-emerald-400" : "bg-amber-400") : "bg-white/10")} />)}</div>
                <p className="mt-1.5 text-xs text-slate-500 font-label-micro">{password ? st.label : "Must be at least 8 characters."}</p>
              </div>
            )}
            {err && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 text-rose-200 text-sm px-3 py-2"><Icon name="error" className="text-[18px] mt-px" />{err}</div>}
            <button disabled={busy} className="mt-1 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-400 text-white font-semibold py-3.5 shadow-[0_8px_30px_rgba(99,102,241,.35)] hover:brightness-110 disabled:opacity-60 flex items-center justify-center gap-2">
              {busy ? "Please wait…" : isLogin ? "Sign In" : "Create Account"}{!busy && <Icon name="arrow_forward" className="text-[20px]" />}</button>
          </form>

          <div className="my-6 flex items-center gap-3 text-slate-500 font-label-micro text-label-micro uppercase"><span className="flex-1 h-px bg-white/10" />or try it first<span className="flex-1 h-px bg-white/10" /></div>
          <button onClick={quickDemo} disabled={busy} className="w-full rounded-xl border border-white/10 bg-[#0b0f1f] hover:bg-white/5 text-white py-3 flex items-center justify-center gap-2 font-semibold disabled:opacity-60"><Icon name="bolt" className="text-emerald-400" />Demo Sandbox <span className="text-slate-500 text-xs font-normal">(sample data)</span></button>
        </div>
      </main>
      <footer className="px-6 py-4 border-t border-white/5 flex flex-wrap items-center justify-between gap-2 font-label-micro text-label-micro text-slate-500">
        <span className="flex items-center gap-2"><Icon name="monitor" className="text-[16px]" />AI: Ollama Cloud</span>
        <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />MongoDB · JWT secured</span>
      </footer>
    </div>
  );
}
