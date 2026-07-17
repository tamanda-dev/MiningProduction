import { useAuth } from "@/auth/useAuth";
import { MasterDataTable, type MasterDataResourceConfig } from "@/components/masterdata/MasterDataTable";
import { useSiteFilter } from "@/lib/SiteFilterContext";
import { useLookup } from "@/lib/useLookup";
import type { Machine, Parameter, PlanTarget, Section, ShiftInstance, Site } from "@/types";

const PERIOD_OPTIONS = [
  { value: "shift", label: "Shift" },
  { value: "day", label: "Day" },
  { value: "month", label: "Month" },
];

export function PlanTargetsPage() {
  const { hasRole } = useAuth();
  const { siteId } = useSiteFilter();
  const { data: sites } = useLookup<Site>("sites");
  const { data: sections } = useLookup<Section>("sections", siteId ? { site: siteId } : undefined);
  const { data: machines } = useLookup<Machine>("machines", siteId ? { site: siteId } : undefined);
  const { data: parameters } = useLookup<Parameter>("parameters");
  const { data: shiftInstances } = useLookup<ShiftInstance>(
    "shift-instances",
    siteId ? { site: siteId } : undefined,
  );

  const paramName = (id: number) => parameters?.find((p) => p.id === id)?.name ?? id;
  const siteName = (id: number) => sites?.find((s) => s.id === id)?.name ?? id;
  const sectionName = (id: number | null) => (id ? sections?.find((s) => s.id === id)?.name ?? id : "—");
  const machineName = (id: number | null) =>
    id ? machines?.find((m) => m.id === id)?.fleet_number ?? id : "—";

  const config: MasterDataResourceConfig<PlanTarget> = {
    resource: "plan-targets",
    title: "Plan Targets",
    canWrite: hasRole("manager"),
    extraParams: siteId ? { site: siteId } : undefined,
    columns: [
      { key: "parameter", label: "Parameter", render: (row) => paramName(row.parameter) },
      { key: "site", label: "Site", render: (row) => siteName(row.site) },
      { key: "section", label: "Section", render: (row) => sectionName(row.section) },
      { key: "machine", label: "Machine", render: (row) => machineName(row.machine) },
      { key: "period_type", label: "Period" },
      { key: "period_date", label: "Date", render: (row) => row.period_date ?? "—" },
      { key: "target_value", label: "Target" },
    ],
    fields: [
      {
        key: "parameter",
        label: "Parameter",
        type: "select",
        required: true,
        options: parameters?.map((p) => ({ value: p.id, label: p.name })) ?? [],
      },
      {
        key: "site",
        label: "Site",
        type: "select",
        required: true,
        options: sites?.map((s) => ({ value: s.id, label: s.name })) ?? [],
      },
      {
        key: "section",
        label: "Section (or leave blank if machine-specific)",
        type: "select",
        options: sections?.map((s) => ({ value: s.id, label: s.name })) ?? [],
      },
      {
        key: "machine",
        label: "Machine (or leave blank if section-wide)",
        type: "select",
        options: machines?.map((m) => ({ value: m.id, label: m.fleet_number })) ?? [],
      },
      { key: "period_type", label: "Period Type", type: "select", options: PERIOD_OPTIONS, required: true },
      {
        key: "shift_instance",
        label: "Shift Instance (if period is 'shift')",
        type: "select",
        options: shiftInstances?.map((si) => ({ value: si.id, label: `${si.date} — ${si.shift_name}` })) ?? [],
      },
      { key: "period_date", label: "Period Date (if period is 'day'/'month')", type: "date" },
      { key: "target_value", label: "Target Value", type: "number", required: true },
    ],
    defaultValues: siteId ? { site: siteId } : undefined,
  };

  return <MasterDataTable config={config} />;
}
