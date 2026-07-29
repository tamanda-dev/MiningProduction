import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Paginated, ShiftInstance } from "@/types";

/** Picks a ShiftInstance by date instead of listing every one a site has
 * ever had. The old pattern (fetch up to 500 instances for the site,
 * render them all as <option>s) silently drops anything past 500 and
 * renders an unusably long, unsearchable list well before that — a date
 * input plus "which shift that day" (usually just Day/Night, i.e. 1-2
 * options) scales to any amount of history since the server does the
 * filtering, not the browser.
 */
export function ShiftInstanceDatePicker({
  siteId,
  value,
  onChange,
  className = "rounded-md border border-slate-300 px-2 py-1.5 text-sm",
}: {
  siteId: number | null;
  value: number | null;
  onChange: (id: number | null) => void;
  className?: string;
}) {
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const { data: instances, isLoading } = useQuery({
    queryKey: ["shift-instances", "by-date", siteId, date],
    queryFn: async () => {
      const { data } = await api.get<Paginated<ShiftInstance>>("/shift-instances/", {
        params: { site: siteId, date, ordering: "-id" },
      });
      return data.results;
    },
    enabled: siteId !== null,
  });

  // Re-pick whenever the date (or site) yields a fresh list — prefer
  // whichever instance is still open, otherwise the most recent.
  useEffect(() => {
    if (!instances) return;
    const open = instances.find((si) => si.status === "open");
    onChange((open ?? instances[0])?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instances]);

  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className={className}
      />
      {(instances?.length ?? 0) > 1 && (
        <select value={value ?? ""} onChange={(e) => onChange(Number(e.target.value))} className={className}>
          {instances!.map((si) => (
            <option key={si.id} value={si.id}>
              {si.shift_name} ({si.status})
            </option>
          ))}
        </select>
      )}
      {!isLoading && instances && instances.length === 0 && (
        <span className="text-sm text-slate-400">No shift on this date</span>
      )}
    </div>
  );
}
