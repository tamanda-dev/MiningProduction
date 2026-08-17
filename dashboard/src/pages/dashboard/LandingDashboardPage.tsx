import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState } from "react";
import { Card } from "@/components/common/Card";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { StatTile } from "@/components/common/StatTile";
import { api } from "@/lib/api";
import { KPI_STATUS_COLOR, KPI_STATUS_LABEL, MACHINE_STATUS_COLOR, MACHINE_STATUS_LABEL } from "@/lib/chartTheme";
import { useSiteFilter } from "@/lib/SiteFilterContext";
import type { KpiStatus, LandingDashboard } from "@/types";

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

function StatusDot({ status }: { status: KpiStatus | null }) {
  if (!status) return <span className="text-slate-300">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: KPI_STATUS_COLOR[status] }} />
      <span className="text-xs font-medium text-slate-600">{KPI_STATUS_LABEL[status]}</span>
    </span>
  );
}

export function LandingDashboardPage() {
  const { siteId, sites } = useSiteFilter();
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const site = sites.find((s) => s.id === siteId);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "landing", siteId, date],
    queryFn: async () => {
      const { data } = await api.get<LandingDashboard>("/dashboard/landing/", { params: { site: siteId, date } });
      return data;
    },
    enabled: siteId !== null,
    refetchInterval: 60_000,
  });

  const kpiRows = data?.kpi_rows ?? [];
  const availabilityRows = data?.availability_rows ?? [];
  const statusCounts = data?.fleet_status_counts ?? {};
  const activeStatuses = (Object.keys(statusCounts) as (keyof typeof statusCounts)[]).filter(
    (s) => (statusCounts[s] ?? 0) > 0,
  );

  const statusTally = { green: 0, amber: 0, black: 0, red: 0 };
  for (const row of kpiRows) if (row.status) statusTally[row.status]++;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Shift-at-a-Glance</h1>
          <p className="text-sm text-slate-500">{site?.name ?? "—"} · whole-site overview</p>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      </div>

      {isLoading && <LoadingSpinner />}
      {isError && <ErrorMessage message="Failed to load the landing dashboard." />}

      {data && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              label="Fleet In Service"
              value={`${data.fleet_total - data.fleet_down}/${data.fleet_total}`}
              tone={data.fleet_total > 0 && data.fleet_down === 0 ? "good" : data.fleet_down > 0 ? "warning" : "neutral"}
              sublabel={data.fleet_down > 0 ? `${data.fleet_down} down or unavailable` : "All machines available"}
            />
            <StatTile
              label="On/Above Target"
              value={kpiRows.length > 0 ? `${statusTally.green}/${kpiRows.length}` : "—"}
              tone={kpiRows.length > 0 && statusTally.green === kpiRows.length ? "good" : "neutral"}
            />
            <StatTile
              label="Critical KPIs"
              value={statusTally.red}
              tone={statusTally.red > 0 ? "critical" : "neutral"}
              sublabel={statusTally.black > 0 ? `+ ${statusTally.black} underperforming` : undefined}
            />
            <StatTile
              label="Downtime Today"
              value={formatMinutes(data.downtime_total_minutes)}
              tone={data.downtime_total_minutes > 0 ? "warning" : "good"}
            />
          </div>

          <Card title="Production — Act vs Target" padded={false} className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Section</th>
                  <th className="px-4 py-3 font-medium">Parameter</th>
                  <th className="px-4 py-3 font-medium text-right">Act</th>
                  <th className="px-4 py-3 font-medium text-right">Target</th>
                  <th className="px-4 py-3 font-medium text-right">Var</th>
                  <th className="px-4 py-3 font-medium text-right">% of Target</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {kpiRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-2">
                      <EmptyState message="No production entries logged for this site/date yet." />
                    </td>
                  </tr>
                )}
                {kpiRows.map((row) => (
                  <tr
                    key={`${row.section}-${row.parameter}`}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 text-slate-700">{row.section_name}</td>
                    <td className="px-4 py-3 text-slate-700">{row.parameter_name}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.act.toLocaleString()} {row.uom}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                      {row.plan !== null ? `${row.plan.toLocaleString()} ${row.uom}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                      {row.var !== null ? row.var.toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.pct_of_target !== null ? `${row.pct_of_target.toFixed(0)}%` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusDot status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Fleet Status">
              {activeStatuses.length === 0 && <EmptyState message="No machines configured for this site." />}
              <div className="flex flex-wrap gap-2">
                {activeStatuses.map((status) => (
                  <div
                    key={status}
                    className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-sm"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: MACHINE_STATUS_COLOR[status] }}
                    />
                    {MACHINE_STATUS_LABEL[status]}: <span className="font-semibold">{statusCounts[status]}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Top Downtime Causes">
              {data.downtime_top_causes.length === 0 ? (
                <EmptyState message="No downtime recorded for this date." />
              ) : (
                <ul className="flex flex-col gap-2">
                  {data.downtime_top_causes.map((c) => (
                    <li
                      key={c.reason_code ?? c.description}
                      className="flex items-center justify-between border-b border-slate-100 pb-2 text-sm last:border-0 last:pb-0"
                    >
                      <span className="text-slate-700">{c.description}</span>
                      <span className="tabular-nums text-slate-500">
                        {formatMinutes(c.total_minutes)} · {c.count} event{c.count === 1 ? "" : "s"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card title="Availability by Machine Type" padded={false} className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Machine Type</th>
                  <th className="px-4 py-3 font-medium text-right">Availability</th>
                  <th className="px-4 py-3 font-medium text-right">Utilization</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {availabilityRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-2">
                      <EmptyState message="No availability data for this site/date yet." />
                    </td>
                  </tr>
                )}
                {availabilityRows.map((row) => (
                  <tr key={row.machine_type} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-700">{row.machine_type_name}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.average.availability_pct !== null ? `${row.average.availability_pct.toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                      {row.average.utilization_pct !== null ? `${row.average.utilization_pct.toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusDot status={row.status} />
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
