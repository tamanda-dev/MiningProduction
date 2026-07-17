import { useQuery } from "@tanstack/react-query";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { api } from "@/lib/api";
import type { AuditLogEntry, Paginated } from "@/types";

/** Audit actions are named "<model_name>.<verb>" by the simple-history
 * bridge on the backend (see audit/signals.py) — filtering by that prefix
 * plus object_id gives the edit history for one specific record.
 */
export function EntryHistoryPanel({ modelName, objectId }: { modelName: string; objectId: number }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["audit-log", modelName, objectId],
    queryFn: async () => {
      const { data } = await api.get<Paginated<AuditLogEntry>>("/audit-log/", {
        params: { action: modelName, object_id: objectId, ordering: "-created_at" },
      });
      return data.results;
    },
  });

  if (isLoading) return <LoadingSpinner label="Loading history…" />;
  if (isError) return <p className="text-sm text-red-600">Failed to load history.</p>;
  if (!data || data.length === 0) return <p className="text-sm text-slate-400">No history recorded yet.</p>;

  return (
    <ul className="flex flex-col gap-2">
      {data.map((event) => (
        <li key={event.id} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium text-slate-700">{event.action}</span>
            <span className="text-xs text-slate-400">{new Date(event.created_at).toLocaleString()}</span>
          </div>
          <div className="text-xs text-slate-500">by {event.actor_label ?? "system"}</div>
          {event.reason && <div className="mt-1 text-xs italic text-slate-600">Reason: {event.reason}</div>}
        </li>
      ))}
    </ul>
  );
}
