import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { colors, fontSize, MIN_TAP_TARGET, radius, spacing } from "@/src/theme/theme";

export function TextField({
  secureToggle,
  style,
  ...props
}: TextInputProps & { secureToggle?: boolean }) {
  const [visible, setVisible] = useState(false);

  if (!secureToggle) {
    return (
      <TextInput placeholderTextColor={colors.textMuted} {...props} style={[styles.input, style]} />
    );
  }

  return (
    <View style={styles.secureWrap}>
      <TextInput
        placeholderTextColor={colors.textMuted}
        {...props}
        secureTextEntry={!visible}
        style={[styles.input, styles.secureInput, style]}
      />
      <Pressable
        onPress={() => setVisible((v) => !v)}
        hitSlop={12}
        style={({ pressed }) => [styles.eyeButton, pressed && styles.eyeButtonPressed]}
        accessibilityRole="button"
        accessibilityLabel={visible ? "Hide password" : "Show password"}
      >
        <Ionicons
          name={visible ? "eye-off" : "eye"}
          size={24}
          color={visible ? colors.primary : colors.textMuted}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.body,
    color: colors.text,
    backgroundColor: colors.background,
    minHeight: MIN_TAP_TARGET,
  },
  secureWrap: {
    position: "relative",
    justifyContent: "center",
  },
  secureInput: {
    paddingRight: spacing.xl + spacing.lg,
  },
  eyeButton: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: spacing.xs,
    width: MIN_TAP_TARGET,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  eyeButtonPressed: {
    opacity: 0.5,
  },
});
