import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/auth/useAuth";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorMessage, extractErrorMessage } from "@/components/common/ErrorMessage";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { api } from "@/lib/api";
import { NEUTRAL, STATUS } from "@/lib/chartTheme";
import { useSiteFilter } from "@/lib/SiteFilterContext";
import { useLookup } from "@/lib/useLookup";
import type { BreakdownLog, DowntimeReasonCode, Machine, Paginated } from "@/types";

const SEVERITY_COLOR: Record<string, string> = {
  low: STATUS.good,
  medium: STATUS.warning,
  high: STATUS.critical,
  "": NEUTRAL,
};

function BreakdownQueueTable({
  rows,
  machineLabel,
  reasonLabel,
  actionLabel,
  onAction,
  isActionPending,
  emptyMessage,
}: {
  rows: BreakdownLog[];
  machineLabel: (id: number) => string | number;
  reasonLabel: (id: number | null) => string | number;
  actionLabel: string;
  onAction: (log: BreakdownLog) => void;
  isActionPending: (log: BreakdownLog) => boolean;
  emptyMessage: string;
}) {
  return (
    <Card padded={false} className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">Reported</th>
            <th className="px-4 py-3 font-medium">Machine</th>
            <th className="px-4 py-3 font-medium">Reason</th>
            <th className="px-4 py-3 font-medium">Severity</th>
            <th className="px-4 py-3 font-medium">Description</th>
            <th className="px-4 py-3 font-medium" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-2">
                <EmptyState message={emptyMessage} />
              </td>
            </tr>
          )}
          {rows.map((log) => (
            <tr key={log.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
              <td className="px-4 py-3">{new Date(log.start_at).toLocaleString()}</td>
              <td className="px-4 py-3">{machineLabel(log.machine)}</td>
              <td className="px-4 py-3">{reasonLabel(log.reason_code) || log.description || "—"}</td>
              <td className="px-4 py-3">
                {log.severity && (
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                    style={{ backgroundColor: SEVERITY_COLOR[log.severity] }}
                  >
                    {log.severity}
                  </span>
                )}
              </td>
              <td className="max-w-xs truncate px-4 py-3 text-slate-600">{log.description || "—"}</td>
              <td className="px-4 py-3 text-right">
                <Button size="sm" onClick={() => onAction(log)} disabled={isActionPending(log)}>
                  {isActionPending(log) ? "…" : actionLabel}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// An Artisan's own work queue: unclaimed breakdowns anywhere they've been
// granted Site Access (report -> acknowledge), and whatever they've
// already claimed (acknowledge -> fixed). Confirming the repair is the
// reporting Operator's job, not this page's — see BreakdownLogsPage's
// detail modal for that last step.
export function MyBreakdownsPage() {
  const { user } = useAuth();
  const { siteId } = useSiteFilter();
  const queryClient = useQueryClient();
  const { data: machines } = useLookup<Machine>("machines", siteId ? { site: siteId } : undefined);
  const { data: reasonCodes } = useLookup<DowntimeReasonCode>("downtime-reason-codes");
  const [error, setError] = useState<string | null>(null);

  const machineLabel = (id: number) => {
    const m = machines?.find((m) => m.id === id);
    return m ? `${m.machine_type_code.toUpperCase()} ${m.fleet_number}` : id;
  };
  const reasonLabel = (id: number | null) =>
    id ? (reasonCodes?.find((r) => r.id === id)?.description ?? id) : "—";

  const unclaimedQuery = useQuery({
    queryKey: ["breakdown-logs", "artisan-unclaimed", siteId],
    queryFn: async () => {
      const { data } = await api.get<Paginated<BreakdownLog>>("/breakdown-logs/", {
        params: { site: siteId, repair_status: "reported", page_size: 500, ordering: "start_at" },
      });
      return data.results;
    },
    enabled: siteId !== null,
  });

  const mineQuery = useQuery({
    queryKey: ["breakdown-logs", "artisan-assigned", siteId, user?.id],
    queryFn: async () => {
      const { data } = await api.get<Paginated<BreakdownLog>>("/breakdown-logs/", {
        params: {
          site: siteId,
          artisan: user?.id,
          repair_status: "acknowledged",
          page_size: 500,
          ordering: "start_at",
        },
      });
      return data.results;
    },
    enabled: siteId !== null && user?.id !== undefined,
  });

  function invalidateBoth() {
    queryClient.invalidateQueries({ queryKey: ["breakdown-logs", "artisan-unclaimed"] });
    queryClient.invalidateQueries({ queryKey: ["breakdown-logs", "artisan-assigned"] });
  }

  const acknowledgeMutation = useMutation({
    mutationFn: async (log: BreakdownLog) => api.post(`/breakdown-logs/${log.id}/acknowledge/`),
    onSuccess: invalidateBoth,
    onError: (err) => setError(extractErrorMessage(err)),
  });

  const completeMutation = useMutation({
    mutationFn: async (log: BreakdownLog) => api.post(`/breakdown-logs/${log.id}/complete/`),
    onSuccess: invalidateBoth,
    onError: (err) => setError(extractErrorMessage(err)),
  });

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-slate-900">My Breakdowns</h1>

      {error && (
        <div className="mb-4">
          <ErrorMessage message={error} />
        </div>
      )}

      <div className="flex flex-col gap-6">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Unclaimed Breakdowns</h2>
          {unclaimedQuery.isLoading && <LoadingSpinner />}
          {unclaimedQuery.isError && <ErrorMessage message="Failed to load unclaimed breakdowns." />}
          {unclaimedQuery.data && (
            <BreakdownQueueTable
              rows={unclaimedQuery.data}
              machineLabel={machineLabel}
              reasonLabel={reasonLabel}
              actionLabel="Acknowledge"
              onAction={(log) => {
                setError(null);
                acknowledgeMutation.mutate(log);
              }}
              isActionPending={(log) =>
                acknowledgeMutation.isPending && acknowledgeMutation.variables?.id === log.id
              }
              emptyMessage="No unclaimed breakdowns at your site(s)."
            />
          )}
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Assigned To Me</h2>
          {mineQuery.isLoading && <LoadingSpinner />}
          {mineQuery.isError && <ErrorMessage message="Failed to load your assigned breakdowns." />}
          {mineQuery.data && (
            <BreakdownQueueTable
              rows={mineQuery.data}
              machineLabel={machineLabel}
              reasonLabel={reasonLabel}
              actionLabel="Mark Fixed"
              onAction={(log) => {
                setError(null);
                completeMutation.mutate(log);
              }}
              isActionPending={(log) => completeMutation.isPending && completeMutation.variables?.id === log.id}
              emptyMessage="Nothing currently assigned to you."
            />
          )}
        </div>
      </div>
    </div>
  );
}
