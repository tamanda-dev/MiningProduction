import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { api } from "@/src/api/client";
import type { Paginated, ShiftInstance } from "@/src/api/types";
import { useAuth } from "@/src/auth/useAuth";
import { BigButton } from "@/src/components/BigButton";
import { Screen } from "@/src/components/Screen";
import { StatusPill } from "@/src/components/StatusPill";
import { useManageSite } from "@/src/manage/useManageSite";
import { colors, fontSize, radius, shadow, spacing } from "@/src/theme/theme";

const STATUS_COLOR: Record<string, string> = {
  open: colors.good,
  closed: colors.warning,
  approved: colors.textMuted,
};

export default function ManageShiftInstancesScreen() {
  const { hasRole } = useAuth();
  const { siteId } = useManageSite();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["shift-instances", siteId],
    queryFn: async () => {
      const { data } = await api.get<Paginated<ShiftInstance>>("/shift-instances/", {
        params: { site: siteId ?? undefined, page_size: 100, ordering: "-date" },
      });
      return data.results;
    },
    enabled: siteId !== null,
  });

  const closeMutation = useMutation({
    mutationFn: async (id: number) => api.post(`/shift-instances/${id}/close/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shift-instances"] }),
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail ?? "Failed to close shift.");
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => api.post(`/shift-instances/${id}/approve/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shift-instances"] }),
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail ?? "Failed to approve shift.");
    },
  });

  const rows = query.data ?? [];

  return (
    <Screen onRefresh={() => query.refetch()} refreshing={query.isRefetching}>
      <Text style={styles.title}>Shift Instances</Text>

      {error && <Text style={styles.error}>{error}</Text>}
      {query.isLoading && <Text style={styles.muted}>Loading…</Text>}
      {query.isError && <Text style={styles.error}>Failed to load shift instances.</Text>}
      {query.data && rows.length === 0 && (
        <Text style={styles.muted}>No shift instances yet — they're created automatically as shifts start.</Text>
      )}

      {rows.map((row) => {
        const closing = closeMutation.isPending && closeMutation.variables === row.id;
        const approving = approveMutation.isPending && approveMutation.variables === row.id;
        return (
          <View key={row.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>
                {row.date} — {row.shift_name}
              </Text>
              <StatusPill label={row.status} color={STATUS_COLOR[row.status] ?? colors.textMuted} />
            </View>
            {hasRole("supervisor") && row.status === "open" && (
              <View style={{ marginTop: spacing.sm }}>
                <BigButton
                  label={closing ? "Closing…" : "Close Shift"}
                  variant="secondary"
                  disabled={closing}
                  onPress={() => {
                    setError(null);
                    closeMutation.mutate(row.id);
                  }}
                />
              </View>
            )}
            {hasRole("supervisor") && row.status === "closed" && (
              <View style={{ marginTop: spacing.sm }}>
                <BigButton
                  label={approving ? "Approving…" : "Approve Shift"}
                  variant="success"
                  disabled={approving}
                  onPress={() => {
                    setError(null);
                    approveMutation.mutate(row.id);
                  }}
                />
              </View>
            )}
          </View>
        );
      })}
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
    marginBottom: spacing.sm,
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
    gap: spacing.sm,
  },
  cardTitle: {
    fontSize: fontSize.button,
    fontWeight: "700",
    color: colors.text,
    flexShrink: 1,
  },
});
