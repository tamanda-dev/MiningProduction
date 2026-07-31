import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/common/Card";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { RoleGate } from "@/components/common/RoleGate";
import { ShiftInstanceDatePicker } from "@/components/common/ShiftInstanceDatePicker";
import { StatTile } from "@/components/common/StatTile";
import { ExportButton } from "@/components/dashboard/ExportButton";
import { api } from "@/lib/api";
import { useSiteFilter } from "@/lib/SiteFilterContext";
import type { ActVsPlanRow } from "@/types";

function pctVarTone(pctVar: number | null): "good" | "warning" | "critical" | "neutral" {
  if (pctVar === null) return "neutral";
  if (pctVar >= 0) return "good";
  if (pctVar >= -10) return "warning";
  return "critical";
}

export function LiveShiftViewPage() {
  const { siteId } = useSiteFilter();
  const [shiftInstanceId, setShiftInstanceId] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "summary", shiftInstanceId],
    queryFn: async () => {
      const { data } = await api.get<ActVsPlanRow[]>("/dashboard/summary/", {
        params: { shift_instance: shiftInstanceId },
      });
      return data;
    },
    enabled: shiftInstanceId !== null,
  });

  const rows = data ?? [];
  const onPlanCount = rows.filter((r) => r.pct_var !== null && r.pct_var >= 0).length;
  const totalWithPlan = rows.filter((r) => r.pct_var !== null).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">Live Shift View</h1>
        <div className="flex flex-wrap items-center gap-3">
          {shiftInstanceId && (
            <RoleGate role="supervisor">
              <ExportButton shiftInstanceId={shiftInstanceId} />
            </RoleGate>
          )}
          <ShiftInstanceDatePicker
            siteId={siteId}
            value={shiftInstanceId}
            onChange={setShiftInstanceId}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      {!shiftInstanceId && (
        <ErrorMessage message="No shift instance found for this site on the selected date." />
      )}

      {shiftInstanceId && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Parameters Reporting" value={rows.length} />
            <StatTile
              label="On/Above Plan"
              value={totalWithPlan > 0 ? `${onPlanCount}/${totalWithPlan}` : "—"}
              tone={totalWithPlan > 0 && onPlanCount === totalWithPlan ? "good" : "neutral"}
            />
            <StatTile
              label="Sections Reporting"
              value={new Set(rows.map((r) => r.section)).size}
            />
          </div>

          {isLoading && <LoadingSpinner />}
          {isError && <ErrorMessage message="Failed to load the live shift summary." />}

          {data && (
            <Card padded={false} className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Section</th>
                    <th className="px-4 py-3 font-medium">Parameter</th>
                    <th className="px-4 py-3 font-medium text-right">Act</th>
                    <th className="px-4 py-3 font-medium text-right">Plan</th>
                    <th className="px-4 py-3 font-medium text-right">Var</th>
                    <th className="px-4 py-3 font-medium text-right">%Var</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-2">
                        <EmptyState message="No production entries logged for this shift yet." />
                      </td>
                    </tr>
                  )}
                  {rows.map((row) => (
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
                        {row.pct_var !== null ? (
                          <span
                            className={{
                              good: "text-emerald-700",
                              warning: "text-amber-700",
                              critical: "text-red-700",
                              neutral: "text-slate-400",
                            }[pctVarTone(row.pct_var)]}
                          >
                            {row.pct_var >= 0 ? "+" : ""}
                            {row.pct_var.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
