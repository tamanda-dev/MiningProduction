import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/useAuth";
import { ErrorMessage, extractErrorMessage } from "@/components/common/ErrorMessage";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { api } from "@/lib/api";
import { useSiteFilter } from "@/lib/SiteFilterContext";
import type { Paginated, ShiftInstance } from "@/types";
import { useState } from "react";

const STATUS_BADGE: Record<string, string> = {
  open: "bg-emerald-50 text-emerald-700 border-emerald-200",
  closed: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-slate-100 text-slate-600 border-slate-200",
};

export function ShiftInstancesPage() {
  const { hasRole } = useAuth();
  const { siteId } = useSiteFilter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
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

      {data && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Shift</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Closed At</th>
                <th className="px-4 py-2 font-medium">Approved At</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                    No shift instances yet — they're created automatically as shifts start.
                  </td>
                </tr>
              )}
              {data.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2">{row.date}</td>
                  <td className="px-4 py-2">{row.shift_name}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[row.status]}`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-500">
                    {row.closed_at ? new Date(row.closed_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-2 text-slate-500">
                    {row.approved_at ? new Date(row.approved_at).toLocaleString() : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    {row.status === "open" && hasRole("supervisor") && (
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          closeMutation.mutate(row.id);
                        }}
                        className="text-brand-600 hover:underline"
                      >
                        Close
                      </button>
                    )}
                    {row.status === "closed" && hasRole("manager") && (
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          approveMutation.mutate(row.id);
                        }}
                        className="text-brand-600 hover:underline"
                      >
                        Approve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
