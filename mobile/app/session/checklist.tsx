import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "@/src/api/client";
import { enqueue } from "@/src/api/queue";
import type { ChecklistItem, HourlySlot, Paginated } from "@/src/api/types";
import { useSession } from "@/src/auth/useSession";
import { BigButton } from "@/src/components/BigButton";
import { Screen } from "@/src/components/Screen";
import { useSyncEngineContext } from "@/src/hooks/SyncEngineContext";
import { colors, fontSize, MIN_TAP_TARGET, radius, spacing } from "@/src/theme/theme";

/** Finds the HourlySlot whose [start_time, end_time) window contains
 * `now`, mirroring crusher_ops.services.current_slot_for on the backend —
 * this is purely a display/default-selection convenience; the server
 * re-resolves and validates the slot on submit regardless.
 */
function currentSlot(slots: HourlySlot[]): HourlySlot | null {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  for (const slot of slots) {
    const start = toMinutes(slot.start_time);
    const end = toMinutes(slot.end_time);
    const isOvernight = end <= start;
    if (isOvernight ? nowMinutes >= start || nowMinutes < end : nowMinutes >= start && nowMinutes < end) {
      return slot;
    }
  }
  return null;
}

export default function ChecklistScreen() {
  const { activeMachine } = useSession();
  const { refreshQueue, runSync } = useSyncEngineContext();
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [notes, setNotes] = useState("");
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

  const itemsQuery = useQuery({
    queryKey: ["checklist-items"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<ChecklistItem>>("/checklist-items/", {
        params: { active: true, page_size: 200 },
      });
      return data.results;
    },
    staleTime: 5 * 60_000,
  });

  const slot = useMemo(() => currentSlot(slotsQuery.data ?? []), [slotsQuery.data]);
  const items = itemsQuery.data ?? [];

  async function handleSubmit() {
    if (!activeMachine || !slot) return;
    setSubmitting(true);
    try {
      for (const item of items) {
        await enqueue("hourly-checklist-entries", {
          crusher: activeMachine.id,
          hourly_slot: slot.id,
          checklist_item: item.id,
          is_completed: Boolean(checked[item.id]),
          notes,
        });
      }
      setChecked({});
      setNotes("");
      await refreshQueue();
      Alert.alert("Saved", "Checklist saved on device and queued for sync.");
      runSync();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      {!slot && !slotsQuery.isLoading && (
        <Text style={styles.warning}>
          No configured hourly slot covers the current time for this site — ask an admin to check Hourly Slots
          config.
        </Text>
      )}

      {slot && (
        <Text style={styles.slotLabel}>
          Slot {slot.slot_index} ({slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)})
        </Text>
      )}

      {items.map((item) => {
        const isChecked = Boolean(checked[item.id]);
        return (
          <Pressable
            key={item.id}
            onPress={() => setChecked((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
            style={styles.itemRow}
          >
            <View style={[styles.checkbox, isChecked && styles.checkboxChecked]} />
            <Text style={styles.itemLabel}>{item.name}</Text>
          </Pressable>
        );
      })}

      <Text style={styles.sectionLabel}>Notes</Text>
      <TextInput value={notes} onChangeText={setNotes} style={styles.input} multiline numberOfLines={3} />

      <View style={{ marginTop: spacing.md }}>
        <BigButton
          label="Save Checklist"
          onPress={handleSubmit}
          loading={submitting}
          disabled={!slot || items.length === 0}
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
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: MIN_TAP_TARGET,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.sm,
  },
  checkboxChecked: {
    backgroundColor: colors.good,
    borderColor: colors.good,
  },
  itemLabel: {
    fontSize: fontSize.body,
    color: colors.text,
    fontWeight: "600",
  },
  sectionLabel: {
    fontSize: fontSize.label,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.body,
    color: colors.text,
    backgroundColor: colors.background,
    minHeight: 90,
    textAlignVertical: "top",
  },
});
