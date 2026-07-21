import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "@/src/theme/theme";

/** Renders a small colored status pill (entry/breakdown queue status,
 * incident open/in-progress status, etc). Text color defaults to
 * `colors.onStatus` (white), except against `colors.warning`'s light fill,
 * where `colors.onWarning` (black) is used instead to keep contrast —
 * matching the convention documented in theme.ts. Pass `textColor` to
 * override explicitly for any other light fill.
 */
export function StatusPill({
  label,
  color,
  textColor,
}: {
  label: string;
  color: string;
  textColor?: string;
}) {
  const resolvedTextColor = textColor ?? (color === colors.warning ? colors.onWarning : colors.onStatus);
  return (
    <View style={[styles.pill, { backgroundColor: color }]}>
      <Text style={[styles.text, { color: resolvedTextColor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  text: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
});
