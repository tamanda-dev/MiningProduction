import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StyleSheet, Text, View } from "react-native";
import { api } from "@/src/api/client";
import type { BreakdownLog, Paginated } from "@/src/api/types";
import { useAuth } from "@/src/auth/useAuth";
import { BigButton } from "@/src/components/BigButton";
import { Screen } from "@/src/components/Screen";
import { StatusPill } from "@/src/components/StatusPill";
import { useMachineLabels } from "@/src/hooks/useMachineLabels";
import { useManageSite } from "@/src/manage/useManageSite";
import { colors, fontSize, radius, shadow, spacing } from "@/src/theme/theme";

function useMyBreakdowns(status: "acknowledged" | "fixed", userId: number | undefined, siteId: number | null) {
  return useQuery({
    queryKey: ["breakdown-logs", "mine", status, userId],
    queryFn: async () => {
      const { data } = await api.get<Paginated<BreakdownLog>>("/breakdown-logs/", {
        params: { artisan: userId, repair_status: status, ordering: "-start_at", page_size: 100 },
      });
      return data.results;
    },
    enabled: userId !== undefined,
    refetchInterval: 30_000,
  });
}

/** Breakdowns this Artisan has claimed: "acknowledged" ones get a "Mark
 * Fixed" action (live POST, same reasoning as unclaimed.tsx's acknowledge —
 * repair_status is server-authoritative); "fixed" ones are read-only here,
 * shown so the Artisan can see what's still waiting on the reporting
 * Operator to confirm. `siteId` only exists to key the shared machine-label
 * lookup — an Artisan's assigned breakdowns are already scoped server-side
 * to sites they have access to, so it isn't used to filter the queries.
 */
export default function ArtisanMyRepairsScreen() {
  const { user } = useAuth();
  const { siteId } = useManageSite();
  const queryClient = useQueryClient();
  const { labels: machineLabels } = useMachineLabels(siteId);

  const acknowledgedQuery = useMyBreakdowns("acknowledged", user?.id, siteId);
  const fixedQuery = useMyBreakdowns("fixed", user?.id, siteId);

  const completeMutation = useMutation({
    mutationFn: async (logId: number) => api.post<BreakdownLog>(`/breakdown-logs/${logId}/complete/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["breakdown-logs"] });
    },
  });

  const inProgress = acknowledgedQuery.data ?? [];
  const awaitingConfirmation = fixedQuery.data ?? [];
  const isLoading = acknowledgedQuery.isLoading || fixedQuery.isLoading;
  const isError = acknowledgedQuery.isError || fixedQuery.isError;

  return (
    <Screen
      onRefresh={() => {
        acknowledgedQuery.refetch();
        fixedQuery.refetch();
      }}
      refreshing={acknowledgedQuery.isRefetching || fixedQuery.isRefetching}
    >
      <Text style={styles.title}>My Repairs</Text>

      {isLoading && <Text style={styles.muted}>Loading…</Text>}
      {isError && <Text style={styles.error}>Failed to load your repairs — check connectivity.</Text>}

      <Text style={styles.sectionLabel}>In Progress</Text>
      {!isLoading && inProgress.length === 0 && (
        <Text style={styles.muted}>Nothing claimed right now — acknowledge one from Unclaimed.</Text>
      )}
      {inProgress.map((log) => {
        const isCompleting = completeMutation.isPending && completeMutation.variables === log.id;
        const failed = completeMutation.isError && completeMutation.variables === log.id;
        return (
          <View key={log.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.machineName}>{machineLabels[log.machine] ?? `Machine #${log.machine}`}</Text>
              <StatusPill label="Acknowledged" color={colors.warning} />
            </View>
            <Text style={styles.cardSubtitle}>Reported {new Date(log.start_at).toLocaleString()}</Text>
            {log.description ? (
              <Text style={styles.cardBody} numberOfLines={3}>
                {log.description}
              </Text>
            ) : null}

            {failed && <Text style={styles.error}>Failed to mark fixed — try again.</Text>}

            <View style={{ marginTop: spacing.sm }}>
              <BigButton
                label={isCompleting ? "Saving…" : "Mark Fixed"}
                onPress={() => completeMutation.mutate(log.id)}
                disabled={completeMutation.isPending}
                variant="success"
              />
            </View>
          </View>
        );
      })}

      <Text style={styles.sectionLabel}>Awaiting Operator Confirmation</Text>
      {!isLoading && awaitingConfirmation.length === 0 && (
        <Text style={styles.muted}>Nothing awaiting confirmation.</Text>
      )}
      {awaitingConfirmation.map((log) => (
        <View key={log.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.machineName}>{machineLabels[log.machine] ?? `Machine #${log.machine}`}</Text>
            <StatusPill label="Fixed" color={colors.primary} />
          </View>
          <Text style={styles.cardSubtitle}>
            {log.end_at ? `Fixed ${new Date(log.end_at).toLocaleString()}` : "Fixed"}
          </Text>
          {log.description ? (
            <Text style={styles.cardBody} numberOfLines={3}>
              {log.description}
            </Text>
          ) : null}
        </View>
      ))}
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
  sectionLabel: {
    fontSize: fontSize.label,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    marginTop: spacing.md,
    marginBottom: spacing.sm,
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
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  machineName: {
    fontSize: fontSize.button,
    fontWeight: "700",
    color: colors.text,
    flexShrink: 1,
  },
  cardSubtitle: {
    fontSize: fontSize.label,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  cardBody: {
    fontSize: fontSize.body,
    color: colors.text,
    marginTop: spacing.sm,
  },
});
