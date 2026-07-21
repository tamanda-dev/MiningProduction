import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { api } from "@/src/api/client";
import { enqueue } from "@/src/api/queue";
import type { BreakdownCause, BreakdownIncident, Paginated } from "@/src/api/types";
import { useSession } from "@/src/auth/useSession";
import { BigButton } from "@/src/components/BigButton";
import { Chip, ChipRow } from "@/src/components/Chip";
import { Screen } from "@/src/components/Screen";
import { TextField } from "@/src/components/TextField";
import { useSyncEngineContext } from "@/src/hooks/SyncEngineContext";
import { colors, fontSize, spacing } from "@/src/theme/theme";

const SEVERITIES = ["low", "medium", "high"] as const;
type Severity = (typeof SEVERITIES)[number];

/** The breakdown incident form covers two flows:
 * 1. Quick-log (no `id` param): create a new incident, occurred/reported
 *    now — the fast path from a "Quick Log Breakdown" button.
 * 2. Attend/Resolve (`id` param, from open-incidents.tsx): the assigned
 *    artisan marks an existing incident attended, then resolved. Both
 *    steps queue as "update" operations against the known server id, per
 *    the offline-sync design in mobile/README.md — the artisan doesn't
 *    need connectivity at the moment they tap the button, only to have
 *    originally discovered the incident's id via open-incidents.tsx.
 */
export default function IncidentScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const incidentId = id ? Number(id) : null;
  const { activeMachine } = useSession();
  const { refreshQueue, runSync } = useSyncEngineContext();
  const router = useRouter();

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

  const incidentQuery = useQuery({
    queryKey: ["breakdown-incident", incidentId],
    queryFn: async () => {
      const { data } = await api.get<BreakdownIncident>(`/breakdown-incidents/${incidentId}/`);
      return data;
    },
    enabled: incidentId !== null,
  });

  const causes = causesQuery.data ?? [];

  if (incidentId !== null) {
    return (
      <ExistingIncidentForm
        incident={incidentQuery.data}
        loading={incidentQuery.isLoading}
        onDone={() => router.back()}
      />
    );
  }

  return <QuickLogForm causes={causes} onSaved={() => {}} refreshQueue={refreshQueue} runSync={runSync} activeMachineId={activeMachine?.id ?? null} />;
}

function QuickLogForm({
  causes,
  refreshQueue,
  runSync,
  activeMachineId,
}: {
  causes: BreakdownCause[];
  onSaved: () => void;
  refreshQueue: () => Promise<void>;
  runSync: (options?: { force?: boolean }) => Promise<void>;
  activeMachineId: number | null;
}) {
  const [causeId, setCauseId] = useState<number | null>(null);
  const [otherText, setOtherText] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCause = causes.find((c) => c.id === causeId);

  async function handleSubmit() {
    if (!activeMachineId) return;
    if (selectedCause?.is_other && !otherText.trim()) {
      setError("Describe the 'Other' cause.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      await enqueue("breakdown-incidents", {
        crusher: activeMachineId,
        time_occurred: now,
        time_reported: now,
        cause: causeId ?? undefined,
        cause_other_text: otherText,
        description,
        severity,
      });
      setCauseId(null);
      setOtherText("");
      setDescription("");
      setSeverity("medium");
      await refreshQueue();
      Alert.alert("Saved", "Breakdown incident logged and queued for sync.");
      runSync();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.title}>Quick Log Breakdown</Text>

      <Text style={styles.sectionLabel}>Cause</Text>
      <ChipRow style={{ marginBottom: spacing.sm }}>
        {causes.map((cause) => (
          <Chip
            key={cause.id}
            label={cause.name}
            selected={causeId === cause.id}
            onPress={() => setCauseId(cause.id)}
            variant="danger"
          />
        ))}
      </ChipRow>

      {selectedCause?.is_other && (
        <>
          <Text style={styles.sectionLabel}>Describe "Other"</Text>
          <TextField value={otherText} onChangeText={setOtherText} multiline numberOfLines={2} />
        </>
      )}

      <Text style={styles.sectionLabel}>Description</Text>
      <TextField
        value={description}
        onChangeText={setDescription}
        style={styles.textArea}
        multiline
        numberOfLines={3}
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

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={{ marginTop: spacing.md }}>
        <BigButton label="Save Incident" onPress={handleSubmit} loading={submitting} variant="danger" />
      </View>
    </Screen>
  );
}

function ExistingIncidentForm({
  incident,
  loading,
  onDone,
}: {
  incident: BreakdownIncident | undefined;
  loading: boolean;
  onDone: () => void;
}) {
  const { refreshQueue, runSync } = useSyncEngineContext();
  const [rootCause, setRootCause] = useState("");
  const [remedialAction, setRemedialAction] = useState("");
  const [markedAttended, setMarkedAttended] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading || !incident) {
    return (
      <Screen>
        <Text style={styles.title}>Loading incident…</Text>
      </Screen>
    );
  }

  const isAttended = markedAttended || Boolean(incident.time_attended);

  async function handleMarkAttended() {
    setSubmitting(true);
    try {
      await enqueue(
        "breakdown-incidents",
        { time_attended: new Date().toISOString() },
        { operation: "update", targetId: incident!.id },
      );
      setMarkedAttended(true);
      await refreshQueue();
      Alert.alert("Saved", "Marked attended — queued for sync.");
      runSync();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResolve() {
    if (!rootCause.trim() || !remedialAction.trim()) {
      setError("Root cause and remedial action are both required to resolve.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await enqueue(
        "breakdown-incidents",
        { root_cause_of_failure: rootCause, remedial_action_taken: remedialAction },
        { operation: "update", targetId: incident!.id, actionPath: "resolve" },
      );
      await refreshQueue();
      Alert.alert("Saved", "Marked resolved — queued for sync.");
      runSync();
      onDone();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.title}>Incident #{incident.id}</Text>
      <Text style={styles.subtitle}>Occurred {new Date(incident.time_occurred).toLocaleString()}</Text>
      {incident.description ? <Text style={styles.description}>{incident.description}</Text> : null}

      {!isAttended ? (
        <View style={{ marginTop: spacing.md }}>
          <BigButton label="Mark Attended" onPress={handleMarkAttended} loading={submitting} />
        </View>
      ) : (
        <>
          <Text style={styles.sectionLabel}>Root Cause of Failure</Text>
          <TextField
            value={rootCause}
            onChangeText={setRootCause}
            style={styles.textArea}
            multiline
            numberOfLines={3}
          />

          <Text style={styles.sectionLabel}>Remedial Action Taken</Text>
          <TextField
            value={remedialAction}
            onChangeText={setRemedialAction}
            style={styles.textArea}
            multiline
            numberOfLines={3}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={{ marginTop: spacing.md }}>
            <BigButton label="Mark Resolved" onPress={handleResolve} loading={submitting} variant="success" />
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: fontSize.title,
    fontWeight: "800",
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSize.label,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  description: {
    fontSize: fontSize.body,
    color: colors.text,
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
  textArea: {
    minHeight: 90,
    textAlignVertical: "top",
  },
  error: {
    color: colors.critical,
    fontSize: fontSize.label,
    fontWeight: "600",
    marginTop: spacing.sm,
  },
});
