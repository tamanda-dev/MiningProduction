import { useAuth } from "@/auth/useAuth";
import { MasterDataTable, type MasterDataResourceConfig } from "@/components/masterdata/MasterDataTable";
import { useLookup } from "@/lib/useLookup";
import type { Section, ShiftPattern, Site, Team } from "@/types";

export function TeamsPage() {
  const { hasRole } = useAuth();
  const { data: sites } = useLookup<Site>("sites");
  const { data: sections } = useLookup<Section>("sections");
  const { data: patterns } = useLookup<ShiftPattern>("shift-patterns");

  const siteName = (id: number) => sites?.find((s) => s.id === id)?.name ?? id;
  const sectionName = (id: number | null) => (id ? sections?.find((s) => s.id === id)?.name ?? id : "—");
  const patternName = (id: number | null) => (id ? patterns?.find((p) => p.id === id)?.name ?? id : "—");

  const config: MasterDataResourceConfig<Team> = {
    resource: "teams",
    title: "Teams",
    canWrite: hasRole("supervisor"),
    columns: [
      { key: "name", label: "Name" },
      { key: "site", label: "Site", render: (row) => siteName(row.site) },
      { key: "section", label: "Section", render: (row) => sectionName(row.section) },
      { key: "shift_pattern", label: "Shift Pattern", render: (row) => patternName(row.shift_pattern) },
      { key: "members", label: "Members", render: (row) => row.members.length },
      { key: "active", label: "Active", render: (row) => (row.active ? "Yes" : "No") },
    ],
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      {
        key: "site",
        label: "Site",
        type: "select",
        required: true,
        options: sites?.map((s) => ({ value: s.id, label: s.name })) ?? [],
      },
      {
        key: "section",
        label: "Section",
        type: "select",
        options: (values) =>
          sections?.filter((s) => String(s.site) === String(values.site)).map((s) => ({ value: s.id, label: s.name })) ?? [],
      },
      {
        key: "shift_pattern",
        label: "Shift Pattern",
        type: "select",
        options: patterns?.map((p) => ({ value: p.id, label: p.name })) ?? [],
      },
      { key: "active", label: "Active", type: "boolean" },
    ],
  };

  return <MasterDataTable config={config} />;
}
