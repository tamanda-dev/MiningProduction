import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/api/client";
import type {
  BreakdownCause,
  ChecklistItem,
  DeliveryDestination,
  DowntimeReasonCode,
  HourlySlot,
  Machine,
  MachineType,
  Paginated,
  Parameter,
  PlanTarget,
  Section,
  Shift,
  ShiftInstance,
  Site,
  UOM,
  UserSummary,
} from "@/src/api/types";
import { useAuth } from "@/src/auth/useAuth";
import { useManageSite } from "@/src/manage/useManageSite";
import { MasterDataScreen, type MasterDataConfig } from "@/src/manage/MasterDataScreen";

// Small live-data lookup, mirroring dashboard/src/lib/useLookup.ts — used
// throughout these configs to populate select/multiselect field options
// and secondary-label lookups from real API data rather than hardcoding.
function useLookup<T>(resource: string, params?: Record<string, string | number>) {
  return useQuery({
    queryKey: [resource, "lookup", params ?? {}],
    queryFn: async () => {
      const { data } = await api.get<Paginated<T>>(`/${resource}/`, { params: { page_size: 500, ...params } });
      return data.results;
    },
  });
}

export function SitesScreen() {
  const { hasRole } = useAuth();
  const config: MasterDataConfig<Site> = {
    resource: "sites",
    title: "Sites",
    canWrite: hasRole("admin"),
    primaryLabel: (row) => row.name,
    secondaryLabel: (row) => row.code,
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "code", label: "Code", type: "text", helpText: "Optional — auto-generated from Name if left blank." },
      { key: "timezone", label: "Timezone", type: "text", required: true, helpText: "e.g. Africa/Harare" },
      { key: "active", label: "Active", type: "boolean" },
    ],
  };
  return <MasterDataScreen config={config} />;
}

export function SectionsScreen() {
  const { hasRole } = useAuth();
  const { data: sites } = useLookup<Site>("sites");
  const siteName = (id: number) => sites?.find((s) => s.id === id)?.name ?? String(id);
  const config: MasterDataConfig<Section> = {
    resource: "sections",
    title: "Sections",
    canWrite: hasRole("admin"),
    primaryLabel: (row) => row.name,
    secondaryLabel: (row) => siteName(row.site),
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "code", label: "Code", type: "text", helpText: "Optional — auto-generated from Name if left blank." },
      { key: "site", label: "Site", type: "select", required: true, options: sites?.map((s) => ({ value: s.id, label: s.name })) ?? [] },
      { key: "active", label: "Active", type: "boolean" },
    ],
  };
  return <MasterDataScreen config={config} />;
}

export function MachineTypesScreen() {
  const { hasRole } = useAuth();
  const config: MasterDataConfig<MachineType> = {
    resource: "machine-types",
    title: "Machine Types",
    canWrite: hasRole("admin"),
    primaryLabel: (row) => row.name,
    secondaryLabel: (row) => row.code,
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "code", label: "Code", type: "text", required: true },
      { key: "description", label: "Description", type: "text" },
      { key: "active", label: "Active", type: "boolean" },
    ],
  };
  return <MasterDataScreen config={config} />;
}

const MACHINE_STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "breakdown", label: "Breakdown" },
  { value: "maintenance", label: "Maintenance" },
  { value: "retired", label: "Retired" },
];

export function MachinesEditScreen() {
  const { hasRole } = useAuth();
  const { data: sites } = useLookup<Site>("sites");
  const { data: machineTypes } = useLookup<MachineType>("machine-types");
  const { data: sections } = useLookup<Section>("sections");
  const typeName = (id: number) => machineTypes?.find((m) => m.id === id)?.name ?? String(id);
  const siteName = (id: number) => sites?.find((s) => s.id === id)?.name ?? String(id);
  const config: MasterDataConfig<Machine> = {
    resource: "machines",
    title: "Machines",
    canWrite: hasRole("admin"),
    primaryLabel: (row) => `${row.machine_type_code.toUpperCase()} ${row.fleet_number}`,
    secondaryLabel: (row) => `${typeName(row.machine_type)} — ${siteName(row.site)}`,
    fields: [
      { key: "site", label: "Site", type: "select", required: true, options: sites?.map((s) => ({ value: s.id, label: s.name })) ?? [] },
      { key: "machine_type", label: "Machine Type", type: "select", required: true, options: machineTypes?.map((m) => ({ value: m.id, label: m.name })) ?? [] },
      { key: "fleet_number", label: "Fleet Number", type: "text", required: true },
      { key: "name", label: "Name / Label", type: "text" },
      { key: "status", label: "Status", type: "select", required: true, options: MACHINE_STATUS_OPTIONS },
      {
        key: "current_section",
        label: "Current Section",
        type: "select",
        options: (values) => sections?.filter((s) => String(s.site) === String(values.site)).map((s) => ({ value: s.id, label: s.name })) ?? [],
      },
    ],
  };
  return <MasterDataScreen config={config} />;
}

export function UOMsScreen() {
  const { hasRole } = useAuth();
  const config: MasterDataConfig<UOM> = {
    resource: "uoms",
    title: "Units of Measure",
    canWrite: hasRole("admin"),
    primaryLabel: (row) => row.name,
    secondaryLabel: (row) => row.abbreviation,
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "abbreviation", label: "Abbreviation", type: "text", required: true },
    ],
  };
  return <MasterDataScreen config={config} />;
}

const SCOPE_OPTIONS = [
  { value: "machine", label: "Machine-level" },
  { value: "section", label: "Section-level" },
  { value: "shift", label: "Shift-total" },
];
const DATA_TYPE_OPTIONS = [
  { value: "number", label: "Number" },
  { value: "integer", label: "Integer" },
  { value: "text", label: "Text" },
  { value: "select", label: "Select" },
  { value: "boolean", label: "Boolean" },
];
const AGGREGATION_OPTIONS = [
  { value: "sum", label: "Sum (additive)" },
  { value: "average", label: "Average (rates/%)" },
];

export function ParametersScreen() {
  const { hasRole } = useAuth();
  const { data: uoms } = useLookup<UOM>("uoms");
  const { data: machineTypes } = useLookup<MachineType>("machine-types");
  const { data: sections } = useLookup<Section>("sections");
  const config: MasterDataConfig<Parameter> = {
    resource: "parameters",
    title: "Parameters",
    canWrite: hasRole("admin"),
    defaultValues: { aggregation: "sum" },
    primaryLabel: (row) => row.name,
    secondaryLabel: (row) => `${row.scope} · ${row.data_type}`,
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "code", label: "Code", type: "text", required: true, helpText: "Stable key, e.g. tonnes-hauled" },
      { key: "scope", label: "Scope", type: "select", required: true, options: SCOPE_OPTIONS },
      { key: "data_type", label: "Data Type", type: "select", required: true, options: DATA_TYPE_OPTIONS },
      {
        key: "aggregation",
        label: "Shift/Day/MTD Roll-up",
        type: "select",
        required: true,
        options: AGGREGATION_OPTIONS,
        helpText: "Wrong for a %/rate parameter and 99/99/100% rolls up to \"298\" instead of ~99.3.",
      },
      { key: "uom", label: "Unit of Measure", type: "select", options: uoms?.map((u) => ({ value: u.id, label: u.abbreviation })) ?? [] },
      { key: "section", label: "Section (required if scope is section-level)", type: "select", options: sections?.map((s) => ({ value: s.id, label: s.name })) ?? [] },
      { key: "applicable_machine_types", label: "Applicable Machine Types", type: "multiselect", options: machineTypes?.map((m) => ({ value: m.id, label: m.name })) ?? [] },
      { key: "min_value", label: "Min Value", type: "number" },
      { key: "max_value", label: "Max Value", type: "number" },
      { key: "is_required", label: "Required", type: "boolean" },
      { key: "active", label: "Active", type: "boolean" },
    ],
  };
  return <MasterDataScreen config={config} />;
}

export function DeliveryDestinationsScreen() {
  const { hasRole } = useAuth();
  const { data: sites } = useLookup<Site>("sites");
  const siteName = (id: number) => sites?.find((s) => s.id === id)?.name ?? String(id);
  const config: MasterDataConfig<DeliveryDestination> = {
    resource: "delivery-destinations",
    title: "Delivery Destinations",
    canWrite: hasRole("admin"),
    primaryLabel: (row) => row.name,
    secondaryLabel: (row) => siteName(row.site),
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "code", label: "Code", type: "text", required: true },
      { key: "site", label: "Site", type: "select", required: true, options: sites?.map((s) => ({ value: s.id, label: s.name })) ?? [] },
      { key: "active", label: "Active", type: "boolean" },
    ],
  };
  return <MasterDataScreen config={config} />;
}

export function DowntimeReasonCodesScreen() {
  const { hasRole } = useAuth();
  const config: MasterDataConfig<DowntimeReasonCode> = {
    resource: "downtime-reason-codes",
    title: "Downtime Reason Codes",
    canWrite: hasRole("admin"),
    primaryLabel: (row) => row.description,
    secondaryLabel: (row) => row.category,
    fields: [
      { key: "code", label: "Code", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: true },
      { key: "category", label: "Category", type: "text" },
      { key: "active", label: "Active", type: "boolean" },
    ],
  };
  return <MasterDataScreen config={config} />;
}

export function ShiftsScreen() {
  const { hasRole } = useAuth();
  const { data: sites } = useLookup<Site>("sites");
  const siteName = (id: number) => sites?.find((s) => s.id === id)?.name ?? String(id);
  const config: MasterDataConfig<Shift> = {
    resource: "shifts",
    title: "Shifts",
    canWrite: hasRole("supervisor"),
    primaryLabel: (row) => row.name,
    secondaryLabel: (row) => siteName(row.site),
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "site", label: "Site", type: "select", required: true, options: sites?.map((s) => ({ value: s.id, label: s.name })) ?? [] },
      { key: "start_time", label: "Start Time", type: "text", required: true, helpText: "HH:MM:SS" },
      { key: "end_time", label: "End Time", type: "text", required: true, helpText: "HH:MM:SS" },
      { key: "slot_length_minutes", label: "Slot Length (minutes)", type: "number", required: true },
    ],
  };
  return <MasterDataScreen config={config} />;
}

export function BreakdownCausesScreen() {
  const { hasRole } = useAuth();
  const config: MasterDataConfig<BreakdownCause> = {
    resource: "breakdown-causes",
    title: "Breakdown Causes",
    canWrite: hasRole("admin"),
    defaultValues: { is_other: false },
    primaryLabel: (row) => row.name,
    secondaryLabel: (row) => (row.is_other ? "Is 'Other'" : null),
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "code", label: "Code", type: "text", required: true },
      { key: "is_other", label: "Is 'Other' (requires free text elsewhere)", type: "boolean", helpText: "Only one cause may be flagged as 'Other'." },
      { key: "active", label: "Active", type: "boolean" },
    ],
  };
  return <MasterDataScreen config={config} />;
}

export function ChecklistItemsScreen() {
  const { hasRole } = useAuth();
  const config: MasterDataConfig<ChecklistItem> = {
    resource: "checklist-items",
    title: "Checklist Items",
    canWrite: hasRole("admin"),
    primaryLabel: (row) => row.name,
    secondaryLabel: (row) => row.description || null,
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "code", label: "Code", type: "text", required: true },
      { key: "description", label: "Description", type: "text" },
      { key: "active", label: "Active", type: "boolean" },
    ],
  };
  return <MasterDataScreen config={config} />;
}

export function HourlySlotsScreen() {
  const { hasRole } = useAuth();
  const { data: sites } = useLookup<Site>("sites");
  const siteName = (id: number) => sites?.find((s) => s.id === id)?.name ?? String(id);
  const config: MasterDataConfig<HourlySlot> = {
    resource: "hourly-slots",
    title: "Hourly Slots",
    canWrite: hasRole("admin"),
    primaryLabel: (row) => `Slot ${row.slot_index}`,
    secondaryLabel: (row) => `${siteName(row.site)} · ${row.start_time}–${row.end_time}`,
    fields: [
      { key: "site", label: "Site", type: "select", required: true, options: sites?.map((s) => ({ value: s.id, label: s.name })) ?? [] },
      { key: "slot_index", label: "Slot Index", type: "number", required: true },
      { key: "start_time", label: "Start Time", type: "text", required: true, helpText: "HH:MM:SS" },
      { key: "end_time", label: "End Time", type: "text", required: true, helpText: "HH:MM:SS" },
      { key: "active", label: "Active", type: "boolean" },
    ],
  };
  return <MasterDataScreen config={config} />;
}

const PERIOD_OPTIONS = [
  { value: "shift", label: "Shift" },
  { value: "day", label: "Day" },
  { value: "month", label: "Month" },
];

export function PlanTargetsScreen() {
  const { hasRole } = useAuth();
  const { data: sites } = useLookup<Site>("sites");
  const { data: sections } = useLookup<Section>("sections");
  const { data: machines } = useLookup<Machine>("machines");
  const { data: parameters } = useLookup<Parameter>("parameters");
  const { data: shiftInstances } = useLookup<ShiftInstance>("shift-instances");

  const paramName = (id: number) => parameters?.find((p) => p.id === id)?.name ?? String(id);
  const siteName = (id: number) => sites?.find((s) => s.id === id)?.name ?? String(id);
  const machineLabel = (id: number) => {
    const m = machines?.find((mm) => mm.id === id);
    return m ? `${m.machine_type_code.toUpperCase()} ${m.fleet_number}` : String(id);
  };

  const config: MasterDataConfig<PlanTarget> = {
    resource: "plan-targets",
    title: "Plan Targets",
    canWrite: hasRole("supervisor"),
    primaryLabel: (row) => `${paramName(row.parameter)} — ${row.target_value}`,
    secondaryLabel: (row) =>
      `${siteName(row.site)} · ${row.period_type}${row.machine ? ` · ${machineLabel(row.machine)}` : ""}`,
    fields: [
      { key: "parameter", label: "Parameter", type: "select", required: true, options: parameters?.map((p) => ({ value: p.id, label: p.name })) ?? [] },
      { key: "site", label: "Site", type: "select", required: true, options: sites?.map((s) => ({ value: s.id, label: s.name })) ?? [] },
      {
        key: "section",
        label: "Section (or leave blank if machine-specific)",
        type: "select",
        options: (values) => sections?.filter((s) => String(s.site) === String(values.site)).map((s) => ({ value: s.id, label: s.name })) ?? [],
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
      { key: "period_type", label: "Period Type", type: "select", required: true, options: PERIOD_OPTIONS },
      {
        key: "shift_instance",
        label: "Shift Instance (if period is 'shift')",
        type: "select",
        options: (values) =>
          shiftInstances
            ?.filter((si) => String(si.site) === String(values.site))
            .map((si) => ({ value: si.id, label: `${si.date} — ${si.shift_name}` })) ?? [],
      },
      { key: "period_date", label: "Period Date (if period is 'day'/'month')", type: "date", helpText: "YYYY-MM-DD" },
      { key: "target_value", label: "Target Value", type: "number", required: true },
    ],
  };
  return <MasterDataScreen config={config} />;
}

export const MASTER_DATA_SCREENS: Record<string, { title: string; Component: React.ComponentType; requireRole: "admin" | "supervisor" }> = {
  sites: { title: "Sites", Component: SitesScreen, requireRole: "admin" },
  sections: { title: "Sections", Component: SectionsScreen, requireRole: "admin" },
  "machine-types": { title: "Machine Types", Component: MachineTypesScreen, requireRole: "admin" },
  machines: { title: "Machines", Component: MachinesEditScreen, requireRole: "admin" },
  uoms: { title: "Units of Measure", Component: UOMsScreen, requireRole: "admin" },
  parameters: { title: "Parameters", Component: ParametersScreen, requireRole: "admin" },
  "delivery-destinations": { title: "Delivery Destinations", Component: DeliveryDestinationsScreen, requireRole: "admin" },
  "downtime-reasons": { title: "Downtime Reason Codes", Component: DowntimeReasonCodesScreen, requireRole: "admin" },
  shifts: { title: "Shifts", Component: ShiftsScreen, requireRole: "supervisor" },
  "breakdown-causes": { title: "Breakdown Causes", Component: BreakdownCausesScreen, requireRole: "admin" },
  "checklist-items": { title: "Checklist Items", Component: ChecklistItemsScreen, requireRole: "admin" },
  "hourly-slots": { title: "Hourly Slots", Component: HourlySlotsScreen, requireRole: "admin" },
};
