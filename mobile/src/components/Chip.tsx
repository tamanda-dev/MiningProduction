import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fontSize, MIN_TAP_TARGET, radius, spacing } from "@/src/theme/theme";

export function ChipRow({
  children,
  style,
}: {
  children: ReactNode;
  style?: React.ComponentProps<typeof View>["style"];
}) {
  return <View style={[styles.wrap, style]}>{children}</View>;
}

export function Chip({
  label,
  selected,
  onPress,
  variant = "neutral",
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  variant?: "neutral" | "danger";
}) {
  const selectedColor = variant === "danger" ? colors.critical : colors.primary;
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && { borderColor: selectedColor, backgroundColor: colors.surface }]}
    >
      <Text style={[styles.text, selected && { color: selectedColor }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  chip: {
    minHeight: MIN_TAP_TARGET - 8,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.borderLight,
    borderRadius: radius.md,
  },
  text: {
    fontSize: fontSize.body,
    color: colors.text,
    fontWeight: "600",
  },
});
