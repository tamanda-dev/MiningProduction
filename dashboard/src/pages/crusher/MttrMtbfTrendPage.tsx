import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/common/Card";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { api } from "@/lib/api";
import { CATEGORICAL, CHART_INK } from "@/lib/chartTheme";
import { useCrusherMachines } from "@/lib/useCrusherMachines";
import { useSiteFilter } from "@/lib/SiteFilterContext";
import type { MttrMtbfTrendPoint } from "@/types";

const MTTR_COLOR = CATEGORICAL[5]; // red — repair time reads as a "cost" metric
const MTBF_COLOR = CATEGORICAL[0]; // blue — uptime reads as a "health" metric

export function MttrMtbfTrendPage() {
  const { siteId } = useSiteFilter();
  const { data: crushers } = useCrusherMachines(siteId);
  const [crusherId, setCrusherId] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 29), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data, isLoading, isError } = useQuery({
    queryKey: ["crusher-ops", "mttr-mtbf-trend", siteId, crusherId, dateFrom, dateTo],
    queryFn: async () => {
      const { data } = await api.get<MttrMtbfTrendPoint[]>("/crusher-ops/dashboard/mttr-mtbf-trend/", {
        params: { site: siteId, crusher: crusherId ?? undefined, date_from: dateFrom, date_to: dateTo },
      });
      return data;
    },
    enabled: siteId !== null,
  });

  const rows = data ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">MTTR / MTBF Trend</h1>
        <div className="flex items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Crusher</label>
            <select
              value={crusherId ?? ""}
              onChange={(e) => setCrusherId(e.target.value ? Number(e.target.value) : null)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">All crushers</option>
              {crushers?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.machine_type_code.toUpperCase()} {c.fleet_number}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
        </div>
      </div>

      {isLoading && <LoadingSpinner />}
      {isError && <ErrorMessage message="Failed to load the MTTR/MTBF trend." />}

      {data && rows.length === 0 && <EmptyState message="No incident/summary data in this range." />}

      {rows.length > 0 && (
        <div className="flex flex-col gap-4">
          {/* Two stacked single-axis charts, never one dual-axis chart —
              MTTR (minutes) and MTBF (minutes) share a unit but not a
              meaningful scale (MTBF is typically an order of magnitude
              larger), so a shared axis would flatten the MTTR line. */}
          <Card>
            <h2 className="mb-2 text-sm font-semibold text-slate-800">MTTR (minutes)</h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={rows} margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={CHART_INK.gridline} vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 12, fill: CHART_INK.muted }} />
                <YAxis tick={{ fontSize: 12, fill: CHART_INK.muted }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="mttr_minutes"
                  name="MTTR (min)"
                  stroke={MTTR_COLOR}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <h2 className="mb-2 text-sm font-semibold text-slate-800">MTBF (minutes)</h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={rows} margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={CHART_INK.gridline} vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 12, fill: CHART_INK.muted }} />
                <YAxis tick={{ fontSize: 12, fill: CHART_INK.muted }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="mtbf_minutes"
                  name="MTBF (min)"
                  stroke={MTBF_COLOR}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card padded={false} className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Period</th>
                  <th className="px-4 py-3 font-medium text-right">MTTR (min)</th>
                  <th className="px-4 py-3 font-medium text-right">MTBF (min)</th>
                  <th className="px-4 py-3 font-medium text-right">Incidents</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.period} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3">{row.period}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.mttr_minutes ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.mtbf_minutes !== null ? row.mtbf_minutes.toFixed(0) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.incident_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}
