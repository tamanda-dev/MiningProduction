import clsx from "clsx";
import type { ReactNode } from "react";

export function Card({
  title,
  actions,
  padded = true,
  className,
  children,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  padded?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const hasHeader = Boolean(title || actions);
  return (
    <div className={clsx("rounded-lg border border-slate-200 bg-white shadow-sm", className)}>
      {hasHeader && (
        <div
          className={clsx(
            "flex items-center justify-between gap-3 border-b border-slate-100",
            padded ? "px-6 py-3" : "px-4 py-3",
          )}
        >
          {title && (
            typeof title === "string" ? (
              <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            ) : (
              title
            )
          )}
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={padded ? "p-6" : undefined}>{children}</div>
    </div>
  );
}
