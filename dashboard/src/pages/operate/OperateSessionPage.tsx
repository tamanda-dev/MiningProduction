import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorMessage, extractErrorMessage } from "@/components/common/ErrorMessage";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { api } from "@/lib/api";
import { useOperateSession } from "@/lib/OperateSessionContext";
import { useLookup } from "@/lib/useLookup";
import type { Machine, MachineAssignment, MachineTypeQualification, Section, Site } from "@/types";

export function OperateSessionPage() {
  const { user, accessibleSiteIds } = useAuth();
  const { selectedSiteId, setSelectedSiteId, activeAssignment, activeMachine, setActiveSession } =
    useOperateSession();
  const navigate = useNavigate();

  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);
  const [activateError, setActivateError] = useState<string | null>(null);

  const { data: sites } = useLookup<Site>("sites", { active: "true" });
  // Operators typically hold zero UserSiteAccess grants (that's the
  // Supervisor mechanism) — their site visibility instead comes
  // from which sites they're qualified to operate machinery at, mirroring
  // mobile/app/site-select.tsx and the backend's MachineViewSet logic.
  const { data: qualifications } = useLookup<MachineTypeQualification>(
    "machine-qualifications",
    user ? { user: user.id, active: "true" } : undefined,
  );

  const hasAnySiteQualification = (qualifications ?? []).some((q) => q.site === null);
  const qualifiedSiteIds = new Set((qualifications ?? []).map((q) => q.site).filter((id): id is number => id !== null));
  const visibleSites = (sites ?? []).filter((s) => {
    if (accessibleSiteIds === null || hasAnySiteQualification) return true;
    return accessibleSiteIds.includes(s.id) || qualifiedSiteIds.has(s.id);
  });

  const machinesQuery = useQuery({
    queryKey: ["machines", "operate", selectedSiteId],
    queryFn: async () => {
      const { data } = await api.get<{ results: Machine[] }>("/machines/", {
        params: { site: selectedSiteId, status: "operating", page_size: 200 },
      });
      return data.results;
    },
    enabled: selectedSiteId !== null,
  });

  const { data: sections } = useLookup<Section>("sections", selectedSiteId ? { site: selectedSiteId, active: "true" } : undefined);

  const activateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedMachine || !selectedSectionId) throw new Error("Pick a machine and section first.");
      const { data } = await api.post<MachineAssignment>(`/machines/${selectedMachine.id}/activate/`, {
        section: selectedSectionId,
      });
      return data;
    },
    onSuccess: (assignment) => {
      setActiveSession(assignment, selectedMachine!);
      navigate("/operate/entry");
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        setActivateError("This machine was just claimed by another operator. Choose a different one.");
        machinesQuery.refetch();
      } else {
        setActivateError(extractErrorMessage(err));
      }
    },
  });

  if (activeAssignment && activeMachine) {
    return (
      <Card>
        <p className="text-sm text-slate-700">
          You already have an active session on{" "}
          <span className="font-semibold">
            {activeMachine.machine_type_code.toUpperCase()} {activeMachine.fleet_number}
          </span>
          .
        </p>
        <Button className="mt-3" onClick={() => navigate("/operate/entry")}>
          Go to Production Entry
        </Button>
      </Card>
    );
  }

  function openMachine(machine: Machine) {
    setActivateError(null);
    setSelectedSectionId(machine.current_section);
    setSelectedMachine(machine);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Site</label>
        <select
          value={selectedSiteId ?? ""}
          onChange={(e) => {
            setSelectedSiteId(e.target.value ? Number(e.target.value) : null);
            setSelectedMachine(null);
          }}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="">Select a site…</option>
          {visibleSites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {selectedSiteId && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Select a machine</h2>
          {machinesQuery.isLoading && <LoadingSpinner />}
          {machinesQuery.isError && <ErrorMessage message="Failed to load machines." />}
          {machinesQuery.data && machinesQuery.data.length === 0 && (
            <EmptyState message="No available machines. You may not be qualified for any machine type at this site yet." />
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {machinesQuery.data?.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => openMachine(m)}
                className={`rounded-lg border-2 p-4 text-left ${
                  selectedMachine?.id === m.id ? "border-brand-600 bg-brand-50" : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <div className="font-semibold text-slate-900">
                  {m.machine_type_code.toUpperCase()} {m.fleet_number}
                </div>
                {m.name && <div className="text-xs text-slate-500">{m.name}</div>}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedMachine && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-800">
            Activate {selectedMachine.machine_type_code.toUpperCase()} {selectedMachine.fleet_number}
          </h2>
          <label className="mb-1 block text-xs font-medium text-slate-500">Section</label>
          <select
            value={selectedSectionId ?? ""}
            onChange={(e) => setSelectedSectionId(e.target.value ? Number(e.target.value) : null)}
            className="mb-3 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">Select a section…</option>
            {sections?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {activateError && <ErrorMessage message={activateError} />}

          <div className="mt-3 flex gap-2">
            <Button
              onClick={() => activateMutation.mutate()}
              disabled={!selectedSectionId || activateMutation.isPending}
            >
              {activateMutation.isPending ? "Activating…" : "Activate Machine"}
            </Button>
            <Button variant="secondary" onClick={() => setSelectedMachine(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
