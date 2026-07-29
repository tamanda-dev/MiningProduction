import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useAuth } from "@/auth/useAuth";
import { Badge } from "@/components/common/Badge";
import { Card } from "@/components/common/Card";
import { DownloadPdfButton } from "@/components/common/DownloadPdfButton";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorMessage, extractErrorMessage } from "@/components/common/ErrorMessage";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { Pagination } from "@/components/common/Pagination";
import { api } from "@/lib/api";
import { MACHINE_STATUS_COLOR, STATUS } from "@/lib/chartTheme";
import { useSiteFilter } from "@/lib/SiteFilterContext";
import type { Paginated, ShiftInstance } from "@/types";

const PAGE_SIZE = 25;

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
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["shift-instances", siteId, dateFrom, dateTo],
    queryFn: async () => {
      const { data } = await api.get<Paginated<ShiftInstance>>("/shift-instances/", {
        params: {
          site: siteId ?? undefined,
          date__gte: dateFrom || undefined,
          date__lte: dateTo || undefined,
          page_size: 500,
          ordering: "-date",
        },
      });
      return data.results;
    },
    enabled: siteId !== null,
  });

  const filtered = useMemo(() => {
    if (!data) return undefined;
    if (!search.trim()) return data;
    const needle = search.trim().toLowerCase();
    return data.filter((row) => [row.shift_name, row.status].join(" ").toLowerCase().includes(needle));
  }, [data, search]);

  const pageCount = filtered ? Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)) : 1;
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered?.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

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
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Search</label>
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search…"
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <DownloadPdfButton
          title="Shift Instances"
          columns={[
            { key: "date", label: "Date" },
            { key: "shift", label: "Shift" },
            { key: "status", label: "Status" },
            { key: "closed_at", label: "Closed At" },
            { key: "approved_at", label: "Approved At" },
          ]}
          rows={(filtered ?? []).map((row) => ({
            date: row.date,
            shift: row.shift_name,
            status: row.status,
            closed_at: row.closed_at ? new Date(row.closed_at).toLocaleString() : "—",
            approved_at: row.approved_at ? new Date(row.approved_at).toLocaleString() : "—",
          }))}
        />
      </div>

      {isLoading && <LoadingSpinner />}
      {isError && <ErrorMessage message="Failed to load shift instances." />}

      {filtered && filtered.length === 0 && (
        <EmptyState message="No shift instances match these filters." />
      )}

      {pageRows && pageRows.length > 0 && (
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
              {pageRows.map((row) => {
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

      {filtered && (
        <Pagination page={currentPage} pageCount={pageCount} totalCount={filtered.length} onChange={setPage} />
      )}
    </div>
  );
}
