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
  // Unfiltered here on purpose: these used to be pre-filtered by the
  // page-level site filter (siteId), which only matches the form's own
  // "Site" field when they happen to agree — picking a different Site
  // inside the create/edit modal left Section/Machine/Shift Instance still
  // scoped to whatever the page-level filter was, or unfiltered-but-wrong
  // if it was "All Sites". Filtering is now done per-field below, driven
  // by the form's own site value (same pattern as Machines/Teams pages).
  const { data: sections } = useLookup<Section>("sections");
  const { data: machines } = useLookup<Machine>("machines");
  const { data: parameters } = useLookup<Parameter>("parameters");
  const { data: shiftInstances } = useLookup<ShiftInstance>("shift-instances");

  const paramName = (id: number) => parameters?.find((p) => p.id === id)?.name ?? id;
  const siteName = (id: number) => sites?.find((s) => s.id === id)?.name ?? id;
  const sectionName = (id: number | null) => (id ? sections?.find((s) => s.id === id)?.name ?? id : "—");
  const machineName = (id: number | null) => {
    if (!id) return "—";
    const m = machines?.find((m) => m.id === id);
    return m ? `${m.machine_type_code.toUpperCase()} ${m.fleet_number}` : id;
  };

  const config: MasterDataResourceConfig<PlanTarget> = {
    resource: "plan-targets",
    title: "Plan Targets",
    canWrite: hasRole("supervisor"),
    extraParams: siteId ? { site: siteId } : undefined,
    // Only meaningfully populated for period_type="day"/"month" rows (a
    // "shift" row's date lives on its shift_instance instead) — filtering
    // by it naturally excludes shift-level targets from a date-ranged
    // search, which matches what the Date column already shows for them ("—").
    dateField: "period_date",
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
        options: (values) =>
          sections?.filter((s) => String(s.site) === String(values.site)).map((s) => ({ value: s.id, label: s.name })) ??
          [],
      },
      {
        key: "machine",
        label: "Machine (or leave blank if section-wide)",
        type: "select",
        options: (values) =>
          machines
            ?.filter((m) => String(m.site) === String(values.site))
            .map((m) => ({ value: m.id, label: `${m.machine_type_code.toUpperCase()} ${m.fleet_number}` })) ?? [],
      },
      { key: "period_type", label: "Period Type", type: "select", options: PERIOD_OPTIONS, required: true },
      {
        key: "shift_instance",
        label: "Shift Instance (if period is 'shift')",
        type: "select",
        options: (values) =>
          shiftInstances
            ?.filter((si) => String(si.site) === String(values.site))
            .map((si) => ({ value: si.id, label: `${si.date} — ${si.shift_name}` })) ?? [],
      },
      { key: "period_date", label: "Period Date (if period is 'day'/'month')", type: "date" },
      { key: "target_value", label: "Target Value", type: "number", required: true },
    ],
    defaultValues: siteId ? { site: siteId } : undefined,
  };

  return <MasterDataTable config={config} />;
}
