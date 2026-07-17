import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fontSize, MIN_TAP_TARGET, radius, spacing } from "@/src/theme/theme";

type Variant = "primary" | "secondary" | "danger" | "success";

export function BigButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  fullWidth = true,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
}) {
  const palette = variantStyles[variant];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: palette.bg, borderColor: palette.border },
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
      ]}
    >
      <View style={styles.content}>
        {loading && <ActivityIndicator color={palette.text} style={{ marginRight: spacing.sm }} />}
        <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const variantStyles: Record<Variant, { bg: string; border: string; text: string }> = {
  primary: { bg: colors.primary, border: colors.primary, text: colors.primaryText },
  secondary: { bg: colors.background, border: colors.border, text: colors.text },
  danger: { bg: colors.critical, border: colors.critical, text: colors.onStatus },
  success: { bg: colors.good, border: colors.good, text: colors.onStatus },
};

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TAP_TARGET,
    borderRadius: radius.md,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  fullWidth: {
    alignSelf: "stretch",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
  },
  label: {
    fontSize: fontSize.button,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.75,
  },
  disabled: {
    opacity: 0.45,
  },
});
