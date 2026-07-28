import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { api } from "@/src/api/client";
import type { AuditLogEntry, Paginated } from "@/src/api/types";
import { Screen } from "@/src/components/Screen";
import { TextField } from "@/src/components/TextField";
import { useManageSite } from "@/src/manage/useManageSite";
import { colors, fontSize, radius, shadow, spacing } from "@/src/theme/theme";

export default function ManageAuditLogScreen() {
  const { siteId } = useManageSite();
  const [action, setAction] = useState("");

  const logQuery = useQuery({
    queryKey: ["audit-log", siteId, action],
    queryFn: async () => {
      const { data } = await api.get<Paginated<AuditLogEntry>>("/audit-log/", {
        params: { site: siteId ?? undefined, action: action || undefined, page_size: 100 },
      });
      return data.results;
    },
  });

  const entries = logQuery.data ?? [];

  return (
    <Screen onRefresh={() => logQuery.refetch()} refreshing={logQuery.isRefetching}>
      <Text style={styles.title}>Audit Log</Text>

      <TextField
        placeholder="Filter by action (e.g. productionentry)"
        value={action}
        onChangeText={setAction}
        style={{ marginBottom: spacing.md }}
        autoCapitalize="none"
      />

      {logQuery.isLoading && <Text style={styles.muted}>Loading…</Text>}
      {logQuery.isError && <Text style={styles.error}>Failed to load audit log.</Text>}
      {logQuery.data && entries.length === 0 && <Text style={styles.muted}>No matching audit events.</Text>}

      {entries.map((entry) => (
        <View key={entry.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.action}>{entry.action}</Text>
            <Text style={styles.timestamp}>{new Date(entry.created_at).toLocaleString()}</Text>
          </View>
          <Text style={styles.meta}>
            {entry.content_type_label ?? "—"} #{entry.object_id ?? "—"} · {entry.actor_label ?? "System"}
          </Text>
          {entry.reason ? <Text style={styles.reason}>{entry.reason}</Text> : null}
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
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  action: {
    fontSize: fontSize.label,
    fontWeight: "700",
    color: colors.text,
    flexShrink: 1,
  },
  timestamp: {
    fontSize: 12,
    color: colors.textMuted,
  },
  meta: {
    fontSize: fontSize.label,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  reason: {
    fontSize: fontSize.label,
    color: colors.text,
    marginTop: spacing.xs,
    fontStyle: "italic",
  },
});
