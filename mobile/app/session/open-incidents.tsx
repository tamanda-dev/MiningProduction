import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "@/src/api/client";
import type { BreakdownIncident, Paginated } from "@/src/api/types";
import { useSession } from "@/src/auth/useSession";
import { BigButton } from "@/src/components/BigButton";
import { Screen } from "@/src/components/Screen";
import { colors, fontSize, radius, spacing } from "@/src/theme/theme";

const STATUS_LABEL: Record<string, string> = { open: "Open", in_progress: "In Progress" };
const STATUS_COLOR: Record<string, string> = { open: colors.critical, in_progress: colors.warning };

/** This screen is the one genuinely-online-dependent step in the
 * attend/resolve flow: it's how a second device/user (the assigned
 * artisan) learns a server-assigned incident id it never created itself
 * and so has no client_uuid for. Once an id is known, tapping through to
 * incident.tsx queues attend/resolve like any other offline-first screen.
 */
export default function OpenIncidentsScreen() {
  const { activeMachine } = useSession();
  const router = useRouter();

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["open-incidents", activeMachine?.site],
    queryFn: async () => {
      const { data } = await api.get<Paginated<BreakdownIncident>>("/breakdown-incidents/", {
        params: { site: activeMachine?.site, status__in: "open,in_progress", ordering: "-time_occurred" },
      });
      return data.results;
    },
    enabled: Boolean(activeMachine),
  });

  const incidents = data ?? [];

  return (
    <Screen onRefresh={() => refetch()} refreshing={isRefetching}>
      <Text style={styles.title}>Open Incidents</Text>

      <View style={{ marginBottom: spacing.md }}>
        <BigButton
          label="Quick Log Breakdown"
          onPress={() => router.push("/session/incident")}
          variant="danger"
        />
      </View>

      {isLoading && <Text style={styles.muted}>Loading…</Text>}
      {isError && <Text style={styles.error}>Failed to load incidents — check connectivity.</Text>}
      {data && incidents.length === 0 && <Text style={styles.muted}>No open or in-progress incidents.</Text>}

      {incidents.map((incident) => (
        <Pressable
          key={incident.id}
          onPress={() => router.push({ pathname: "/session/incident", params: { id: String(incident.id) } })}
          style={styles.card}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Incident #{incident.id}</Text>
            <View style={[styles.statusPill, { backgroundColor: STATUS_COLOR[incident.status] }]}>
              <Text style={styles.statusPillText}>{STATUS_LABEL[incident.status]}</Text>
            </View>
          </View>
          <Text style={styles.cardSubtitle}>{new Date(incident.time_occurred).toLocaleString()}</Text>
          {incident.description ? (
            <Text style={styles.cardBody} numberOfLines={2}>
              {incident.description}
            </Text>
          ) : null}
        </Pressable>
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
  statusPill: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  statusPillText: {
    color: colors.onStatus,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
});
