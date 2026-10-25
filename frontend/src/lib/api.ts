import type {
  CheckAnswerOut, CheckOut, CurriculumInfo, ExplainKind, HelpConfig, HelpOut, HintOut, Mistake, PSession, PlacementQ, PlacementResult,
  Plan, PlanCreate, PlanDay, PlanPreview, Rebalance, SessionCreate,
  AiStatus, EvaluateMeta, EvaluateOut, Flashcard, FlashcardStats, Heatmap, JournalEntry, JournalPage, Performance, Preset,
  RunOut, RuntimeInfo, Schedule, Stats, Task, TaskContent, TaskCreate, TaskMode, TaskUpdate, TokenOut, User, UserPreferences,
} from "./types";

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) || "";
const TOKEN_KEY = "agama.token";
console.log('BASE', BASE)
export class ApiError extends Error {
  status: number; code?: string;
  constructor(status: number, message: string, code?: string) { super(message); this.status = status; this.code = code; }
}

export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t: string) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
};

/** The user's LOCAL calendar date (YYYY-MM-DD). Sent on every request so "today" matches the user's timezone. */
export function localDate(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type Unauthorized = () => void;
let onUnauthorized: Unauthorized | null = null;
export const setUnauthorizedHandler = (fn: Unauthorized | null) => { onUnauthorized = fn; };

async function request<T>(method: string, path: string, body?: unknown, opts: { signal?: AbortSignal; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { "X-Client-Date": localDate() };
  const token = tokenStore.get();
  if (token && opts.auth !== false) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: opts.signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "Cannot reach the Agama API. Is the backend running?");
  }
  if (res.status === 204) return undefined as T;
  let data: any = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { data = null; } }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    if (data?.detail) {
      msg = typeof data.detail === "string" ? data.detail
        : Array.isArray(data.detail) ? data.detail.map((d: any) => `${(d.loc || []).slice(1).join(".")}: ${d.msg}`).join("; ") : msg;
    }
    if (res.status === 401 && opts.auth !== false && token) onUnauthorized?.();
    throw new ApiError(res.status, msg, data?.code);
  }
  return data as T;
}
const get = <T,>(p: string, signal?: AbortSignal) => request<T>("GET", p, undefined, { signal });
const post = <T,>(p: string, b?: unknown) => request<T>("POST", p, b ?? {});
const put = <T,>(p: string, b?: unknown) => request<T>("PUT", p, b ?? {});
const patch = <T,>(p: string, b?: unknown) => request<T>("PATCH", p, b ?? {});
const del = <T,>(p: string) => request<T>("DELETE", p);
const qs = (o: Record<string, string | number | undefined | null>) => {
  const u = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") u.set(k, String(v)); });
  const s = u.toString();
  return s ? `?${s}` : "";
};

export const api = {
  auth: {
    register: (b: { name: string; email: string; password: string }) => request<TokenOut>("POST", "/api/auth/register", b, { auth: false }),
    login: (b: { email: string; password: string }) => request<TokenOut>("POST", "/api/auth/login", b, { auth: false }),
    demo: () => request<TokenOut>("POST", "/api/auth/demo", {}, { auth: false }),
    me: () => get<User>("/api/auth/me"),
    update: (b: { name?: string; daily_target_minutes?: number; onboarded?: boolean; learner_level?: string; goal?: string; preferences?: Partial<UserPreferences> }) => patch<User>("/api/auth/me", b),
    changePassword: (b: { current_password: string; new_password: string }) => post<void>("/api/auth/change-password", b),
    deleteAccount: (password: string) => post<void>("/api/auth/delete-account", { password }),
  },
  schedule: {
    today: (date?: string) => get<Schedule>(`/api/schedule/today${qs({ date })}`),
    backlog: () => get<Task[]>("/api/schedule/backlog"),
    presets: () => get<Preset[]>("/api/schedule/presets"),
    applyPreset: (key: string, date?: string) => post<Schedule>(`/api/schedule/presets/${key}/apply`, { date }),
    create: (b: TaskCreate) => post<Task>("/api/schedule/", b),
    update: (id: string, b: TaskUpdate) => put<Task>(`/api/schedule/${id}`, b),
    remove: (id: string) => del<void>(`/api/schedule/${id}`),
    reorder: (task_ids: string[], date?: string) => patch<Schedule>("/api/schedule/reorder", { task_ids, date }),
    setStatus: (id: string, status: "pending" | "completed") => patch<Task>(`/api/schedule/${id}/status`, { status }),
    shape: (minutes: 15 | 30 | 60, date?: string) => post<Schedule>("/api/schedule/shape", { minutes, date }),
    generate: (b: { title: string; task_mode: TaskMode; category?: string; language?: string | null; duration_minutes?: number; instructions?: string }) =>
      post<TaskContent>("/api/schedule/generate", b),
    regenerate: (id: string, instructions = "") => post<Task>(`/api/schedule/${id}/regenerate${qs({ instructions })}`),
  },
  focus: {
    runtimes: () => get<RuntimeInfo[]>("/api/focus/runtimes"),
    get: (id: string) => get<Task>(`/api/focus/${id}`),
    saveDraft: (id: string, b: { content: string; notes: string; checklist_done: number[]; hints_used: number; elapsed_seconds: number }) =>
      put<{ saved_at: string }>(`/api/focus/${id}/draft`, b),
    run: (id: string, b: { code: string; language?: string | null; stdin?: string; run_tests?: boolean }) => post<RunOut>(`/api/focus/${id}/run`, b),
    evaluate: (id: string, b: { user_submission: string; time_spent_seconds: number; language?: string | null; meta?: EvaluateMeta }) =>
      post<EvaluateOut>(`/api/focus/${id}/evaluate`, b),
  },
  metrics: {
    journal: (p: { page?: number; page_size?: number; mode?: TaskMode | ""; date_from?: string; date_to?: string; q?: string }) =>
      get<JournalPage>(`/api/metrics/journal${qs(p)}`),
    entry: (id: string) => get<JournalEntry>(`/api/metrics/journal/${id}`),
    remove: (id: string) => del<void>(`/api/metrics/journal/${id}`),
    export: () => get<unknown>("/api/metrics/journal/export"),
    rerun: (id: string) => post<Task>(`/api/metrics/journal/${id}/rerun`),
    heatmap: (days = 90) => get<Heatmap>(`/api/metrics/heatmap${qs({ days })}`),
    stats: (range_days = 30) => get<Stats>(`/api/metrics/stats${qs({ range_days })}`),
    performance: (mode: TaskMode) => get<Performance>(`/api/metrics/performance${qs({ mode })}`),
  },
  flashcards: {
    list: (p: { due?: boolean; task_id?: string } = {}) => get<Flashcard[]>(`/api/flashcards/${qs({ due: p.due ? "true" : undefined, task_id: p.task_id })}`),
    stats: () => get<FlashcardStats>("/api/flashcards/stats"),
    create: (b: { front: string; back: string; topic?: string; task_id?: string }) => post<Flashcard>("/api/flashcards/", b),
    generate: (b: { task_id: string; text?: string; count?: number }) => post<Flashcard[]>("/api/flashcards/generate", b),
    review: (id: string, rating: "hard" | "good" | "easy") => post<Flashcard>(`/api/flashcards/${id}/review`, { rating }),
    remove: (id: string) => del<void>(`/api/flashcards/${id}`),
  },
  plans: {
    curriculum: () => get<CurriculumInfo>("/api/plans/curriculum"),
    placement: () => get<PlacementQ[]>("/api/plans/placement"),
    grade: (answers: Record<string, number>) => post<PlacementResult>("/api/plans/placement", { answers }),
    preview: (b: PlanCreate) => post<PlanPreview>("/api/plans/preview", b),
    create: (b: PlanCreate) => post<Plan>("/api/plans/", b),
    active: () => get<Plan | null>("/api/plans/active"),
    days: (id: string) => get<PlanDay[]>(`/api/plans/${id}/days`),
    rebalance: (id: string, extend_days = 0) => post<Rebalance>(`/api/plans/${id}/rebalance`, { extend_days }),
    remove: (id: string) => del<void>(`/api/plans/${id}`),
  },
  help: {
    config: () => get<HelpConfig>("/api/help/config"),
    explain: (task_id: string, kind: ExplainKind, passage = "") => post<HelpOut>("/api/help/explain", { task_id, kind, passage }),
    ask: (task_id: string, question: string, history: { role: "user" | "assistant"; content: string }[]) => post<HelpOut>("/api/help/ask", { task_id, question, history }),
    check: (task_id: string, passage = "") => post<CheckOut>("/api/help/check", { task_id, passage }),
    checkAnswer: (b: { task_id: string; question: string; key_points: string[]; answer: string }) => post<CheckAnswerOut>("/api/help/check/answer", b),
    hint: (b: { task_id: string; level: number; code: string; run_output: string; elapsed_seconds: number; failed_runs: number; confirm_solution: boolean }) => post<HintOut>("/api/help/hint", b),
  },
  practice: {
    start: (b: SessionCreate) => post<PSession>("/api/practice/sessions", b),
    list: () => get<PSession[]>("/api/practice/sessions"),
    get: (id: string) => get<PSession>(`/api/practice/sessions/${id}`),
    answer: (id: string, b: { answer: string; duration_seconds: number; speaking_seconds?: number | null; skip?: boolean }) =>
      post<{ session: PSession; feedback: PSession["turns"][number]["feedback"]; done: boolean }>(`/api/practice/sessions/${id}/answer`, b),
    finish: (id: string) => post<{ session: PSession; streak_count: number; total_xp: number }>(`/api/practice/sessions/${id}/finish`),
    abandon: (id: string) => del<void>(`/api/practice/sessions/${id}`),
    mistakes: () => get<Mistake[]>("/api/practice/mistakes"),
    setMastered: (id: string, mastered: boolean) => patch<Mistake>(`/api/practice/mistakes/${id}`, { mastered }),
  },
  system: {
    health: () => request<{ status: string; db: string }>("GET", "/api/system/health", undefined, { auth: false }),
    aiStatus: () => get<AiStatus>("/api/system/ai/status"),
  },
};
