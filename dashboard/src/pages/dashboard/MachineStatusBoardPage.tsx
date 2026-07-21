import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/common/Badge";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { api } from "@/lib/api";
import { MACHINE_STATUS_COLOR } from "@/lib/chartTheme";
import { useSiteFilter } from "@/lib/SiteFilterContext";
import { useLookup } from "@/lib/useLookup";
import type { MachineStatusRow, MachineType } from "@/types";

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  breakdown: "Breakdown",
  maintenance: "Maintenance",
  retired: "Retired",
};

export function MachineStatusBoardPage() {
  const { siteId } = useSiteFilter();
  const { data: machineTypes } = useLookup<MachineType>("machine-types");
  const [machineTypeId, setMachineTypeId] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "machine-status", siteId, machineTypeId],
    queryFn: async () => {
      const { data } = await api.get<MachineStatusRow[]>("/dashboard/machine-status/", {
        params: { site: siteId, machine_type: machineTypeId ?? undefined },
      });
      return data;
    },
    enabled: siteId !== null,
    refetchInterval: 30_000,
  });

  const rows = data ?? [];
  const summary = ["active", "breakdown", "maintenance", "retired"].map((status) => ({
    status,
    count: rows.filter((r) => r.status === status).length,
  }));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">Machine Status Board</h1>
        <select
          value={machineTypeId ?? ""}
          onChange={(e) => setMachineTypeId(e.target.value ? Number(e.target.value) : null)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">All types</option>
          {machineTypes?.map((mt) => (
            <option key={mt.id} value={mt.id}>
              {mt.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        {summary.map((s) => (
          <div
            key={s.status}
            className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm"
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: MACHINE_STATUS_COLOR[s.status] }}
            />
            {STATUS_LABEL[s.status]}: <span className="font-semibold">{s.count}</span>
          </div>
        ))}
      </div>

      {isLoading && <LoadingSpinner />}
      {isError && <ErrorMessage message="Failed to load machine status." />}

      {data && rows.length === 0 && <p className="text-sm text-slate-400">No machines found for this site.</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {rows.map((row) => (
          <div key={row.machine} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold text-slate-900">
                {row.machine_type_name} {row.fleet_number}
              </span>
              <Badge label={STATUS_LABEL[row.status]} color={MACHINE_STATUS_COLOR[row.status]} />
            </div>
            <div className="text-sm text-slate-500">
              {row.operator_label ? (
                <>
                  Operated by <span className="font-medium text-slate-700">{row.operator_label}</span>
                  {row.assignment_started_at && (
                    <div className="text-xs text-slate-400">
                      Since {new Date(row.assignment_started_at).toLocaleTimeString()}
                    </div>
                  )}
                </>
              ) : (
                "Idle — no active operator"
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
