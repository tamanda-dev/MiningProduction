import { useAuth } from "@/auth/useAuth";
import { MasterDataTable, type MasterDataResourceConfig } from "@/components/masterdata/MasterDataTable";
import { useLookup } from "@/lib/useLookup";
import type { Shift, Site } from "@/types";

export function ShiftsPage() {
  const { hasRole } = useAuth();
  const { data: sites } = useLookup<Site>("sites");
  const siteName = (id: number) => sites?.find((s) => s.id === id)?.name ?? id;

  const config: MasterDataResourceConfig<Shift> = {
    resource: "shifts",
    title: "Shifts",
    canWrite: hasRole("supervisor"),
    columns: [
      { key: "name", label: "Name" },
      { key: "site", label: "Site", render: (row) => siteName(row.site) },
      { key: "start_time", label: "Start" },
      { key: "end_time", label: "End" },
      { key: "slot_length_minutes", label: "Slot Length (min)" },
      { key: "active", label: "Active", render: (row) => (row.active ? "Yes" : "No") },
    ],
    fields: [
      {
        key: "site",
        label: "Site",
        type: "select",
        required: true,
        options: sites?.map((s) => ({ value: s.id, label: s.name })) ?? [],
      },
      { key: "name", label: "Name", type: "text", required: true, helpText: "e.g. Day, Night" },
      { key: "start_time", label: "Start Time", type: "time", required: true },
      { key: "end_time", label: "End Time", type: "time", required: true },
      {
        key: "slot_length_minutes",
        label: "Slot Length (minutes)",
        type: "number",
        required: true,
        helpText: "Length of each hourly entry slot, e.g. 60",
      },
      { key: "active", label: "Active", type: "boolean" },
    ],
    defaultValues: { slot_length_minutes: 60 },
  };

  return <MasterDataTable config={config} />;
}
