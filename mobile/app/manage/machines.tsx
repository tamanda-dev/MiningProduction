import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "@/src/api/client";
import type {
  MachineStatusRow,
  MachineTypeQualification,
  Paginated,
  Section,
  UserSummary,
} from "@/src/api/types";
import { BigButton } from "@/src/components/BigButton";
import { ChipRow, Chip } from "@/src/components/Chip";
import { ModalSheet } from "@/src/components/ModalSheet";
import { Screen } from "@/src/components/Screen";
import { StatusPill } from "@/src/components/StatusPill";
import { useManageSite } from "@/src/manage/useManageSite";
import { colors, fontSize, radius, shadow, spacing } from "@/src/theme/theme";

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  breakdown: "Breakdown",
  maintenance: "Maintenance",
  retired: "Retired",
};
const STATUS_COLOR: Record<string, string> = {
  active: colors.good,
  breakdown: colors.critical,
  maintenance: colors.warning,
  retired: colors.textMuted,
};

function AssignModal({ row, siteId, onClose }: { row: MachineStatusRow; siteId: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [operatorId, setOperatorId] = useState<number | null>(null);
  const [sectionId, setSectionId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sectionsQuery = useQuery({
    queryKey: ["sections", siteId],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Section>>("/sections/", { params: { site: siteId, page_size: 200 } });
      return data.results;
    },
  });

  // Qualifications are granted per specific machine (see the web/mobile
  // "Assign Machines to Operators" screens), not per machine_type+site —
  // matching this machine's own id is what determines who's assignable.
  const qualificationsQuery = useQuery({
    queryKey: ["machine-qualifications", "for-assign", row.machine],
    queryFn: async () => {
      const { data } = await api.get<Paginated<MachineTypeQualification>>("/machine-qualifications/", {
        params: { machine: row.machine, active: "true", page_size: 500 },
      });
      return data.results;
    },
  });

  const usersQuery = useQuery({
    queryKey: ["users", "lookup"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<UserSummary>>("/users/", { params: { page_size: 500 } });
      return data.results;
    },
  });

  const qualifiedOperators = (usersQuery.data ?? []).filter((u) =>
    qualificationsQuery.data?.some((q) => q.user === u.id),
  );

  const assignMutation = useMutation({
    mutationFn: async () =>
      api.post(`/machines/${row.machine}/assign/`, { operator: operatorId, section: sectionId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "machine-status"] });
      onClose();
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Failed to assign machine.";
      setError(message);
    },
  });

  return (
    <ModalSheet visible title={`Assign ${row.machine_type_name} ${row.fleet_number}`}>
      <Text style={styles.modalLabel}>Operator</Text>
      <ChipRow style={{ marginBottom: spacing.md }}>
        {qualifiedOperators.length === 0 && (
          <Text style={styles.muted}>No operator is qualified for this machine type at this site yet.</Text>
        )}
        {qualifiedOperators.map((u) => (
          <Chip
            key={u.id}
            label={[u.first_name, u.last_name].filter(Boolean).join(" ") || u.username}
            selected={operatorId === u.id}
            onPress={() => setOperatorId(u.id)}
          />
        ))}
      </ChipRow>

      <Text style={styles.modalLabel}>Section</Text>
      <ChipRow style={{ marginBottom: spacing.md }}>
        {(sectionsQuery.data ?? []).map((s) => (
          <Chip key={s.id} label={s.name} selected={sectionId === s.id} onPress={() => setSectionId(s.id)} />
        ))}
      </ChipRow>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <BigButton label="Cancel" variant="secondary" onPress={onClose} />
        </View>
        <View style={{ flex: 1 }}>
          <BigButton
            label={assignMutation.isPending ? "Assigning…" : "Assign"}
            onPress={() => {
              setError(null);
              assignMutation.mutate();
            }}
            disabled={!operatorId || !sectionId || assignMutation.isPending}
          />
        </View>
      </View>
    </ModalSheet>
  );
}

export default function ManageMachinesScreen() {
  const { siteId } = useManageSite();
  const [assigningRow, setAssigningRow] = useState<MachineStatusRow | null>(null);

  const statusQuery = useQuery({
    queryKey: ["dashboard", "machine-status", siteId],
    queryFn: async () => {
      const { data } = await api.get<MachineStatusRow[]>("/dashboard/machine-status/", { params: { site: siteId } });
      return data;
    },
    enabled: siteId !== null,
    refetchInterval: 30_000,
  });

  const rows = statusQuery.data ?? [];

  return (
    <Screen onRefresh={() => statusQuery.refetch()} refreshing={statusQuery.isRefetching}>
      <Text style={styles.title}>Machine Status</Text>

      {statusQuery.isLoading && <Text style={styles.muted}>Loading…</Text>}
      {statusQuery.isError && <Text style={styles.error}>Failed to load machine status.</Text>}
      {statusQuery.data && rows.length === 0 && <Text style={styles.muted}>No machines found for this site.</Text>}

      {rows.map((row) => (
        <View key={row.machine} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.machineName}>
              {row.machine_type_name} {row.fleet_number}
            </Text>
            <StatusPill label={STATUS_LABEL[row.status]} color={STATUS_COLOR[row.status]} />
          </View>
          {row.operator_label ? (
            <Text style={styles.operator}>
              Operated by <Text style={styles.operatorName}>{row.operator_label}</Text>
            </Text>
          ) : (
            <View style={styles.idleRow}>
              <Text style={styles.muted}>Idle — no active operator</Text>
              {row.status === "active" && siteId !== null && (
                <Pressable onPress={() => setAssigningRow(row)}>
                  <Text style={styles.assignLink}>Assign to Operator</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      ))}

      {assigningRow && siteId !== null && (
        <AssignModal row={assigningRow} siteId={siteId} onClose={() => setAssigningRow(null)} />
      )}
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
    fontSize: fontSize.body,
    color: colors.critical,
    fontWeight: "600",
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
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  machineName: {
    fontSize: fontSize.button,
    fontWeight: "700",
    color: colors.text,
  },
  operator: {
    fontSize: fontSize.label,
    color: colors.textMuted,
  },
  operatorName: {
    fontWeight: "700",
    color: colors.text,
  },
  idleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  assignLink: {
    fontSize: fontSize.label,
    fontWeight: "700",
    color: colors.primary,
  },
  modalLabel: {
    fontSize: fontSize.label,
    fontWeight: "700",
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
});
