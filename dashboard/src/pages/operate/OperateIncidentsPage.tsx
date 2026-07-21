import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Badge } from "@/components/common/Badge";
import { ErrorMessage, extractErrorMessage } from "@/components/common/ErrorMessage";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { api } from "@/lib/api";
import { STATUS } from "@/lib/chartTheme";
import { useOperateSession } from "@/lib/OperateSessionContext";
import { useLookup } from "@/lib/useLookup";
import type { BreakdownCause, BreakdownIncident, Paginated } from "@/types";

const SEVERITIES = ["low", "medium", "high"] as const;
type Severity = (typeof SEVERITIES)[number];

function QuickLogForm({ crusherId, onSaved }: { crusherId: number; onSaved: () => void }) {
  const { data: causes } = useLookup<BreakdownCause>("breakdown-causes", { active: "true" });
  const [causeId, setCauseId] = useState<number | null>(null);
  const [otherText, setOtherText] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [error, setError] = useState<string | null>(null);

  const selectedCause = causes?.find((c) => c.id === causeId);

  const mutation = useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString();
      const { data } = await api.post("/breakdown-incidents/", {
        crusher: crusherId,
        time_occurred: now,
        time_reported: now,
        cause: causeId ?? undefined,
        cause_other_text: otherText,
        description,
        severity,
        client_uuid: crypto.randomUUID(),
      });
      return data;
    },
    onSuccess: () => {
      setCauseId(null);
      setOtherText("");
      setDescription("");
      setSeverity("medium");
      onSaved();
    },
    onError: (err) => setError(extractErrorMessage(err)),
  });

  function handleSubmit() {
    if (selectedCause?.is_other && !otherText.trim()) {
      setError("Describe the 'Other' cause.");
      return;
    }
    setError(null);
    mutation.mutate();
  }

  return (
    <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
      <h2 className="mb-3 text-sm font-semibold text-red-900">Quick Log Breakdown</h2>

      <div className="mb-3 flex flex-wrap gap-2">
        {causes?.map((cause) => (
          <button
            key={cause.id}
            type="button"
            onClick={() => setCauseId(cause.id)}
            className={`rounded-md border-2 px-3 py-1.5 text-sm font-medium ${
              causeId === cause.id ? "border-red-600 bg-white text-red-700" : "border-red-200 bg-white text-slate-600"
            }`}
          >
            {cause.name}
          </button>
        ))}
      </div>

      {selectedCause?.is_other && (
        <input
          value={otherText}
          onChange={(e) => setOtherText(e.target.value)}
          placeholder="Describe the 'Other' cause"
          className="mb-3 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
      )}

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description"
        rows={2}
        className="mb-3 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
      />

      <div className="mb-3 flex gap-2">
        {SEVERITIES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSeverity(s)}
            className={`rounded-md border-2 px-3 py-1.5 text-sm font-medium ${
              severity === s ? "border-red-600 bg-white text-red-700" : "border-red-200 bg-white text-slate-600"
            }`}
          >
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {error && <ErrorMessage message={error} />}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={mutation.isPending}
        className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
      >
        {mutation.isPending ? "Saving…" : "Save Incident"}
      </button>
    </div>
  );
}

function IncidentDetail({ incident, onChanged }: { incident: BreakdownIncident; onChanged: (collapse: boolean) => void }) {
  const [rootCause, setRootCause] = useState("");
  const [remedialAction, setRemedialAction] = useState("");
  const [error, setError] = useState<string | null>(null);

  const attendMutation = useMutation({
    mutationFn: async () => api.patch(`/breakdown-incidents/${incident.id}/`, { time_attended: new Date().toISOString() }),
    onSuccess: () => onChanged(false),
    onError: (err) => setError(extractErrorMessage(err)),
  });

  const resolveMutation = useMutation({
    mutationFn: async () =>
      api.post(`/breakdown-incidents/${incident.id}/resolve/`, {
        root_cause_of_failure: rootCause,
        remedial_action_taken: remedialAction,
      }),
    onSuccess: () => onChanged(true),
    onError: (err) => setError(extractErrorMessage(err)),
  });

  function handleResolve() {
    if (!rootCause.trim() || !remedialAction.trim()) {
      setError("Root cause and remedial action are both required to resolve.");
      return;
    }
    setError(null);
    resolveMutation.mutate();
  }

  return (
    <div className="border-t border-slate-100 bg-slate-50 p-4">
      {!incident.time_attended ? (
        <>
          <button
            type="button"
            onClick={() => attendMutation.mutate()}
            disabled={attendMutation.isPending}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {attendMutation.isPending ? "Saving…" : "Mark Attended"}
          </button>
          {error && <ErrorMessage message={error} />}
        </>
      ) : (
        <>
          <label className="mb-1 block text-xs font-medium text-slate-500">Root Cause of Failure</label>
          <textarea
            value={rootCause}
            onChange={(e) => setRootCause(e.target.value)}
            rows={2}
            className="mb-2 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <label className="mb-1 block text-xs font-medium text-slate-500">Remedial Action Taken</label>
          <textarea
            value={remedialAction}
            onChange={(e) => setRemedialAction(e.target.value)}
            rows={2}
            className="mb-2 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          {error && <ErrorMessage message={error} />}
          <button
            type="button"
            onClick={handleResolve}
            disabled={resolveMutation.isPending}
            className="mt-2 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {resolveMutation.isPending ? "Saving…" : "Mark Resolved"}
          </button>
        </>
      )}
    </div>
  );
}

export function OperateIncidentsPage() {
  const { activeMachine, isRestoring } = useOperateSession();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["operate-incidents", activeMachine?.site],
    queryFn: async () => {
      const { data } = await api.get<Paginated<BreakdownIncident>>("/breakdown-incidents/", {
        params: { site: activeMachine?.site, status__in: "open,in_progress", ordering: "-time_occurred" },
      });
      return data.results;
    },
    enabled: Boolean(activeMachine),
  });

  if (isRestoring) return null;
  if (!activeMachine) return <Navigate to="/operate/session" replace />;

  // Used by both the quick-log form (nothing expanded yet, so collapsing
  // is a no-op) and "Mark Attended" (must NOT collapse — that would force
  // the operator to re-expand the row just to reach the resolve fields
  // that "Mark Attended" itself just revealed). "Mark Resolved" passes
  // collapse=true since the incident then drops out of the open/
  // in-progress filtered list entirely, making the expanded state moot.
  function refresh(collapse = false) {
    queryClient.invalidateQueries({ queryKey: ["operate-incidents"] });
    if (collapse) setExpandedId(null);
  }

  const incidents = data ?? [];

  return (
    <div className="max-w-2xl">
      <QuickLogForm crusherId={activeMachine.id} onSaved={refresh} />

      <h2 className="mb-2 text-sm font-semibold text-slate-800">Open Incidents</h2>
      {isLoading && <LoadingSpinner />}
      {isError && <ErrorMessage message="Failed to load incidents." />}
      {data && incidents.length === 0 && <p className="text-sm text-slate-400">No open or in-progress incidents.</p>}

      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {incidents.map((incident) => (
          <div key={incident.id}>
            <button
              type="button"
              onClick={() => setExpandedId(expandedId === incident.id ? null : incident.id)}
              className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
            >
              <div>
                <div className="text-sm font-medium text-slate-900">Incident #{incident.id}</div>
                <div className="text-xs text-slate-500">{new Date(incident.time_occurred).toLocaleString()}</div>
              </div>
              <Badge
                label={incident.status === "open" ? "Open" : "In Progress"}
                color={incident.status === "open" ? STATUS.critical : STATUS.warning}
                variant="soft"
              />
            </button>
            {expandedId === incident.id && <IncidentDetail incident={incident} onChanged={refresh} />}
          </div>
        ))}
      </div>
    </div>
  );
}
