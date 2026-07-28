import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { ErrorMessage, extractErrorMessage } from "@/components/common/ErrorMessage";
import { api } from "@/lib/api";
import { useOperateSession } from "@/lib/OperateSessionContext";
import { useLookup } from "@/lib/useLookup";
import type { BreakdownLog, DowntimeReasonCode, Paginated } from "@/types";

const SEVERITIES = ["low", "medium", "high"] as const;
type Severity = (typeof SEVERITIES)[number];

// The operator's own currently-open breakdowns on the active machine —
// "close" PATCHes end_at on this same row, it doesn't start a second one.
function OpenBreakdownsList({ machineId }: { machineId: number }) {
  const queryClient = useQueryClient();
  const { data: reasons } = useLookup<DowntimeReasonCode>("downtime-reason-codes");
  const [error, setError] = useState<string | null>(null);

  const { data: openBreakdowns } = useQuery({
    queryKey: ["breakdown-logs", "open", machineId],
    queryFn: async () => {
      const { data } = await api.get<Paginated<BreakdownLog>>("/breakdown-logs/", {
        params: { machine: machineId, page_size: 50, ordering: "-start_at" },
      });
      return data.results.filter((row) => !row.end_at);
    },
    refetchInterval: 30_000,
  });

  const closeMutation = useMutation({
    mutationFn: async (id: number) => api.patch(`/breakdown-logs/${id}/`, { end_at: new Date().toISOString() }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["breakdown-logs"] });
    },
    onError: (err) => setError(extractErrorMessage(err)),
  });

  const reasonLabel = (id: number | null) => (id ? reasons?.find((r) => r.id === id)?.description ?? id : null);

  if (!openBreakdowns || openBreakdowns.length === 0) return null;

  return (
    <Card className="mb-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Open Breakdown{openBreakdowns.length > 1 ? "s" : ""} — close instead of logging a new one
      </div>
      <ul className="flex flex-col gap-2">
        {openBreakdowns.map((row) => (
          <li
            key={row.id}
            className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2"
          >
            <div className="text-sm">
              <div className="font-medium text-red-800">{reasonLabel(row.reason_code) ?? (row.description || "Breakdown")}</div>
              <div className="text-xs text-red-600">Since {new Date(row.start_at).toLocaleString()}</div>
            </div>
            <Button
              variant="success"
              size="sm"
              onClick={() => closeMutation.mutate(row.id)}
              disabled={closeMutation.isPending && closeMutation.variables === row.id}
            >
              {closeMutation.isPending && closeMutation.variables === row.id ? "Closing…" : "Close Now"}
            </Button>
          </li>
        ))}
      </ul>
      {error && (
        <div className="mt-2">
          <ErrorMessage message={error} />
        </div>
      )}
    </Card>
  );
}

export function OperateBreakdownPage() {
  const { activeMachine, isRestoring } = useOperateSession();
  const queryClient = useQueryClient();
  const { data: reasons } = useLookup<DowntimeReasonCode>("downtime-reason-codes", { active: "true" });

  const [reasonCodeId, setReasonCodeId] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [alreadyResolved, setAlreadyResolved] = useState(false);
  const [comments, setComments] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const now = new Date();
      const { data } = await api.post("/breakdown-logs/", {
        machine: activeMachine!.id,
        reason_code: reasonCodeId ?? undefined,
        description,
        severity,
        comments,
        start_at: now.toISOString(),
        end_at: alreadyResolved ? now.toISOString() : undefined,
        client_uuid: crypto.randomUUID(),
      });
      return data;
    },
    onSuccess: () => {
      setReasonCodeId(null);
      setDescription("");
      setComments("");
      setAlreadyResolved(false);
      setSavedMessage("Breakdown log saved.");
      queryClient.invalidateQueries({ queryKey: ["breakdown-logs"] });
      setTimeout(() => setSavedMessage(null), 3000);
    },
    onError: (err) => setError(extractErrorMessage(err)),
  });

  if (isRestoring) return null;
  if (!activeMachine) return <Navigate to="/operate/session" replace />;

  function handleSubmit() {
    if (!description.trim() && !reasonCodeId) {
      setError("Provide a reason code or a description of the fault.");
      return;
    }
    setError(null);
    submitMutation.mutate();
  }

  return (
    <div className="max-w-2xl">
      <OpenBreakdownsList machineId={activeMachine.id} />

      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Log New Breakdown</div>
      <Card className="mb-4">
      <div className="mb-4">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Reason</div>
        <div className="flex flex-wrap gap-2">
          {reasons?.map((reason) => (
            <button
              key={reason.id}
              type="button"
              onClick={() => setReasonCodeId(reason.id)}
              className={`rounded-md border-2 px-3 py-1.5 text-sm font-medium ${
                reasonCodeId === reason.id ? "border-red-600 bg-red-50 text-red-700" : "border-slate-200 text-slate-600"
              }`}
            >
              {reason.description}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-slate-700">Or describe the fault</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="e.g. Hydraulic hose failure on boom"
          className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
      </div>

      <div className="mb-4">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Severity</div>
        <div className="flex gap-2">
          {SEVERITIES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSeverity(s)}
              className={`rounded-md border-2 px-3 py-1.5 text-sm font-medium ${
                severity === s ? "border-red-600 bg-red-50 text-red-700" : "border-slate-200 text-slate-600"
              }`}
            >
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <label className="mb-4 flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={alreadyResolved} onChange={(e) => setAlreadyResolved(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
        Already resolved (mark end time as now)
      </label>

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

      <Button variant="danger" size="md" onClick={handleSubmit} disabled={submitMutation.isPending}>
        {submitMutation.isPending ? "Saving…" : "Save Breakdown Log"}
      </Button>
    </div>
  );
}
