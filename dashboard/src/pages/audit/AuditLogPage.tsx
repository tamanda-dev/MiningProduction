import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { api } from "@/lib/api";
import { useSiteFilter } from "@/lib/SiteFilterContext";
import type { AuditLogEntry, Paginated } from "@/types";

export function AuditLogPage() {
  const { siteId } = useSiteFilter();
  const [action, setAction] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["audit-log", "all", siteId, action],
    queryFn: async () => {
      const { data } = await api.get<Paginated<AuditLogEntry>>("/audit-log/", {
        params: { site: siteId ?? undefined, action: action || undefined, page_size: 100, ordering: "-created_at" },
      });
      return data.results;
    },
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">Audit Log</h1>
        <input
          type="text"
          placeholder="Filter by action, e.g. productionentry"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
      </div>

      {isLoading && <LoadingSpinner />}
      {isError && <ErrorMessage message="Failed to load the audit log." />}

      {data && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">Object</th>
                <th className="px-4 py-2 font-medium">Actor</th>
                <th className="px-4 py-2 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                    No audit events match these filters.
                  </td>
                </tr>
              )}
              {data.map((event) => (
                <tr key={event.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 whitespace-nowrap">{new Date(event.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2 font-mono text-xs">{event.action}</td>
                  <td className="px-4 py-2 text-slate-500">
                    {event.content_type_label} #{event.object_id}
                  </td>
                  <td className="px-4 py-2">{event.actor_label ?? "system"}</td>
                  <td className="px-4 py-2 text-slate-500">{event.reason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
