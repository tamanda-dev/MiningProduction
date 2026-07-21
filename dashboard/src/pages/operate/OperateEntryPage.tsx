import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { DynamicField, type FieldValue } from "@/components/operate/DynamicField";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { ErrorMessage, extractErrorMessage } from "@/components/common/ErrorMessage";
import { api } from "@/lib/api";
import { validateAll } from "@/lib/entryValidation";
import { useOperateSession } from "@/lib/OperateSessionContext";
import type { EntryType, FormSchemaParameter, TimeSlot } from "@/types";

function currentSlotIndex(slots: TimeSlot[]): number | null {
  const now = Date.now();
  const match = slots.find((s) => new Date(s.start_at).getTime() <= now && now < new Date(s.end_at).getTime());
  return match ? match.slot_index : (slots.at(-1)?.slot_index ?? null);
}

export function OperateEntryPage() {
  const { activeAssignment, activeMachine, isRestoring } = useOperateSession();
  const queryClient = useQueryClient();

  const [entryType, setEntryType] = useState<EntryType>("hourly");
  const [slotIndex, setSlotIndex] = useState<number | null>(null);
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [comments, setComments] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const schemaQuery = useQuery({
    queryKey: ["form-schema", activeMachine?.machine_type, activeAssignment?.section],
    queryFn: async () => {
      const { data } = await api.get<FormSchemaParameter[]>(
        `/machine-types/${activeMachine!.machine_type}/form-schema/`,
        { params: { section: activeAssignment!.section } },
      );
      return data;
    },
    enabled: Boolean(activeMachine && activeAssignment),
    staleTime: 5 * 60_000,
  });

  const slotsQuery = useQuery({
    queryKey: ["time-slots", activeAssignment?.shift_instance],
    queryFn: async () => {
      const { data } = await api.get<TimeSlot[]>(`/shift-instances/${activeAssignment!.shift_instance}/time-slots/`);
      return data;
    },
    enabled: Boolean(activeAssignment),
    staleTime: 5 * 60_000,
  });

  const slots = slotsQuery.data ?? [];
  const parameters = schemaQuery.data ?? [];

  useEffect(() => {
    if (slotIndex === null && slots.length > 0) {
      setSlotIndex(currentSlotIndex(slots));
    }
  }, [slots, slotIndex]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/production-entries/", {
        machine_assignment: activeAssignment!.id,
        entry_type: entryType,
        slot_index: entryType === "hourly" ? slotIndex : undefined,
        comments,
        client_uuid: crypto.randomUUID(),
        values: parameters
          .filter((p) => values[p.code] !== undefined && values[p.code] !== "")
          .map((p) => ({ parameter: p.code, value: values[p.code] })),
      });
      return data;
    },
    onSuccess: () => {
      setValues({});
      setComments("");
      setSavedMessage("Entry saved.");
      queryClient.invalidateQueries({ queryKey: ["production-entries"] });
      setTimeout(() => setSavedMessage(null), 3000);
    },
    onError: (err) => setErrors([extractErrorMessage(err)]),
  });

  if (isRestoring) return null;
  if (!activeAssignment || !activeMachine) return <Navigate to="/operate/session" replace />;

  function updateValue(code: string, value: FieldValue) {
    setValues((prev) => ({ ...prev, [code]: value }));
  }

  function handleSubmit() {
    const validationErrors = validateAll(parameters, values);
    if (entryType === "hourly" && slotIndex === null) {
      validationErrors.push("Select a time slot.");
    }
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors([]);
    submitMutation.mutate();
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex gap-2">
        {(["hourly", "shift_total"] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setEntryType(type)}
            className={`rounded-md border-2 px-4 py-2 text-sm font-semibold ${
              entryType === type ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600"
            }`}
          >
            {type === "hourly" ? "Hourly" : "Shift Total"}
          </button>
        ))}
      </div>

      {entryType === "hourly" && (
        <div className="mb-4">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Time Slot</div>
          <div className="flex flex-wrap gap-2">
            {slots.map((slot) => (
              <button
                key={slot.slot_index}
                type="button"
                onClick={() => setSlotIndex(slot.slot_index)}
                className={`rounded-md border-2 px-3 py-1.5 text-sm font-medium ${
                  slotIndex === slot.slot_index
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-slate-200 text-slate-600"
                }`}
              >
                {new Date(slot.start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </button>
            ))}
          </div>
        </div>
      )}

      <Card className="mb-4">
        {schemaQuery.isLoading && <p className="text-sm text-slate-400">Loading form…</p>}
        {parameters.map((param) => (
          <DynamicField key={param.code} parameter={param} value={values[param.code]} onChange={(v) => updateValue(param.code, v)} />
        ))}

        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium text-slate-700">Comments</label>
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
      </Card>

      {errors.length > 0 && (
        <div className="mb-4">
          {errors.map((e) => (
            <ErrorMessage key={e} message={e} />
          ))}
        </div>
      )}

      {savedMessage && <p className="mb-3 text-sm font-medium text-emerald-700">{savedMessage}</p>}

      <Button size="md" onClick={handleSubmit} disabled={submitMutation.isPending}>
        {submitMutation.isPending ? "Saving…" : "Save Entry"}
      </Button>
    </div>
  );
}
