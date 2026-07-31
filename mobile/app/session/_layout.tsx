import { Redirect, Tabs } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "@/src/auth/useSession";
import { SyncStatusBar } from "@/src/components/SyncStatusBar";
import { SyncEngineProvider } from "@/src/hooks/SyncEngineContext";
import { colors, fontSize, spacing } from "@/src/theme/theme";

export default function SessionLayout() {
  const { activeAssignment, activeMachine, isRestoring } = useSession();

  if (isRestoring) return null;
  if (!activeAssignment || !activeMachine) {
    return <Redirect href="/" />;
  }

  // The Crushing & Breakdowns module's tabs (checklist, breakdown matrix,
  // open incidents, quick-log incident) only make sense while operating a
  // crusher (machine_type.code === "cru") — hidden via `href: null` rather
  // than omitted, so the route stays valid to navigate to (e.g. an artisan
  // reaching incident.tsx from open-incidents.tsx) without cluttering the
  // tab bar for every other machine type.
  const isCrusher = activeMachine.machine_type_code === "cru";

  return (
    <SyncEngineProvider>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.machineLabel} numberOfLines={1}>
            {activeMachine.machine_type_code.toUpperCase()} {activeMachine.fleet_number}
          </Text>
          <SyncStatusBar />
        </View>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.textMuted,
            tabBarStyle: { height: 64, paddingBottom: 8, paddingTop: 6 },
            tabBarLabelStyle: { fontSize: fontSize.label, fontWeight: "700" },
          }}
        >
          <Tabs.Screen name="entry" options={{ title: "Production" }} />
          <Tabs.Screen name="breakdown" options={{ title: "Breakdown" }} />
          <Tabs.Screen name="delivery" options={{ title: "Delivery" }} />
          <Tabs.Screen name="checklist" options={{ title: "Checklist", href: isCrusher ? undefined : null }} />
          <Tabs.Screen
            name="breakdown-matrix"
            options={{ title: "Breakdown Matrix", href: isCrusher ? undefined : null }}
          />
          <Tabs.Screen
            name="open-incidents"
            options={{ title: "Incidents", href: isCrusher ? undefined : null }}
          />
          <Tabs.Screen name="incident" options={{ href: null }} />
          <Tabs.Screen name="release" options={{ title: "Release" }} />
        </Tabs>
      </SafeAreaView>
    </SyncEngineProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: spacing.sm,
  },
  machineLabel: {
    fontSize: fontSize.button,
    fontWeight: "800",
    color: colors.text,
    flexShrink: 1,
  },
});
