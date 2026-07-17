import { useAuth } from "@/auth/useAuth";
import { MasterDataTable, type MasterDataResourceConfig } from "@/components/masterdata/MasterDataTable";
import type { MachineType } from "@/types";

export function MachineTypesPage() {
  const { hasRole } = useAuth();

  const config: MasterDataResourceConfig<MachineType> = {
    resource: "machine-types",
    title: "Machine Types",
    canWrite: hasRole("admin"),
    columns: [
      { key: "name", label: "Name" },
      { key: "code", label: "Code" },
      { key: "description", label: "Description" },
      { key: "active", label: "Active", render: (row) => (row.active ? "Yes" : "No") },
    ],
    fields: [
      { key: "name", label: "Name", type: "text", required: true, helpText: "e.g. Dump Truck" },
      { key: "code", label: "Code", type: "text", required: true, helpText: "e.g. DUT" },
      { key: "description", label: "Description", type: "textarea" },
      { key: "active", label: "Active", type: "boolean" },
    ],
  };

  return <MasterDataTable config={config} />;
}
