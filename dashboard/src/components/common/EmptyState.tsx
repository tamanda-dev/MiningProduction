import type { ReactNode } from "react";

export function EmptyState({
  message,
  icon,
  className = "py-10",
}: {
  message: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 text-center ${className}`}>
      {icon ?? (
        <svg
          viewBox="0 0 24 24"
          className="h-8 w-8 text-slate-300"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 13h6m-7 7h8a2 2 0 002-2V7.414a1 1 0 00-.293-.707l-3.414-3.414A1 1 0 0013.586 3H8a2 2 0 00-2 2v13a2 2 0 002 2z"
          />
        </svg>
      )}
      <p className="text-sm text-slate-400">{message}</p>
    </div>
  );
}
