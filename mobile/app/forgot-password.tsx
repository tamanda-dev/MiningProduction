import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BigButton } from "@/src/components/BigButton";
import { Screen } from "@/src/components/Screen";
import { TextField } from "@/src/components/TextField";
import { api } from "@/src/api/client";
import { colors, fontSize, spacing } from "@/src/theme/theme";

type Step = "request" | "reset" | "done";

function extractErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "response" in error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (error as any).response?.data;
    if (data?.detail) return String(data.detail);
  }
  return fallback;
}

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleRequestOtp() {
    setError(null);
    setSubmitting(true);
    try {
      const { data } = await api.post("/auth/forgot-password/", { email: email.trim() });
      setInfo(data.detail ?? "If that email is registered, a reset code has been sent.");
      setStep("reset");
    } catch (err) {
      setError(extractErrorMessage(err, "Something went wrong. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword() {
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/auth/reset-password/", {
        email: email.trim(),
        otp,
        new_password: newPassword,
      });
      setStep("done");
    } catch (err) {
      setError(extractErrorMessage(err, "Invalid or expired code."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>{step === "done" ? "Password reset" : "Reset your password"}</Text>
      </View>

      {step === "request" && (
        <View style={styles.form}>
          <Text style={styles.helper}>
            Enter your account email and we&apos;ll send you a one-time code to reset your password.
          </Text>
          <Text style={styles.label}>Email</Text>
          <TextField
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            placeholder="you@example.com"
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={{ marginTop: spacing.md }}>
            <BigButton label="Send reset code" onPress={handleRequestOtp} loading={submitting} disabled={!email.trim()} />
          </View>
          <View style={{ marginTop: spacing.md, alignItems: "center" }}>
            <Text style={styles.link} onPress={() => router.back()}>
              Back to sign in
            </Text>
          </View>
        </View>
      )}

      {step === "reset" && (
        <View style={styles.form}>
          {info && <Text style={styles.info}>{info}</Text>}

          <Text style={styles.label}>Reset code</Text>
          <TextField
            value={otp}
            onChangeText={(t) => setOtp(t.replace(/\D/g, "").slice(0, 6))}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="6-digit code"
          />

          <Text style={styles.label}>New password</Text>
          <TextField value={newPassword} onChangeText={setNewPassword} secureToggle autoComplete="new-password" />

          <Text style={styles.label}>Confirm new password</Text>
          <TextField value={confirmPassword} onChangeText={setConfirmPassword} secureToggle autoComplete="new-password" />

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={{ marginTop: spacing.md }}>
            <BigButton
              label="Reset password"
              onPress={handleResetPassword}
              loading={submitting}
              disabled={otp.length !== 6 || !newPassword || !confirmPassword}
            />
          </View>
          <View style={{ marginTop: spacing.md, alignItems: "center" }}>
            <Text
              style={styles.link}
              onPress={() => {
                setStep("request");
                setError(null);
              }}
            >
              Use a different email
            </Text>
          </View>
        </View>
      )}

      {step === "done" && (
        <View style={styles.form}>
          <Text style={styles.info}>Your password has been reset. You can now sign in with your new password.</Text>
          <View style={{ marginTop: spacing.md }}>
            <BigButton label="Back to sign in" onPress={() => router.replace("/login")} />
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
    alignItems: "center",
  },
  title: {
    fontSize: fontSize.hero,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
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
  helper: {
    fontSize: fontSize.label,
    color: colors.textMuted,
  },
  info: {
    fontSize: fontSize.label,
    color: colors.good,
    fontWeight: "600",
  },
  error: {
    color: colors.critical,
    fontSize: fontSize.label,
    marginTop: spacing.md,
    fontWeight: "600",
  },
  link: {
    fontSize: fontSize.label,
    fontWeight: "700",
    color: colors.primary,
  },
});
