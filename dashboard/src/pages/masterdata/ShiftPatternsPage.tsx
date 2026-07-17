import { useAuth } from "@/auth/useAuth";
import { MasterDataTable, type MasterDataResourceConfig } from "@/components/masterdata/MasterDataTable";
import type { ShiftPattern } from "@/types";

export function ShiftPatternsPage() {
  const { hasRole } = useAuth();

  const config: MasterDataResourceConfig<ShiftPattern> = {
    resource: "shift-patterns",
    title: "Shift Patterns",
    canWrite: hasRole("supervisor"),
    columns: [
      { key: "name", label: "Name" },
      { key: "description", label: "Description" },
      { key: "active", label: "Active", render: (row) => (row.active ? "Yes" : "No") },
    ],
    fields: [
      { key: "name", label: "Name", type: "text", required: true, helpText: "e.g. 4 on / 4 off" },
      { key: "description", label: "Description", type: "textarea" },
      { key: "active", label: "Active", type: "boolean" },
    ],
  };

  return <MasterDataTable config={config} />;
}
