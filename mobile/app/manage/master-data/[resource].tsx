import { Stack, useLocalSearchParams } from "expo-router";
import { Text } from "react-native";
import { Screen } from "@/src/components/Screen";
import { useAuth } from "@/src/auth/useAuth";
import { MASTER_DATA_SCREENS } from "@/src/manage/masterDataConfigs";
import { colors, fontSize } from "@/src/theme/theme";

// One dynamic route for every Master Data resource (see
// src/manage/masterDataConfigs.tsx's MASTER_DATA_SCREENS registry) rather
// than ~17 near-identical route files — Expo Router's [resource] segment
// picks which config to render.
export default function MasterDataResourceScreen() {
  const { resource } = useLocalSearchParams<{ resource: string }>();
  const { hasRole } = useAuth();
  const entry = resource ? MASTER_DATA_SCREENS[resource] : undefined;

  if (!entry) {
    return (
      <Screen>
        <Text style={{ fontSize: fontSize.body, color: colors.critical }}>Unknown master data resource.</Text>
      </Screen>
    );
  }

  if (!hasRole(entry.requireRole)) {
    return (
      <Screen>
        <Text style={{ fontSize: fontSize.body, color: colors.critical }}>
          You don't have permission to view this.
        </Text>
      </Screen>
    );
  }

  const { Component } = entry;
  return (
    <>
      <Stack.Screen options={{ title: entry.title }} />
      <Component />
    </>
  );
}
