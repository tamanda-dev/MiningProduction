import { useAuth } from "@/auth/useAuth";
import { MasterDataTable, type MasterDataResourceConfig } from "@/components/masterdata/MasterDataTable";
import type { ChecklistItem } from "@/types";

export function ChecklistItemsPage() {
  const { hasRole } = useAuth();

  const config: MasterDataResourceConfig<ChecklistItem> = {
    resource: "checklist-items",
    title: "Checklist Items",
    canWrite: hasRole("admin"),
    columns: [
      { key: "name", label: "Name" },
      { key: "code", label: "Code" },
      { key: "description", label: "Description" },
      { key: "active", label: "Active", render: (row) => (row.active ? "Yes" : "No") },
    ],
    fields: [
      { key: "name", label: "Name", type: "text", required: true, helpText: "e.g. Safety Talk" },
      { key: "code", label: "Code", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea" },
      { key: "active", label: "Active", type: "boolean" },
    ],
  };

  return <MasterDataTable config={config} />;
}
