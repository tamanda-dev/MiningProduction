import { Redirect } from "expo-router";
import { ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth/useAuth";
import { useSession } from "@/src/auth/useSession";
import { colors } from "@/src/theme/theme";

export default function Index() {
  const { isAuthenticated, isLoading } = useAuth();
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

  if (activeAssignment) {
    return <Redirect href="/session/entry" />;
  }

  if (!selectedSiteId) {
    return <Redirect href="/site-select" />;
  }

  return <Redirect href="/machine-select" />;
}
