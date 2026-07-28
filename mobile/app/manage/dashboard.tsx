import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { api } from "@/src/api/client";
import type { ActVsPlanRow, Paginated, ShiftInstance } from "@/src/api/types";
import { ChipRow, Chip } from "@/src/components/Chip";
import { Screen } from "@/src/components/Screen";
import { useManageSite } from "@/src/manage/useManageSite";
import { colors, fontSize, radius, shadow, spacing } from "@/src/theme/theme";

function pctVarColor(pctVar: number | null): string {
  if (pctVar === null) return colors.textMuted;
  if (pctVar >= 0) return colors.good;
  if (pctVar >= -10) return colors.warning;
  return colors.critical;
}

export default function ManageDashboardScreen() {
  const { siteId, isLoading: siteLoading } = useManageSite();
  const [shiftInstanceId, setShiftInstanceId] = useState<number | null>(null);

  const shiftInstancesQuery = useQuery({
    queryKey: ["shift-instances", siteId],
    queryFn: async () => {
      const { data } = await api.get<Paginated<ShiftInstance>>("/shift-instances/", {
        params: { site: siteId, ordering: "-date", page_size: 20 },
      });
      return data.results;
    },
    enabled: siteId !== null,
  });

  const shiftInstances = shiftInstancesQuery.data ?? [];

  useEffect(() => {
    if (!shiftInstanceId && shiftInstances.length > 0) {
      const open = shiftInstances.find((si) => si.status === "open");
      setShiftInstanceId((open ?? shiftInstances[0]).id);
    }
  }, [shiftInstances, shiftInstanceId]);

  const summaryQuery = useQuery({
    queryKey: ["dashboard", "summary", shiftInstanceId],
    queryFn: async () => {
      const { data } = await api.get<ActVsPlanRow[]>("/dashboard/summary/", {
        params: { shift_instance: shiftInstanceId },
      });
      return data;
    },
    enabled: shiftInstanceId !== null,
  });

  const rows = summaryQuery.data ?? [];

  return (
    <Screen onRefresh={() => summaryQuery.refetch()} refreshing={summaryQuery.isRefetching}>
      <Text style={styles.title}>Live Shift View</Text>

      {siteLoading && <Text style={styles.muted}>Loading sites…</Text>}

      {shiftInstances.length > 1 && (
        <ChipRow style={{ marginBottom: spacing.md }}>
          {shiftInstances.map((si) => (
            <Chip
              key={si.id}
              label={`${si.date} — ${si.shift_name}`}
              selected={si.id === shiftInstanceId}
              onPress={() => setShiftInstanceId(si.id)}
            />
          ))}
        </ChipRow>
      )}

      {!shiftInstancesQuery.isLoading && shiftInstances.length === 0 && (
        <Text style={styles.muted}>No shift instances found for this site yet.</Text>
      )}

      {summaryQuery.isLoading && <Text style={styles.muted}>Loading…</Text>}
      {summaryQuery.isError && <Text style={styles.error}>Failed to load the live shift summary.</Text>}

      {summaryQuery.data && rows.length === 0 && (
        <Text style={styles.muted}>No production entries logged for this shift yet.</Text>
      )}

      {rows.map((row) => (
        <View key={`${row.section}-${row.parameter}`} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.sectionName}>{row.section_name}</Text>
            {row.pct_var !== null && (
              <Text style={[styles.pctVar, { color: pctVarColor(row.pct_var) }]}>
                {row.pct_var >= 0 ? "+" : ""}
                {row.pct_var.toFixed(1)}%
              </Text>
            )}
          </View>
          <Text style={styles.paramName}>{row.parameter_name}</Text>
          <View style={styles.figures}>
            <View>
              <Text style={styles.figureLabel}>Act</Text>
              <Text style={styles.figureValue}>
                {row.act.toLocaleString()} {row.uom}
              </Text>
            </View>
            <View>
              <Text style={styles.figureLabel}>Plan</Text>
              <Text style={styles.figureValueMuted}>{row.plan !== null ? `${row.plan.toLocaleString()} ${row.uom}` : "—"}</Text>
            </View>
            <View>
              <Text style={styles.figureLabel}>Var</Text>
              <Text style={styles.figureValueMuted}>{row.var !== null ? row.var.toLocaleString() : "—"}</Text>
            </View>
          </View>
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
    alignItems: "center",
  },
  sectionName: {
    fontSize: fontSize.label,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
  },
  pctVar: {
    fontSize: fontSize.body,
    fontWeight: "800",
  },
  paramName: {
    fontSize: fontSize.button,
    fontWeight: "700",
    color: colors.text,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  figures: {
    flexDirection: "row",
    gap: spacing.lg,
  },
  figureLabel: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  figureValue: {
    fontSize: fontSize.body,
    fontWeight: "800",
    color: colors.text,
  },
  figureValueMuted: {
    fontSize: fontSize.body,
    fontWeight: "600",
    color: colors.textMuted,
  },
});
