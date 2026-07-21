import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "@/src/api/client";
import type { Machine, MachineAssignment, Paginated, Section } from "@/src/api/types";
import { useSession } from "@/src/auth/useSession";
import { BigButton } from "@/src/components/BigButton";
import { ModalSheet } from "@/src/components/ModalSheet";
import { Screen } from "@/src/components/Screen";
import { colors, fontSize, MIN_TAP_TARGET, radius, shadow, spacing } from "@/src/theme/theme";

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "response" in error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (error as any).response?.data;
    if (data?.detail) return String(data.detail);
  }
  return "Something went wrong. Please try again.";
}

export default function MachineSelectScreen() {
  const { selectedSiteId, setActiveSession, setSelectedSiteId } = useSession();
  const router = useRouter();
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  const machinesQuery = useQuery({
    queryKey: ["machines", selectedSiteId],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Machine>>("/machines/", {
        params: { site: selectedSiteId, status: "active", page_size: 200 },
      });
      return data.results;
    },
    enabled: selectedSiteId !== null,
  });

  const sectionsQuery = useQuery({
    queryKey: ["sections", selectedSiteId],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Section>>("/sections/", {
        params: { site: selectedSiteId, active: true, page_size: 200 },
      });
      return data.results;
    },
    enabled: selectedSiteId !== null,
  });

  function openSectionPicker(machine: Machine) {
    setActivateError(null);
    setSelectedSectionId(machine.current_section);
    setSelectedMachine(machine);
  }

  async function confirmActivate() {
    if (!selectedMachine || !selectedSectionId) return;
    setActivating(true);
    setActivateError(null);
    try {
      const { data } = await api.post<MachineAssignment>(`/machines/${selectedMachine.id}/activate/`, {
        section: selectedSectionId,
      });
      setActiveSession(data, selectedMachine);
      setSelectedMachine(null);
      router.replace("/session/entry");
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        setActivateError("This machine was just claimed by another operator. Choose a different one.");
        machinesQuery.refetch();
      } else {
        setActivateError(extractErrorMessage(err));
      }
    } finally {
      setActivating(false);
    }
  }

  const machines = machinesQuery.data ?? [];
  const sections = sectionsQuery.data ?? [];

  return (
    <Screen scroll={false}>
      <View style={styles.siteRow}>
        <Text style={styles.title}>Select a machine</Text>
        <Pressable onPress={() => setSelectedSiteId(null).then(() => router.replace("/site-select"))}>
          <Text style={styles.changeSite}>Change site</Text>
        </Pressable>
      </View>

      {machinesQuery.isLoading && (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
      )}
      {machinesQuery.isError && <Text style={styles.error}>Couldn't load machines. Pull down to retry.</Text>}

      <FlatList
        data={machines}
        keyExtractor={(item) => String(item.id)}
        refreshing={machinesQuery.isRefetching}
        onRefresh={machinesQuery.refetch}
        contentContainerStyle={{ gap: spacing.md, paddingVertical: spacing.md }}
        ListEmptyComponent={
          !machinesQuery.isLoading ? (
            <Text style={styles.empty}>
              No machines available. You may not be qualified for any machine type at this site yet — contact
              your supervisor.
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => openSectionPicker(item)}
            style={({ pressed }) => [styles.machineCard, pressed && styles.pressed]}
          >
            <View style={styles.machineCardText}>
              <Text style={styles.machineLabel}>
                {item.machine_type_code.toUpperCase()} {item.fleet_number}
              </Text>
              {item.name ? <Text style={styles.machineSub}>{item.name}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
          </Pressable>
        )}
      />

      <ModalSheet
        visible={selectedMachine !== null}
        title={`Activate ${selectedMachine ? `${selectedMachine.machine_type_code.toUpperCase()} ${selectedMachine.fleet_number}` : ""}`}
      >
        <Text style={styles.modalLabel}>Which section are you working in?</Text>

        <FlatList
          data={sections}
          keyExtractor={(item) => String(item.id)}
          style={{ maxHeight: 260 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setSelectedSectionId(item.id)}
              style={[
                styles.sectionOption,
                selectedSectionId === item.id && styles.sectionOptionSelected,
              ]}
            >
              <Text
                style={[
                  styles.sectionOptionText,
                  selectedSectionId === item.id && styles.sectionOptionTextSelected,
                ]}
              >
                {item.name}
              </Text>
            </Pressable>
          )}
        />

        {activateError && <Text style={styles.error}>{activateError}</Text>}

        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          <BigButton
            label="Activate Machine"
            onPress={confirmActivate}
            disabled={!selectedSectionId}
            loading={activating}
          />
          <BigButton label="Cancel" variant="secondary" onPress={() => setSelectedMachine(null)} />
        </View>
      </ModalSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  siteRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: fontSize.title,
    fontWeight: "800",
    color: colors.text,
  },
  changeSite: {
    color: colors.primary,
    fontWeight: "600",
    fontSize: fontSize.label,
  },
  machineCard: {
    minHeight: MIN_TAP_TARGET + 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    ...shadow,
  },
  machineCardText: {
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  machineLabel: {
    fontSize: fontSize.button,
    fontWeight: "700",
    color: colors.text,
  },
  machineSub: {
    fontSize: fontSize.label,
    color: colors.textMuted,
    marginTop: 2,
  },
  empty: {
    fontSize: fontSize.body,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.xl,
  },
  error: {
    color: colors.critical,
    fontSize: fontSize.label,
    marginTop: spacing.md,
    fontWeight: "600",
  },
  modalLabel: {
    fontSize: fontSize.body,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  sectionOption: {
    minHeight: MIN_TAP_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    marginBottom: spacing.xs,
    borderWidth: 2,
    borderColor: colors.borderLight,
  },
  sectionOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  sectionOptionText: {
    fontSize: fontSize.body,
    color: colors.text,
    fontWeight: "600",
  },
  sectionOptionTextSelected: {
    color: colors.primary,
  },
});
