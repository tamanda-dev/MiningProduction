import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { Modal } from "@/components/common/Modal";
import { EntryHistoryPanel } from "@/components/entries/EntryHistoryPanel";
import { api } from "@/lib/api";
import { STATUS } from "@/lib/chartTheme";
import { useSiteFilter } from "@/lib/SiteFilterContext";
import { useLookup } from "@/lib/useLookup";
import type { BreakdownLog, DowntimeReasonCode, Machine, Paginated } from "@/types";

const SEVERITY_COLOR: Record<string, string> = {
  low: STATUS.good,
  medium: STATUS.warning,
  high: STATUS.critical,
  "": "#898781",
};

function BreakdownDetailModal({ log, onClose }: { log: BreakdownLog; onClose: () => void }) {
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
  const [selected, setSelected] = useState<BreakdownLog | null>(null);

  const machineLabel = (id: number) => machines?.find((m) => m.id === id)?.fleet_number ?? id;
  const reasonLabel = (id: number | null) =>
    id ? reasonCodes?.find((r) => r.id === id)?.description ?? id : "—";

  const { data, isLoading, isError } = useQuery({
    queryKey: ["breakdown-logs", siteId, machineId],
    queryFn: async () => {
      const { data } = await api.get<Paginated<BreakdownLog>>("/breakdown-logs/", {
        params: { site: siteId, machine: machineId ?? undefined, page_size: 100, ordering: "-start_at" },
      });
      return data.results;
    },
    enabled: siteId !== null,
  });

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
              {m.fleet_number}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <LoadingSpinner />}
      {isError && <ErrorMessage message="Failed to load breakdown logs." />}

      {data && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Start</th>
                <th className="px-4 py-2 font-medium">Machine</th>
                <th className="px-4 py-2 font-medium">Reason</th>
                <th className="px-4 py-2 font-medium">Duration</th>
                <th className="px-4 py-2 font-medium">Severity</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                    No breakdown logs match these filters.
                  </td>
                </tr>
              )}
              {data.map((log) => (
                <tr
                  key={log.id}
                  onClick={() => setSelected(log)}
                  className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-2">{new Date(log.start_at).toLocaleString()}</td>
                  <td className="px-4 py-2">{machineLabel(log.machine)}</td>
                  <td className="px-4 py-2">{reasonLabel(log.reason_code) || log.description}</td>
                  <td className="px-4 py-2">{log.duration_minutes !== null ? `${log.duration_minutes} min` : "Ongoing"}</td>
                  <td className="px-4 py-2">
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
        </div>
      )}

      {selected && <BreakdownDetailModal log={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
