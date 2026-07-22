import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/common/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorMessage, extractErrorMessage } from "@/components/common/ErrorMessage";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { Modal } from "@/components/common/Modal";
import { api } from "@/lib/api";
import { useLookup } from "@/lib/useLookup";
import type { MachineType, MachineTypeQualification, Paginated, Site, UserSummary } from "@/types";

export function userLabel(user: UserSummary) {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
  return fullName ? `${fullName} (${user.username})` : user.username;
}

// Shared by the Admin-only Users page and the Supervisor+ "Assign
// Machines" page — the underlying /machine-qualifications/ API is
// Supervisor+ writable (a Supervisor is who actually knows which of their
// operators are certified on which machine types), so this modal doesn't
// assume anything about who's allowed to open it beyond what the API
// itself already enforces.
export function QualificationsModal({ user, onClose }: { user: UserSummary | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: sites } = useLookup<Site>("sites");
  const { data: machineTypes } = useLookup<MachineType>("machine-types");
  const [machineType, setMachineType] = useState<string>("");
  const [site, setSite] = useState<string>("");
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
    mutationFn: async () =>
      api.post("/machine-qualifications/", {
        user: user!.id,
        machine_type: Number(machineType),
        site: site ? Number(site) : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["machine-qualifications", user?.id] });
      setMachineType("");
      setSite("");
      setError(null);
    },
    onError: (err) => setError(extractErrorMessage(err)),
  });

  const removeMutation = useMutation({
    mutationFn: async (qualId: number) => api.delete(`/machine-qualifications/${qualId}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["machine-qualifications", user?.id] }),
  });

  const machineTypeName = (id: number) => machineTypes?.find((m) => m.id === id)?.name ?? id;
  const siteName = (id: number | null) => (id ? sites?.find((s) => s.id === id)?.name ?? id : "Any site");

  function handleClose() {
    setMachineType("");
    setSite("");
    setError(null);
    onClose();
  }

  return (
    <Modal
      open={user !== null}
      onClose={handleClose}
      title={user ? `Machine Qualifications — ${userLabel(user)}` : "Machine Qualifications"}
      wide
    >
      {user && (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-slate-500">
            Which machine types this user is certified to operate — drives the machine list they see when
            activating a machine to start a shift.
          </p>
          {isLoading && <LoadingSpinner />}
          {qualifications && qualifications.length === 0 && (
            <EmptyState message="No machine-type qualifications yet." className="py-6" />
          )}
          {qualifications && qualifications.length > 0 && (
            <ul className="flex flex-col gap-2">
              {qualifications.map((qual) => (
                <li
                  key={qual.id}
                  className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <span>
                    {machineTypeName(qual.machine_type)} —{" "}
                    <span className="text-slate-500">{siteName(qual.site)}</span>
                  </span>
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
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Add Qualification</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Machine Type</label>
                <select
                  value={machineType}
                  onChange={(e) => setMachineType(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                >
                  <option value="">—</option>
                  {machineTypes?.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Site <span className="font-normal text-slate-400">(blank = any site)</span>
                </label>
                <select
                  value={site}
                  onChange={(e) => setSite(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                >
                  <option value="">—</option>
                  {sites?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {error && (
              <div className="mt-2">
                <ErrorMessage message={error} />
              </div>
            )}
            <div className="mt-3 flex justify-end">
              <Button size="sm" disabled={!machineType || addMutation.isPending} onClick={() => addMutation.mutate()}>
                {addMutation.isPending ? "Adding…" : "+ Add Qualification"}
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
