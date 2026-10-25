import type { MutableRefObject } from "react";
import type { EvaluateMeta, Task } from "@/lib/types";

/** Props shared by the four modality workspaces. The Focus page owns all state (so autosave/submit are uniform). */
export interface WorkProps {
  task: Task;
  content: string; setContent: (s: string) => void;
  checklistDone: number[]; setChecklistDone: (v: number[]) => void;
  hintsUsed: number; setHintsUsed: (n: number) => void;
  language: string; setLanguage: (l: string) => void;
  elapsed: number;
  /** Extra signals (speech duration, last run output…) that the page forwards to /evaluate. */
  metaRef: MutableRefObject<Partial<EvaluateMeta>>;
}
