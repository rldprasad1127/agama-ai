import { Icon } from "@/components/Icon";
import { cx } from "@/lib/utils";

export function Checklist({ title, items, done, onChange, tone = "primary" }: {
  title: string; items: string[]; done: number[]; onChange: (v: number[]) => void; tone?: "primary" | "secondary";
}) {
  if (!items.length) return null;
  const toggle = (i: number) => onChange(done.includes(i) ? done.filter((x) => x !== i) : [...done, i].sort((a, b) => a - b));
  return (
    <section className="rounded-xl bg-surface-container-lowest border border-outline-variant/50">
      <header className="flex items-center justify-between px-4 py-3 border-b border-surface-container">
        <div className="flex items-center gap-2 font-semibold text-body-md"><Icon name="fact_check" className="text-primary text-[20px]" />{title}</div>
        <span className="font-label-code text-label-code text-on-surface-variant">{done.length} / {items.length} Checked</span>
      </header>
      <ul className="p-3 flex flex-col gap-1">
        {items.map((it, i) => {
          const on = done.includes(i);
          return (
            <li key={i}>
              <label className="flex items-start gap-3 px-2 py-1.5 rounded-lg hover:bg-surface-container-low cursor-pointer">
                <input type="checkbox" checked={on} onChange={() => toggle(i)} className="peer sr-only" />
                <span className={cx("mt-0.5 w-4 h-4 rounded-[3px] border-[1.5px] flex items-center justify-center shrink-0 peer-focus-visible:ring-2 ring-primary-container",
                  on ? "bg-primary-container border-primary-container text-on-primary" : "border-outline-variant bg-surface-container-lowest")}>
                  {on && <Icon name="check" className="text-[14px]" />}
                </span>
                <span className={cx("text-body-md", on && "line-through text-on-surface-variant", tone === "secondary" && !on && "text-on-surface")}>{it}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
