import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { ErrorMessage, extractErrorMessage } from "@/components/common/ErrorMessage";
import { api } from "@/lib/api";
import { useOperateSession } from "@/lib/OperateSessionContext";
import { useLookup } from "@/lib/useLookup";
import type { DeliveryDestination } from "@/types";

export function OperateDeliveryPage() {
  const { activeMachine, isRestoring } = useOperateSession();
  const queryClient = useQueryClient();
  const { data: destinations } = useLookup<DeliveryDestination>("delivery-destinations", { active: "true" });

  const [destinationId, setDestinationId] = useState<number | null>(null);
  const [tonnes, setTonnes] = useState("");
  const [tripCount, setTripCount] = useState("1");
  const [comments, setComments] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/delivery-entries/", {
        delivery_destination: destinationId,
        section: activeMachine!.current_section ?? undefined,
        tonnes,
        trip_count: Number(tripCount) || 1,
        comments,
        client_uuid: crypto.randomUUID(),
      });
      return data;
    },
    onSuccess: () => {
      setDestinationId(null);
      setTonnes("");
      setTripCount("1");
      setComments("");
      setSavedMessage("Delivery logged.");
      queryClient.invalidateQueries({ queryKey: ["delivery-entries"] });
      setTimeout(() => setSavedMessage(null), 3000);
    },
    onError: (err) => setError(extractErrorMessage(err)),
  });

  if (isRestoring) return null;
  if (!activeMachine) return <Navigate to="/operate/session" replace />;

  function handleSubmit() {
    if (!destinationId) {
      setError("Pick a destination.");
      return;
    }
    if (!tonnes || Number(tonnes) <= 0) {
      setError("Enter the tonnes delivered.");
      return;
    }
    setError(null);
    submitMutation.mutate();
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Log Delivery</div>
      <Card className="mb-4">
        <div className="mb-4">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Destination</div>
          <div className="flex flex-wrap gap-2">
            {destinations?.map((dest) => (
              <button
                key={dest.id}
                type="button"
                onClick={() => setDestinationId(dest.id)}
                className={`rounded-md border-2 px-3 py-1.5 text-sm font-medium ${
                  destinationId === dest.id
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-slate-200 text-slate-600"
                }`}
              >
                {dest.name}
              </button>
            ))}
            {destinations && destinations.length === 0 && (
              <p className="text-sm text-slate-400">
                No delivery destinations configured yet — ask an Admin to add one under Master Data.
              </p>
            )}
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Tonnes</label>
            <input
              type="number"
              inputMode="decimal"
              value={tonnes}
              onChange={(e) => setTonnes(e.target.value)}
              placeholder="e.g. 42.5"
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Trip Count</label>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={tripCount}
              onChange={(e) => setTripCount(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Comments</label>
          <input
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
      </Card>

      {error && <ErrorMessage message={error} />}
      {savedMessage && <p className="mb-3 text-sm font-medium text-emerald-700">{savedMessage}</p>}

      <Button size="md" onClick={handleSubmit} disabled={submitMutation.isPending}>
        {submitMutation.isPending ? "Saving…" : "Save Delivery"}
      </Button>
    </div>
  );
}
