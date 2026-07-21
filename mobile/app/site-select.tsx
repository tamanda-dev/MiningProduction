import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "@/src/api/client";
import type { MachineTypeQualification, Paginated, Site } from "@/src/api/types";
import { useAuth } from "@/src/auth/useAuth";
import { useSession } from "@/src/auth/useSession";
import { Screen } from "@/src/components/Screen";
import { colors, fontSize, MIN_TAP_TARGET, radius, shadow, spacing } from "@/src/theme/theme";

export default function SiteSelectScreen() {
  const { accessibleSiteIds, logout, user } = useAuth();
  const { setSelectedSiteId } = useSession();
  const router = useRouter();

  const sitesQuery = useQuery({
    queryKey: ["sites"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Site>>("/sites/", { params: { active: true, page_size: 200 } });
      return data.results;
    },
  });

  // Operators typically hold no UserSiteAccess grants at all (that's the
  // Manager/Supervisor mechanism) — their site visibility instead comes
  // from which sites they're qualified to operate machinery at, mirroring
  // the backend's MachineViewSet.get_queryset() logic.
  const qualificationsQuery = useQuery({
    queryKey: ["machine-qualifications", "mine", user?.id],
    queryFn: async () => {
      const { data } = await api.get<Paginated<MachineTypeQualification>>("/machine-qualifications/", {
        params: { user: user!.id, active: true, page_size: 200 },
      });
      return data.results;
    },
    enabled: Boolean(user),
  });

  const isLoading = sitesQuery.isLoading || qualificationsQuery.isLoading;
  const isError = sitesQuery.isError;
  const data = sitesQuery.data;

  const qualifications = qualificationsQuery.data ?? [];
  const hasAnySiteQualification = qualifications.some((q) => q.site === null);
  const qualifiedSiteIds = new Set(qualifications.map((q) => q.site).filter((id): id is number => id !== null));

  const sites = (data ?? []).filter((s) => {
    if (accessibleSiteIds === null || hasAnySiteQualification) return true;
    return accessibleSiteIds.includes(s.id) || qualifiedSiteIds.has(s.id);
  });

  async function handleSelect(site: Site) {
    await setSelectedSiteId(site.id);
    router.replace("/machine-select");
  }

  return (
    <Screen scroll={false}>
      <Text style={styles.title}>Select your site</Text>

      {isLoading && <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />}
      {isError && <Text style={styles.error}>Couldn't load sites. Pull down to retry.</Text>}

      <FlatList
        data={sites}
        keyExtractor={(item) => String(item.id)}
        refreshing={sitesQuery.isRefetching || qualificationsQuery.isRefetching}
        onRefresh={() => {
          sitesQuery.refetch();
          qualificationsQuery.refetch();
        }}
        contentContainerStyle={{ gap: spacing.md, paddingVertical: spacing.md }}
        ListEmptyComponent={
          !isLoading ? <Text style={styles.empty}>No sites available for your account.</Text> : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => handleSelect(item)}
            style={({ pressed }) => [styles.siteCard, pressed && styles.pressed]}
          >
            <View style={styles.siteCardText}>
              <Text style={styles.siteName}>{item.name}</Text>
              <Text style={styles.siteCode}>{item.code}</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
          </Pressable>
        )}
      />

      <Pressable onPress={logout} style={styles.signOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
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
  siteCard: {
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
  siteCardText: {
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  siteName: {
    fontSize: fontSize.button,
    fontWeight: "700",
    color: colors.text,
  },
  siteCode: {
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
    fontSize: fontSize.body,
    marginTop: spacing.md,
  },
  signOut: {
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  signOutText: {
    color: colors.textMuted,
    fontSize: fontSize.label,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
});
