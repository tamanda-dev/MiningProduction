import axios from "axios";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Modal, StyleSheet, Text, TextInput, View } from "react-native";
import { API_BASE_URL, api } from "@/src/api/client";
import { tokenStore } from "@/src/api/tokenStore";
import type { MachineAssignment, Me } from "@/src/api/types";
import { useSession } from "@/src/auth/useSession";
import { BigButton } from "@/src/components/BigButton";
import { Screen } from "@/src/components/Screen";
import { SyncStatusBar } from "@/src/components/SyncStatusBar";
import { useSyncEngineContext } from "@/src/hooks/SyncEngineContext";
import { colors, fontSize, radius, spacing } from "@/src/theme/theme";

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "response" in error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (error as any).response?.data;
    if (data?.detail) return String(data.detail);
  }
  return "Something went wrong. Please try again.";
}

export default function ReleaseScreen() {
  const { activeAssignment, activeMachine, clearActiveSession, setActiveSession } = useSession();
  const { pendingCount, conflictCount, runSync, isSyncing } = useSyncEngineContext();
  const router = useRouter();

  const [reason, setReason] = useState("");
  const [releasing, setReleasing] = useState(false);

  const [handoverVisible, setHandoverVisible] = useState(false);
  const [handoverUsername, setHandoverUsername] = useState("");
  const [handoverPassword, setHandoverPassword] = useState("");
  const [handoverError, setHandoverError] = useState<string | null>(null);
  const [handingOver, setHandingOver] = useState(false);

  async function confirmRelease() {
    if (!activeMachine) return;
    if (pendingCount > 0) {
      Alert.alert(
        "Entries still syncing",
        `${pendingCount} entr${pendingCount > 1 ? "ies are" : "y is"} still queued to sync. Release anyway? They'll keep trying to sync in the background.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Release Anyway", style: "destructive", onPress: doRelease },
        ],
      );
      return;
    }
    doRelease();
  }

  async function doRelease() {
    if (!activeMachine) return;
    setReleasing(true);
    try {
      await api.post(`/machines/${activeMachine.id}/release/`, { reason });
      clearActiveSession();
      router.replace("/machine-select");
    } catch (err) {
      Alert.alert("Couldn't release machine", extractErrorMessage(err));
    } finally {
      setReleasing(false);
    }
  }

  async function confirmHandover() {
    if (!activeMachine || !activeAssignment) return;
    setHandoverError(null);
    setHandingOver(true);
    try {
      // Verify the incoming operator's own credentials (a separate,
      // throwaway token exchange — the current operator's session below is
      // what actually authorizes the handover call) to resolve their user
      // id, since operators can't list other users via the API.
      const { data: incomingTokens } = await axios.post(`${API_BASE_URL}/auth/login/`, {
        username: handoverUsername.trim(),
        password: handoverPassword,
      });
      const { data: incomingMe } = await axios.get<Me>(`${API_BASE_URL}/auth/me/`, {
        headers: { Authorization: `Bearer ${incomingTokens.access}` },
      });

      const { data: newAssignment } = await api.post<MachineAssignment>(
        `/machines/${activeMachine.id}/handover/`,
        { new_operator: incomingMe.id },
      );

      // Adopt the incoming operator's already-verified tokens as the new
      // session — avoids making them log in twice back-to-back.
      await tokenStore.setTokens(incomingTokens.access, incomingTokens.refresh);
      setActiveSession(newAssignment, activeMachine);
      setHandoverVisible(false);
      setHandoverUsername("");
      setHandoverPassword("");
      router.replace("/session/entry");
    } catch (err) {
      setHandoverError(extractErrorMessage(err));
    } finally {
      setHandingOver(false);
    }
  }

  if (!activeMachine || !activeAssignment) return null;

  return (
    <Screen>
      <Text style={styles.title}>End of Shift</Text>
      <Text style={styles.subtitle}>
        {activeMachine.machine_type_code.toUpperCase()} {activeMachine.fleet_number}
      </Text>

      <View style={styles.syncCard}>
        <SyncStatusBar />
        {(pendingCount > 0 || conflictCount > 0) && (
          <View style={{ marginTop: spacing.sm }}>
            <BigButton
              label="Sync Now"
              onPress={() => runSync({ force: true })}
              loading={isSyncing}
              variant="secondary"
            />
          </View>
        )}
      </View>

      <Text style={styles.sectionLabel}>Release reason (optional)</Text>
      <TextInput value={reason} onChangeText={setReason} style={styles.input} placeholder="e.g. End of shift" />

      <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
        <BigButton label="Release Machine" onPress={confirmRelease} loading={releasing} variant="success" />
        <BigButton label="Hand Over to Next Operator" onPress={() => setHandoverVisible(true)} variant="secondary" />
      </View>

      <Modal visible={handoverVisible} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Hand Over Machine</Text>
            <Text style={styles.modalHelp}>
              Incoming operator: sign in below to confirm you're taking over this machine.
            </Text>

            <Text style={styles.sectionLabel}>Username</Text>
            <TextInput
              value={handoverUsername}
              onChangeText={setHandoverUsername}
              autoCapitalize="none"
              style={styles.input}
            />
            <Text style={styles.sectionLabel}>Password</Text>
            <TextInput
              value={handoverPassword}
              onChangeText={setHandoverPassword}
              secureTextEntry
              style={styles.input}
            />

            {handoverError && <Text style={styles.error}>{handoverError}</Text>}

            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              <BigButton label="Confirm Handover" onPress={confirmHandover} loading={handingOver} />
              <BigButton label="Cancel" variant="secondary" onPress={() => setHandoverVisible(false)} />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: fontSize.title,
    fontWeight: "800",
    color: colors.text,
  },
  subtitle: {
    fontSize: fontSize.body,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  syncCard: {
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    fontSize: fontSize.label,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
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
  },
  error: {
    color: colors.critical,
    fontSize: fontSize.label,
    fontWeight: "600",
    marginTop: spacing.sm,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(11,11,11,0.5)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
  },
  modalTitle: {
    fontSize: fontSize.title,
    fontWeight: "800",
    color: colors.text,
  },
  modalHelp: {
    fontSize: fontSize.label,
    color: colors.textMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
});
