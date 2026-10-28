import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { cx } from "@/lib/utils";

const STEPS = ["Parsing your submission", "Running deterministic checks", "Asking the AI reviewer", "Validating the evaluation JSON"];

export function EvaluatingOverlay({ model, error, onRetry, onBack }: { model: string; error: string | null; onRetry: () => void; onBack: () => void }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (error) return;
    const id = setInterval(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), 2500);
    return () => clearInterval(id);
  }, [error]);
  return (
    <div className="fixed inset-0 z-[70] bg-on-surface/40 backdrop-blur-sm flex items-center justify-center p-4" role="alertdialog" aria-live="assertive" aria-label="AI evaluation">
      <div className="w-full max-w-md rounded-2xl bg-surface-container-low border border-outline-variant text-on-surface p-6 shadow-2xl fade-up">
        {error ? (
          <>
            <div className="flex items-center gap-2 text-error font-semibold"><Icon name="error" />Evaluation failed</div>
            <p className="mt-2 text-body-md text-on-surface-variant break-words">{error}</p>
            <p className="mt-2 text-body-sm text-outline">Your work is safe — nothing was lost and the timer is paused.</p>
            <div className="mt-5 flex gap-2 justify-end">
              <button onClick={onBack} className="px-4 py-2 rounded-lg bg-surface-container hover:bg-surface-container font-semibold">Back to editing</button>
              <button onClick={onRetry} className="px-4 py-2 rounded-lg bg-primary hover:opacity-90 text-on-primary font-semibold">Retry</button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 font-semibold text-on-surface"><Icon name="progress_activity" className="animate-spin text-primary" />AI Evaluating Workspace…</div>
            <div className="mt-1 font-label-code text-label-code text-on-surface-variant">ENGINE: {model}</div>
            <ol className="mt-4 flex flex-col gap-2">
              {STEPS.map((s, i) => (
                <li key={s} className={cx("flex items-center gap-2 text-body-md", i > step && "opacity-40")}>
                  <Icon name={i < step ? "check_circle" : i === step ? "progress_activity" : "radio_button_unchecked"} className={cx("text-[18px]", i < step ? "text-secondary" : i === step ? "text-primary animate-spin" : "text-outline")} fill={i < step} />{s}
                </li>
              ))}
            </ol>
            <p className="mt-4 text-body-sm text-outline">Large cloud models can take up to a minute. Please keep this tab open.</p>
          </>
        )}
      </div>
    </div>
  );
}
