import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth/useAuth";
import { ManageSiteProvider } from "@/src/manage/ManageSiteContext";
import { SitePickerSheet } from "@/src/manage/SitePickerSheet";
import { useManageSite } from "@/src/manage/useManageSite";
import { colors, fontSize, spacing } from "@/src/theme/theme";

function ManageHeader() {
  const { user, hasRole, logout } = useAuth();
  const { sites, siteId } = useManageSite();
  const [pickerOpen, setPickerOpen] = useState(false);

  const siteName = sites.find((s) => s.id === siteId)?.name ?? "Select site";
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.username;

  return (
    <View style={styles.header}>
      <View style={{ flexShrink: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {fullName}
        </Text>
        <Text style={styles.role}>{hasRole("admin") ? "Admin" : "Supervisor"}</Text>
      </View>

      <View style={styles.headerActions}>
        {sites.length > 1 ? (
          <Pressable onPress={() => setPickerOpen(true)} style={styles.siteButton}>
            <Ionicons name="location-outline" size={18} color={colors.primary} />
            <Text style={styles.siteButtonText} numberOfLines={1}>
              {siteName}
            </Text>
          </Pressable>
        ) : (
          <Text style={styles.siteButtonText}>{siteName}</Text>
        )}
        <Pressable onPress={logout} hitSlop={12} accessibilityRole="button" accessibilityLabel="Sign out">
          <Ionicons name="log-out-outline" size={24} color={colors.textMuted} />
        </Pressable>
      </View>

      <SitePickerSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} />
    </View>
  );
}

export default function ManageLayout() {
  const { hasRole } = useAuth();

  // Operate (session/*) is Operator-only, mirroring the web dashboard's
  // ProtectedRoute requireRole="operator" restriction — Admin/Supervisor
  // land here instead. A plain Operator has no business in /manage, so
  // send them back to "/" (which routes them into the Operate flow).
  if (!hasRole("admin") && !hasRole("supervisor")) {
    return <Redirect href="/" />;
  }

  return (
    <ManageSiteProvider>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ManageHeader />
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.textMuted,
            tabBarStyle: { height: 64, paddingBottom: 8, paddingTop: 6 },
            tabBarLabelStyle: { fontSize: fontSize.label, fontWeight: "700" },
          }}
        >
          <Tabs.Screen
            name="dashboard"
            options={{
              title: "Dashboard",
              tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart-outline" size={size} color={color} />,
            }}
          />
          <Tabs.Screen
            name="machines"
            options={{
              title: "Machines",
              tabBarIcon: ({ color, size }) => <Ionicons name="construct-outline" size={size} color={color} />,
            }}
          />
          <Tabs.Screen
            name="incidents"
            options={{
              title: "Incidents",
              tabBarIcon: ({ color, size }) => <Ionicons name="warning-outline" size={size} color={color} />,
            }}
          />
          <Tabs.Screen
            name="users"
            options={{
              title: "Users",
              href: hasRole("admin") ? undefined : null,
              tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
            }}
          />
          <Tabs.Screen
            name="more"
            options={{
              title: "More",
              tabBarIcon: ({ color, size }) => <Ionicons name="ellipsis-horizontal-outline" size={size} color={color} />,
            }}
          />
          {/* Reachable only via Links from the "More" tab, not as tab-bar
              buttons themselves — mirrors the href:null pattern used for
              session/_layout.tsx's "incident" detail screen. */}
          <Tabs.Screen name="master-data/[resource]" options={{ href: null }} />
          <Tabs.Screen name="plan-targets" options={{ href: null }} />
          <Tabs.Screen name="shift-instances" options={{ href: null }} />
          <Tabs.Screen name="assign-machines" options={{ href: null }} />
          <Tabs.Screen name="audit-log" options={{ href: null }} />
        </Tabs>
      </SafeAreaView>
    </ManageSiteProvider>
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
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: spacing.sm,
  },
  name: {
    fontSize: fontSize.body,
    fontWeight: "800",
    color: colors.text,
  },
  role: {
    fontSize: fontSize.label,
    color: colors.textMuted,
    fontWeight: "600",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  siteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    maxWidth: 140,
  },
  siteButtonText: {
    fontSize: fontSize.label,
    fontWeight: "700",
    color: colors.primary,
  },
});
