import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/common/Card";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { StatTile } from "@/components/common/StatTile";
import { api } from "@/lib/api";
import { CATEGORICAL, CHART_INK, NEUTRAL } from "@/lib/chartTheme";
import { useSiteFilter } from "@/lib/SiteFilterContext";
import { useLookup } from "@/lib/useLookup";
import type { GeneralFleetMttr, Section } from "@/types";

const ACTUAL_COLOR = CATEGORICAL[5]; // red — repair time reads as a "cost" metric, same convention as crusher MTTR
const TARGET_COLOR = NEUTRAL;

function mttrTone(actual: number | null, target: number | null): "good" | "warning" | "critical" | "neutral" {
  if (actual === null || target === null) return "neutral";
  // Lower is better for a repair-time metric — under target is good, up to
  // 25% over is a warning, further over is critical.
  if (actual <= target) return "good";
  if (actual <= target * 1.25) return "warning";
  return "critical";
}

export function MttrReportPage() {
  const { siteId } = useSiteFilter();
  const { data: sections } = useLookup<Section>("sections", siteId ? { site: siteId } : undefined);
  const [sectionId, setSectionId] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 29), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "mttr", siteId, sectionId, dateFrom, dateTo],
    queryFn: async () => {
      const { data } = await api.get<GeneralFleetMttr>("/dashboard/mttr/", {
        params: { site: siteId, section: sectionId ?? undefined, date_from: dateFrom, date_to: dateTo },
      });
      return data;
    },
    enabled: siteId !== null,
  });

  const chartData =
    data && (data.actual_mttr_minutes !== null || data.target_mttr_minutes !== null)
      ? [
          {
            label: "MTTR",
            actual: data.actual_mttr_minutes !== null ? Number(data.actual_mttr_minutes.toFixed(1)) : null,
            target: data.target_mttr_minutes !== null ? Number(data.target_mttr_minutes.toFixed(1)) : null,
          },
        ]
      : [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">MTTR Report</h1>
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
      {isError && <ErrorMessage message="Failed to load MTTR data." />}

      {data && (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-slate-400">
            General-fleet (non-crusher) breakdowns only — see the Crusher Plant section for crusher MTTR/MTBF.
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              label="Actual MTTR"
              value={data.actual_mttr_minutes !== null ? `${data.actual_mttr_minutes.toFixed(1)} min` : "—"}
              tone={mttrTone(data.actual_mttr_minutes, data.target_mttr_minutes)}
            />
            <StatTile
              label="Target MTTR"
              value={data.target_mttr_minutes !== null ? `${data.target_mttr_minutes.toFixed(1)} min` : "No target set"}
            />
            <StatTile label="Breakdowns Repaired" value={data.breakdown_count} />
            <StatTile
              label="Variance"
              value={
                data.actual_mttr_minutes !== null && data.target_mttr_minutes !== null
                  ? `${(data.actual_mttr_minutes - data.target_mttr_minutes).toFixed(1)} min`
                  : "—"
              }
              tone={mttrTone(data.actual_mttr_minutes, data.target_mttr_minutes)}
            />
          </div>

          {chartData.length > 0 && (
            <Card>
              <h2 className="mb-2 text-sm font-semibold text-slate-800">Actual vs Target (minutes)</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke={CHART_INK.gridline} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12, fill: CHART_INK.muted }} />
                  <YAxis type="category" dataKey="label" width={60} tick={{ fontSize: 12, fill: CHART_INK.primary }} />
                  <Tooltip formatter={(value) => `${value} min`} />
                  <Bar dataKey="actual" name="Actual" fill={ACTUAL_COLOR} radius={[0, 3, 3, 0]} barSize={28} />
                  <Bar dataKey="target" name="Target" fill={TARGET_COLOR} radius={[0, 3, 3, 0]} barSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
