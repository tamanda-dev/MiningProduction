import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "@/src/api/client";
import { enqueue, type QueueItem } from "@/src/api/queue";
import type { BreakdownLog, DowntimeReasonCode, Paginated } from "@/src/api/types";
import { useAuth } from "@/src/auth/useAuth";
import { useSession } from "@/src/auth/useSession";
import { BigButton } from "@/src/components/BigButton";
import { Checkbox } from "@/src/components/Checkbox";
import { Chip, ChipRow } from "@/src/components/Chip";
import { Screen } from "@/src/components/Screen";
import { StatusPill } from "@/src/components/StatusPill";
import { TextField } from "@/src/components/TextField";
import { useMachineLabels } from "@/src/hooks/useMachineLabels";
import { useSyncEngineContext } from "@/src/hooks/SyncEngineContext";
import { colors, fontSize, MIN_TAP_TARGET, radius, shadow, spacing } from "@/src/theme/theme";

const QUEUE_STATUS_COLOR: Record<QueueItem["status"], string> = {
  pending: colors.warning,
  synced: colors.good,
  failed: colors.critical,
  conflict: colors.critical,
};

const SEVERITIES = ["low", "medium", "high"] as const;
type Severity = (typeof SEVERITIES)[number];

export default function BreakdownScreen() {
  const { activeMachine } = useSession();
  const { queue, runSync, refreshQueue } = useSyncEngineContext();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { labels: machineLabels } = useMachineLabels(activeMachine?.site ?? null);

  // Breakdowns this Operator reported that the Artisan has now fixed —
  // repair_status "fixed" means it's waiting on this exact step, closing
  // the loop back to whoever needs the machine. This is a live GET/POST,
  // not the offline queue: repair_status is server-authoritative workflow
  // state (see entries/services.py confirm_breakdown_repair), not
  // something this device could safely resolve while offline. The API
  // itself already includes rows this user owns regardless of site scoping
  // (SiteScopedOrOwnQuerySetMixin), but the operator filter here is kept
  // as a belt-and-braces check against ever rendering a Confirm button for
  // someone else's breakdown.
  const awaitingConfirmationQuery = useQuery({
    queryKey: ["breakdown-logs", "awaiting-confirmation", user?.id],
    queryFn: async () => {
      const { data } = await api.get<Paginated<BreakdownLog>>("/breakdown-logs/", {
        params: { repair_status: "fixed", ordering: "-start_at", page_size: 50 },
      });
      return data.results.filter((log) => log.operator === user?.id);
    },
    enabled: user !== null,
    refetchInterval: 30_000,
  });

  const confirmMutation = useMutation({
    mutationFn: async (logId: number) => api.post<BreakdownLog>(`/breakdown-logs/${logId}/confirm/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["breakdown-logs"] });
    },
  });

  const awaitingConfirmation = awaitingConfirmationQuery.data ?? [];
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
      {awaitingConfirmation.length > 0 && (
        <View style={styles.confirmSection}>
          <Text style={styles.sectionLabel}>Awaiting Your Confirmation</Text>
          {awaitingConfirmation.map((log) => {
            const isConfirming = confirmMutation.isPending && confirmMutation.variables === log.id;
            const failed = confirmMutation.isError && confirmMutation.variables === log.id;
            return (
              <View key={log.id} style={styles.confirmCard}>
                <View style={styles.confirmCardHeader}>
                  <Text style={styles.confirmMachine}>{machineLabels[log.machine] ?? `Machine #${log.machine}`}</Text>
                  <StatusPill label="Fixed" color={colors.primary} />
                </View>
                {log.description ? (
                  <Text style={styles.confirmDescription} numberOfLines={2}>
                    {log.description}
                  </Text>
                ) : null}
                <Text style={styles.confirmHint}>The Artisan marked this fixed — confirm the machine works.</Text>
                {failed && <Text style={styles.error}>Failed to confirm — try again.</Text>}
                <View style={{ marginTop: spacing.sm }}>
                  <BigButton
                    label={isConfirming ? "Confirming…" : "Confirm Machine Working"}
                    onPress={() => confirmMutation.mutate(log.id)}
                    disabled={confirmMutation.isPending}
                    variant="success"
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}

      <Text style={styles.sectionLabel}>Reason</Text>
      <ChipRow style={{ marginBottom: spacing.sm }}>
        {reasons.map((reason) => (
          <Chip
            key={reason.id}
            label={reason.description}
            selected={reasonCodeId === reason.id}
            onPress={() => setReasonCodeId(reason.id)}
            variant="danger"
          />
        ))}
      </ChipRow>

      <Text style={styles.sectionLabel}>Or describe the fault</Text>
      <TextField
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={3}
        style={styles.textArea}
        placeholder="e.g. Hydraulic hose failure on boom"
      />

      <Text style={styles.sectionLabel}>Severity</Text>
      <ChipRow style={{ marginBottom: spacing.sm }}>
        {SEVERITIES.map((s) => (
          <Chip
            key={s}
            label={s[0].toUpperCase() + s.slice(1)}
            selected={severity === s}
            onPress={() => setSeverity(s)}
            variant="danger"
          />
        ))}
      </ChipRow>

      <Pressable style={styles.checkboxRow} onPress={() => setAlreadyResolved((v) => !v)}>
        <Checkbox checked={alreadyResolved} color={colors.critical} />
        <Text style={styles.checkboxLabel}>Already resolved (mark end time as now)</Text>
      </Pressable>

      <Text style={styles.sectionLabel}>Comments</Text>
      <TextField value={comments} onChangeText={setComments} />

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
  confirmSection: {
    marginBottom: spacing.lg,
  },
  confirmCard: {
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.background,
    ...shadow,
  },
  confirmCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  confirmMachine: {
    fontSize: fontSize.button,
    fontWeight: "700",
    color: colors.text,
    flexShrink: 1,
  },
  confirmDescription: {
    fontSize: fontSize.body,
    color: colors.text,
    marginTop: spacing.sm,
  },
  confirmHint: {
    fontSize: fontSize.label,
    color: colors.textMuted,
    marginTop: spacing.xs,
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
});
