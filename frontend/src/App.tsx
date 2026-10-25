import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./hooks/useAuth";
import { AppShell } from "./components/AppShell";
import { ScheduleProvider } from "./hooks/useSchedule";
import AuthPage from "./pages/AuthPage";
import Dashboard from "./pages/Dashboard";
import FocusRedirect from "./pages/FocusRedirect";
import Focus from "./pages/Focus";
import Journal from "./pages/Journal";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";
import Paths from "./pages/Paths";
import PathNew from "./pages/PathNew";
import Practice, { PracticeStart } from "./pages/Practice";
import PracticeRun from "./pages/PracticeRun";

function Splash() {
  return <div className="min-h-screen flex items-center justify-center text-on-surface-variant font-label-code text-label-code">Loading Agama…</div>;
}
function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  if (!user.onboarded && !user.is_demo && loc.pathname !== "/paths/new") return <Navigate to="/paths/new?welcome=1" replace />;
  return <>{children}</>;
}
function Public({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Splash />;
  if (user) return <Navigate to={(loc.state as { from?: string } | null)?.from || "/"} replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Public><AuthPage mode="login" /></Public>} />
      <Route path="/register" element={<Public><AuthPage mode="register" /></Public>} />
      <Route element={<Protected><AppShell /></Protected>}>
        <Route index element={<Dashboard />} />
        <Route path="focus" element={<FocusRedirect />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="journal" element={<Journal />} />
        <Route path="settings" element={<Settings />} />
        <Route path="paths" element={<Paths />} />
        <Route path="paths/new" element={<PathNew />} />
        <Route path="practice" element={<Practice />} />
        <Route path="practice/start" element={<PracticeStart />} />
        <Route path="practice/run/:sessionId" element={<PracticeRun />} />
      </Route>
      {/* full-screen workspace (no sidebar) */}
      <Route path="/focus/:taskId" element={<Protected><ScheduleProvider><Focus /></ScheduleProvider></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
