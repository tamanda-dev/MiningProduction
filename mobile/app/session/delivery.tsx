import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { api } from "@/src/api/client";
import { enqueue, type QueueItem } from "@/src/api/queue";
import type { DeliveryDestination, Paginated } from "@/src/api/types";
import { useSession } from "@/src/auth/useSession";
import { BigButton } from "@/src/components/BigButton";
import { Chip, ChipRow } from "@/src/components/Chip";
import { Screen } from "@/src/components/Screen";
import { StatusPill } from "@/src/components/StatusPill";
import { TextField } from "@/src/components/TextField";
import { useSyncEngineContext } from "@/src/hooks/SyncEngineContext";
import { colors, fontSize, spacing } from "@/src/theme/theme";

const QUEUE_STATUS_COLOR: Record<QueueItem["status"], string> = {
  pending: colors.warning,
  synced: colors.good,
  failed: colors.critical,
  conflict: colors.critical,
};

export default function DeliveryScreen() {
  const { activeMachine } = useSession();
  const { queue, runSync, refreshQueue } = useSyncEngineContext();
  const [destinationId, setDestinationId] = useState<number | null>(null);
  const [tonnes, setTonnes] = useState("");
  const [tripCount, setTripCount] = useState("1");
  const [comments, setComments] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const recentItems = queue
    .filter((i) => i.endpoint === "delivery-entries")
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 6);

  const destinationsQuery = useQuery({
    queryKey: ["delivery-destinations"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<DeliveryDestination>>("/delivery-destinations/", {
        params: { active: true, page_size: 200 },
      });
      return data.results;
    },
    staleTime: 5 * 60_000,
  });

  async function handleSubmit() {
    if (!activeMachine) return;
    if (!destinationId) {
      setError("Pick a destination.");
      return;
    }
    if (!tonnes || Number(tonnes) <= 0) {
      setError("Enter the tonnes delivered.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await enqueue("delivery-entries", {
        delivery_destination: destinationId,
        section: activeMachine.current_section ?? undefined,
        tonnes,
        trip_count: Number(tripCount) || 1,
        comments,
      });
      setDestinationId(null);
      setTonnes("");
      setTripCount("1");
      setComments("");
      await refreshQueue();
      Alert.alert("Saved", "Delivery saved on device and queued for sync.");
      runSync();
    } finally {
      setSubmitting(false);
    }
  }

  const destinations = destinationsQuery.data ?? [];

  return (
    <Screen>
      <Text style={styles.sectionLabel}>Destination</Text>
      <ChipRow style={{ marginBottom: spacing.sm }}>
        {destinations.map((dest) => (
          <Chip
            key={dest.id}
            label={dest.name}
            selected={destinationId === dest.id}
            onPress={() => setDestinationId(dest.id)}
          />
        ))}
        {destinations.length === 0 && (
          <Text style={styles.muted}>No delivery destinations configured yet.</Text>
        )}
      </ChipRow>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionLabel}>Tonnes</Text>
          <TextField value={tonnes} onChangeText={setTonnes} keyboardType="decimal-pad" placeholder="e.g. 42.5" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionLabel}>Trip Count</Text>
          <TextField value={tripCount} onChangeText={setTripCount} keyboardType="number-pad" />
        </View>
      </View>

      <Text style={styles.sectionLabel}>Comments</Text>
      <TextField value={comments} onChangeText={setComments} />

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={{ marginTop: spacing.md }}>
        <BigButton label="Save Delivery" onPress={handleSubmit} loading={submitting} />
      </View>

      {recentItems.length > 0 && (
        <View style={styles.recent}>
          <Text style={styles.sectionLabel}>Recent Deliveries (this session)</Text>
          {recentItems.map((item) => (
            <View key={item.clientUuid} style={styles.recentRow}>
              <Text style={styles.recentText} numberOfLines={1}>
                {String(item.payload.tonnes ?? "—")} t — {String(item.payload.trip_count ?? 1)} trip(s)
              </Text>
              <StatusPill label={item.status} color={QUEUE_STATUS_COLOR[item.status]} />
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: fontSize.label,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  muted: {
    fontSize: fontSize.body,
    color: colors.textMuted,
  },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  error: {
    color: colors.critical,
    fontSize: fontSize.label,
    fontWeight: "600",
    marginTop: spacing.sm,
  },
  recent: {
    marginTop: spacing.lg,
  },
  recentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: spacing.sm,
  },
  recentText: {
    fontSize: fontSize.body,
    color: colors.text,
    flex: 1,
  },
});
