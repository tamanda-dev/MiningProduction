import { StyleSheet, Switch, Text, View } from "react-native";
import type { FormSchemaParameter } from "@/src/api/types";
import { Chip, ChipRow } from "@/src/components/Chip";
import { TextField } from "@/src/components/TextField";
import { colors, fontSize, MIN_TAP_TARGET, spacing } from "@/src/theme/theme";

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
        <ChipRow>
          {parameter.choices.map((choice) => (
            <Chip
              key={choice.value}
              label={choice.label}
              selected={value === choice.value}
              onPress={() => onChange(choice.value)}
            />
          ))}
        </ChipRow>
      </View>
    );
  }

  const isNumeric = parameter.data_type === "number" || parameter.data_type === "integer";

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextField
        value={value === undefined ? "" : String(value)}
        onChangeText={(text) => onChange(text)}
        keyboardType={isNumeric ? "numeric" : "default"}
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
});
