import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { api } from "@/lib/api";
import { CATEGORICAL, CHART_INK } from "@/lib/chartTheme";
import { useSiteFilter } from "@/lib/SiteFilterContext";
import { useLookup } from "@/lib/useLookup";
import type { HourlyCurvePoint, Parameter, Section, ShiftInstance, TrendPoint } from "@/types";

const ACT_COLOR = CATEGORICAL[0];
const PLAN_COLOR = CHART_INK.muted;

function useSectionsAndParameters(siteId: number | null) {
  const { data: sections } = useLookup<Section>("sections", siteId ? { site: siteId } : undefined);
  const { data: parameters } = useLookup<Parameter>("parameters");
  return { sections, parameters };
}

function DailyTrendTab() {
  const { siteId } = useSiteFilter();
  const { sections, parameters } = useSectionsAndParameters(siteId);
  const [sectionId, setSectionId] = useState<number | null>(null);
  const [parameterId, setParameterId] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 13), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const ready = siteId && sectionId && parameterId;
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "trends", siteId, sectionId, parameterId, dateFrom, dateTo],
    queryFn: async () => {
      const { data } = await api.get<TrendPoint[]>("/dashboard/trends/", {
        params: { site: siteId, section: sectionId, parameter: parameterId, date_from: dateFrom, date_to: dateTo },
      });
      return data;
    },
    enabled: Boolean(ready),
  });

  const parameterLabel = parameters?.find((p) => p.id === parameterId);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Section">
          <select
            value={sectionId ?? ""}
            onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : null)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">Select section…</option>
            {sections?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Parameter">
          <select
            value={parameterId ?? ""}
            onChange={(e) => setParameterId(e.target.value ? Number(e.target.value) : null)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">Select parameter…</option>
            {parameters?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="From">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </Field>
      </div>

      {!ready && <p className="text-sm text-slate-400">Select a section and parameter to see the trend.</p>}
      {isLoading && <LoadingSpinner />}
      {isError && <ErrorMessage message="Failed to load trend data." />}

      {data && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART_INK.gridline} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: CHART_INK.muted }} />
              <YAxis
                tick={{ fontSize: 12, fill: CHART_INK.muted }}
                label={{ value: parameterLabel?.name, angle: -90, position: "insideLeft", fontSize: 12 }}
              />
              <Tooltip />
              <Legend />
              <Bar dataKey="act" name="Act" fill={ACT_COLOR} radius={[3, 3, 0, 0]} maxBarSize={28} />
              <Line
                dataKey="plan"
                name="Plan"
                stroke={PLAN_COLOR}
                strokeDasharray="5 4"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function HourlyCurveTab() {
  const { siteId } = useSiteFilter();
  const { sections, parameters } = useSectionsAndParameters(siteId);
  const { data: shiftInstances } = useLookup<ShiftInstance>(
    "shift-instances",
    siteId ? { site: siteId, ordering: "-date" } : undefined,
  );
  const [shiftInstanceId, setShiftInstanceId] = useState<number | null>(null);
  const [sectionId, setSectionId] = useState<number | null>(null);
  const [parameterId, setParameterId] = useState<number | null>(null);

  const ready = shiftInstanceId && sectionId && parameterId;
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "hourly-curve", shiftInstanceId, sectionId, parameterId],
    queryFn: async () => {
      const { data } = await api.get<HourlyCurvePoint[]>("/dashboard/hourly-curve/", {
        params: { shift_instance: shiftInstanceId, section: sectionId, parameter: parameterId },
      });
      return data;
    },
    enabled: Boolean(ready),
  });

  const chartData = (data ?? []).map((p) => ({
    slot: `S${p.slot_index}`,
    cumulative_act: p.cumulative_act,
    cumulative_target: p.cumulative_target,
  }));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Shift Instance">
          <select
            value={shiftInstanceId ?? ""}
            onChange={(e) => setShiftInstanceId(e.target.value ? Number(e.target.value) : null)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">Select shift…</option>
            {shiftInstances?.map((si) => (
              <option key={si.id} value={si.id}>
                {si.date} — {si.shift_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Section">
          <select
            value={sectionId ?? ""}
            onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : null)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">Select section…</option>
            {sections?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Parameter">
          <select
            value={parameterId ?? ""}
            onChange={(e) => setParameterId(e.target.value ? Number(e.target.value) : null)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">Select parameter…</option>
            {parameters?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {!ready && <p className="text-sm text-slate-400">Select a shift, section, and parameter to see the curve.</p>}
      {isLoading && <LoadingSpinner />}
      {isError && <ErrorMessage message="Failed to load the hourly curve." />}

      {data && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART_INK.gridline} vertical={false} />
              <XAxis dataKey="slot" tick={{ fontSize: 12, fill: CHART_INK.muted }} />
              <YAxis tick={{ fontSize: 12, fill: CHART_INK.muted }} />
              <Tooltip />
              <Legend />
              <Line
                dataKey="cumulative_act"
                name="Cumulative Act"
                stroke={ACT_COLOR}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                dataKey="cumulative_target"
                name="Cumulative Target"
                stroke={PLAN_COLOR}
                strokeDasharray="5 4"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
      {children}
    </div>
  );
}

export function TrendsPage() {
  const [tab, setTab] = useState<"daily" | "hourly">("daily");

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-slate-900">Trends</h1>
      <div className="mb-4 flex gap-1 rounded-lg border border-slate-200 bg-white p-1 w-fit">
        {(["daily", "hourly"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === t ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {t === "daily" ? "Daily / MTD Trend" : "Hourly Curve"}
          </button>
        ))}
      </div>
      {tab === "daily" ? <DailyTrendTab /> : <HourlyCurveTab />}
    </div>
  );
}
