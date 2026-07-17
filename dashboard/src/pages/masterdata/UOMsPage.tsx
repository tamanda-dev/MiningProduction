import { useAuth } from "@/auth/useAuth";
import { MasterDataTable, type MasterDataResourceConfig } from "@/components/masterdata/MasterDataTable";
import type { UOM } from "@/types";

export function UOMsPage() {
  const { hasRole } = useAuth();

  const config: MasterDataResourceConfig<UOM> = {
    resource: "uoms",
    title: "Units of Measure",
    canWrite: hasRole("admin"),
    columns: [
      { key: "name", label: "Name" },
      { key: "abbreviation", label: "Abbreviation" },
    ],
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "abbreviation", label: "Abbreviation", type: "text", required: true, helpText: "e.g. t, m, %, hr" },
    ],
  };

  return <MasterDataTable config={config} />;
}
