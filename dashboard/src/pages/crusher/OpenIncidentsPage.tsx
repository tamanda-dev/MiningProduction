import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { useState } from "react";
import { useAuth } from "@/auth/useAuth";
import { ErrorMessage, extractErrorMessage } from "@/components/common/ErrorMessage";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { Modal } from "@/components/common/Modal";
import { RoleGate } from "@/components/common/RoleGate";
import { EntryHistoryPanel } from "@/components/entries/EntryHistoryPanel";
import { API_BASE_URL, api } from "@/lib/api";
import { useCrusherMachines } from "@/lib/useCrusherMachines";
import { useSiteFilter } from "@/lib/SiteFilterContext";
import { useLookup } from "@/lib/useLookup";
import type { BreakdownIncident, Paginated, UserSummary } from "@/types";

const STATUS_LABEL: Record<string, string> = { open: "Open", in_progress: "In Progress" };

function PdfExportButton({ siteId }: { siteId: number }) {
  const [dateFrom] = useState(format(subDays(new Date(), 29), "yyyy-MM-dd"));
  const [dateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [taskId, setTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trigger = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ task_id: string; status: string; download_url?: string }>(
        "/crusher-ops/dashboard/export/",
        { site: siteId, date_from: dateFrom, date_to: dateTo },
      );
      return data;
    },
    onSuccess: (data) => {
      setError(null);
      setTaskId(data.task_id);
    },
    onError: (err) => setError(extractErrorMessage(err)),
  });

  const { data: statusData } = useQuery({
    queryKey: ["crusher-plant-export-status", taskId],
    queryFn: async () => {
      const { data } = await api.get<{ status: string; download_url?: string }>(
        `/crusher-ops/dashboard/export/${taskId}/`,
      );
      return data;
    },
    enabled: Boolean(taskId),
    refetchInterval: (query) => (query.state.data?.status === "success" ? false : 2000),
  });

  const downloadUrl = trigger.data?.download_url ?? statusData?.download_url;
  const isDone = statusData?.status === "success" || Boolean(trigger.data?.download_url);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => trigger.mutate()}
        disabled={trigger.isPending}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {trigger.isPending ? "Generating…" : "Export PDF (last 30 days)"}
      </button>
      {taskId && !isDone && <span className="text-xs text-slate-400">Processing…</span>}
      {downloadUrl && (
        <a
          href={downloadUrl.startsWith("http") ? downloadUrl : `${API_BASE_URL.replace(/\/api\/?$/, "")}${downloadUrl}`}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-brand-600 hover:underline"
        >
          Download
        </a>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

export function OpenIncidentsPage() {
  const { siteId } = useSiteFilter();
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();
  const { data: crushers } = useCrusherMachines(siteId);
  const { data: artisans } = useLookup<UserSummary>("users", { maintenance_technician: "true" });
  const [detailIncident, setDetailIncident] = useState<BreakdownIncident | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["crusher-ops", "open-incidents", siteId],
    queryFn: async () => {
      const { data } = await api.get<Paginated<BreakdownIncident>>("/breakdown-incidents/", {
        params: { site: siteId, status__in: "open,in_progress", ordering: "-time_occurred" },
      });
      return data.results;
    },
    enabled: siteId !== null,
    refetchInterval: 30_000,
  });

  const assignMutation = useMutation({
    mutationFn: async ({ incidentId, artisanId }: { incidentId: number; artisanId: number }) =>
      api.post(`/breakdown-incidents/${incidentId}/assign/`, { artisan: artisanId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crusher-ops", "open-incidents"] }),
  });

  const crusherLabel = (id: number) => {
    const m = crushers?.find((c) => c.id === id);
    return m ? `${m.machine_type_code.toUpperCase()} ${m.fleet_number}` : id;
  };
  const artisanLabel = (id: number | null) => {
    if (!id) return null;
    const a = artisans?.find((u) => u.id === id);
    return a ? a.username : id;
  };

  const rows = data ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">Open Incidents</h1>
        {siteId && (
          <RoleGate role="manager">
            <PdfExportButton siteId={siteId} />
          </RoleGate>
        )}
      </div>

      {isLoading && <LoadingSpinner />}
      {isError && <ErrorMessage message="Failed to load open incidents." />}

      {data && rows.length === 0 && <p className="text-sm text-slate-400">No open or in-progress incidents.</p>}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Crusher</th>
                <th className="px-4 py-2 font-medium">Occurred</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Artisan</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((incident) => (
                <tr key={incident.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2 text-slate-700">{crusherLabel(incident.crusher)}</td>
                  <td className="px-4 py-2 text-slate-700">{new Date(incident.time_occurred).toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        incident.status === "open"
                          ? "rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
                          : "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
                      }
                    >
                      {STATUS_LABEL[incident.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {hasRole("supervisor") ? (
                      <select
                        value={incident.artisan ?? ""}
                        onChange={(e) => {
                          if (!e.target.value) return;
                          assignMutation.mutate({ incidentId: incident.id, artisanId: Number(e.target.value) });
                        }}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                      >
                        <option value="">{incident.artisan ? artisanLabel(incident.artisan) : "Unassigned"}</option>
                        {artisans?.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.username}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-slate-600">{artisanLabel(incident.artisan) ?? "Unassigned"}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setDetailIncident(incident)}
                      className="text-brand-600 hover:underline"
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={detailIncident !== null}
        onClose={() => setDetailIncident(null)}
        title={`Incident #${detailIncident?.id ?? ""}`}
        wide
      >
        {detailIncident && (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-slate-500">Crusher</dt>
              <dd className="text-slate-800">{crusherLabel(detailIncident.crusher)}</dd>
              <dt className="text-slate-500">Occurred</dt>
              <dd className="text-slate-800">{new Date(detailIncident.time_occurred).toLocaleString()}</dd>
              <dt className="text-slate-500">Reported</dt>
              <dd className="text-slate-800">{new Date(detailIncident.time_reported).toLocaleString()}</dd>
              <dt className="text-slate-500">Attended</dt>
              <dd className="text-slate-800">
                {detailIncident.time_attended ? new Date(detailIncident.time_attended).toLocaleString() : "—"}
              </dd>
              <dt className="text-slate-500">Description</dt>
              <dd className="text-slate-800">{detailIncident.description || "—"}</dd>
              <dt className="text-slate-500">Severity</dt>
              <dd className="text-slate-800">{detailIncident.severity || "—"}</dd>
            </dl>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Edit History</h3>
              <EntryHistoryPanel modelName="breakdownincident" objectId={detailIncident.id} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
