// Mirrors backend/app/models/schemas.py
export type TaskMode = "CODE" | "PROSE" | "THEORY" | "SPEECH";
export type TaskStatus = "pending" | "completed";

export type ThemePref = "light" | "dark" | "system";
export interface UserPreferences { day_start: string; binaural_enabled: boolean; default_language: string; ai_model: string | null; ai_hints: boolean; theme: ThemePref }
export interface User {
  id: string; name: string; email: string; created_at: string; streak_count: number; longest_streak: number;
  daily_target_minutes: number; xp: number; is_demo: boolean; preferences: UserPreferences;
  onboarded: boolean; learner_level: Level | null; goal: Goal | null;
}
export type Level = "beginner" | "intermediate" | "advanced";
export type Goal = "dsa" | "interview" | "english" | "explore";
export interface TokenOut { access_token: string; token_type: string; user: User }

export interface TestCaseIO { name: string; call: string; expected: string }
export interface Draft { content: string; notes: string; checklist_done: number[]; hints_used: number; elapsed_seconds: number; updated_at: string }

export interface Task {
  id: string; date: string | null; title: string; duration_minutes: number; order_index: number; status: TaskStatus;
  task_mode: TaskMode; prompt_context: string; category: string; description: string; language: string | null;
  difficulty: string | null; tags: string[]; constraints: string[]; hints: string[]; checklist: string[];
  starter_code: string; test_cases: TestCaseIO[]; word_target_min: number | null; word_target_max: number | null;
  target_wpm: number | null; draft: Draft | null; time_spent_seconds: number; completed_at: string | null;
  journal_id: string | null; content_ready: boolean; start_time: string | null; end_time: string | null;
  plan_id: string | null; topic_key: string | null; phase: string | null; plan_day: number | null; hint_level_used: number; plan_name?: string | null; plan_color?: number | null;
  practice_kind: "INTERVIEW" | "ENGLISH" | null; practice_config: Record<string, unknown>;
}

export interface TaskContent {
  prompt_context: string; constraints: string[]; hints: string[]; checklist: string[]; starter_code: string;
  test_cases: TestCaseIO[]; word_target_min: number | null; word_target_max: number | null; target_wpm: number | null;
  description: string; difficulty: string | null; tags: string[];
}

export interface TaskCreate {
  title: string; task_mode: TaskMode; duration_minutes: number; date?: string | null; backlog?: boolean; category?: string;
  language?: string | null; prompt_context?: string; description?: string; difficulty?: string | null; tags?: string[];
  constraints?: string[]; hints?: string[]; checklist?: string[]; starter_code?: string; test_cases?: TestCaseIO[];
  word_target_min?: number | null; word_target_max?: number | null; target_wpm?: number | null;
}
export type TaskUpdate = Partial<Omit<TaskCreate, "backlog">> & { move_to_backlog?: boolean };

export interface Schedule {
  date: string; tasks: Task[]; total_planned_minutes: number; completed_minutes: number; remaining_minutes: number;
  completed_count: number; total_count: number; progress_pct: number; daily_target_minutes: number; streak_count: number;
  next_task_id: string | null; mode_minutes: Record<TaskMode, number>;
}
export interface PresetBlock { title: string; task_mode: TaskMode; duration_minutes: number; category: string }
export interface Preset { key: string; name: string; subtitle: string; total_minutes: number; blocks: PresetBlock[] }

export interface TestResult { name: string; call: string; expected: string; actual: string | null; passed: boolean; error: string | null }
export interface RunOut {
  language: string; stdout: string; stderr: string; exit_code: number | null; timed_out: boolean; duration_ms: number;
  tests: TestResult[]; tests_passed: number; tests_total: number;
}
export interface RuntimeInfo { key: string; label: string; available: boolean; supports_tests: boolean; monaco: string }

export interface EvaluateMeta {
  duration_seconds?: number; speaking_seconds?: number; checklist_done?: number[]; hints_used?: number; notes?: string; run_output?: string | null;
  failed_runs?: number;       // client-only (never sent to the API)
}
export interface Insight { kind: "strength" | "warning" | "tip"; title: string; detail: string }
interface MetricsBase { score: number; verdict: string; feedback_bullets: string[]; insights: Insight[]; takeaway: string }
export interface CodeMetrics extends MetricsBase {
  mode: "CODE"; logic_status: "PASS" | "PARTIAL" | "FAIL"; time_complexity: string; space_complexity: string;
  target_time_complexity: string; target_space_complexity: string; tests_passed: number | null; tests_total: number | null;
}
export interface ProseMetrics extends MetricsBase {
  mode: "PROSE"; tone: string; pacing: string; voice_texture: string; word_count: number; readability_grade: number | null;
  flesch_reading_ease: number | null; technical_accuracy: number; narrative_pacing: number; word_target_min: number | null; word_target_max: number | null;
}
export interface FlashcardDraft { front: string; back: string; topic: string }
export interface TheoryMetrics extends MetricsBase {
  mode: "THEORY"; comprehension_score: number; missed_concepts: string[]; captured_concepts: string[]; flashcards: FlashcardDraft[]; next_review_days: number;
}
export interface SpeechMetrics extends MetricsBase {
  mode: "SPEECH"; wpm: number; target_wpm: number; filler_words: { word: string; count: number }[]; filler_total: number;
  fluency_score: number; clarity_score: number; fluency_grade: string; speaking_ratio: number | null; duration_seconds: number;
}
export type Metrics = CodeMetrics | ProseMetrics | TheoryMetrics | SpeechMetrics;

export interface JournalEntry {
  id: string; task_id: string; task_title: string; task_mode: TaskMode; category: string; language: string | null; date: string;
  time_spent_seconds: number; planned_minutes: number; user_submission: string; notes: string; hints_used: number;
  metrics: Metrics; score: number; xp_earned: number; ai_model: string; submission_sha: string; run_output: string | null; created_at: string;
}
export interface Flashcard {
  id: string; task_id: string | null; journal_id: string | null; front: string; back: string; topic: string; box: number;
  due_date: string; reviews: number; correct: number; interval_days: number; next_intervals: { hard: number; good: number; easy: number };
}
export interface EvaluateOut { entry: JournalEntry; task: Task; flashcards: Flashcard[]; streak_count: number; total_xp: number; next_task_id: string | null }

export interface JournalPage {
  items: JournalEntry[]; total: number; page: number; page_size: number; pages: number;
  counts_by_mode: Record<TaskMode | "ALL", number>;
  summary: { blocks_logged: number; focus_seconds: number; pass_rate: number; avg_score: number };
}
export interface HeatmapDay { date: string; minutes: number; sessions: number; items: { title: string; mode: string; minutes: number }[] }
export interface Heatmap { days: HeatmapDay[]; total_minutes: number; active_days: number; longest_streak: number; max_minutes: number }
export interface Stats {
  range_days: number; total_focus_minutes: number; focus_minutes_this_week: number; sessions: number; blocks_completed: number; blocks_total: number;
  completion_rate: number; streak_count: number; longest_streak: number; active_last_7: boolean[]; mean_block_minutes: number;
  planned_mean_minutes: number; pace_delta_minutes: number; avg_score: number; total_xp: number;
  by_mode: Record<TaskMode, { count: number; minutes: number; avg_score: number }>;
}
export interface TopicMastery { category: string; attempts: number; passed: number; avg_score: number; mastery_pct: number; level: string }
export interface SeriesPoint { label: string; date: string; minutes: number; score: number; hints_used: number }
export interface Performance {
  mode: TaskMode; topics: TopicMastery[]; series: SeriesPoint[]; attempts: number; avg_score: number; no_hint_rate: number;
  avg_minutes: number; mean_score: number; extras: Record<string, number | null>;
}
export interface AiStatus { base_url: string; model: string; configured: boolean; is_cloud: boolean; reachable: boolean; models: string[]; error: string | null }
export interface FlashcardStats { total: number; due: number; by_box: Record<string, number>; accuracy: number | null }


// ───────── learning paths ─────────
export type Track = "DSA" | "SUBJECT" | "INTERVIEW" | "ENGLISH";
export interface OutlineExercise { title: string; difficulty: "Easy" | "Medium" | "Hard" }
export interface OutlineTopic { name: string; theory: string; exercises: OutlineExercise[] }
export interface Outline { subject: string; summary: string; topics: OutlineTopic[]; left_out: string[]; reviewed: boolean }
export interface SubjectInfo {
  key: string; name: string; icon: string; blurb: string; group: string; kind: "dsa" | "code" | "sql" | "exercise"; featured: boolean;
  language: string | null; note: string; has_placement: boolean; executable: boolean;
  topics: { key: string; name: string; exercises: number; weight: number }[];
}
export interface SubjectCatalog { subjects: SubjectInfo[]; max_plans: number; over_budget_minutes: number }
export interface PlanCreate {
  subject?: string; custom_name?: string; custom_topics?: OutlineTopic[];
  track: Track; mode: "LEARN" | "PRACTICE"; days: number; minutes_per_day: number; level: Level;
  difficulty: "easy" | "medium" | "hard" | "mixed" | "adaptive"; topics: string[]; known_topics: string[]; weak_topics: string[];
  language: string; skip_weekends: boolean; start_date?: string | null;
  role: string; experience: "fresher" | "junior" | "senior"; company_type: string;
  cefr: "A1" | "A2" | "B1" | "B2" | "C1"; focus_topics: string[];
}
export interface PreviewDay { day: number; date: string; blocks: { title: string; mode: TaskMode; minutes: number; phase: string }[] }
export interface PlanPreview {
  title: string; track: Track; mode: string; days: number; minutes_per_day: number; start_date: string; end_date: string;
  topics: { key: string; name: string; days: number; first_day: number; last_day: number }[]; trimmed_topics: string[];
  total_blocks: number; total_minutes: number; by_phase: Record<string, number>; sample_days: PreviewDay[];
  other_minutes_per_day: number; combined_minutes_per_day: number; over_budget: boolean;
}
export interface PlanTopic { key: string; name: string; first_day: number; last_day: number; blocks_total: number; blocks_done: number; mastery: number | null; help_requests: number; status: "done" | "current" | "upcoming" }
export interface Plan {
  id: string; title: string; track: Track; mode: string; level: string; days: number; minutes_per_day: number; start_date: string; end_date: string;
  difficulty: string; language: string; status: "active" | "paused" | "completed" | "archived"; subject: string; subject_name: string; icon: string; color: number; custom: boolean;
  skip_weekends: boolean; day_index: number; days_left: number;
  blocks_total: number; blocks_done: number; minutes_total: number; minutes_done: number; progress_pct: number;
  missed_count: number; missed_minutes: number; today_count: number; next_task_id: string | null; topics: PlanTopic[];
  trimmed_topics: string[]; rebalanced_count: number; config: Record<string, unknown>;
}
export interface PlanBlock { id: string; title: string; mode: TaskMode; phase: string; minutes: number; status: string; topic_key: string | null; difficulty: string | null; score: number | null; missed: boolean; practice_kind: string | null }
export interface PlanDay { day: number; date: string; is_today: boolean; blocks: PlanBlock[] }
export interface Rebalance { moved: number; dropped: string[]; new_end_date: string; plan: Plan }
export interface PlacementQ { id: string; topic: string; topic_name: string; prompt: string; options: string[] }
export interface PlacementResult { score: number; total: number; level: Level; known_topics: string[]; weak_topics: string[]; suggested_mode: "LEARN" | "PRACTICE"; by_topic: Record<string, boolean> }
export interface CurriculumInfo { topics: { key: string; name: string; problems: number; weight: number }[]; tracks: Track[]; english_topics: string[] }

// ───────── AI help ─────────
export type ExplainKind = "simpler" | "analogy" | "example" | "diagram" | "why";
export interface HelpOut { text: string; cached: boolean; remaining_today: number }
export interface HelpConfig { daily_limit: number; remaining_today: number; hints_enabled: boolean; thresholds: { level: number; label: string; seconds: number; failed_runs: number }[] }
export interface CheckOut { question: string; key_points: string[]; remaining_today: number }
export interface CheckAnswerOut { understood: boolean; feedback: string; reexplain: string; remaining_today: number }
export interface HintOut { level: number; hint: string; solution: string | null; remaining_today: number }

// ───────── speaking practice ─────────
export interface Fb { score: number; strengths: string[]; improvements: string[]; better_answer: string; grammar_fixes: { wrong: string; right: string; rule: string }[]; new_vocabulary: string[] }
export interface PTurn { index: number; kind: string; question: string; answer: string | null; words: number; wpm: number; fillers: { word: string; count: number }[]; feedback: Fb | null; rubric: string | null }
export interface PSession {
  id: string; kind: "INTERVIEW" | "ENGLISH"; task_id: string | null; config: Record<string, string | number | boolean>; status: string; instant_feedback: boolean;
  turns: PTurn[]; current_index: number | null; answered: number; total: number; score: number; xp_earned: number;
  report: PReport | null; created_at: string; completed_at: string | null;
}
export interface PReport {
  overall_score: number; summary: string; category_scores: Record<string, number>; top_strengths: string[]; top_improvements: string[];
  action_plan: string[]; readiness?: string; cefr_estimate?: string; avg_answer_score: number; wpm: number; filler_total: number;
  fillers: { word: string; count: number }[]; answered: number; skipped: number;
}
export interface SessionCreate {
  kind: "INTERVIEW" | "ENGLISH"; task_id?: string; role?: string; round?: "hr" | "behavioral" | "technical" | "mixed"; experience?: "fresher" | "junior" | "senior";
  company_type?: string; cefr?: string; topic?: string; style?: string; num_questions?: number; instant_feedback?: boolean;
}
export interface Mistake { id: string; wrong: string; right: string; rule: string; times: number; last_seen: string; mastered: boolean }
