import { useAuth } from "@/auth/useAuth";
import { MasterDataTable, type MasterDataResourceConfig } from "@/components/masterdata/MasterDataTable";
import { useLookup } from "@/lib/useLookup";
import type { HourlySlot, Site } from "@/types";

export function HourlySlotsPage() {
  const { hasRole } = useAuth();
  const { data: sites } = useLookup<Site>("sites");
  const siteName = (id: number) => sites?.find((s) => s.id === id)?.name ?? id;

  const config: MasterDataResourceConfig<HourlySlot> = {
    resource: "hourly-slots",
    title: "Hourly Slots (Crusher Plant)",
    canWrite: hasRole("admin"),
    columns: [
      { key: "site", label: "Site", render: (row) => siteName(row.site) },
      { key: "slot_index", label: "Slot #" },
      { key: "start_time", label: "Start" },
      { key: "end_time", label: "End" },
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
      { key: "slot_index", label: "Slot Index", type: "number", required: true },
      { key: "start_time", label: "Start Time", type: "time", required: true },
      { key: "end_time", label: "End Time", type: "time", required: true },
      { key: "active", label: "Active", type: "boolean" },
    ],
  };

  return <MasterDataTable config={config} />;
}
