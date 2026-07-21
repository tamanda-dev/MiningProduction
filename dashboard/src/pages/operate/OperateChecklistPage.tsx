import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { api } from "@/lib/api";
import { useOperateSession } from "@/lib/OperateSessionContext";
import { currentSlot } from "@/lib/timeSlots";
import { useLookup } from "@/lib/useLookup";
import type { ChecklistItem, HourlySlot } from "@/types";

export function OperateChecklistPage() {
  const { activeMachine, isRestoring } = useOperateSession();
  const { data: slots } = useLookup<HourlySlot>("hourly-slots", activeMachine ? { site: activeMachine.site, active: "true" } : undefined);
  const { data: items } = useLookup<ChecklistItem>("checklist-items", { active: "true" });

  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [notes, setNotes] = useState("");
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const slot = useMemo(() => currentSlot(slots ?? []), [slots]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      for (const item of items ?? []) {
        await api.post("/hourly-checklist-entries/", {
          crusher: activeMachine!.id,
          hourly_slot: slot!.id,
          checklist_item: item.id,
          is_completed: Boolean(checked[item.id]),
          notes,
          client_uuid: crypto.randomUUID(),
        });
      }
    },
    onSuccess: () => {
      setChecked({});
      setNotes("");
      setSavedMessage("Checklist saved.");
      setTimeout(() => setSavedMessage(null), 3000);
    },
  });

  if (isRestoring) return null;
  if (!activeMachine) return <Navigate to="/operate/session" replace />;

  return (
    <div className="max-w-2xl">
      {!slot && slots && (
        <ErrorMessage message="No configured hourly slot covers the current time for this site — check Hourly Slots admin config." />
      )}
      {slot && (
        <p className="mb-4 text-sm font-semibold text-slate-800">
          Slot {slot.slot_index} ({slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)})
        </p>
      )}

      <div className="mb-4 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {items?.map((item) => {
          const isChecked = Boolean(checked[item.id]);
          return (
            <label key={item.id} className="flex cursor-pointer items-center gap-3 px-4 py-3">
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => setChecked((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                className="h-5 w-5 rounded border-slate-300"
              />
              <span className="text-sm font-medium text-slate-800">{item.name}</span>
            </label>
          );
        })}
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
      </div>

      {savedMessage && <p className="mb-3 text-sm font-medium text-emerald-700">{savedMessage}</p>}

      <button
        type="button"
        onClick={() => submitMutation.mutate()}
        disabled={!slot || !items?.length || submitMutation.isPending}
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {submitMutation.isPending ? "Saving…" : "Save Checklist"}
      </button>
    </div>
  );
}
