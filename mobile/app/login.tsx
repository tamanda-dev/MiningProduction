import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { BigButton } from "@/src/components/BigButton";
import { Screen } from "@/src/components/Screen";
import { TextField } from "@/src/components/TextField";
import { useAuth } from "@/src/auth/useAuth";
import { colors, fontSize, spacing } from "@/src/theme/theme";

// Shown at the bottom of the login screen so a build can always be
// positively identified during support/troubleshooting — sideloaded APK
// updates on Android don't always make it obvious whether an install
// actually replaced the previous build.
const APP_VERSION = Constants.expoConfig?.version ?? "unknown";
const BUILD_ID = Constants.expoConfig?.android?.versionCode ?? "?";

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "response" in error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (error as any).response?.data;
    if (data?.detail) return String(data.detail);
  }
  return "Invalid username or password.";
}

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      router.replace("/");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Image
          source={require("@/assets/images/logo.png")}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="Ilanga 24/7"
        />
        <Text style={styles.title}>Mining Production</Text>
        <Text style={styles.subtitle}>Operator Sign In</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Username</Text>
        <TextField
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="e.g. demo_operator1"
        />

        <Text style={styles.label}>Password</Text>
        <TextField value={password} onChangeText={setPassword} secureToggle />

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={{ marginTop: spacing.md }}>
          <BigButton label="Sign In" onPress={handleSubmit} loading={submitting} />
        </View>
      </View>

      <Text style={styles.version}>
        v{APP_VERSION} (build {BUILD_ID})
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
    alignItems: "center",
  },
  logo: {
    width: 220,
    height: 110,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: fontSize.hero,
    fontWeight: "800",
    color: colors.text,
  },
  subtitle: {
    fontSize: fontSize.body,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  form: {
    gap: spacing.xs,
  },
  label: {
    fontSize: fontSize.label,
    fontWeight: "600",
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  error: {
    color: colors.critical,
    fontSize: fontSize.label,
    marginTop: spacing.md,
    fontWeight: "600",
  },
  version: {
    marginTop: spacing.xl,
    textAlign: "center",
    fontSize: fontSize.label,
    color: colors.textMuted,
  },
});
