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

function ArtisanHeader() {
  const { user, logout } = useAuth();
  const { sites, siteId } = useManageSite();
  const [pickerOpen, setPickerOpen] = useState(false);

  const siteName = sites.find((s) => s.id === siteId)?.name ?? "No site access";
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.username;

  return (
    <View style={styles.header}>
      <View style={{ flexShrink: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {fullName}
        </Text>
        <Text style={styles.role}>Artisan</Text>
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

export default function ArtisanLayout() {
  const { hasRole } = useAuth();

  // Mirrors manage/_layout.tsx's own role gate/redirect-home pattern — a
  // non-Artisan has no business here (index.tsx never routes one in, but
  // this guards direct navigation too).
  if (!hasRole("artisan")) {
    return <Redirect href="/" />;
  }

  return (
    <ManageSiteProvider>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ArtisanHeader />
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
            name="unclaimed"
            options={{
              title: "Unclaimed",
              tabBarIcon: ({ color, size }) => <Ionicons name="alert-circle-outline" size={size} color={color} />,
            }}
          />
          <Tabs.Screen
            name="my-repairs"
            options={{
              title: "My Repairs",
              tabBarIcon: ({ color, size }) => <Ionicons name="build-outline" size={size} color={color} />,
            }}
          />
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
