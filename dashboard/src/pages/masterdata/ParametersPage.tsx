import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/auth/useAuth";
import { Button } from "@/components/common/Button";
import { ErrorMessage, extractErrorMessage } from "@/components/common/ErrorMessage";
import { Modal } from "@/components/common/Modal";
import { MasterDataTable, type MasterDataResourceConfig } from "@/components/masterdata/MasterDataTable";
import { api } from "@/lib/api";
import { useLookup } from "@/lib/useLookup";
import type { MachineType, Parameter, ParameterChoice, Section, UOM } from "@/types";

const SCOPE_OPTIONS = [
  { value: "machine", label: "Machine-level" },
  { value: "section", label: "Section-level" },
  { value: "shift", label: "Shift-total" },
];

const DATA_TYPE_OPTIONS = [
  { value: "number", label: "Number" },
  { value: "integer", label: "Integer" },
  { value: "text", label: "Text" },
  { value: "select", label: "Select" },
  { value: "boolean", label: "Boolean" },
];

const AGGREGATION_OPTIONS = [
  { value: "sum", label: "Sum (tonnes, counts, loads — additive across hourly entries)" },
  { value: "average", label: "Average (rates/percentages — e.g. availability %)" },
];

function ChoicesManager({ parameter, onClose }: { parameter: Parameter; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const addChoice = useMutation({
    mutationFn: async () =>
      api.post("/parameter-choices/", {
        parameter: parameter.id,
        value,
        label,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parameters"] });
      setValue("");
      setLabel("");
    },
    onError: (err) => setError(extractErrorMessage(err)),
  });

  const deleteChoice = useMutation({
    mutationFn: async (id: number) => api.delete(`/parameter-choices/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parameters"] });
      setConfirmDeleteId(null);
    },
  });

  return (
    <Modal open onClose={onClose} title={`Choices for "${parameter.name}"`}>
      <div className="flex flex-col gap-3">
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
          {parameter.choices.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-400">No choices yet.</li>
          )}
          {parameter.choices.map((c: ParameterChoice) => (
            <li key={c.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>
                <span className="font-medium">{c.label}</span>{" "}
                <span className="text-slate-400">({c.value})</span>
              </span>
              <button
                type="button"
                onClick={() => setConfirmDeleteId(c.id)}
                className="font-medium text-red-600 hover:text-red-700 hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-600">Value</label>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-600">Label</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="button"
            disabled={!value || !label || addChoice.isPending}
            onClick={() => {
              setError(null);
              addChoice.mutate();
            }}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            Add
          </button>
        </div>
        {error && <ErrorMessage message={error} />}
      </div>

      <Modal open={confirmDeleteId !== null} onClose={() => setConfirmDeleteId(null)} title="Remove choice?">
        <p className="text-sm text-slate-600">This action cannot be undone.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmDeleteId(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (confirmDeleteId !== null) deleteChoice.mutate(confirmDeleteId);
            }}
            disabled={deleteChoice.isPending}
          >
            {deleteChoice.isPending ? "Removing…" : "Remove"}
          </Button>
        </div>
      </Modal>
    </Modal>
  );
}

export function ParametersPage() {
  const { hasRole } = useAuth();
  const { data: uoms } = useLookup<UOM>("uoms");
  const { data: machineTypes } = useLookup<MachineType>("machine-types");
  const { data: sections } = useLookup<Section>("sections");
  const { data: parameters } = useLookup<Parameter>("parameters");
  const [choicesForId, setChoicesForId] = useState<number | null>(null);
  const choicesFor = choicesForId ? parameters?.find((p) => p.id === choicesForId) ?? null : null;

  const uomName = (id: number | null) => (id ? uoms?.find((u) => u.id === id)?.abbreviation ?? id : "—");
  const sectionName = (id: number | null) => (id ? sections?.find((s) => s.id === id)?.name ?? id : "—");

  const config: MasterDataResourceConfig<Parameter> = {
    resource: "parameters",
    title: "Parameters",
    canWrite: hasRole("admin"),
    columns: [
      { key: "name", label: "Name" },
      { key: "code", label: "Code" },
      { key: "scope", label: "Scope" },
      { key: "data_type", label: "Data Type" },
      { key: "aggregation", label: "Roll-up", render: (row) => (row.aggregation === "average" ? "Average" : "Sum") },
      { key: "uom", label: "UOM", render: (row) => uomName(row.uom) },
      { key: "section", label: "Section", render: (row) => sectionName(row.section) },
      { key: "is_required", label: "Required", render: (row) => (row.is_required ? "Yes" : "No") },
      {
        key: "choices",
        label: "Choices",
        render: (row) =>
          row.data_type === "select" ? (
            <button
              type="button"
              onClick={() => setChoicesForId(row.id)}
              className="text-brand-600 hover:underline"
            >
              Manage ({row.choices.length})
            </button>
          ) : (
            "—"
          ),
      },
    ],
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "code", label: "Code", type: "text", required: true, helpText: "Stable key, e.g. tonnes-hauled" },
      { key: "scope", label: "Scope", type: "select", options: SCOPE_OPTIONS, required: true },
      { key: "data_type", label: "Data Type", type: "select", options: DATA_TYPE_OPTIONS, required: true },
      {
        key: "aggregation",
        label: "Shift/Day/MTD Roll-up",
        type: "select",
        options: AGGREGATION_OPTIONS,
        required: true,
        helpText:
          "How hourly entries combine into a total. Get this wrong for a rate/percentage parameter and three " +
          "hourly readings of 99/99/100% roll up to \"298%\" instead of ~99.3%.",
      },
      { key: "uom", label: "Unit of Measure", type: "select", options: uoms?.map((u) => ({ value: u.id, label: u.abbreviation })) ?? [] },
      {
        key: "section",
        label: "Section (required if scope is section-level)",
        type: "select",
        options: sections?.map((s) => ({ value: s.id, label: s.name })) ?? [],
      },
      {
        key: "applicable_machine_types",
        label: "Applicable Machine Types",
        type: "multiselect",
        options: machineTypes?.map((m) => ({ value: m.id, label: m.name })) ?? [],
      },
      { key: "min_value", label: "Min Value", type: "number" },
      { key: "max_value", label: "Max Value", type: "number" },
      { key: "is_required", label: "Required", type: "boolean" },
      { key: "active", label: "Active", type: "boolean" },
    ],
    defaultValues: { aggregation: "sum" },
  };

  return (
    <>
      <MasterDataTable config={config} />
      {choicesFor && <ChoicesManager parameter={choicesFor} onClose={() => setChoicesForId(null)} />}
    </>
  );
}
