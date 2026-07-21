import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ShiftInstancePicker } from "@/components/common/ShiftInstancePicker";
import { StatTile } from "@/components/common/StatTile";
import { api } from "@/lib/api";
import { useCrusherMachines } from "@/lib/useCrusherMachines";
import { useSiteFilter } from "@/lib/SiteFilterContext";
import { useLookup } from "@/lib/useLookup";
import type { BreakdownIncident, Paginated, ShiftCrushingSummary, ShiftInstance } from "@/types";

function availabilityTone(pct: number | null): "good" | "warning" | "critical" | "neutral" {
  if (pct === null) return "neutral";
  if (pct >= 90) return "good";
  if (pct >= 75) return "warning";
  return "critical";
}

export function CrusherPlantSummaryPage() {
  const { siteId } = useSiteFilter();
  const { data: crushers } = useCrusherMachines(siteId);
  const [crusherId, setCrusherId] = useState<number | null>(null);

  const { data: shiftInstances } = useLookup<ShiftInstance>(
    "shift-instances",
    siteId ? { site: siteId, ordering: "-date" } : undefined,
  );
  const [shiftInstanceId, setShiftInstanceId] = useState<number | null>(null);

  useEffect(() => {
    if (!crusherId && crushers && crushers.length > 0) setCrusherId(crushers[0].id);
  }, [crushers, crusherId]);

  useEffect(() => {
    if (!shiftInstanceId && shiftInstances && shiftInstances.length > 0) {
      const open = shiftInstances.find((si) => si.status === "open");
      setShiftInstanceId((open ?? shiftInstances[0]).id);
    }
  }, [shiftInstances, shiftInstanceId]);

  const summaryQuery = useQuery({
    queryKey: ["crusher-ops", "shift-crushing-summaries", siteId, crusherId, shiftInstanceId],
    queryFn: async () => {
      const { data } = await api.get<Paginated<ShiftCrushingSummary>>("/shift-crushing-summaries/", {
        params: { site: siteId, crusher: crusherId, shift_instance: shiftInstanceId },
      });
      return data.results[0] ?? null;
    },
    enabled: siteId !== null && crusherId !== null && shiftInstanceId !== null,
  });

  const openIncidentsQuery = useQuery({
    queryKey: ["crusher-ops", "open-incidents-count", siteId, crusherId],
    queryFn: async () => {
      const { data } = await api.get<Paginated<BreakdownIncident>>("/breakdown-incidents/", {
        params: { site: siteId, crusher: crusherId, status__in: "open,in_progress" },
      });
      return data.count;
    },
    enabled: siteId !== null && crusherId !== null,
  });

  const summary = summaryQuery.data;
  const crusherLabel = (id: number) => {
    const m = crushers?.find((c) => c.id === id);
    return m ? `${m.machine_type_code.toUpperCase()} ${m.fleet_number}` : id;
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">Crusher Plant Summary</h1>
        <div className="flex items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Crusher</label>
            <select
              value={crusherId ?? ""}
              onChange={(e) => setCrusherId(e.target.value ? Number(e.target.value) : null)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              {crushers?.map((c) => (
                <option key={c.id} value={c.id}>
                  {crusherLabel(c.id)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Shift Instance</label>
            <ShiftInstancePicker shiftInstances={shiftInstances} value={shiftInstanceId} onChange={setShiftInstanceId} />
          </div>
        </div>
      </div>

      {(!crushers || crushers.length === 0) && (
        <ErrorMessage message="No crusher machines (machine type 'Crusher') found for this site." />
      )}

      {summaryQuery.isLoading && <LoadingSpinner />}
      {summaryQuery.isError && <ErrorMessage message="Failed to load the crushing summary." />}

      {!summaryQuery.isLoading && !summary && shiftInstanceId && crusherId && (
        <EmptyState
          message="No shift crushing summary recorded yet for this crusher/shift instance."
          className="mb-4 py-6"
        />
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Crushing Time" value={summary?.crushing_time_minutes ?? "—"} sublabel="minutes" />
        <StatTile
          label="Down Time"
          value={summary?.down_time_minutes ?? "—"}
          sublabel="minutes"
          tone={summary?.down_time_minutes ? "warning" : "neutral"}
        />
        <StatTile
          label="Crushed Tonnage"
          value={summary?.crushed_tonnage ? Number(summary.crushed_tonnage).toLocaleString() : "—"}
          sublabel="tonnes"
        />
        <StatTile
          label="Availability"
          value={summary?.availability_pct ? `${Number(summary.availability_pct).toFixed(1)}%` : "—"}
          tone={availabilityTone(summary?.availability_pct ? Number(summary.availability_pct) : null)}
        />
        <StatTile label="Stoppage Instances" value={summary?.stoppage_instances ?? "—"} />
        <StatTile
          label="Open Incidents"
          value={openIncidentsQuery.data ?? "—"}
          tone={openIncidentsQuery.data ? "critical" : "good"}
        />
      </div>
    </div>
  );
}
