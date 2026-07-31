import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Card } from "@/components/common/Card";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ShiftInstanceDatePicker } from "@/components/common/ShiftInstanceDatePicker";
import { api } from "@/lib/api";
import { STATUS } from "@/lib/chartTheme";
import { useCrusherMachines } from "@/lib/useCrusherMachines";
import { useSiteFilter } from "@/lib/SiteFilterContext";
import type { ChecklistComplianceStatus, ChecklistHeatmapRow } from "@/types";

// Categorical 3-color status palette (not a continuous scale) — compliance
// is a state (done/missed/pending), not a magnitude.
const CELL_COLOR: Record<ChecklistComplianceStatus, string> = {
  done: STATUS.good,
  missed: STATUS.critical,
  pending: STATUS.warning,
};
const CELL_LABEL: Record<ChecklistComplianceStatus, string> = {
  done: "Done",
  missed: "Missed",
  pending: "Pending",
};

export function ChecklistComplianceHeatmapPage() {
  const { siteId } = useSiteFilter();
  const { data: crushers } = useCrusherMachines(siteId);
  const [crusherId, setCrusherId] = useState<number | null>(null);

  const [shiftInstanceId, setShiftInstanceId] = useState<number | null>(null);

  useEffect(() => {
    if (!crusherId && crushers && crushers.length > 0) setCrusherId(crushers[0].id);
  }, [crushers, crusherId]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["crusher-ops", "checklist-heatmap", siteId, shiftInstanceId, crusherId],
    queryFn: async () => {
      const { data } = await api.get<ChecklistHeatmapRow[]>("/crusher-ops/dashboard/checklist-heatmap/", {
        params: { site: siteId, shift_instance: shiftInstanceId, crusher: crusherId ?? undefined },
      });
      return data;
    },
    enabled: siteId !== null && shiftInstanceId !== null,
  });

  const rows = data ?? [];
  const itemNames = rows[0]?.items.map((i) => i.checklist_item_name) ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">Checklist Compliance</h1>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Crusher</label>
            <select
              value={crusherId ?? ""}
              onChange={(e) => setCrusherId(e.target.value ? Number(e.target.value) : null)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              {crushers?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.machine_type_code.toUpperCase()} {c.fleet_number}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Shift Instance</label>
            <ShiftInstanceDatePicker siteId={siteId} value={shiftInstanceId} onChange={setShiftInstanceId} />
          </div>
        </div>
      </div>

      <div className="mb-3 flex gap-4 text-xs text-slate-600">
        {(["done", "pending", "missed"] as ChecklistComplianceStatus[]).map((status) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CELL_COLOR[status] }} />
            {CELL_LABEL[status]}
          </div>
        ))}
      </div>

      {isLoading && <LoadingSpinner />}
      {isError && <ErrorMessage message="Failed to load checklist compliance." />}

      {data && rows.length === 0 && <EmptyState message="No hourly slots configured for this site." />}

      {rows.length > 0 && (
        <Card padded={false} className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Slot</th>
                {itemNames.map((name) => (
                  <th key={name} className="px-4 py-3 text-center font-medium">
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.hourly_slot} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-700">Slot {row.slot_index}</td>
                  {row.items.map((item) => (
                    <td key={item.checklist_item} className="px-2 py-3 text-center">
                      <span
                        className="inline-block rounded-md px-2 py-1 text-xs font-medium text-white"
                        style={{ backgroundColor: CELL_COLOR[item.status] }}
                        title={CELL_LABEL[item.status]}
                      >
                        {CELL_LABEL[item.status]}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
