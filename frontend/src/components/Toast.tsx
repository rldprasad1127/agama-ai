import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { cx } from "@/lib/utils";

type Kind = "success" | "error" | "info";
interface T { id: number; kind: Kind; msg: string }
const Ctx = createContext<{ toast: (msg: string, kind?: Kind) => void }>({ toast: () => {} });
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<T[]>([]);
  const toast = useCallback((msg: string, kind: Kind = "info") => {
    const id = Date.now() + Math.random();
    setItems((p) => [...p, { id, kind, msg }]);
    setTimeout(() => setItems((p) => p.filter((x) => x.id !== id)), kind === "error" ? 7000 : 3500);
  }, []);
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cx("fade-up flex items-start gap-2 rounded-xl px-3 py-2.5 shadow-lg text-body-sm border",
            t.kind === "success" && "bg-secondary-container text-on-secondary-container border-secondary/20",
            t.kind === "error" && "bg-error-container text-on-error-container border-error/20",
            t.kind === "info" && "bg-inverse-surface text-inverse-on-surface border-transparent")}>
            <Icon name={t.kind === "success" ? "check_circle" : t.kind === "error" ? "error" : "info"} className="text-[18px] mt-px" />
            <span className="leading-snug">{t.msg}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
