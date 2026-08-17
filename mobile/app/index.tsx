import { Redirect } from "expo-router";
import { ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth/useAuth";
import { useSession } from "@/src/auth/useSession";
import { colors } from "@/src/theme/theme";

export default function Index() {
  const { isAuthenticated, isLoading, hasRole } = useAuth();
  const { selectedSiteId, activeAssignment, isRestoring } = useSession();

  if (isLoading || (isAuthenticated && isRestoring)) {
    return (
      <SafeAreaView
        style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  // An in-progress machine assignment takes priority over role — e.g. a
  // Supervisor who self-activated a machine before Operate became
  // Operator-only should still be able to finish/release that session.
  if (activeAssignment) {
    return <Redirect href="/session/entry" />;
  }

  // Operating a machine (site-select -> machine-select -> session/*) is an
  // Operator's job, mirroring the web dashboard's requireRole="operator"
  // restriction on Operate.
  if (hasRole("operator")) {
    if (!selectedSiteId) {
      return <Redirect href="/site-select" />;
    }
    return <Redirect href="/machine-select" />;
  }

  // Artisan gets its own claim/repair queue — neither session/* (Operator-
  // only, see above) nor manage/* (Admin/Supervisor-only, see manage/
  // _layout.tsx's own redirect back to "/") fit a plain Artisan account,
  // so without this branch it would land on manage/dashboard and bounce
  // straight back here, looping.
  if (hasRole("artisan")) {
    return <Redirect href="/artisan/unclaimed" />;
  }

  // Admin/Supervisor (or, as a fallback, any account with no recognized
  // role) land in the management dashboard.
  return <Redirect href="/manage/dashboard" />;
}
