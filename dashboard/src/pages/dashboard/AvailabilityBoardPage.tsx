import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/common/Card";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { api } from "@/lib/api";
import { CATEGORICAL, CHART_INK } from "@/lib/chartTheme";
import { useSiteFilter } from "@/lib/SiteFilterContext";
import { useLookup } from "@/lib/useLookup";
import type { AvailabilityRow, MachineType } from "@/types";

const AVAILABILITY_COLOR = CATEGORICAL[0]; // blue
const UTILIZATION_COLOR = CATEGORICAL[1]; // aqua

export function AvailabilityBoardPage() {
  const { siteId } = useSiteFilter();
  const { data: machineTypes } = useLookup<MachineType>("machine-types");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [machineTypeId, setMachineTypeId] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "availability", siteId, date, machineTypeId],
    queryFn: async () => {
      const { data } = await api.get<AvailabilityRow[]>("/dashboard/availability/", {
        params: { site: siteId, date, machine_type: machineTypeId ?? undefined },
      });
      return data;
    },
    enabled: siteId !== null,
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">Availability & Utilization</h1>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Machine Type</label>
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
        </div>
      </div>

      {isLoading && <LoadingSpinner />}
      {isError && <ErrorMessage message="Failed to load availability data." />}

      {data && data.length === 0 && (
        <EmptyState message="No shift instances found for this site/date." />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {data?.map((row) => {
          const chartData = [
            ...row.by_shift.map((s) => ({
              label: s.shift_name,
              availability: s.availability_pct !== null ? Number(s.availability_pct.toFixed(1)) : null,
              utilization: s.utilization_pct !== null ? Number(s.utilization_pct.toFixed(1)) : null,
            })),
            {
              label: "Average",
              availability:
                row.average.availability_pct !== null ? Number(row.average.availability_pct.toFixed(1)) : null,
              utilization:
                row.average.utilization_pct !== null ? Number(row.average.utilization_pct.toFixed(1)) : null,
            },
          ];

          return (
            <Card key={row.machine_type}>
              <h2 className="mb-2 text-sm font-semibold text-slate-800">{row.machine_type_name}</h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={CHART_INK.gridline} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: CHART_INK.muted }} />
                  <YAxis
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fontSize: 12, fill: CHART_INK.muted }}
                  />
                  <Tooltip formatter={(value) => `${value}%`} />
                  <Legend />
                  <Bar dataKey="availability" name="Availability %" fill={AVAILABILITY_COLOR} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="utilization" name="Utilization %" fill={UTILIZATION_COLOR} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
