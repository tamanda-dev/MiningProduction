import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "@/src/api/client";
import { enqueue, type QueueItem } from "@/src/api/queue";
import type { DowntimeReasonCode, Paginated } from "@/src/api/types";
import { useSession } from "@/src/auth/useSession";
import { BigButton } from "@/src/components/BigButton";
import { Screen } from "@/src/components/Screen";
import { useSyncEngineContext } from "@/src/hooks/SyncEngineContext";
import { colors, fontSize, MIN_TAP_TARGET, radius, spacing } from "@/src/theme/theme";

const SEVERITIES = ["low", "medium", "high"] as const;
type Severity = (typeof SEVERITIES)[number];

export default function BreakdownScreen() {
  const { activeMachine } = useSession();
  const { queue, runSync, refreshQueue } = useSyncEngineContext();
  const [reasonCodeId, setReasonCodeId] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [alreadyResolved, setAlreadyResolved] = useState(false);
  const [comments, setComments] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const recentItems = queue
    .filter((i) => i.endpoint === "breakdown-logs")
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 6);

  const reasonsQuery = useQuery({
    queryKey: ["downtime-reason-codes"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<DowntimeReasonCode>>("/downtime-reason-codes/", {
        params: { active: true, page_size: 200 },
      });
      return data.results;
    },
    staleTime: 5 * 60_000,
  });

  async function handleSubmit() {
    if (!activeMachine) return;
    if (!description.trim() && !reasonCodeId) {
      setError("Provide a reason code or a description of the fault.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const now = new Date();
      await enqueue("breakdown-logs", {
        machine: activeMachine.id,
        reason_code: reasonCodeId ?? undefined,
        description,
        severity,
        comments,
        start_at: now.toISOString(),
        end_at: alreadyResolved ? now.toISOString() : undefined,
      });
      setReasonCodeId(null);
      setDescription("");
      setComments("");
      setAlreadyResolved(false);
      await refreshQueue();
      Alert.alert("Saved", "Breakdown log saved on device and queued for sync.");
      runSync();
    } finally {
      setSubmitting(false);
    }
  }

  const reasons = reasonsQuery.data ?? [];

  return (
    <Screen>
      <Text style={styles.sectionLabel}>Reason</Text>
      <View style={styles.choiceWrap}>
        {reasons.map((reason) => {
          const selected = reasonCodeId === reason.id;
          return (
            <Pressable
              key={reason.id}
              onPress={() => setReasonCodeId(reason.id)}
              style={[styles.choiceChip, selected && styles.choiceChipSelected]}
            >
              <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{reason.description}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>Or describe the fault</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={3}
        style={[styles.input, styles.textArea]}
        placeholder="e.g. Hydraulic hose failure on boom"
      />

      <Text style={styles.sectionLabel}>Severity</Text>
      <View style={styles.choiceWrap}>
        {SEVERITIES.map((s) => {
          const selected = severity === s;
          return (
            <Pressable
              key={s}
              onPress={() => setSeverity(s)}
              style={[styles.choiceChip, selected && styles.choiceChipSelected]}
            >
              <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
                {s[0].toUpperCase() + s.slice(1)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable style={styles.checkboxRow} onPress={() => setAlreadyResolved((v) => !v)}>
        <View style={[styles.checkbox, alreadyResolved && styles.checkboxChecked]} />
        <Text style={styles.checkboxLabel}>Already resolved (mark end time as now)</Text>
      </Pressable>

      <Text style={styles.sectionLabel}>Comments</Text>
      <TextInput value={comments} onChangeText={setComments} style={styles.input} />

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={{ marginTop: spacing.md }}>
        <BigButton label="Save Breakdown Log" onPress={handleSubmit} loading={submitting} variant="danger" />
      </View>

      {recentItems.length > 0 && (
        <View style={styles.recent}>
          <Text style={styles.sectionLabel}>Recent Logs (this session)</Text>
          {recentItems.map((item) => (
            <View key={item.clientUuid} style={styles.recentRow}>
              <Text style={styles.recentText} numberOfLines={1}>
                {(item.payload.description as string) || "Breakdown"}
              </Text>
              <StatusPill status={item.status} />
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

function StatusPill({ status }: { status: QueueItem["status"] }) {
  const palette: Record<QueueItem["status"], string> = {
    pending: colors.warning,
    synced: colors.good,
    failed: colors.critical,
    conflict: colors.critical,
  };
  return (
    <View style={[styles.pill, { backgroundColor: palette[status] }]}>
      <Text style={styles.pillText}>{status}</Text>
    </View>
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
  choiceWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  choiceChip: {
    minHeight: MIN_TAP_TARGET - 8,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.borderLight,
    borderRadius: radius.md,
  },
  choiceChipSelected: {
    borderColor: colors.critical,
    backgroundColor: colors.surface,
  },
  choiceText: {
    fontSize: fontSize.body,
    color: colors.text,
    fontWeight: "600",
  },
  choiceTextSelected: {
    color: colors.critical,
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
    minHeight: MIN_TAP_TARGET,
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: "top",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: MIN_TAP_TARGET,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.sm,
  },
  checkboxChecked: {
    backgroundColor: colors.critical,
    borderColor: colors.critical,
  },
  checkboxLabel: {
    fontSize: fontSize.body,
    color: colors.text,
    flexShrink: 1,
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
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  pillText: {
    color: colors.onStatus,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
});
