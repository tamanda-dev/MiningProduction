import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StyleSheet, Text, View } from "react-native";
import { api } from "@/src/api/client";
import type { BreakdownIncident, Paginated, UserSummary } from "@/src/api/types";
import { ChipRow, Chip } from "@/src/components/Chip";
import { Screen } from "@/src/components/Screen";
import { StatusPill } from "@/src/components/StatusPill";
import { useManageSite } from "@/src/manage/useManageSite";
import { colors, fontSize, radius, shadow, spacing } from "@/src/theme/theme";

const STATUS_LABEL: Record<string, string> = { open: "Open", in_progress: "In Progress" };
const STATUS_COLOR: Record<string, string> = { open: colors.critical, in_progress: colors.warning };

export default function ManageIncidentsScreen() {
  const { siteId } = useManageSite();
  const queryClient = useQueryClient();

  const incidentsQuery = useQuery({
    queryKey: ["breakdown-incidents", "open", siteId],
    queryFn: async () => {
      const { data } = await api.get<Paginated<BreakdownIncident>>("/breakdown-incidents/", {
        params: { site: siteId, status__in: "open,in_progress", ordering: "-time_occurred" },
      });
      return data.results;
    },
    enabled: siteId !== null,
    refetchInterval: 30_000,
  });

  const artisansQuery = useQuery({
    queryKey: ["users", "artisans"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<UserSummary>>("/users/", {
        params: { maintenance_technician: "true", page_size: 200 },
      });
      return data.results;
    },
  });

  const assignMutation = useMutation({
    mutationFn: async ({ incidentId, artisanId }: { incidentId: number; artisanId: number }) =>
      api.post(`/breakdown-incidents/${incidentId}/assign/`, { artisan: artisanId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["breakdown-incidents", "open"] }),
  });

  const incidents = incidentsQuery.data ?? [];
  const artisans = artisansQuery.data ?? [];
  const artisanLabel = (id: number | null) => {
    if (!id) return null;
    const a = artisans.find((u) => u.id === id);
    return a ? [a.first_name, a.last_name].filter(Boolean).join(" ") || a.username : null;
  };

  return (
    <Screen onRefresh={() => incidentsQuery.refetch()} refreshing={incidentsQuery.isRefetching}>
      <Text style={styles.title}>Open Incidents</Text>

      {incidentsQuery.isLoading && <Text style={styles.muted}>Loading…</Text>}
      {incidentsQuery.isError && <Text style={styles.error}>Failed to load incidents.</Text>}
      {incidentsQuery.data && incidents.length === 0 && (
        <Text style={styles.muted}>No open or in-progress incidents.</Text>
      )}

      {incidents.map((incident) => {
        const isAssigning = assignMutation.isPending && assignMutation.variables?.incidentId === incident.id;
        return (
          <View key={incident.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Incident #{incident.id}</Text>
              <StatusPill label={STATUS_LABEL[incident.status]} color={STATUS_COLOR[incident.status]} />
            </View>
            <Text style={styles.cardSubtitle}>{new Date(incident.time_occurred).toLocaleString()}</Text>
            {incident.description ? (
              <Text style={styles.cardBody} numberOfLines={2}>
                {incident.description}
              </Text>
            ) : null}

            <Text style={styles.artisanLabel}>
              Artisan: <Text style={styles.artisanName}>{artisanLabel(incident.artisan) ?? "Unassigned"}</Text>
            </Text>
            <ChipRow style={{ marginTop: spacing.xs }}>
              {artisans.map((a) => (
                <Chip
                  key={a.id}
                  label={[a.first_name, a.last_name].filter(Boolean).join(" ") || a.username}
                  selected={incident.artisan === a.id}
                  onPress={() => {
                    if (!isAssigning) assignMutation.mutate({ incidentId: incident.id, artisanId: a.id });
                  }}
                />
              ))}
            </ChipRow>
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
  },
  cardTitle: {
    fontSize: fontSize.body,
    fontWeight: "700",
    color: colors.text,
  },
  cardSubtitle: {
    fontSize: fontSize.label,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  cardBody: {
    fontSize: fontSize.label,
    color: colors.text,
    marginTop: spacing.xs,
  },
  artisanLabel: {
    fontSize: fontSize.label,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  artisanName: {
    fontWeight: "700",
    color: colors.text,
  },
});
