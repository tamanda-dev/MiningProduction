import { useAuth } from "@/auth/useAuth";
import { MasterDataTable, type MasterDataResourceConfig } from "@/components/masterdata/MasterDataTable";
import type { Site } from "@/types";

export function SitesPage() {
  const { hasRole } = useAuth();

  const config: MasterDataResourceConfig<Site> = {
    resource: "sites",
    title: "Sites",
    canWrite: hasRole("admin"),
    columns: [
      { key: "name", label: "Name" },
      { key: "code", label: "Code" },
      { key: "timezone", label: "Timezone" },
      { key: "active", label: "Active", render: (row) => (row.active ? "Yes" : "No") },
    ],
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "code", label: "Code", type: "text", required: true, helpText: "URL-safe slug, e.g. south-pit" },
      { key: "timezone", label: "Timezone", type: "text", required: true },
      { key: "active", label: "Active", type: "boolean" },
    ],
    defaultValues: { timezone: "Africa/Harare" },
  };

  return <MasterDataTable config={config} />;
}
