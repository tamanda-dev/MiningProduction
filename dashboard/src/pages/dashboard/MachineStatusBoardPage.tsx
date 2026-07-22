import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorMessage, extractErrorMessage } from "@/components/common/ErrorMessage";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { Modal } from "@/components/common/Modal";
import { api } from "@/lib/api";
import { MACHINE_STATUS_COLOR } from "@/lib/chartTheme";
import { useSiteFilter } from "@/lib/SiteFilterContext";
import { useLookup } from "@/lib/useLookup";
import type { MachineStatusRow, MachineType, MachineTypeQualification, Paginated, Section, UserSummary } from "@/types";

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  breakdown: "Breakdown",
  maintenance: "Maintenance",
  retired: "Retired",
};

// Supervisor+ pushes an idle machine to a specific operator (rather than
// the operator having to self-activate it) — the assignment then shows up
// in that operator's own "My Shift" for them to enter production/breakdown
// data against.
function AssignMachineModal({
  row,
  siteId,
  onClose,
}: {
  row: MachineStatusRow;
  siteId: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: sections } = useLookup<Section>("sections", { site: siteId });
  const { data: qualifications } = useQuery({
    queryKey: ["machine-qualifications", "for-assign", row.machine_type, siteId],
    queryFn: async () => {
      const { data } = await api.get<Paginated<MachineTypeQualification>>("/machine-qualifications/", {
        params: { machine_type: row.machine_type, active: "true", page_size: 500 },
      });
      return data.results.filter((q) => q.site === siteId || q.site === null);
    },
  });
  const { data: users } = useLookup<UserSummary>("users");
  const qualifiedOperators = (users ?? []).filter((u) => qualifications?.some((q) => q.user === u.id));

  const [operator, setOperator] = useState("");
  const [section, setSection] = useState("");
  const [error, setError] = useState<string | null>(null);

  const assignMutation = useMutation({
    mutationFn: async () =>
      api.post(`/machines/${row.machine}/assign/`, { operator: Number(operator), section: Number(section) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "machine-status"] });
      handleClose();
    },
    onError: (err) => setError(extractErrorMessage(err)),
  });

  function handleClose() {
    setOperator("");
    setSection("");
    setError(null);
    onClose();
  }

  return (
    <Modal open onClose={handleClose} title={`Assign ${row.machine_type_name} ${row.fleet_number}`}>
      <div className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Operator</label>
          <select
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">—</option>
            {qualifiedOperators.map((u) => (
              <option key={u.id} value={u.id}>
                {[u.first_name, u.last_name].filter(Boolean).join(" ") || u.username}
              </option>
            ))}
          </select>
          {qualifications && qualifiedOperators.length === 0 && (
            <p className="mt-1 text-xs text-slate-400">
              No operator is qualified for this machine type at this site yet — grant a qualification first (Master
              Data &gt; Assign Machines).
            </p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Section</label>
          <select
            value={section}
            onChange={(e) => setSection(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">—</option>
            {sections?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {error && <ErrorMessage message={error} />}

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            disabled={!operator || !section || assignMutation.isPending}
            onClick={() => {
              setError(null);
              assignMutation.mutate();
            }}
          >
            {assignMutation.isPending ? "Assigning…" : "Assign"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function MachineStatusBoardPage() {
  const { siteId } = useSiteFilter();
  const { data: machineTypes } = useLookup<MachineType>("machine-types");
  const [machineTypeId, setMachineTypeId] = useState<number | null>(null);
  const [assigningRow, setAssigningRow] = useState<MachineStatusRow | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "machine-status", siteId, machineTypeId],
    queryFn: async () => {
      const { data } = await api.get<MachineStatusRow[]>("/dashboard/machine-status/", {
        params: { site: siteId, machine_type: machineTypeId ?? undefined },
      });
      return data;
    },
    enabled: siteId !== null,
    refetchInterval: 30_000,
  });

  const rows = data ?? [];
  const summary = ["active", "breakdown", "maintenance", "retired"].map((status) => ({
    status,
    count: rows.filter((r) => r.status === status).length,
  }));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">Machine Status Board</h1>
        <select
          value={machineTypeId ?? ""}
          onChange={(e) => setMachineTypeId(e.target.value ? Number(e.target.value) : null)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">All types</option>
          {machineTypes?.map((mt) => (
            <option key={mt.id} value={mt.id}>
              {mt.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        {summary.map((s) => (
          <div
            key={s.status}
            className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm"
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: MACHINE_STATUS_COLOR[s.status] }}
            />
            {STATUS_LABEL[s.status]}: <span className="font-semibold">{s.count}</span>
          </div>
        ))}
      </div>

      {isLoading && <LoadingSpinner />}
      {isError && <ErrorMessage message="Failed to load machine status." />}

      {data && rows.length === 0 && <EmptyState message="No machines found for this site." />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {rows.map((row) => (
          <Card key={row.machine}>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold text-slate-900">
                {row.machine_type_name} {row.fleet_number}
              </span>
              <Badge label={STATUS_LABEL[row.status]} color={MACHINE_STATUS_COLOR[row.status]} />
            </div>
            <div className="text-sm text-slate-500">
              {row.operator_label ? (
                <>
                  Operated by <span className="font-medium text-slate-700">{row.operator_label}</span>
                  {row.assignment_started_at && (
                    <div className="text-xs text-slate-400">
                      Since {new Date(row.assignment_started_at).toLocaleTimeString()}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="mb-2">Idle — no active operator</div>
                  {row.status === "active" && (
                    <button
                      type="button"
                      onClick={() => setAssigningRow(row)}
                      className="font-medium text-brand-600 hover:text-brand-700 hover:underline"
                    >
                      Assign to Operator
                    </button>
                  )}
                </>
              )}
            </div>
          </Card>
        ))}
      </div>

      {assigningRow && siteId && (
        <AssignMachineModal row={assigningRow} siteId={siteId} onClose={() => setAssigningRow(null)} />
      )}
    </div>
  );
}
