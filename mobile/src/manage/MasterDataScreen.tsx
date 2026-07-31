import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { api } from "@/src/api/client";
import type { Paginated } from "@/src/api/types";
import { BigButton } from "@/src/components/BigButton";
import { Chip, ChipRow } from "@/src/components/Chip";
import { ModalSheet } from "@/src/components/ModalSheet";
import { Screen } from "@/src/components/Screen";
import { TextField } from "@/src/components/TextField";
import { colors, fontSize, radius, shadow, spacing } from "@/src/theme/theme";

export interface FieldOption {
  value: string | number;
  label: string;
}

type FormValues = Record<string, unknown>;

export interface FieldConfig {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "boolean" | "select" | "multiselect";
  // A function lets a field's choices depend on another field's current
  // value in the same form (e.g. "Section" narrowed to the selected
  // "Site") — mirrors dashboard/src/components/masterdata/MasterDataTable.tsx.
  options?: FieldOption[] | ((values: FormValues) => FieldOption[]);
  required?: boolean;
  helpText?: string;
}

export interface MasterDataConfig<T extends { id: number }> {
  resource: string;
  title: string;
  canWrite: boolean;
  fields: FieldConfig[];
  primaryLabel: (row: T) => string;
  secondaryLabel?: (row: T) => string | null;
  extraParams?: Record<string, string | number>;
  defaultValues?: FormValues;
}

function resolveOptions(field: FieldConfig, values: FormValues): FieldOption[] {
  if (typeof field.options === "function") return field.options(values);
  return field.options ?? [];
}

function fieldDefault(field: FieldConfig): unknown {
  if (field.type === "boolean") return true;
  if (field.type === "multiselect") return [];
  return "";
}

function buildPayload(fields: FieldConfig[], values: FormValues): FormValues {
  const payload: FormValues = { ...values };
  fields.forEach((f) => {
    if (f.required || payload[f.key] !== "") return;
    // DRF's non-char fields (numbers, FK selects) reject an empty string
    // outright even when the model field is null=True/blank=True with a
    // default — only CharField-backed types treat "" as a real value. Omit
    // rather than send a "" the API will always reject (same fix already
    // applied to the web dashboard's MasterDataTable this session).
    if (f.type !== "text") {
      delete payload[f.key];
    }
  });
  return payload;
}

function FieldInput({
  field,
  values,
  onChange,
}: {
  field: FieldConfig;
  values: FormValues;
  onChange: (key: string, value: unknown) => void;
}) {
  const value = values[field.key];

  if (field.type === "boolean") {
    return (
      <View style={styles.switchRow}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        <Switch value={Boolean(value)} onValueChange={(v) => onChange(field.key, v)} />
      </View>
    );
  }

  if (field.type === "select" || field.type === "multiselect") {
    const options = resolveOptions(field, values);
    const selected = field.type === "multiselect" ? (Array.isArray(value) ? (value as (string | number)[]) : []) : null;
    return (
      <View style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>
          {field.label}
          {field.required && <Text style={styles.required}> *</Text>}
        </Text>
        <ChipRow>
          {options.map((opt) => {
            const isSelected = field.type === "multiselect" ? selected!.includes(opt.value) : value === opt.value;
            return (
              <Chip
                key={String(opt.value)}
                label={opt.label}
                selected={isSelected}
                onPress={() => {
                  if (field.type === "multiselect") {
                    const next = isSelected
                      ? selected!.filter((v) => v !== opt.value)
                      : [...selected!, opt.value];
                    onChange(field.key, next);
                  } else {
                    onChange(field.key, isSelected ? "" : opt.value);
                  }
                }}
              />
            );
          })}
          {options.length === 0 && <Text style={styles.muted}>No options available.</Text>}
        </ChipRow>
        {field.helpText && <Text style={styles.helpText}>{field.helpText}</Text>}
      </View>
    );
  }

  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>
        {field.label}
        {field.required && <Text style={styles.required}> *</Text>}
      </Text>
      <TextField
        value={value === "" || value === undefined ? "" : String(value)}
        onChangeText={(text) => onChange(field.key, field.type === "number" ? (text === "" ? "" : text) : text)}
        keyboardType={field.type === "number" ? "numeric" : "default"}
      />
      {field.helpText && <Text style={styles.helpText}>{field.helpText}</Text>}
    </View>
  );
}

export function MasterDataScreen<T extends { id: number }>({ config }: { config: MasterDataConfig<T> }) {
  const { resource, title, canWrite, fields, primaryLabel, secondaryLabel, extraParams, defaultValues } = config;
  const queryClient = useQueryClient();
  const queryKey = [resource, "master-data", extraParams ?? {}];

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data } = await api.get<Paginated<T>>(`/${resource}/`, { params: { page_size: 500, ...extraParams } });
      return data.results;
    },
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [formValues, setFormValues] = useState<FormValues>({});
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  function openCreate() {
    const initial: FormValues = { ...defaultValues };
    fields.forEach((f) => {
      if (!(f.key in initial)) initial[f.key] = fieldDefault(f);
    });
    setEditing(null);
    setFormValues(initial);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(row: T) {
    const initial: FormValues = {};
    fields.forEach((f) => {
      initial[f.key] = (row as unknown as Record<string, unknown>)[f.key];
    });
    setEditing(row);
    setFormValues(initial);
    setError(null);
    setModalOpen(true);
  }

  function updateField(key: string, value: unknown) {
    setFormValues((prev) => {
      const next = { ...prev, [key]: value };
      fields.forEach((f) => {
        if (f.key === key || typeof f.options !== "function") return;
        const allowed = f.options(next);
        if (allowed.length > 0 && !allowed.some((opt) => String(opt.value) === String(next[f.key]))) {
          next[f.key] = f.type === "multiselect" ? [] : "";
        }
      });
      return next;
    });
  }

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = buildPayload(fields, values);
      if (editing) return api.patch(`/${resource}/${editing.id}/`, payload);
      return api.post(`/${resource}/`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [resource] });
      setModalOpen(false);
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: unknown } })?.response?.data;
      setError(typeof detail === "string" ? detail : JSON.stringify(detail) || "Failed to save.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/${resource}/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [resource] });
      setConfirmDeleteId(null);
      setModalOpen(false);
    },
  });

  const rows = data ?? [];

  return (
    <Screen onRefresh={() => refetch()} refreshing={isRefetching}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {canWrite && (
          <Pressable onPress={openCreate}>
            <Text style={styles.addLink}>+ Add</Text>
          </Pressable>
        )}
      </View>

      {isLoading && <Text style={styles.muted}>Loading…</Text>}
      {isError && <Text style={styles.error}>Failed to load data.</Text>}
      {data && rows.length === 0 && <Text style={styles.muted}>No records yet.</Text>}

      {rows.map((row) => {
        const secondary = secondaryLabel?.(row);
        return (
          <Pressable
            key={row.id}
            onPress={() => (canWrite ? openEdit(row) : undefined)}
            style={styles.card}
          >
            <Text style={styles.cardTitle}>{primaryLabel(row)}</Text>
            {secondary ? <Text style={styles.cardSubtitle}>{secondary}</Text> : null}
          </Pressable>
        );
      })}

      <ModalSheet visible={modalOpen} title={editing ? `Edit ${title}` : `New ${title}`}>
        {fields.map((f) => (
          <FieldInput key={f.key} field={f} values={formValues} onChange={updateField} />
        ))}

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <BigButton label="Cancel" variant="secondary" onPress={() => setModalOpen(false)} />
          </View>
          <View style={{ flex: 1 }}>
            <BigButton
              label={saveMutation.isPending ? "Saving…" : "Save"}
              onPress={() => {
                setError(null);
                saveMutation.mutate(formValues);
              }}
              disabled={saveMutation.isPending}
            />
          </View>
        </View>

        {editing && (
          <Pressable onPress={() => setConfirmDeleteId(editing.id)} style={{ marginTop: spacing.md }}>
            <Text style={styles.deleteLink}>Delete</Text>
          </Pressable>
        )}
      </ModalSheet>

      <ModalSheet visible={confirmDeleteId !== null} title="Delete record?">
        <Text style={styles.muted}>This action cannot be undone.</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
          <View style={{ flex: 1 }}>
            <BigButton label="Cancel" variant="secondary" onPress={() => setConfirmDeleteId(null)} />
          </View>
          <View style={{ flex: 1 }}>
            <BigButton
              label={deleteMutation.isPending ? "Deleting…" : "Delete"}
              variant="danger"
              onPress={() => confirmDeleteId !== null && deleteMutation.mutate(confirmDeleteId)}
              disabled={deleteMutation.isPending}
            />
          </View>
        </View>
      </ModalSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  title: {
    fontSize: fontSize.title,
    fontWeight: "800",
    color: colors.text,
    // Some resource titles ("Delivery Destinations", "Downtime Reason
    // Codes") are long enough at fontSize.title to crowd the "+ Add" link
    // on a 360dp-wide screen — shrink/wrap rather than push it off-screen.
    flexShrink: 1,
  },
  addLink: {
    fontSize: fontSize.body,
    fontWeight: "700",
    color: colors.primary,
  },
  muted: {
    fontSize: fontSize.body,
    color: colors.textMuted,
  },
  error: {
    fontSize: fontSize.label,
    color: colors.critical,
    fontWeight: "600",
    marginTop: spacing.xs,
  },
  card: {
    borderWidth: 2,
    borderColor: colors.borderLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.background,
    ...shadow,
  },
  cardTitle: {
    fontSize: fontSize.button,
    fontWeight: "700",
    color: colors.text,
  },
  cardSubtitle: {
    fontSize: fontSize.label,
    color: colors.textMuted,
    marginTop: 2,
  },
  fieldBlock: {
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontSize: fontSize.label,
    fontWeight: "700",
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  required: {
    color: colors.critical,
  },
  helpText: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  deleteLink: {
    fontSize: fontSize.label,
    fontWeight: "700",
    color: colors.critical,
    textAlign: "center",
  },
});
