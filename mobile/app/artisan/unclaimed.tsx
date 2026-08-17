import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StyleSheet, Text, View } from "react-native";
import { api } from "@/src/api/client";
import type { BreakdownLog, Paginated } from "@/src/api/types";
import { BigButton } from "@/src/components/BigButton";
import { Screen } from "@/src/components/Screen";
import { StatusPill } from "@/src/components/StatusPill";
import { useMachineLabels } from "@/src/hooks/useMachineLabels";
import { useManageSite } from "@/src/manage/useManageSite";
import { colors, fontSize, radius, shadow, spacing } from "@/src/theme/theme";

const SEVERITY_COLOR: Record<string, string> = {
  low: colors.warning,
  medium: colors.serious,
  high: colors.critical,
};

/** Unclaimed general-fleet breakdowns at the Artisan's site — "first to
 * acknowledge gets it" per entries/services.py's acknowledge_breakdown, so
 * this is a live, synchronous POST (not the offline queue): it depends on
 * server-side state (repair_status == "reported") that can flip out from
 * under a stale local copy the moment another Artisan claims it first.
 */
export default function ArtisanUnclaimedScreen() {
  const { siteId } = useManageSite();
  const queryClient = useQueryClient();
  const { labels: machineLabels } = useMachineLabels(siteId);

  const logsQuery = useQuery({
    queryKey: ["breakdown-logs", "unclaimed", siteId],
    queryFn: async () => {
      const { data } = await api.get<Paginated<BreakdownLog>>("/breakdown-logs/", {
        params: { site: siteId, repair_status: "reported", ordering: "-start_at", page_size: 100 },
      });
      return data.results;
    },
    enabled: siteId !== null,
    refetchInterval: 30_000,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (logId: number) => api.post<BreakdownLog>(`/breakdown-logs/${logId}/acknowledge/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["breakdown-logs"] });
    },
  });

  const logs = logsQuery.data ?? [];

  return (
    <Screen onRefresh={() => logsQuery.refetch()} refreshing={logsQuery.isRefetching}>
      <Text style={styles.title}>Unclaimed Breakdowns</Text>

      {siteId === null && <Text style={styles.muted}>No site access has been granted to your account yet.</Text>}
      {logsQuery.isLoading && <Text style={styles.muted}>Loading…</Text>}
      {logsQuery.isError && <Text style={styles.error}>Failed to load breakdowns — check connectivity.</Text>}
      {logsQuery.data && logs.length === 0 && (
        <Text style={styles.muted}>No unclaimed breakdowns at this site right now.</Text>
      )}

      {logs.map((log) => {
        const isAcknowledging = acknowledgeMutation.isPending && acknowledgeMutation.variables === log.id;
        const failed = acknowledgeMutation.isError && acknowledgeMutation.variables === log.id;
        return (
          <View key={log.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.machineName}>{machineLabels[log.machine] ?? `Machine #${log.machine}`}</Text>
              {log.severity ? (
                <StatusPill label={log.severity.toUpperCase()} color={SEVERITY_COLOR[log.severity]} />
              ) : null}
            </View>
            <Text style={styles.cardSubtitle}>Reported {new Date(log.start_at).toLocaleString()}</Text>
            {log.description ? (
              <Text style={styles.cardBody} numberOfLines={3}>
                {log.description}
              </Text>
            ) : null}

            {failed && <Text style={styles.error}>Failed to acknowledge — someone may have already claimed it.</Text>}

            <View style={{ marginTop: spacing.sm }}>
              <BigButton
                label={isAcknowledging ? "Acknowledging…" : "Acknowledge"}
                onPress={() => acknowledgeMutation.mutate(log.id)}
                disabled={acknowledgeMutation.isPending}
              />
            </View>
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
