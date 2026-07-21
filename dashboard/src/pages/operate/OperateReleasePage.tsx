import axios from "axios";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Modal } from "@/components/common/Modal";
import { ErrorMessage, extractErrorMessage } from "@/components/common/ErrorMessage";
import { API_BASE_URL, api } from "@/lib/api";
import { tokenStore } from "@/lib/tokenStore";
import { useOperateSession } from "@/lib/OperateSessionContext";
import type { MachineAssignment, Me } from "@/types";

export function OperateReleasePage() {
  const { activeMachine, isRestoring, clearActiveSession } = useOperateSession();
  const navigate = useNavigate();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [handoverOpen, setHandoverOpen] = useState(false);
  const [handoverUsername, setHandoverUsername] = useState("");
  const [handoverPassword, setHandoverPassword] = useState("");
  const [handoverError, setHandoverError] = useState<string | null>(null);

  const releaseMutation = useMutation({
    mutationFn: async () => api.post(`/machines/${activeMachine!.id}/release/`, { reason }),
    onSuccess: () => {
      clearActiveSession();
      navigate("/operate/session");
    },
    onError: (err) => setError(extractErrorMessage(err)),
  });

  const handoverMutation = useMutation({
    mutationFn: async () => {
      // Verify the incoming operator's own credentials (a separate,
      // throwaway token exchange — the current operator's session is what
      // actually authorizes the handover call below) to resolve their user
      // id, since operators can't list other users via the API. Mirrors
      // mobile/app/session/release.tsx's confirmHandover().
      const { data: incomingTokens } = await axios.post(`${API_BASE_URL}/auth/login/`, {
        username: handoverUsername.trim(),
        password: handoverPassword,
      });
      const { data: incomingMe } = await axios.get<Me>(`${API_BASE_URL}/auth/me/`, {
        headers: { Authorization: `Bearer ${incomingTokens.access}` },
      });
      await api.post<MachineAssignment>(`/machines/${activeMachine!.id}/handover/`, {
        new_operator: incomingMe.id,
      });
      return incomingTokens;
    },
    onSuccess: (incomingTokens) => {
      // Adopt the incoming operator's already-verified tokens as the new
      // session, then a hard reload so AuthContext/OperateSessionContext
      // both re-mount and rehydrate as the new operator from scratch,
      // rather than carrying over stale `user`/session state in memory.
      tokenStore.setTokens(incomingTokens.access, incomingTokens.refresh);
      window.location.href = "/operate/entry";
    },
    onError: (err) => setHandoverError(extractErrorMessage(err)),
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

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => releaseMutation.mutate()}
          disabled={releaseMutation.isPending}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {releaseMutation.isPending ? "Releasing…" : "Release Machine"}
        </button>
        <button
          type="button"
          onClick={() => setHandoverOpen(true)}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          Hand Over to Next Operator
        </button>
      </div>

      <Modal open={handoverOpen} title="Hand Over Machine" onClose={() => setHandoverOpen(false)}>
        <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
          This signs a different operator in and switches the active operator on this machine away from you.
        </div>
        <p className="mb-3 text-sm text-slate-600">
          Incoming operator: sign in below to confirm you're taking over this machine.
        </p>

        <label className="mb-1 block text-sm font-medium text-slate-700">Username</label>
        <input
          value={handoverUsername}
          onChange={(e) => setHandoverUsername(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          className="mb-3 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
        <input
          type="password"
          value={handoverPassword}
          onChange={(e) => setHandoverPassword(e.target.value)}
          className="mb-3 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />

        {handoverError && <ErrorMessage message={handoverError} />}

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => handoverMutation.mutate()}
            disabled={handoverMutation.isPending || !handoverUsername || !handoverPassword}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {handoverMutation.isPending ? "Confirming…" : "Confirm Handover"}
          </button>
          <button
            type="button"
            onClick={() => setHandoverOpen(false)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
