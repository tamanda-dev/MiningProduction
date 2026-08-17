import { useAuth } from "@/auth/useAuth";
import { MasterDataTable, type MasterDataResourceConfig } from "@/components/masterdata/MasterDataTable";
import { useLookup } from "@/lib/useLookup";
import type { Machine, MachineType, Section, Site } from "@/types";

const STATUS_OPTIONS = [
  { value: "operating", label: "Operating" },
  { value: "standby", label: "Standby" },
  { value: "operational_delay", label: "Operational Delay" },
  { value: "planned_maintenance", label: "Planned Maintenance" },
  { value: "unplanned_maintenance", label: "Unplanned Maintenance" },
  { value: "breakdown", label: "Breakdown" },
  { value: "refuelling", label: "Refuelling" },
  { value: "no_operator", label: "No Operator" },
  { value: "weather_delay", label: "Weather Delay" },
  { value: "blast_clearance", label: "Blast Clearance" },
  { value: "communications_loss", label: "Communications Loss" },
  { value: "unknown", label: "Unknown" },
  { value: "retired", label: "Retired" },
];

export function MachinesPage() {
  const { hasRole } = useAuth();
  const { data: sites } = useLookup<Site>("sites");
  const { data: machineTypes } = useLookup<MachineType>("machine-types");
  const { data: sections } = useLookup<Section>("sections");

  const siteName = (id: number) => sites?.find((s) => s.id === id)?.name ?? id;
  const typeName = (id: number) => machineTypes?.find((m) => m.id === id)?.name ?? id;
  const sectionName = (id: number | null) => (id ? sections?.find((s) => s.id === id)?.name ?? id : "—");

  const config: MasterDataResourceConfig<Machine> = {
    resource: "machines",
    title: "Machines",
    canWrite: hasRole("admin"),
    columns: [
      { key: "fleet_number", label: "Fleet #" },
      { key: "name", label: "Name" },
      { key: "machine_type", label: "Type", render: (row) => typeName(row.machine_type) },
      { key: "site", label: "Site", render: (row) => siteName(row.site) },
      { key: "status", label: "Status" },
      { key: "current_section", label: "Current Section", render: (row) => sectionName(row.current_section) },
    ],
    fields: [
      {
        key: "site",
        label: "Site",
        type: "select",
        required: true,
        options: sites?.map((s) => ({ value: s.id, label: s.name })) ?? [],
      },
      {
        key: "machine_type",
        label: "Machine Type",
        type: "select",
        required: true,
        options: machineTypes?.map((m) => ({ value: m.id, label: m.name })) ?? [],
      },
      { key: "fleet_number", label: "Fleet Number", type: "text", required: true },
      { key: "name", label: "Name / Label", type: "text" },
      { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS, required: true },
      {
        key: "current_section",
        label: "Current Section",
        type: "select",
        options: (values) =>
          sections?.filter((s) => String(s.site) === String(values.site)).map((s) => ({ value: s.id, label: s.name })) ?? [],
      },
    ],
  };

  return <MasterDataTable config={config} />;
}
