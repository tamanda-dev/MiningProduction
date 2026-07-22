import { useAuth } from "@/auth/useAuth";
import { MasterDataTable, type MasterDataResourceConfig } from "@/components/masterdata/MasterDataTable";
import type { BreakdownCause } from "@/types";

export function BreakdownCausesPage() {
  const { hasRole } = useAuth();

  const config: MasterDataResourceConfig<BreakdownCause> = {
    resource: "breakdown-causes",
    title: "Breakdown Causes",
    canWrite: hasRole("admin"),
    // MasterDataTable defaults every boolean field to `true` on create,
    // which is right for "Active" but wrong here — the backend now
    // rejects a second is_other=True cause, so pre-checking this on every
    // new row would make creating any cause after the first "Other" one
    // fail validation unless the admin remembers to uncheck it.
    defaultValues: { is_other: false },
    columns: [
      { key: "name", label: "Name" },
      { key: "code", label: "Code" },
      { key: "is_other", label: "Is 'Other'", render: (row) => (row.is_other ? "Yes" : "No") },
      { key: "display_order", label: "Order" },
      { key: "active", label: "Active", render: (row) => (row.active ? "Yes" : "No") },
    ],
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "code", label: "Code", type: "text", required: true },
      {
        key: "is_other",
        label: "Is 'Other' (requires free-text elsewhere)",
        type: "boolean",
        helpText: "Exactly one cause should be flagged as 'Other'.",
      },
      { key: "display_order", label: "Display Order", type: "number" },
      { key: "active", label: "Active", type: "boolean" },
    ],
  };

  return <MasterDataTable config={config} />;
}
