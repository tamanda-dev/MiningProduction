import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { queryClient } from "@/src/api/queryClient";
import { AuthProvider } from "@/src/auth/AuthContext";
import { SessionProvider } from "@/src/auth/SessionContext";
import { colors } from "@/src/theme/theme";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SessionProvider>
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: colors.background },
                headerTintColor: colors.text,
                headerTitleStyle: { fontWeight: "700" },
                contentStyle: { backgroundColor: colors.background },
              }}
            >
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="login" options={{ headerShown: false }} />
              <Stack.Screen name="site-select" options={{ title: "Select Site" }} />
              <Stack.Screen name="machine-select" options={{ title: "Select Machine" }} />
              <Stack.Screen name="session" options={{ headerShown: false }} />
              <Stack.Screen name="manage" options={{ headerShown: false }} />
            </Stack>
            <StatusBar style="dark" />
          </SessionProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
