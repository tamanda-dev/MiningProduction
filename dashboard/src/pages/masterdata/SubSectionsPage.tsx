import { useAuth } from "@/auth/useAuth";
import { MasterDataTable, type MasterDataResourceConfig } from "@/components/masterdata/MasterDataTable";
import { useLookup } from "@/lib/useLookup";
import type { Section, SubSection } from "@/types";

export function SubSectionsPage() {
  const { hasRole } = useAuth();
  const { data: sections } = useLookup<Section>("sections");
  const sectionName = (id: number) => sections?.find((s) => s.id === id)?.name ?? id;

  const config: MasterDataResourceConfig<SubSection> = {
    resource: "subsections",
    title: "Sub-Sections",
    canWrite: hasRole("admin"),
    columns: [
      { key: "name", label: "Name" },
      { key: "code", label: "Code" },
      { key: "section", label: "Section", render: (row) => sectionName(row.section) },
      { key: "display_order", label: "Order" },
      { key: "active", label: "Active", render: (row) => (row.active ? "Yes" : "No") },
    ],
    fields: [
      {
        key: "section",
        label: "Section",
        type: "select",
        required: true,
        options: sections?.map((s) => ({ value: s.id, label: s.name })) ?? [],
      },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "code", label: "Code", type: "text", required: true },
      { key: "display_order", label: "Display order", type: "number" },
      { key: "active", label: "Active", type: "boolean" },
    ],
  };

  return <MasterDataTable config={config} />;
}
