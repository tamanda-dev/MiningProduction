import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ErrorMessage, extractErrorMessage } from "@/components/common/ErrorMessage";
import { api } from "@/lib/api";
import { useOperateSession } from "@/lib/OperateSessionContext";

export function OperateReleasePage() {
  const { activeMachine, isRestoring, clearActiveSession } = useOperateSession();
  const navigate = useNavigate();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const releaseMutation = useMutation({
    mutationFn: async () => api.post(`/machines/${activeMachine!.id}/release/`, { reason }),
    onSuccess: () => {
      clearActiveSession();
      navigate("/operate/session");
    },
    onError: (err) => setError(extractErrorMessage(err)),
  });

  if (isRestoring) return null;
  if (!activeMachine) return <Navigate to="/operate/session" replace />;

  return (
    <div className="max-w-md">
      <p className="mb-4 text-sm text-slate-600">
        Release{" "}
        <span className="font-semibold text-slate-900">
          {activeMachine.machine_type_code.toUpperCase()} {activeMachine.fleet_number}
        </span>{" "}
        at end of shift.
      </p>

      <label className="mb-1 block text-sm font-medium text-slate-700">Release reason (optional)</label>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. End of shift"
        className="mb-4 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
      />

      {error && <ErrorMessage message={error} />}

      <button
        type="button"
        onClick={() => releaseMutation.mutate()}
        disabled={releaseMutation.isPending}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {releaseMutation.isPending ? "Releasing…" : "Release Machine"}
      </button>
    </div>
  );
}
