import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState } from "react";
import { Card } from "@/components/common/Card";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ShiftInstanceDatePicker } from "@/components/common/ShiftInstanceDatePicker";
import { api } from "@/lib/api";
import { STATUS } from "@/lib/chartTheme";
import { useSiteFilter } from "@/lib/SiteFilterContext";
import { useLookup } from "@/lib/useLookup";
import type { HourlyMachineStatusCell, HourlyMachineStatusGroup, MachineType } from "@/types";

/** Collapses a row's per-slot cells into merged runs — consecutive "down"
 * slots sharing the same reason become one wide cell (matching the source
 * report's merged-across-hours breakdown cells); "ok" slots stay one cell
 * per hour, same as the source. */
function mergeRuns(cells: HourlyMachineStatusCell[]) {
  const runs: { span: number; ok: boolean; reason: string | null }[] = [];
  for (const cell of cells) {
    const last = runs[runs.length - 1];
    if (last && !cell.ok && !last.ok && last.reason === cell.reason) {
      last.span += 1;
    } else {
      runs.push({ span: 1, ok: cell.ok, reason: cell.reason });
    }
  }
  return runs;
}

export function HourlyMachineStatusPage() {
  const { siteId } = useSiteFilter();
  const { data: machineTypes } = useLookup<MachineType>("machine-types");
  const [shiftInstanceId, setShiftInstanceId] = useState<number | null>(null);
  const [machineTypeId, setMachineTypeId] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "hourly-machine-status", shiftInstanceId, machineTypeId],
    queryFn: async () => {
      const { data } = await api.get<HourlyMachineStatusGroup[]>("/dashboard/hourly-machine-status/", {
        params: { shift_instance: shiftInstanceId, machine_type: machineTypeId ?? undefined },
      });
      return data;
    },
    enabled: shiftInstanceId !== null,
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">Availability & Breakdown</h1>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Shift Instance</label>
            <ShiftInstanceDatePicker siteId={siteId} value={shiftInstanceId} onChange={setShiftInstanceId} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Machine Type</label>
            <select
              value={machineTypeId ?? ""}
              onChange={(e) => setMachineTypeId(e.target.value ? Number(e.target.value) : null)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">All types</option>
              {machineTypes
                ?.filter((mt) => mt.code.toLowerCase() !== "cru")
                .map((mt) => (
                  <option key={mt.id} value={mt.id}>
                    {mt.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>

      <div className="mb-3 flex gap-4 text-xs text-slate-600">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: STATUS.good }} />
          Running
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: STATUS.critical }} />
          Down (reason shown)
        </div>
      </div>

      {!shiftInstanceId && (
        <EmptyState message="Pick a shift instance to see its hourly availability." className="py-8" />
      )}
      {isLoading && <LoadingSpinner />}
      {isError && <ErrorMessage message="Failed to load hourly machine status." />}
      {data && data.length === 0 && (
        <EmptyState message="No general-fleet machines found for this site (crushers are tracked separately, under Crusher Plant)." />
      )}

      <div className="flex flex-col gap-4">
        {data?.map((group) => (
          <Card key={group.machine_type} padded={false} className="overflow-x-auto">
            <h2 className="px-4 pt-3 text-sm font-semibold text-slate-800">{group.machine_type_name}</h2>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="whitespace-nowrap px-4 py-2 font-medium">Machine</th>
                  {group.slots.map((slot) => (
                    <th key={slot.slot_index} className="whitespace-nowrap px-2 py-2 text-center font-medium">
                      {format(new Date(slot.start_at), "HH:mm")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.machines.map((row) => (
                  <tr key={row.machine} className="border-b border-slate-100 last:border-0">
                    <td className="whitespace-nowrap px-4 py-2 font-medium text-slate-700">
                      {row.fleet_number}
                      {row.name ? ` (${row.name})` : ""}
                    </td>
                    {mergeRuns(row.cells).map((run, i) => (
                      <td key={i} colSpan={run.span} className="px-1 py-1.5 text-center">
                        <span
                          className="inline-block w-full rounded-md px-2 py-1 text-xs font-medium text-white"
                          style={{ backgroundColor: run.ok ? STATUS.good : STATUS.critical }}
                          title={run.ok ? "Running" : (run.reason ?? "Breakdown")}
                        >
                          {run.ok ? "OK" : run.reason}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-700">
                  <td className="whitespace-nowrap px-4 py-2">Running</td>
                  {group.running_by_slot.map((count, i) => (
                    <td key={i} className="px-2 py-2 text-center">
                      {count}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </Card>
        ))}
      </div>
    </div>
  );
}
