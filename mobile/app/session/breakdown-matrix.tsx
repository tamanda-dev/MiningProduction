import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { api } from "@/src/api/client";
import { enqueue } from "@/src/api/queue";
import type { BreakdownCause, HourlySlot, Paginated } from "@/src/api/types";
import { useSession } from "@/src/auth/useSession";
import { BigButton } from "@/src/components/BigButton";
import { Chip, ChipRow } from "@/src/components/Chip";
import { Screen } from "@/src/components/Screen";
import { TextField } from "@/src/components/TextField";
import { useSyncEngineContext } from "@/src/hooks/SyncEngineContext";
import { currentSlot } from "@/src/lib/timeSlots";
import { colors, fontSize, spacing } from "@/src/theme/theme";

export default function BreakdownMatrixScreen() {
  const { activeMachine } = useSession();
  const { refreshQueue, runSync } = useSyncEngineContext();
  const [selectedCauses, setSelectedCauses] = useState<number[]>([]);
  const [otherText, setOtherText] = useState("");
  const [downtimeMinutes, setDowntimeMinutes] = useState("");
  const [comments, setComments] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const slotsQuery = useQuery({
    queryKey: ["hourly-slots", activeMachine?.site],
    queryFn: async () => {
      const { data } = await api.get<Paginated<HourlySlot>>("/hourly-slots/", {
        params: { site: activeMachine?.site, active: true, page_size: 200 },
      });
      return data.results;
    },
    enabled: Boolean(activeMachine),
  });

  const causesQuery = useQuery({
    queryKey: ["breakdown-causes"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<BreakdownCause>>("/breakdown-causes/", {
        params: { active: true, page_size: 200 },
      });
      return data.results;
    },
    staleTime: 5 * 60_000,
  });

  const slot = useMemo(() => currentSlot(slotsQuery.data ?? []), [slotsQuery.data]);
  const causes = causesQuery.data ?? [];
  const hasOtherSelected = causes.some((c) => c.is_other && selectedCauses.includes(c.id));

  function toggleCause(id: number) {
    setSelectedCauses((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  async function handleSubmit() {
    if (!activeMachine || !slot) return;
    if (hasOtherSelected && !otherText.trim()) {
      setError("Describe the 'Other' cause.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await enqueue("hourly-breakdown-entries", {
        crusher: activeMachine.id,
        hourly_slot: slot.id,
        causes: selectedCauses,
        other_cause_text: otherText,
        downtime_minutes: downtimeMinutes ? Number(downtimeMinutes) : undefined,
        comments,
      });
      setSelectedCauses([]);
      setOtherText("");
      setDowntimeMinutes("");
      setComments("");
      await refreshQueue();
      Alert.alert("Saved", "Breakdown matrix entry saved on device and queued for sync.");
      runSync();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      {!slot && !slotsQuery.isLoading && (
        <Text style={styles.warning}>No configured hourly slot covers the current time for this site.</Text>
      )}
      {slot && (
        <Text style={styles.slotLabel}>
          Slot {slot.slot_index} ({slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)})
        </Text>
      )}

      <Text style={styles.sectionLabel}>Causes (select all that apply)</Text>
      <ChipRow style={{ marginBottom: spacing.sm }}>
        {causes.map((cause) => (
          <Chip
            key={cause.id}
            label={cause.name}
            selected={selectedCauses.includes(cause.id)}
            onPress={() => toggleCause(cause.id)}
            variant="danger"
          />
        ))}
      </ChipRow>

      {hasOtherSelected && (
        <>
          <Text style={styles.sectionLabel}>Describe "Other"</Text>
          <TextField value={otherText} onChangeText={setOtherText} multiline numberOfLines={2} />
        </>
      )}

      <Text style={styles.sectionLabel}>Downtime (minutes, optional)</Text>
      <TextField value={downtimeMinutes} onChangeText={setDowntimeMinutes} keyboardType="number-pad" />

      <Text style={styles.sectionLabel}>Comments</Text>
      <TextField value={comments} onChangeText={setComments} />

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={{ marginTop: spacing.md }}>
        <BigButton
          label="Save Breakdown Matrix Entry"
          onPress={handleSubmit}
          loading={submitting}
          disabled={!slot}
          variant="danger"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  slotLabel: {
    fontSize: fontSize.button,
    fontWeight: "800",
    color: colors.text,
    marginBottom: spacing.md,
  },
  warning: {
    fontSize: fontSize.label,
    color: colors.warning,
    fontWeight: "600",
    marginBottom: spacing.md,
  },
  sectionLabel: {
    fontSize: fontSize.label,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  error: {
    color: colors.critical,
    fontSize: fontSize.label,
    fontWeight: "600",
    marginTop: spacing.sm,
  },
});
