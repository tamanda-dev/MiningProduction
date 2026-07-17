import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import type { FormSchemaParameter } from "@/src/api/types";
import { colors, fontSize, MIN_TAP_TARGET, radius, spacing } from "@/src/theme/theme";

export type FieldValue = string | number | boolean | undefined;

export function DynamicField({
  parameter,
  value,
  onChange,
}: {
  parameter: FormSchemaParameter;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
}) {
  const label = `${parameter.name}${parameter.uom ? ` (${parameter.uom})` : ""}${parameter.is_required ? " *" : ""}`;

  if (parameter.data_type === "boolean") {
    return (
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Switch value={Boolean(value)} onValueChange={(v) => onChange(v)} />
      </View>
    );
  }

  if (parameter.data_type === "select") {
    return (
      <View style={styles.field}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.choiceWrap}>
          {parameter.choices.map((choice) => {
            const selected = value === choice.value;
            return (
              <Pressable
                key={choice.value}
                onPress={() => onChange(choice.value)}
                style={[styles.choiceChip, selected && styles.choiceChipSelected]}
              >
                <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{choice.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  const isNumeric = parameter.data_type === "number" || parameter.data_type === "integer";

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value === undefined ? "" : String(value)}
        onChangeText={(text) => onChange(text)}
        keyboardType={isNumeric ? "numeric" : "default"}
        style={styles.input}
        placeholder={
          isNumeric && (parameter.min_value || parameter.max_value)
            ? `${parameter.min_value ?? ""}–${parameter.max_value ?? ""}`
            : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
    minHeight: MIN_TAP_TARGET,
  },
  label: {
    fontSize: fontSize.body,
    fontWeight: "600",
    color: colors.text,
    marginBottom: spacing.xs,
    flexShrink: 1,
  },
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
  choiceWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  choiceChip: {
    minHeight: MIN_TAP_TARGET - 8,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.borderLight,
    borderRadius: radius.md,
  },
  choiceChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  choiceText: {
    fontSize: fontSize.body,
    color: colors.text,
    fontWeight: "600",
  },
  choiceTextSelected: {
    color: colors.primary,
  },
});
