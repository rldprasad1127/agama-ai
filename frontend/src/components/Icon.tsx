import { cx } from "@/lib/utils";

export function Icon({ name, className, fill, size }: { name: string; className?: string; fill?: boolean; size?: number }) {
  return (
    <span className={cx("material-symbols-outlined leading-none", fill && "msi-fill", className)} style={size ? { fontSize: size } : undefined} aria-hidden>
      {name}
    </span>
  );
}
