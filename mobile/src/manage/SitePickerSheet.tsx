import { Pressable, StyleSheet, Text } from "react-native";
import { BigButton } from "@/src/components/BigButton";
import { ModalSheet } from "@/src/components/ModalSheet";
import { useManageSite } from "@/src/manage/useManageSite";
import { colors, fontSize, radius, spacing } from "@/src/theme/theme";

export function SitePickerSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { sites, siteId, setSiteId } = useManageSite();

  return (
    <ModalSheet visible={visible} title="Select Site">
      {sites.map((site) => (
        <Pressable
          key={site.id}
          onPress={() => {
            setSiteId(site.id);
            onClose();
          }}
          style={[styles.row, site.id === siteId && styles.rowActive]}
        >
          <Text style={[styles.rowText, site.id === siteId && styles.rowTextActive]}>{site.name}</Text>
        </Pressable>
      ))}
      <BigButton label="Close" variant="secondary" onPress={onClose} />
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
  },
  rowActive: {
    backgroundColor: colors.surface,
  },
  rowText: {
    fontSize: fontSize.body,
    fontWeight: "600",
    color: colors.text,
  },
  rowTextActive: {
    color: colors.primary,
  },
});
