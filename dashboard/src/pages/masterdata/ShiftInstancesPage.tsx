import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/useAuth";
import { Badge } from "@/components/common/Badge";
import { Card } from "@/components/common/Card";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorMessage, extractErrorMessage } from "@/components/common/ErrorMessage";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { api } from "@/lib/api";
import { MACHINE_STATUS_COLOR, STATUS } from "@/lib/chartTheme";
import { useSiteFilter } from "@/lib/SiteFilterContext";
import type { Paginated, ShiftInstance } from "@/types";
import { useState } from "react";

const STATUS_COLOR: Record<string, string> = {
  open: STATUS.good,
  closed: STATUS.warning,
  approved: MACHINE_STATUS_COLOR.retired, // reuse the existing neutral-grey token
};

export function ShiftInstancesPage() {
  const { hasRole } = useAuth();
  const { siteId } = useSiteFilter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["shift-instances", siteId],
    queryFn: async () => {
      const { data } = await api.get<Paginated<ShiftInstance>>("/shift-instances/", {
        params: { site: siteId ?? undefined, page_size: 100, ordering: "-date" },
      });
      return data.results;
    },
    enabled: siteId !== null,
  });

  const closeMutation = useMutation({
    mutationFn: async (id: number) => api.post(`/shift-instances/${id}/close/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shift-instances"] }),
    onError: (err) => setError(extractErrorMessage(err)),
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => api.post(`/shift-instances/${id}/approve/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shift-instances"] }),
    onError: (err) => setError(extractErrorMessage(err)),
  });

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-slate-900">Shift Instances</h1>
      {error && (
        <div className="mb-3">
          <ErrorMessage message={error} />
        </div>
      )}
      {isLoading && <LoadingSpinner />}
      {isError && <ErrorMessage message="Failed to load shift instances." />}

      {data && data.length === 0 && (
        <EmptyState message="No shift instances yet — they're created automatically as shifts start." />
      )}

      {data && data.length > 0 && (
        <Card padded={false} className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Shift</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Closed At</th>
                <th className="px-4 py-3 font-medium">Approved At</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.map((row) => {
                const closing = closeMutation.isPending && closeMutation.variables === row.id;
                const approving = approveMutation.isPending && approveMutation.variables === row.id;
                return (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-700">{row.date}</td>
                    <td className="px-4 py-3 text-slate-700">{row.shift_name}</td>
                    <td className="px-4 py-3">
                      <Badge label={row.status} color={STATUS_COLOR[row.status]} variant="soft" />
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {row.closed_at ? new Date(row.closed_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {row.approved_at ? new Date(row.approved_at).toLocaleString() : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {row.status === "open" && hasRole("supervisor") && (
                        <button
                          type="button"
                          disabled={closing}
                          onClick={() => {
                            setError(null);
                            closeMutation.mutate(row.id);
                          }}
                          className="font-medium text-brand-600 hover:text-brand-700 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {closing ? "Closing…" : "Close"}
                        </button>
                      )}
                      {row.status === "closed" && hasRole("supervisor") && (
                        <button
                          type="button"
                          disabled={approving}
                          onClick={() => {
                            setError(null);
                            approveMutation.mutate(row.id);
                          }}
                          className="font-medium text-brand-600 hover:text-brand-700 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {approving ? "Approving…" : "Approve"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
