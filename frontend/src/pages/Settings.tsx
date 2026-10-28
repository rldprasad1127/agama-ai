import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useAiStatus } from "@/hooks/useAiStatus";
import { useToast } from "@/components/Toast";
import { useTheme } from "@/hooks/useTheme";
import type { ThemePref } from "@/lib/types";
import { Icon } from "@/components/Icon";
import { cx, downloadFile, errMsg, LANGUAGES } from "@/lib/utils";

const inp = "w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/40";
function Card({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
    <h2 className="font-headline-md text-title-lg flex items-center gap-2 mb-4"><Icon name={icon} className="text-primary" />{title}</h2>{children}</section>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="block font-label-micro text-label-micro uppercase tracking-wider text-on-surface-variant mb-1">{label}</span>{children}</label>;
}

export default function Settings() {
  const { user, setUser, logout } = useAuth();
  const { toast } = useToast();
  const nav = useNavigate();
  const [force, setForce] = useState(0);
  const ai = useAiStatus(force);
  const [name, setName] = useState(user?.name ?? "");
  const [target, setTarget] = useState(user?.daily_target_minutes ?? 240);
  const [dayStart, setDayStart] = useState(user?.preferences.day_start ?? "09:00");
  const [lang, setLang] = useState(user?.preferences.default_language ?? "python");
  const [bin, setBin] = useState(user?.preferences.binaural_enabled ?? false);
  const [model, setModel] = useState(user?.preferences.ai_model ?? "");
  const [hints, setHints] = useState(user?.preferences.ai_hints ?? true);
  const { pref: themePref, setPref: setTheme } = useTheme();
  const [busy, setBusy] = useState("");
  const [pw, setPw] = useState({ cur: "", next: "", again: "" });
  const [del, setDel] = useState({ open: false, password: "" });
  if (!user) return null;

  async function saveProfile() {
    if (!name.trim()) return toast("Name can't be empty.", "error");
    if (!(target >= 15 && target <= 960)) return toast("Daily target must be between 15 and 960 minutes.", "error");
    setBusy("save");
    try {
      setUser(await api.auth.update({ name: name.trim(), daily_target_minutes: target, preferences: { day_start: dayStart, default_language: lang, binaural_enabled: bin, ai_model: model || null, ai_hints: hints } }));
      toast("Settings saved.", "success"); setForce((n) => n + 1);
    } catch (e) { toast(errMsg(e), "error"); } finally { setBusy(""); }
  }
  async function changePw() {
    if (pw.next.length < 8) return toast("New password must be at least 8 characters.", "error");
    if (pw.next !== pw.again) return toast("New passwords don't match.", "error");
    setBusy("pw");
    try { await api.auth.changePassword({ current_password: pw.cur, new_password: pw.next }); setPw({ cur: "", next: "", again: "" }); toast("Password changed.", "success"); }
    catch (e) { toast(errMsg(e), "error"); } finally { setBusy(""); }
  }
  async function exportData() {
    setBusy("export");
    try { downloadFile(`agama-journal-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await api.metrics.export(), null, 2)); toast("Journal exported.", "success"); }
    catch (e) { toast(errMsg(e), "error"); } finally { setBusy(""); }
  }
  async function deleteAccount() {
    setBusy("del");
    try { await api.auth.deleteAccount(del.password); logout(); nav("/login"); }
    catch (e) { toast(errMsg(e), "error"); setBusy(""); }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-8 flex flex-col gap-5">
      <div><h1 className="font-headline-lg text-headline-lg">Settings</h1><p className="text-on-surface-variant">{user.email}{user.is_demo && " · demo account"}</p></div>

      <Card title="Appearance" icon="palette">
        <p className="text-on-surface-variant mb-3">Light is the default. Pick what's comfortable — it applies everywhere and is remembered on your account.</p>
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-3">
          {([["light", "Light", "light_mode"], ["dark", "Dark", "dark_mode"], ["system", "System", "contrast"]] as [ThemePref, string, string][]).map(([k, label, icon]) => (
            <button key={k} role="radio" aria-checked={themePref === k} onClick={() => setTheme(k)}
              className={cx("rounded-xl border p-3 flex flex-col items-center gap-1.5 font-semibold transition-colors",
                themePref === k ? "border-primary bg-primary-fixed/50 text-on-surface ring-2 ring-primary/30" : "border-outline-variant hover:bg-surface-container")}>
              <Icon name={icon} className="text-[22px]" />{label}
              {themePref === k && <span className="font-label-micro text-label-micro text-primary uppercase">Active</span>}
            </button>))}
        </div>
      </Card>

      <Card title="Profile & planning" icon="person">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Display name"><input className={inp} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
          <Field label="Daily focus target (minutes)"><input type="number" className={inp} min={15} max={960} step={15} value={target} onChange={(e) => setTarget(Number(e.target.value))} /></Field>
          <Field label="Day start time"><input type="time" className={inp} value={dayStart} onChange={(e) => setDayStart(e.target.value)} /></Field>
          <Field label="Default code language"><select className={inp} value={lang} onChange={(e) => setLang(e.target.value)}>{LANGUAGES.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}</select></Field>
        </div>
        <label className="mt-4 flex items-center gap-3 cursor-pointer"><input type="checkbox" className="w-4 h-4" checked={bin} onChange={(e) => setBin(e.target.checked)} /><span>Start focus sessions with the 40&nbsp;Hz binaural tone <span className="text-on-surface-variant">(use headphones)</span></span></label>
      </Card>

      <Card title="AI engine (Ollama Cloud)" icon="auto_awesome">
        <div className={cx("rounded-lg px-3 py-2 flex items-start gap-2 text-body-md", !ai ? "bg-surface-container" : ai.reachable ? "bg-tertiary-fixed/40" : "bg-error-container/50")}>
          <Icon name={!ai ? "progress_activity" : ai.reachable ? "check_circle" : "error"} className={cx("text-[20px] mt-0.5", !ai && "animate-spin")} />
          <div className="min-w-0">{!ai ? "Checking…" : ai.reachable ? <>Connected to <b>{ai.base_url}</b>{ai.is_cloud ? " (cloud)" : ""}. Active model: <b>{ai.model}</b>.</> :
            <>Can't use the AI endpoint at <b>{ai.base_url}</b>. {!ai.configured && "OLLAMA_API_KEY is not set on the server. "}{ai.error && <span className="break-words">{ai.error}</span>}</>}</div>
        </div>
        <label className="mt-4 flex items-center gap-3 cursor-pointer"><input type="checkbox" className="w-4 h-4" checked={hints} onChange={(e) => setHints(e.target.checked)} /><span>Enable AI hints while coding <span className="text-on-surface-variant">(turn off if you want a pure exam-style experience)</span></span></label>
        <div className="mt-4 grid sm:grid-cols-[1fr_auto] gap-3 items-end">
          <Field label="Model (blank = server default)">
            <input className={inp} list="ai-models" value={model} onChange={(e) => setModel(e.target.value)} placeholder={ai?.model ?? "gpt-oss:120b"} />
            <datalist id="ai-models">{ai?.models.map((m) => <option key={m} value={m} />)}</datalist></Field>
          <button onClick={() => setForce((n) => n + 1)} className="px-4 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high font-semibold flex items-center gap-1.5"><Icon name="refresh" className="text-[18px]" />Test connection</button>
        </div>
        <p className="mt-2 text-body-sm text-on-surface-variant">The API key lives only in the server's <code>.env</code>; it is never sent to the browser. Save settings, then test, to try a different model.</p>
      </Card>

      <div className="flex justify-end"><button onClick={() => void saveProfile()} disabled={busy === "save"} className="px-5 py-2.5 rounded-lg bg-primary text-on-primary font-semibold disabled:opacity-60">{busy === "save" ? "Saving…" : "Save settings"}</button></div>

      <Card title="Change password" icon="lock">
        {user.is_demo ? <p className="text-on-surface-variant">The demo account's password can't be changed.</p> : <>
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Current"><input type="password" autoComplete="current-password" className={inp} value={pw.cur} onChange={(e) => setPw({ ...pw, cur: e.target.value })} /></Field>
            <Field label="New (8+ chars)"><input type="password" autoComplete="new-password" className={inp} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
            <Field label="Repeat new"><input type="password" autoComplete="new-password" className={inp} value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} /></Field>
          </div>
          <button onClick={() => void changePw()} disabled={!pw.cur || !pw.next || busy === "pw"} className="mt-3 px-4 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high font-semibold disabled:opacity-50">Update password</button></>}
      </Card>

      <Card title="Your data" icon="database">
        <p className="text-on-surface-variant mb-3">Everything is stored in your MongoDB. Export your full journal (all evaluations, code, and metrics) as JSON.</p>
        <div className="flex gap-3 flex-wrap">
          <button onClick={() => void exportData()} disabled={busy === "export"} className="px-4 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high font-semibold flex items-center gap-1.5"><Icon name="download" className="text-[18px]" />Export journal (JSON)</button>
          <button onClick={() => { logout(); nav("/login"); }} className="px-4 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high font-semibold flex items-center gap-1.5"><Icon name="logout" className="text-[18px]" />Sign out</button>
        </div>
      </Card>

      <Card title="Danger zone" icon="warning">
        {user.is_demo ? <p className="text-on-surface-variant">The demo account is reset daily and can't be deleted.</p> : !del.open ? <button onClick={() => setDel({ open: true, password: "" })} className="px-4 py-2 rounded-lg border border-error text-error font-semibold hover:bg-error-container/40">Delete account…</button> : (
          <div className="flex flex-col gap-3 max-w-sm">
            <p className="text-body-md">This permanently deletes your account, schedule, journal and flashcards. {user.is_demo ? "" : "Enter your password to confirm."}</p>
            {!user.is_demo && <input type="password" className={inp} placeholder="Password" value={del.password} onChange={(e) => setDel({ ...del, password: e.target.value })} />}
            <div className="flex gap-2"><button onClick={() => setDel({ open: false, password: "" })} className="px-4 py-2 rounded-lg bg-surface-container font-semibold">Cancel</button>
              <button onClick={() => void deleteAccount()} disabled={busy === "del" || (!user.is_demo && !del.password)} className="px-4 py-2 rounded-lg bg-error text-on-error font-semibold disabled:opacity-50">Delete forever</button></div>
          </div>)}
      </Card>
    </div>
  );
}
