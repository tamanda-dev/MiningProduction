import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/common/Card";
import { DownloadPdfButton } from "@/components/common/DownloadPdfButton";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { api } from "@/lib/api";
import { CATEGORICAL, CHART_INK } from "@/lib/chartTheme";
import { useSiteFilter } from "@/lib/SiteFilterContext";
import { useLookup } from "@/lib/useLookup";
import type { Parameter, ProductionSummaryGroupBy, ProductionSummaryRow, Section, UOM } from "@/types";

const BAR_COLOR = CATEGORICAL[0]; // blue — a neutral "volume" metric, not a status/health signal

const GROUP_BY_OPTIONS: { value: ProductionSummaryGroupBy; label: string }[] = [
  { value: "machine", label: "Machine" },
  { value: "operator", label: "Operator" },
  { value: "supervisor", label: "Supervisor (Recorded By)" },
  { value: "shift", label: "Shift" },
];

export function ProductionSummaryPage() {
  const { siteId } = useSiteFilter();
  const { data: parameters } = useLookup<Parameter>("parameters");
  const { data: sections } = useLookup<Section>("sections", siteId ? { site: siteId } : undefined);
  const { data: uoms } = useLookup<UOM>("uoms");

  const [parameterId, setParameterId] = useState<number | null>(null);
  const [sectionId, setSectionId] = useState<number | null>(null);
  const [groupBy, setGroupBy] = useState<ProductionSummaryGroupBy>("machine");
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 29), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));

  // No parameter selected by default (there's no universally "right" one)
  // — seed it with the first active parameter once the lookup resolves,
  // same pattern CrusherPlantSummaryPage uses for its crusher picker.
  useEffect(() => {
    if (parameterId === null && parameters && parameters.length > 0) {
      setParameterId(parameters[0].id);
    }
  }, [parameters, parameterId]);

  const parameter = parameters?.find((p) => p.id === parameterId);
  const uomAbbrev = parameter?.uom ? uoms?.find((u) => u.id === parameter.uom)?.abbreviation : null;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "production-summary", siteId, parameterId, sectionId, groupBy, dateFrom, dateTo],
    queryFn: async () => {
      const { data } = await api.get<ProductionSummaryRow[]>("/dashboard/production-summary/", {
        params: {
          site: siteId,
          parameter: parameterId,
          section: sectionId ?? undefined,
          group_by: groupBy,
          date_from: dateFrom,
          date_to: dateTo,
        },
      });
      return data;
    },
    enabled: siteId !== null && parameterId !== null,
  });

  const rows = data ?? [];
  const groupByLabel = GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.label ?? groupBy;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">Production Summary</h1>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Parameter</label>
          <select
            value={parameterId ?? ""}
            onChange={(e) => setParameterId(e.target.value ? Number(e.target.value) : null)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            {parameters?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
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
          <label className="mb-1 block text-xs font-medium text-slate-500">Group By</label>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as ProductionSummaryGroupBy)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            {GROUP_BY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
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
        <DownloadPdfButton
          title={`Production Summary — ${parameter?.name ?? ""} by ${groupByLabel}`}
          columns={[
            { key: "label", label: groupByLabel },
            { key: "act", label: uomAbbrev ? `Total (${uomAbbrev})` : "Total" },
          ]}
          rows={rows.map((row) => ({
            label: row.label,
            act: row.act.toLocaleString(undefined, { maximumFractionDigits: 2 }),
          }))}
        />
      </div>

      {isLoading && <LoadingSpinner />}
      {isError && <ErrorMessage message="Failed to load the production summary." />}

      {data && rows.length === 0 && <EmptyState message="No production values in this range." />}

      {rows.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <ResponsiveContainer width="100%" height={Math.max(240, rows.length * 40)}>
              <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={CHART_INK.gridline} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: CHART_INK.muted }} />
                <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 12, fill: CHART_INK.primary }} />
                <Tooltip formatter={(value) => (uomAbbrev ? `${value} ${uomAbbrev}` : `${value}`)} />
                <Bar
                  dataKey="act"
                  name={uomAbbrev ? `Total (${uomAbbrev})` : "Total"}
                  fill={BAR_COLOR}
                  radius={[0, 3, 3, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card padded={false} className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">{groupByLabel}</th>
                  <th className="px-4 py-3 font-medium text-right">{uomAbbrev ? `Total (${uomAbbrev})` : "Total"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.group} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3">{row.label}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.act.toLocaleString(undefined, { maximumFractionDigits: 2 })}
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
