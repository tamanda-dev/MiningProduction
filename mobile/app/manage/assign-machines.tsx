import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "@/src/api/client";
import type { Machine, MachineTypeQualification, Paginated, Site, UserSummary } from "@/src/api/types";
import { BigButton } from "@/src/components/BigButton";
import { Chip, ChipRow } from "@/src/components/Chip";
import { ModalSheet } from "@/src/components/ModalSheet";
import { Screen } from "@/src/components/Screen";
import { colors, fontSize, radius, shadow, spacing } from "@/src/theme/theme";

function userLabel(user: UserSummary) {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
  return fullName ? `${fullName} (${user.username})` : user.username;
}

// Mirrors dashboard/src/components/users/QualificationsModal.tsx: assigns
// one specific physical Machine to an operator (not a machine type, no
// separate site step — whichever machine is picked already has a site).
function AssignedMachinesModal({ user, onClose }: { user: UserSummary; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: sites } = useQuery({
    queryKey: ["sites", "lookup"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Site>>("/sites/", { params: { page_size: 500 } });
      return data.results;
    },
  });
  const { data: machines } = useQuery({
    queryKey: ["machines", "lookup"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Machine>>("/machines/", { params: { page_size: 500 } });
      return data.results;
    },
  });
  const { data: qualifications, isLoading } = useQuery({
    queryKey: ["machine-qualifications", user.id],
    queryFn: async () => {
      const { data } = await api.get<Paginated<MachineTypeQualification>>("/machine-qualifications/", {
        params: { user: user.id, page_size: 500 },
      });
      return data.results;
    },
  });

  const addMutation = useMutation({
    mutationFn: async (machineId: number) => api.post("/machine-qualifications/", { user: user.id, machine: machineId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["machine-qualifications", user.id] });
      setPickerOpen(false);
      setError(null);
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail ?? "Failed to assign machine.");
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (qualId: number) => api.delete(`/machine-qualifications/${qualId}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["machine-qualifications", user.id] }),
  });

  const siteName = (id: number) => sites?.find((s) => s.id === id)?.name ?? String(id);
  const machineLabel = (m: Machine) =>
    `${m.machine_type_code.toUpperCase()} ${m.fleet_number}${m.name ? ` (${m.name})` : ""} — ${siteName(m.site)}`;

  const assignedIds = new Set((qualifications ?? []).map((q) => q.machine).filter((id): id is number => id !== null));
  const availableMachines = (machines ?? []).filter((m) => !assignedIds.has(m.id));

  return (
    <ModalSheet visible title={`Assigned Machines — ${userLabel(user)}`}>
      {isLoading && <Text style={styles.muted}>Loading…</Text>}
      {qualifications && qualifications.length === 0 && <Text style={styles.muted}>No machines assigned yet.</Text>}
      {(qualifications ?? []).map((qual) => {
        const m = machines?.find((mm) => mm.id === qual.machine);
        return (
          <View key={qual.id} style={styles.grantRow}>
            <Text style={styles.grantLabel}>{m ? machineLabel(m) : `Any ${qual.machine_type_code?.toUpperCase() ?? "machine"}`}</Text>
            <Pressable onPress={() => removeMutation.mutate(qual.id)} disabled={removeMutation.isPending}>
              <Text style={styles.removeLink}>Remove</Text>
            </Pressable>
          </View>
        );
      })}

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={{ marginTop: spacing.md }}>
        <BigButton label="+ Assign a Machine" variant="secondary" onPress={() => setPickerOpen(true)} />
      </View>
      <View style={{ marginTop: spacing.sm }}>
        <BigButton label="Close" onPress={onClose} />
      </View>

      <ModalSheet visible={pickerOpen} title="Pick a Machine">
        <ChipRow>
          {availableMachines.map((m) => (
            <Chip
              key={m.id}
              label={machineLabel(m)}
              selected={false}
              onPress={() => {
                setError(null);
                addMutation.mutate(m.id);
              }}
            />
          ))}
          {availableMachines.length === 0 && <Text style={styles.muted}>No more machines to assign.</Text>}
        </ChipRow>
        <View style={{ marginTop: spacing.md }}>
          <BigButton label="Cancel" variant="secondary" onPress={() => setPickerOpen(false)} />
        </View>
      </ModalSheet>
    </ModalSheet>
  );
}

export default function ManageAssignMachinesScreen() {
  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);

  const usersQuery = useQuery({
    queryKey: ["users", "for-assign"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<UserSummary>>("/users/", { params: { page_size: 500 } });
      return data.results;
    },
  });

  const users = usersQuery.data ?? [];

  return (
    <Screen onRefresh={() => usersQuery.refetch()} refreshing={usersQuery.isRefetching}>
      <Text style={styles.title}>Assign Machines to Operators</Text>

      {usersQuery.isLoading && <Text style={styles.muted}>Loading…</Text>}
      {usersQuery.isError && <Text style={styles.error}>Failed to load users.</Text>}

      {users.map((user) => (
        <Pressable key={user.id} onPress={() => setSelectedUser(user)} style={styles.card}>
          <Text style={styles.username}>{user.username}</Text>
          <Text style={styles.fullName}>{[user.first_name, user.last_name].filter(Boolean).join(" ") || "—"}</Text>
        </Pressable>
      ))}

      {selectedUser && <AssignedMachinesModal user={selectedUser} onClose={() => setSelectedUser(null)} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: fontSize.title,
    fontWeight: "800",
    color: colors.text,
    marginBottom: spacing.md,
  },
  muted: {
    fontSize: fontSize.body,
    color: colors.textMuted,
  },
  error: {
    fontSize: fontSize.label,
    color: colors.critical,
    fontWeight: "600",
    marginTop: spacing.xs,
  },
  card: {
    borderWidth: 2,
    borderColor: colors.borderLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.background,
    ...shadow,
  },
  username: {
    fontSize: fontSize.button,
    fontWeight: "700",
    color: colors.text,
  },
  fullName: {
    fontSize: fontSize.label,
    color: colors.textMuted,
    marginTop: 2,
  },
  grantRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 2,
    borderColor: colors.borderLight,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  grantLabel: {
    fontSize: fontSize.label,
    color: colors.text,
    flexShrink: 1,
  },
  removeLink: {
    fontSize: fontSize.label,
    fontWeight: "700",
    color: colors.critical,
    flexShrink: 0,
  },
});
