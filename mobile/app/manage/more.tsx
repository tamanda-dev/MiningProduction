import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Screen } from "@/src/components/Screen";
import { useAuth } from "@/src/auth/useAuth";
import { colors, fontSize, radius, spacing } from "@/src/theme/theme";

interface NavRow {
  label: string;
  href: string;
  requireRole?: "admin" | "supervisor";
}

const SECTIONS: { title: string; items: NavRow[] }[] = [
  {
    title: "Master Data",
    items: [
      { label: "Sites", href: "/manage/master-data/sites", requireRole: "admin" },
      { label: "Sections", href: "/manage/master-data/sections", requireRole: "admin" },
      { label: "Machine Types", href: "/manage/master-data/machine-types", requireRole: "admin" },
      { label: "Machines", href: "/manage/master-data/machines", requireRole: "admin" },
      { label: "Units of Measure", href: "/manage/master-data/uoms", requireRole: "admin" },
      { label: "Parameters", href: "/manage/master-data/parameters", requireRole: "admin" },
      { label: "Delivery Destinations", href: "/manage/master-data/delivery-destinations", requireRole: "admin" },
      { label: "Downtime Reason Codes", href: "/manage/master-data/downtime-reasons", requireRole: "admin" },
      { label: "Shifts", href: "/manage/master-data/shifts", requireRole: "supervisor" },
      { label: "Shift Instances", href: "/manage/shift-instances", requireRole: "supervisor" },
      { label: "Plan Targets", href: "/manage/plan-targets", requireRole: "supervisor" },
      { label: "Breakdown Causes", href: "/manage/master-data/breakdown-causes", requireRole: "admin" },
      { label: "Checklist Items", href: "/manage/master-data/checklist-items", requireRole: "admin" },
      { label: "Hourly Slots", href: "/manage/master-data/hourly-slots", requireRole: "admin" },
    ],
  },
  {
    title: "Administration",
    items: [{ label: "Assign Machines to Operators", href: "/manage/assign-machines", requireRole: "supervisor" }],
  },
  {
    title: "Audit",
    items: [{ label: "Audit Log", href: "/manage/audit-log", requireRole: "supervisor" }],
  },
];

export default function ManageMoreScreen() {
  const { hasRole } = useAuth();

  return (
    <Screen>
      <Text style={styles.title}>More</Text>
      {SECTIONS.map((section) => {
        const visibleItems = section.items.filter((item) => !item.requireRole || hasRole(item.requireRole));
        if (visibleItems.length === 0) return null;
        return (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.card}>
              {visibleItems.map((item, i) => (
                <Link key={item.href} href={item.href as never} asChild>
                  <Pressable style={[styles.row, i < visibleItems.length - 1 && styles.rowBorder]}>
                    <Text style={styles.rowLabel} numberOfLines={2}>
                      {item.label}
                    </Text>
                    <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                  </Pressable>
                </Link>
              ))}
            </View>
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: fontSize.title,
    fontWeight: "800",
    color: colors.text,
    marginBottom: spacing.md,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.label,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
  },
  card: {
    borderWidth: 2,
    borderColor: colors.borderLight,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  rowLabel: {
    fontSize: fontSize.body,
    color: colors.text,
    fontWeight: "600",
    flex: 1,
    flexShrink: 1,
  },
});
