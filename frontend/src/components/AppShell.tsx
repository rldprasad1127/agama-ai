import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ScheduleProvider, useSchedule } from "@/hooks/useSchedule";
import { useAiStatus } from "@/hooks/useAiStatus";
import { useTheme } from "@/hooks/useTheme";
import { Icon } from "./Icon";
import { NewBlockModal } from "./NewBlockModal";
import { cx, fmtMinutes } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Dashboard", icon: "grid_view", end: true },
  { to: "/paths", label: "Learning Path", icon: "route" },
  { to: "/focus", label: "Focus Mode", icon: "timer" },
  { to: "/practice", label: "Speaking Practice", icon: "record_voice_over" },
  { to: "/analytics", label: "Analytics", icon: "bar_chart" },
  { to: "/journal", label: "Journal", icon: "menu_book" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

function Shell() {
  const { user, logout } = useAuth();
  const { schedule, openNewBlock } = useSchedule();
  const ai = useAiStatus();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const aiOk = ai?.reachable;
  const { resolved, setPref } = useTheme();

  return (
    <div className="min-h-screen bg-surface">
      {open && <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={cx("fixed left-0 top-0 bottom-0 w-64 bg-surface-container-lowest z-50 flex flex-col justify-between shadow-[0_1px_8px_rgba(0,0,0,0.04)] transition-transform",
        open ? "translate-x-0" : "-translate-x-full lg:translate-x-0")}>
        <div className="flex flex-col">
          <div className="h-16 px-space-md flex items-center justify-between">
            <div className="flex items-center gap-space-sm">
              <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary"><Icon name="code" className="text-[18px]" /></div>
              <div className="flex flex-col"><span className="font-headline-sm text-headline-sm text-on-surface tracking-tight">Agama AI</span><span className="font-label-micro text-label-micro text-on-surface-variant">v1.0 Core</span></div>
            </div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" /><span className="font-label-micro text-label-micro uppercase font-medium">Live</span>
            </div>
          </div>
          <div className="px-space-md py-space-xs"><span className="font-label-micro text-label-micro uppercase text-outline tracking-wider">Workspace</span></div>
          <nav className="flex flex-col gap-1 px-space-sm">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)}
                className={({ isActive }) => cx("flex items-center gap-space-sm px-space-sm py-2 rounded-lg transition-colors",
                  isActive ? "bg-primary-container text-on-primary-container-container font-semibold" : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface")}>
                <Icon name={n.icon} className="text-[20px]" /><span className="font-body-md text-body-md">{n.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex flex-col gap-space-sm p-space-md bg-surface-container-low">
          <div className="flex items-center justify-between p-2 rounded-lg bg-surface-container-lowest shadow-[0_1px_4px_rgba(0,0,0,0.03)]">
            <div className="flex items-center gap-2"><Icon name="local_fire_department" fill className="text-tertiary-container text-[18px]" /><span className="font-label-code text-label-code text-on-surface">{schedule?.streak_count ?? user?.streak_count ?? 0} Days</span></div>
            <span className="font-label-micro text-label-micro text-on-surface-variant uppercase tracking-wider">Streak</span>
          </div>
          <div className="flex items-center justify-between px-2 py-1">
            <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-secondary" /><span className="font-label-code text-label-code text-on-surface-variant">MongoDB</span></div>
            <span className="font-label-micro text-label-micro text-secondary font-semibold">Synced</span>
          </div>
          <div className="flex items-center justify-between pt-space-xs relative">
            <div className="flex items-center gap-space-sm min-w-0">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0"><Icon name="person" className="text-on-primary text-[18px]" /></div>
              <div className="flex flex-col min-w-0"><span className="font-body-sm text-body-sm font-semibold text-on-surface leading-none truncate">{user?.name}</span>
                <span className="font-label-micro text-label-micro text-secondary leading-tight mt-0.5">{user?.is_demo ? "Demo Sandbox" : `${user?.xp ?? 0} XP`}</span></div>
            </div>
            <button aria-label="Profile options" onClick={() => setMenu((m) => !m)} className="text-on-surface-variant hover:text-on-surface"><Icon name="more_vert" className="text-[18px]" /></button>
            {menu && (
              <div className="absolute bottom-12 right-0 w-44 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-lg py-1 z-50 fade-up">
                <button className="w-full text-left px-3 py-2 text-body-sm hover:bg-surface-container flex items-center gap-2" onClick={() => { setMenu(false); nav("/settings"); }}><Icon name="settings" className="text-[16px]" />Settings</button>
                <button className="w-full text-left px-3 py-2 text-body-sm hover:bg-surface-container flex items-center gap-2 text-error" onClick={logout}><Icon name="logout" className="text-[16px]" />Sign out</button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="fixed top-0 left-0 lg:left-64 right-0 h-16 bg-surface/85 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-30 flex items-center justify-between px-4 lg:px-gutter-expanded">
          <div className="flex items-center gap-space-sm text-on-surface-variant">
            <button className="lg:hidden p-1 -ml-1" aria-label="Open menu" onClick={() => setOpen(true)}><Icon name="menu" /></button>
            <Icon name="terminal" className="text-[18px] text-outline hidden sm:block" />
            <div className="hidden sm:flex items-center gap-1.5 font-label-code text-label-code"><span>Agama</span><span className="text-outline">/</span><span className="text-on-surface font-semibold">Workspace</span></div>
          </div>
          <div className="flex items-center gap-space-md">
            <div className="hidden xl:flex items-center gap-2 px-space-sm py-1 rounded bg-surface-container-low text-on-surface-variant">
              <Icon name="schedule" className="text-[16px] text-primary" /><span className="font-body-sm text-body-sm">Planned Today:</span>
              <span className="font-label-code text-label-code font-semibold text-on-surface">{fmtMinutes(schedule?.total_planned_minutes ?? 0)}</span>
            </div>
            <button onClick={() => nav("/settings")} title={ai ? (ai.reachable ? "Ollama connected" : ai.error ?? "Ollama not reachable") : "Checking AI…"}
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container text-on-surface hover:bg-surface-container-high">
              <Icon name="bolt" className="text-[16px] text-primary" />
              <span className="font-label-code text-label-code text-primary font-semibold max-w-[140px] truncate">{ai?.model ?? "AI"}</span>
              <span className={cx("font-label-micro text-label-micro px-1 rounded", aiOk ? "bg-secondary-container text-on-secondary-container" : "bg-error-container text-on-error-container")}>{ai ? (aiOk ? (ai.is_cloud ? "CLOUD" : "LOCAL") : "OFFLINE") : "…"}</span>
            </button>
            <button onClick={() => setPref(resolved === "dark" ? "light" : "dark")} aria-label={resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              title={resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"} className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container">
              <Icon name={resolved === "dark" ? "light_mode" : "dark_mode"} className="text-[20px]" /></button>
            <button onClick={() => openNewBlock()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-on-primary hover:brightness-110 transition-colors shadow-sm">
              <Icon name="add" className="text-[18px]" /><span className="font-body-sm text-body-sm font-semibold">New Block</span>
            </button>
          </div>
        </header>
        <main className="w-full pt-16 bg-surface min-h-screen"><Outlet /></main>
      </div>
      <NewBlockModal />
    </div>
  );
}

export function AppShell() { return <ScheduleProvider><Shell /></ScheduleProvider>; }
