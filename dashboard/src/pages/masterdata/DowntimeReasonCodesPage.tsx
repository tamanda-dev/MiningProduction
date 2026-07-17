import { useAuth } from "@/auth/useAuth";
import { MasterDataTable, type MasterDataResourceConfig } from "@/components/masterdata/MasterDataTable";
import type { DowntimeReasonCode } from "@/types";

export function DowntimeReasonCodesPage() {
  const { hasRole } = useAuth();

  const config: MasterDataResourceConfig<DowntimeReasonCode> = {
    resource: "downtime-reason-codes",
    title: "Downtime Reason Codes",
    canWrite: hasRole("admin"),
    columns: [
      { key: "description", label: "Description" },
      { key: "code", label: "Code" },
      { key: "category", label: "Category" },
      { key: "active", label: "Active", render: (row) => (row.active ? "Yes" : "No") },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: true },
      { key: "category", label: "Category", type: "text", helpText: "e.g. Mechanical, Electrical, Operational" },
      { key: "active", label: "Active", type: "boolean" },
    ],
  };

  return <MasterDataTable config={config} />;
}
