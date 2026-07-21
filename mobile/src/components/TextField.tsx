import { StyleSheet, TextInput, type TextInputProps } from "react-native";
import { colors, fontSize, MIN_TAP_TARGET, radius, spacing } from "@/src/theme/theme";

export function TextField(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.textMuted} {...props} style={[styles.input, props.style]} />;
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
});
