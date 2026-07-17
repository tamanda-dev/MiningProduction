import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { ErrorMessage, extractErrorMessage } from "@/components/common/ErrorMessage";
import { api } from "@/lib/api";
import { useOperateSession } from "@/lib/OperateSessionContext";
import { useLookup } from "@/lib/useLookup";
import type { BreakdownCause, HourlySlot } from "@/types";

function currentSlot(slots: HourlySlot[]): HourlySlot | null {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  for (const slot of slots) {
    const start = toMinutes(slot.start_time);
    const end = toMinutes(slot.end_time);
    const isOvernight = end <= start;
    if (isOvernight ? nowMinutes >= start || nowMinutes < end : nowMinutes >= start && nowMinutes < end) {
      return slot;
    }
  }
  return null;
}

export function OperateBreakdownMatrixPage() {
  const { activeMachine, isRestoring } = useOperateSession();
  const { data: slots } = useLookup<HourlySlot>("hourly-slots", activeMachine ? { site: activeMachine.site, active: "true" } : undefined);
  const { data: causes } = useLookup<BreakdownCause>("breakdown-causes", { active: "true" });

  const [selectedCauses, setSelectedCauses] = useState<number[]>([]);
  const [otherText, setOtherText] = useState("");
  const [downtimeMinutes, setDowntimeMinutes] = useState("");
  const [comments, setComments] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const slot = useMemo(() => currentSlot(slots ?? []), [slots]);
  const hasOtherSelected = (causes ?? []).some((c) => c.is_other && selectedCauses.includes(c.id));

  function toggleCause(id: number) {
    setSelectedCauses((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  const submitMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/hourly-breakdown-entries/", {
        crusher: activeMachine!.id,
        hourly_slot: slot!.id,
        causes: selectedCauses,
        other_cause_text: otherText,
        downtime_minutes: downtimeMinutes ? Number(downtimeMinutes) : undefined,
        comments,
        client_uuid: crypto.randomUUID(),
      });
      return data;
    },
    onSuccess: () => {
      setSelectedCauses([]);
      setOtherText("");
      setDowntimeMinutes("");
      setComments("");
      setSavedMessage("Breakdown matrix entry saved.");
      setTimeout(() => setSavedMessage(null), 3000);
    },
    onError: (err) => setError(extractErrorMessage(err)),
  });

  if (isRestoring) return null;
  if (!activeMachine) return <Navigate to="/operate/session" replace />;

  function handleSubmit() {
    if (hasOtherSelected && !otherText.trim()) {
      setError("Describe the 'Other' cause.");
      return;
    }
    setError(null);
    submitMutation.mutate();
  }

  return (
    <div className="max-w-2xl">
      {!slot && slots && <ErrorMessage message="No configured hourly slot covers the current time for this site." />}
      {slot && (
        <p className="mb-4 text-sm font-semibold text-slate-800">
          Slot {slot.slot_index} ({slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)})
        </p>
      )}

      <div className="mb-4">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Causes (select all that apply)
        </div>
        <div className="flex flex-wrap gap-2">
          {causes?.map((cause) => {
            const selected = selectedCauses.includes(cause.id);
            return (
              <button
                key={cause.id}
                type="button"
                onClick={() => toggleCause(cause.id)}
                className={`rounded-md border-2 px-3 py-1.5 text-sm font-medium ${
                  selected ? "border-red-600 bg-red-50 text-red-700" : "border-slate-200 text-slate-600"
                }`}
              >
                {cause.name}
              </button>
            );
          })}
        </div>
      </div>

      {hasOtherSelected && (
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-slate-700">Describe "Other"</label>
          <textarea
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
      )}

      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-slate-700">Downtime (minutes, optional)</label>
        <input
          type="number"
          value={downtimeMinutes}
          onChange={(e) => setDowntimeMinutes(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-slate-700">Comments</label>
        <input
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
      </div>

      {error && <ErrorMessage message={error} />}
      {savedMessage && <p className="mb-3 text-sm font-medium text-emerald-700">{savedMessage}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!slot || submitMutation.isPending}
        className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
      >
        {submitMutation.isPending ? "Saving…" : "Save Breakdown Matrix Entry"}
      </button>
    </div>
  );
}
