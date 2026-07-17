import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSyncEngineContext } from "@/src/hooks/SyncEngineContext";
import { colors, fontSize, radius, spacing } from "@/src/theme/theme";

export function SyncStatusBar({ onPressConflicts }: { onPressConflicts?: () => void }) {
  const { isOnline, isSyncing, pendingCount, conflictCount, runSync } = useSyncEngineContext();

  const statusColor = !isOnline ? colors.textMuted : conflictCount > 0 ? colors.critical : pendingCount > 0 ? colors.warning : colors.good;
  const statusLabel = !isOnline
    ? "Offline — entries saved on device"
    : isSyncing
      ? "Syncing…"
      : conflictCount > 0
        ? `${conflictCount} conflict${conflictCount > 1 ? "s" : ""} need review`
        : pendingCount > 0
          ? `${pendingCount} entr${pendingCount > 1 ? "ies" : "y"} waiting to sync`
          : "All entries synced";

  return (
    <Pressable
      onPress={conflictCount > 0 ? onPressConflicts : () => runSync({ force: true })}
      style={styles.container}
      accessibilityRole="button"
    >
      <View style={[styles.dot, { backgroundColor: statusColor }]} />
      <Text style={styles.label}>{statusLabel}</Text>
      {isSyncing && <ActivityIndicator size="small" style={{ marginLeft: spacing.sm }} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.sm,
  },
  label: {
    fontSize: fontSize.label,
    color: colors.text,
    fontWeight: "600",
    flexShrink: 1,
  },
});
