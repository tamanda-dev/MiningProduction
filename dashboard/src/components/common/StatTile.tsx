import clsx from "clsx";
import type { ReactNode } from "react";

export function StatTile({
  label,
  value,
  sublabel,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: ReactNode;
  sublabel?: ReactNode;
  tone?: "neutral" | "good" | "warning" | "critical";
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
        {icon}
      </div>
      <div
        className={clsx("mt-1 text-2xl font-semibold tabular-nums", {
          "text-slate-900": tone === "neutral",
          "text-emerald-700": tone === "good",
          "text-amber-700": tone === "warning",
          "text-red-700": tone === "critical",
        })}
      >
        {value}
      </div>
      {sublabel && <div className="mt-1 text-xs text-slate-500">{sublabel}</div>}
    </div>
  );
}
