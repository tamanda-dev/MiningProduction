import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "@/src/api/client";
import { enqueue, type QueueItem } from "@/src/api/queue";
import type { EntryType, FormSchemaParameter, TimeSlot } from "@/src/api/types";
import { validateAll } from "@/src/api/validation";
import { useSession } from "@/src/auth/useSession";
import { BigButton } from "@/src/components/BigButton";
import { DynamicField, type FieldValue } from "@/src/components/DynamicField";
import { Screen } from "@/src/components/Screen";
import { StatusPill } from "@/src/components/StatusPill";
import { useSyncEngineContext } from "@/src/hooks/SyncEngineContext";
import { colors, fontSize, MIN_TAP_TARGET, radius, spacing } from "@/src/theme/theme";

const QUEUE_STATUS_COLOR: Record<QueueItem["status"], string> = {
  pending: colors.warning,
  synced: colors.good,
  failed: colors.critical,
  conflict: colors.critical,
};

function currentSlotIndex(slots: TimeSlot[]): number | null {
  const now = Date.now();
  const match = slots.find((s) => new Date(s.start_at).getTime() <= now && now < new Date(s.end_at).getTime());
  return match ? match.slot_index : (slots.at(-1)?.slot_index ?? null);
}

export default function EntryScreen() {
  const { activeAssignment, activeMachine } = useSession();
  const { queue, runSync, refreshQueue } = useSyncEngineContext();
  const [entryType, setEntryType] = useState<EntryType>("hourly");
  const [slotIndex, setSlotIndex] = useState<number | null>(null);
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [comments, setComments] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const recentItems = queue
    .filter((i) => i.endpoint === "production-entries")
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 8);

  const schemaQuery = useQuery({
    queryKey: ["form-schema", activeMachine?.machine_type, activeAssignment?.section],
    queryFn: async () => {
      const { data } = await api.get<FormSchemaParameter[]>(
        `/machine-types/${activeMachine!.machine_type}/form-schema/`,
        { params: { section: activeAssignment!.section } },
      );
      return data;
    },
    enabled: Boolean(activeMachine && activeAssignment),
    staleTime: 5 * 60_000,
  });

  const slotsQuery = useQuery({
    queryKey: ["time-slots", activeAssignment?.shift_instance],
    queryFn: async () => {
      const { data } = await api.get<TimeSlot[]>(`/shift-instances/${activeAssignment!.shift_instance}/time-slots/`);
      return data;
    },
    enabled: Boolean(activeAssignment),
    staleTime: 5 * 60_000,
  });

  const slots = slotsQuery.data ?? [];
  // "Shift Total" is not a second place to type the same figure — see
  // dashboard/src/pages/operate/OperateEntryPage.tsx for the full
  // rationale (mirrored here). Only scope="shift" parameters belong on
  // this tab; the backend enforces the same split independently.
  const parameters = (schemaQuery.data ?? []).filter((p) =>
    entryType === "shift_total" ? p.scope === "shift" : p.scope !== "shift",
  );

  useEffect(() => {
    if (slotIndex === null && slots.length > 0) {
      setSlotIndex(currentSlotIndex(slots));
    }
  }, [slots, slotIndex]);

  function updateValue(code: string, value: FieldValue) {
    setValues((prev) => ({ ...prev, [code]: value }));
  }

  async function handleSubmit() {
    if (!activeAssignment) return;
    const validationErrors = validateAll(parameters, values);
    if (entryType === "hourly" && slotIndex === null) {
      validationErrors.push("Select a time slot.");
    }
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors([]);
    setSubmitting(true);
    try {
      await enqueue("production-entries", {
        machine_assignment: activeAssignment.id,
        entry_type: entryType,
        slot_index: entryType === "hourly" ? slotIndex : undefined,
        comments,
        values: parameters
          .filter((p) => values[p.code] !== undefined && values[p.code] !== "")
          .map((p) => ({ parameter: p.code, value: values[p.code] })),
      });
      setValues({});
      setComments("");
      await refreshQueue();
      Alert.alert("Saved", "Entry saved on device and queued for sync.");
      runSync();
    } finally {
      setSubmitting(false);
    }
  }

  if (!activeMachine || !activeAssignment) return null;

  return (
    <Screen>
      <View style={styles.toggleRow}>
        {(["hourly", "shift_total"] as const).map((type) => (
          <Pressable
            key={type}
            onPress={() => setEntryType(type)}
            style={[styles.toggleButton, entryType === type && styles.toggleButtonActive]}
          >
            <Text style={[styles.toggleText, entryType === type && styles.toggleTextActive]}>
              {type === "hourly" ? "Hourly" : "Shift Total"}
            </Text>
          </Pressable>
        ))}
      </View>

      {entryType === "hourly" && (
        <View style={styles.field}>
          <Text style={styles.sectionLabel}>Time Slot</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {slots.map((slot) => {
                const selected = slotIndex === slot.slot_index;
                return (
                  <Pressable
                    key={slot.slot_index}
                    onPress={() => setSlotIndex(slot.slot_index)}
                    style={[styles.slotChip, selected && styles.slotChipSelected]}
                  >
                    <Text style={[styles.slotText, selected && styles.slotTextSelected]}>
                      {new Date(slot.start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}

      <View style={styles.divider} />

      {schemaQuery.isLoading && (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
      )}
      {parameters.map((param) => (
        <DynamicField
          key={param.code}
          parameter={param}
          value={values[param.code]}
          onChange={(v) => updateValue(param.code, v)}
        />
      ))}

      <View style={styles.field}>
        <Text style={styles.sectionLabel}>Comments</Text>
        <DynamicField
          parameter={{
            id: -1,
            code: "__comments",
            name: "Comments",
            scope: "shift",
            data_type: "text",
            uom: null,
            is_required: false,
            min_value: null,
            max_value: null,
            choices: [],
          }}
          value={comments}
          onChange={(v) => setComments(String(v ?? ""))}
        />
      </View>

      {errors.length > 0 && (
        <View style={styles.errorBox}>
          {errors.map((e) => (
            <Text key={e} style={styles.errorText}>
              • {e}
            </Text>
          ))}
        </View>
      )}

      <BigButton label="Save Entry" onPress={handleSubmit} loading={submitting} />

      {recentItems.length > 0 && (
        <View style={styles.recent}>
          <Text style={styles.sectionLabel}>Recent Entries (this session)</Text>
          {recentItems.map((item) => (
            <View key={item.clientUuid} style={styles.recentRow}>
              <Text style={styles.recentText}>
                {(item.payload.entry_type as string) === "hourly"
                  ? `Slot #${item.payload.slot_index}`
                  : "Shift total"}
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
  toggleRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  toggleButton: {
    flex: 1,
    minHeight: MIN_TAP_TARGET - 8,
    borderWidth: 2,
    borderColor: colors.borderLight,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  toggleText: {
    fontSize: fontSize.body,
    fontWeight: "700",
    color: colors.textMuted,
  },
  toggleTextActive: {
    color: colors.primary,
  },
  field: {
    marginBottom: spacing.md,
  },
  sectionLabel: {
    fontSize: fontSize.label,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  slotChip: {
    minHeight: MIN_TAP_TARGET - 12,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.borderLight,
    borderRadius: radius.md,
  },
  slotChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  slotText: {
    fontSize: fontSize.label,
    fontWeight: "700",
    color: colors.text,
  },
  slotTextSelected: {
    color: colors.primary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.md,
  },
  errorBox: {
    backgroundColor: "#FCE8E8",
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    color: colors.critical,
    fontSize: fontSize.label,
    fontWeight: "600",
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
  },
  recentText: {
    fontSize: fontSize.body,
    color: colors.text,
  },
});
