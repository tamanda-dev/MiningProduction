import { StyleSheet, View } from "react-native";
import { colors, radius } from "@/src/theme/theme";

/** Presentational checkbox box only (no press handling) — both call sites
 * (breakdown.tsx, checklist.tsx) already wrap this in their own row-level
 * Pressable sized to MIN_TAP_TARGET, so the tap target is already generous
 * without this component needing its own hitSlop. Sized 28x28 (checklist's
 * size) rather than breakdown's previous 26x26, per MIN_TAP_TARGET-adjacent
 * sizing preference.
 */
export function Checkbox({ checked, color = colors.good }: { checked: boolean; color?: string }) {
  return <View style={[styles.box, checked && { backgroundColor: color, borderColor: color }]} />;
}

const styles = StyleSheet.create({
  box: {
    width: 28,
    height: 28,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.sm,
  },
});
