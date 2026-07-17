import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { api } from "@/lib/api";
import { CATEGORICAL, CHART_INK } from "@/lib/chartTheme";
import { useSiteFilter } from "@/lib/SiteFilterContext";
import type { BreakdownParetoRow } from "@/types";

const TICK_COLOR = CATEGORICAL[2]; // yellow — hourly-matrix ticks
const INCIDENT_COLOR = CATEGORICAL[5]; // red — full incidents

export function BreakdownParetoByCausePage() {
  const { siteId } = useSiteFilter();
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 29), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data, isLoading, isError } = useQuery({
    queryKey: ["crusher-ops", "breakdown-pareto", siteId, dateFrom, dateTo],
    queryFn: async () => {
      const { data } = await api.get<BreakdownParetoRow[]>("/crusher-ops/dashboard/breakdown-pareto/", {
        params: { site: siteId, date_from: dateFrom, date_to: dateTo },
      });
      return data;
    },
    enabled: siteId !== null,
  });

  const rows = data ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">Breakdown Pareto by Cause</h1>
        <div className="flex items-end gap-3">
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
      {isError && <ErrorMessage message="Failed to load breakdown Pareto data." />}

      {data && rows.length === 0 && <p className="text-sm text-slate-400">No breakdown data in this date range.</p>}

      {rows.length > 0 && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <ResponsiveContainer width="100%" height={Math.max(240, rows.length * 44)}>
              <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={CHART_INK.gridline} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: CHART_INK.muted }} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="cause_name"
                  width={160}
                  tick={{ fontSize: 12, fill: CHART_INK.primary }}
                />
                <Tooltip />
                <Legend />
                <Bar dataKey="hourly_tick_count" name="Hourly Matrix Ticks" fill={TICK_COLOR} radius={[0, 3, 3, 0]} />
                <Bar dataKey="incident_count" name="Incidents" fill={INCIDENT_COLOR} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Cause</th>
                  <th className="px-4 py-2 font-medium text-right">Hourly Ticks</th>
                  <th className="px-4 py-2 font-medium text-right">Incidents</th>
                  <th className="px-4 py-2 font-medium text-right">Incident Minutes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.cause ?? row.cause_name} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2">{row.cause_name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{row.hourly_tick_count}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{row.incident_count}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{row.incident_total_minutes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
