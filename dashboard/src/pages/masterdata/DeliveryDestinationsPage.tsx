import { useAuth } from "@/auth/useAuth";
import { MasterDataTable, type MasterDataResourceConfig } from "@/components/masterdata/MasterDataTable";
import { useLookup } from "@/lib/useLookup";
import type { DeliveryDestination, Site } from "@/types";

export function DeliveryDestinationsPage() {
  const { hasRole } = useAuth();
  const { data: sites } = useLookup<Site>("sites");
  const siteName = (id: number) => sites?.find((s) => s.id === id)?.name ?? id;

  const config: MasterDataResourceConfig<DeliveryDestination> = {
    resource: "delivery-destinations",
    title: "Delivery Destinations",
    canWrite: hasRole("admin"),
    columns: [
      { key: "name", label: "Name" },
      { key: "code", label: "Code" },
      { key: "site", label: "Site", render: (row) => siteName(row.site) },
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
      { key: "name", label: "Name", type: "text", required: true, helpText: "e.g. Plant 1" },
      { key: "code", label: "Code", type: "text", required: true },
      { key: "active", label: "Active", type: "boolean" },
    ],
  };

  return <MasterDataTable config={config} />;
}
