import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/common/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorMessage, extractErrorMessage } from "@/components/common/ErrorMessage";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { Modal } from "@/components/common/Modal";
import { api } from "@/lib/api";
import { useLookup } from "@/lib/useLookup";
import type { Machine, MachineTypeQualification, Paginated, Site, UserSummary } from "@/types";

export function userLabel(user: UserSummary) {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
  return fullName ? `${fullName} (${user.username})` : user.username;
}

// Shared by the Admin-only Users page and the Supervisor+ "Assign
// Machines" page — the underlying /machine-qualifications/ API is
// Supervisor+ writable (a Supervisor is who actually knows which of their
// operators should run which specific machine), so this modal doesn't
// assume anything about who's allowed to open it beyond what the API
// itself already enforces.
//
// Deliberately assigns one specific physical Machine, not a machine type
// (and with no separate site step — whichever machine is picked already
// has a site). The operator still says which site they're actually
// working at for themselves when they activate a machine; this only
// controls whether that one unit shows up in their picker once they get
// there.
export function QualificationsModal({ user, onClose }: { user: UserSummary | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: sites } = useLookup<Site>("sites");
  const { data: machines } = useLookup<Machine>("machines");
  const [machine, setMachine] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const { data: qualifications, isLoading } = useQuery({
    queryKey: ["machine-qualifications", user?.id],
    queryFn: async () => {
      const { data } = await api.get<Paginated<MachineTypeQualification>>("/machine-qualifications/", {
        params: { user: user!.id, page_size: 500 },
      });
      return data.results;
    },
    enabled: user !== null,
  });

  const addMutation = useMutation({
    mutationFn: async () => api.post("/machine-qualifications/", { user: user!.id, machine: Number(machine) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["machine-qualifications", user?.id] });
      setMachine("");
      setError(null);
    },
    onError: (err) => setError(extractErrorMessage(err)),
  });

  const removeMutation = useMutation({
    mutationFn: async (qualId: number) => api.delete(`/machine-qualifications/${qualId}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["machine-qualifications", user?.id] }),
  });

  const siteName = (id: number) => sites?.find((s) => s.id === id)?.name ?? id;
  const machineLabel = (m: Machine) =>
    `${m.machine_type_code.toUpperCase()} ${m.fleet_number}${m.name ? ` (${m.name})` : ""} — ${siteName(m.site)}`;
  const qualifiedMachineLabel = (qual: MachineTypeQualification) => {
    const m = machines?.find((mm) => mm.id === qual.machine);
    if (m) return machineLabel(m);
    // Legacy/other-API grant with no specific machine — falls back to the
    // broader machine_type(+site) shape this same model still supports.
    return qual.site ? `Any ${qual.machine_type_code?.toUpperCase() ?? "machine"} — ${siteName(qual.site)}` : `Any ${qual.machine_type_code?.toUpperCase() ?? "machine"} — any site`;
  };

  // Already-assigned machines don't need to show up again in the picker.
  const assignedMachineIds = new Set((qualifications ?? []).map((q) => q.machine).filter((id): id is number => id !== null));
  const availableMachines = (machines ?? []).filter((m) => !assignedMachineIds.has(m.id));

  function handleClose() {
    setMachine("");
    setError(null);
    onClose();
  }

  return (
    <Modal
      open={user !== null}
      onClose={handleClose}
      title={user ? `Assigned Machines — ${userLabel(user)}` : "Assigned Machines"}
      wide
    >
      {user && (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-slate-500">
            Which specific machines this user may operate — drives the machine list they see when activating a
            machine to start a shift. They still pick their own site when activating; this just controls which unit
            shows up for them once they get there.
          </p>
          {isLoading && <LoadingSpinner />}
          {qualifications && qualifications.length === 0 && (
            <EmptyState message="No machines assigned yet." className="py-6" />
          )}
          {qualifications && qualifications.length > 0 && (
            <ul className="flex flex-col gap-2">
              {qualifications.map((qual) => (
                <li
                  key={qual.id}
                  className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <span>{qualifiedMachineLabel(qual)}</span>
                  <button
                    type="button"
                    onClick={() => removeMutation.mutate(qual.id)}
                    disabled={removeMutation.isPending}
                    className="font-medium text-red-600 hover:text-red-700 hover:underline"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-slate-100 pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Assign a Machine</p>
            <label className="mb-1 block text-xs font-medium text-slate-600">Machine</label>
            <select
              value={machine}
              onChange={(e) => setMachine(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            >
              <option value="">—</option>
              {availableMachines.map((m) => (
                <option key={m.id} value={m.id}>
                  {machineLabel(m)}
                </option>
              ))}
            </select>
            {error && (
              <div className="mt-2">
                <ErrorMessage message={error} />
              </div>
            )}
            <div className="mt-3 flex justify-end">
              <Button size="sm" disabled={!machine || addMutation.isPending} onClick={() => addMutation.mutate()}>
                {addMutation.isPending ? "Assigning…" : "+ Assign Machine"}
              </Button>
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="secondary" onClick={handleClose}>
              Close
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
