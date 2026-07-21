import type { ReactNode } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { colors, fontSize, radius, spacing } from "@/src/theme/theme";

export function ModalSheet({
  visible,
  title,
  children,
}: {
  visible: boolean;
  title: string;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    // Functionally identical to the rgba(11,11,11,0.5) both call sites
    // previously hardcoded — colors.text is "#0B0B0B" (11,11,11 in decimal).
    backgroundColor: "rgba(11,11,11,0.5)",
    justifyContent: "flex-end",
  },
  card: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
  },
  title: {
    fontSize: fontSize.title,
    fontWeight: "800",
    color: colors.text,
    marginBottom: spacing.sm,
  },
});
