import { useAuth } from "@/auth/useAuth";
import { MasterDataTable, type MasterDataResourceConfig } from "@/components/masterdata/MasterDataTable";
import { useLookup } from "@/lib/useLookup";
import type { Team, TeamMember, UserSummary } from "@/types";

const ROLE_OPTIONS = [
  { value: "operator", label: "Operator" },
  { value: "team_leader", label: "Team Leader" },
];

export function TeamMembersPage() {
  const { hasRole } = useAuth();
  const { data: teams } = useLookup<Team>("teams");
  const { data: users } = useLookup<UserSummary>("users");

  const formatUser = (u: UserSummary): string =>
    u.first_name || u.last_name ? `${u.first_name} ${u.last_name}`.trim() : u.username;

  const teamName = (id: number) => teams?.find((t) => t.id === id)?.name ?? id;
  const userName = (id: number) => {
    const u = users?.find((u) => u.id === id);
    return u ? formatUser(u) : id;
  };

  const config: MasterDataResourceConfig<TeamMember> = {
    resource: "team-members",
    title: "Team Members",
    canWrite: hasRole("supervisor"),
    columns: [
      { key: "team", label: "Team", render: (row) => teamName(row.team) },
      { key: "user", label: "User", render: (row) => userName(row.user) },
      { key: "role_on_team", label: "Role" },
      { key: "active", label: "Active", render: (row) => (row.active ? "Yes" : "No") },
    ],
    fields: [
      {
        key: "team",
        label: "Team",
        type: "select",
        required: true,
        options: teams?.map((t) => ({ value: t.id, label: t.name })) ?? [],
      },
      {
        key: "user",
        label: "User",
        type: "select",
        required: true,
        options: users?.map((u) => ({ value: u.id, label: formatUser(u) })) ?? [],
      },
      { key: "role_on_team", label: "Role on Team", type: "select", options: ROLE_OPTIONS, required: true },
      { key: "active", label: "Active", type: "boolean" },
    ],
  };

  return <MasterDataTable config={config} />;
}
