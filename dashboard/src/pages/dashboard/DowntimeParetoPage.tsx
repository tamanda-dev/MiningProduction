import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/common/Card";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { api } from "@/lib/api";
import { CATEGORICAL, CHART_INK } from "@/lib/chartTheme";
import { useSiteFilter } from "@/lib/SiteFilterContext";
import { useLookup } from "@/lib/useLookup";
import type { DowntimeParetoRow, Section } from "@/types";

const BAR_COLOR = CATEGORICAL[5]; // red — downtime reads as a "cost" metric

export function DowntimeParetoPage() {
  const { siteId } = useSiteFilter();
  const { data: sections } = useLookup<Section>("sections", siteId ? { site: siteId } : undefined);
  const [sectionId, setSectionId] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 29), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "downtime-pareto", siteId, sectionId, dateFrom, dateTo],
    queryFn: async () => {
      const { data } = await api.get<DowntimeParetoRow[]>("/dashboard/downtime-pareto/", {
        params: { site: siteId, section: sectionId ?? undefined, date_from: dateFrom, date_to: dateTo },
      });
      return data;
    },
    enabled: siteId !== null,
  });

  const rows = data ?? [];
  const totalMinutes = rows.reduce((sum, r) => sum + r.total_minutes, 0);
  let cumulative = 0;
  const withCumulative = rows.map((r) => {
    cumulative += r.total_minutes;
    return { ...r, cumulativePct: totalMinutes > 0 ? (cumulative / totalMinutes) * 100 : 0 };
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">Downtime Pareto</h1>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Section</label>
            <select
              value={sectionId ?? ""}
              onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : null)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">All sections</option>
              {sections?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
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
      {isError && <ErrorMessage message="Failed to load downtime data." />}

      {data && rows.length === 0 && <EmptyState message="No breakdown logs in this date range." />}

      {rows.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <ResponsiveContainer width="100%" height={Math.max(240, rows.length * 40)}>
              <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={CHART_INK.gridline} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: CHART_INK.muted }} />
                <YAxis
                  type="category"
                  dataKey="description"
                  width={140}
                  tick={{ fontSize: 12, fill: CHART_INK.primary }}
                />
                <Tooltip formatter={(value) => `${value} min`} />
                <Bar dataKey="total_minutes" name="Downtime (min)" fill={BAR_COLOR} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card padded={false} className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Reason</th>
                  <th className="px-4 py-3 font-medium text-right">Count</th>
                  <th className="px-4 py-3 font-medium text-right">Minutes</th>
                  <th className="px-4 py-3 font-medium text-right">Cumulative %</th>
                </tr>
              </thead>
              <tbody>
                {withCumulative.map((row) => (
                  <tr
                    key={row.reason_code ?? row.description}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      {row.description}
                      {row.category && <span className="ml-1 text-xs text-slate-400">({row.category})</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.count}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.total_minutes}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                      {row.cumulativePct.toFixed(0)}%
                    </td>
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
