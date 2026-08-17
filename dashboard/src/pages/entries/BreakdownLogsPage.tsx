import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useAuth } from "@/auth/useAuth";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { DownloadPdfButton } from "@/components/common/DownloadPdfButton";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorMessage, extractErrorMessage } from "@/components/common/ErrorMessage";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { Modal } from "@/components/common/Modal";
import { Pagination } from "@/components/common/Pagination";
import { EntryHistoryPanel } from "@/components/entries/EntryHistoryPanel";
import { userLabel } from "@/components/users/QualificationsModal";
import { api } from "@/lib/api";
import { NEUTRAL, REPAIR_STATUS_COLOR, STATUS } from "@/lib/chartTheme";
import { useSiteFilter } from "@/lib/SiteFilterContext";
import { useLookup } from "@/lib/useLookup";
import type { BreakdownLog, DowntimeReasonCode, Machine, Paginated, UserSummary } from "@/types";

const PAGE_SIZE = 25;

const SEVERITY_COLOR: Record<string, string> = {
  low: STATUS.good,
  medium: STATUS.warning,
  high: STATUS.critical,
  "": NEUTRAL,
};

const REPAIR_STATUS_LABEL: Record<string, string> = {
  reported: "Reported",
  acknowledged: "Acknowledged",
  fixed: "Fixed",
  confirmed: "Confirmed",
};

function BreakdownDetailModal({ log, onClose }: { log: BreakdownLog; onClose: () => void }) {
  const { hasRole, user } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  // Supervisor+ can read /users/ for the assigned-artisan name; an Operator
  // opening this same modal for their own reported breakdown can't (403),
  // so this simply comes back empty for them and the id-only fallback
  // below is used instead — never a hard failure.
  const { data: users } = useLookup<UserSummary>("users");
  const artisanLabel = (id: number | null) => {
    if (!id) return "—";
    const u = users?.find((u) => u.id === id);
    return u ? userLabel(u) : `User #${id}`;
  };

  const confirmMutation = useMutation({
    mutationFn: async () => api.post(`/breakdown-logs/${log.id}/confirm/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["breakdown-logs"] });
      onClose();
    },
    onError: (err) => setError(extractErrorMessage(err)),
  });

  // Confirming is the reporting Operator's call (or a Supervisor/Admin
  // override) — mirrors services.confirm_breakdown_repair's own check
  // server-side, just so the button doesn't show up for someone the API
  // would reject anyway.
  const canConfirm = log.repair_status === "fixed" && (hasRole("supervisor") || user?.id === log.operator);

  return (
    <Modal open onClose={onClose} title={`Breakdown #${log.id}`} wide>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <Detail label="Start" value={new Date(log.start_at).toLocaleString()} />
          <Detail label="End" value={log.end_at ? new Date(log.end_at).toLocaleString() : "Ongoing"} />
          <Detail label="Duration" value={log.duration_minutes !== null ? `${log.duration_minutes} min` : "—"} />
          <Detail
            label="Severity"
            value={
              log.severity ? (
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                  style={{ backgroundColor: SEVERITY_COLOR[log.severity] }}
                >
                  {log.severity}
                </span>
              ) : (
                "—"
              )
            }
          />
          <Detail label="Status" value={log.status} />
          <Detail label="Comments" value={log.comments || "—"} />
        </div>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Repair Workflow
          </h3>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <Detail
              label="Repair Status"
              value={
                <Badge
                  label={REPAIR_STATUS_LABEL[log.repair_status]}
                  color={REPAIR_STATUS_COLOR[log.repair_status]}
                />
              }
            />
            <Detail label="Assigned Artisan" value={artisanLabel(log.artisan)} />
            <Detail
              label="Acknowledged At"
              value={log.acknowledged_at ? new Date(log.acknowledged_at).toLocaleString() : "—"}
            />
            <Detail
              label="Confirmed At"
              value={log.confirmed_at ? new Date(log.confirmed_at).toLocaleString() : "—"}
            />
          </div>
          {canConfirm && (
            <div className="mt-3">
              <Button
                variant="success"
                size="sm"
                onClick={() => {
                  setError(null);
                  confirmMutation.mutate();
                }}
                disabled={confirmMutation.isPending}
              >
                {confirmMutation.isPending ? "Confirming…" : "Confirm machine is working"}
              </Button>
            </div>
          )}
          {error && (
            <div className="mt-2">
              <ErrorMessage message={error} />
            </div>
          )}
        </div>

        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Description</h3>
          <p className="text-sm text-slate-700">{log.description || "—"}</p>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">History</h3>
          <EntryHistoryPanel modelName="breakdownlog" objectId={log.id} />
        </div>
      </div>
    </Modal>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-slate-800">{value}</div>
    </div>
  );
}

export function BreakdownLogsPage() {
  const { siteId } = useSiteFilter();
  const { data: machines } = useLookup<Machine>("machines", siteId ? { site: siteId } : undefined);
  const { data: reasonCodes } = useLookup<DowntimeReasonCode>("downtime-reason-codes");
  const [machineId, setMachineId] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<BreakdownLog | null>(null);

  const machineLabel = (id: number) => {
    const m = machines?.find((m) => m.id === id);
    return m ? `${m.machine_type_code.toUpperCase()} ${m.fleet_number}` : id;
  };
  const reasonLabel = (id: number | null) =>
    id ? reasonCodes?.find((r) => r.id === id)?.description ?? id : "—";

  const { data, isLoading, isError } = useQuery({
    queryKey: ["breakdown-logs", siteId, machineId, dateFrom, dateTo],
    queryFn: async () => {
      const { data } = await api.get<Paginated<BreakdownLog>>("/breakdown-logs/", {
        params: {
          site: siteId,
          machine: machineId ?? undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          page_size: 500,
          ordering: "-start_at",
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
    return data.filter((log) =>
      [machineLabel(log.machine), reasonLabel(log.reason_code), log.description, log.severity, log.status]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, search, machines, reasonCodes]);

  const pageCount = filtered ? Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)) : 1;
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered?.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-slate-900">Breakdown Logs</h1>

      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={machineId ?? ""}
          onChange={(e) => setMachineId(e.target.value ? Number(e.target.value) : null)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">All machines</option>
          {machines?.map((m) => (
            <option key={m.id} value={m.id}>
              {m.machine_type_code.toUpperCase()} {m.fleet_number}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
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
        <DownloadPdfButton
          title="Breakdown Logs"
          columns={[
            { key: "start", label: "Start" },
            { key: "machine", label: "Machine" },
            { key: "reason", label: "Reason" },
            { key: "duration", label: "Duration" },
            { key: "severity", label: "Severity" },
          ]}
          rows={(filtered ?? []).map((log) => ({
            start: new Date(log.start_at).toLocaleString(),
            machine: String(machineLabel(log.machine)),
            reason: String(reasonLabel(log.reason_code) || log.description),
            duration: log.duration_minutes !== null ? `${log.duration_minutes} min` : "Ongoing",
            severity: log.severity,
          }))}
        />
      </div>

      {isLoading && <LoadingSpinner />}
      {isError && <ErrorMessage message="Failed to load breakdown logs." />}

      {pageRows && (
        <Card padded={false} className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Start</th>
                <th className="px-4 py-3 font-medium">Machine</th>
                <th className="px-4 py-3 font-medium">Reason</th>
                <th className="px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3 font-medium">Severity</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-2">
                    <EmptyState message="No breakdown logs match these filters." />
                  </td>
                </tr>
              )}
              {pageRows.map((log) => (
                <tr
                  key={log.id}
                  onClick={() => setSelected(log)}
                  className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-3">{new Date(log.start_at).toLocaleString()}</td>
                  <td className="px-4 py-3">{machineLabel(log.machine)}</td>
                  <td className="px-4 py-3">{reasonLabel(log.reason_code) || log.description}</td>
                  <td className="px-4 py-3">{log.duration_minutes !== null ? `${log.duration_minutes} min` : "Ongoing"}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {filtered && (
        <Pagination page={currentPage} pageCount={pageCount} totalCount={filtered.length} onChange={setPage} />
      )}

      {selected && <BreakdownDetailModal log={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
