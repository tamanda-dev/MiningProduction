import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/auth/useAuth";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorMessage, extractErrorMessage } from "@/components/common/ErrorMessage";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { Modal } from "@/components/common/Modal";
import { ShiftInstancePicker } from "@/components/common/ShiftInstancePicker";
import { EntryHistoryPanel } from "@/components/entries/EntryHistoryPanel";
import { api } from "@/lib/api";
import { ENTRY_STATUS_COLOR } from "@/lib/chartTheme";
import { useSiteFilter } from "@/lib/SiteFilterContext";
import { useLookup } from "@/lib/useLookup";
import type { EntryStatus, Machine, Paginated, ProductionEntry, Section, ShiftInstance } from "@/types";

const STATUS_OPTIONS: EntryStatus[] = ["submitted", "flagged", "corrected", "approved"];

function EntryDetailModal({ entry, onClose }: { entry: ProductionEntry; onClose: () => void }) {
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const statusMutation = useMutation({
    mutationFn: async (status: EntryStatus) => api.patch(`/production-entries/${entry.id}/`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["production-entries"] }),
    onError: (err) => setError(extractErrorMessage(err)),
  });

  return (
    <Modal open onClose={onClose} title={`Production Entry #${entry.id}`} wide>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <Detail label="Entry Type" value={entry.entry_type} />
          <Detail label="Slot" value={entry.slot_index !== null ? `#${entry.slot_index}` : "—"} />
          <Detail label="Status" value={<Badge label={entry.status} color={ENTRY_STATUS_COLOR[entry.status]} />} />
          <Detail
            label="Slot Window"
            value={
              entry.slot_start_at
                ? `${new Date(entry.slot_start_at).toLocaleTimeString()} – ${new Date(entry.slot_end_at!).toLocaleTimeString()}`
                : "—"
            }
          />
          <Detail label="Source" value={entry.source} />
          <Detail label="Comments" value={entry.comments || "—"} />
        </div>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Values</h3>
          <table className="w-full text-left text-sm">
            <tbody>
              {entry.values_display.length === 0 && (
                <tr>
                  <td className="py-1 text-slate-400">No parameter values recorded.</td>
                </tr>
              )}
              {entry.values_display.map((v) => (
                <tr key={v.parameter} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 text-slate-600">{v.parameter_name}</td>
                  <td className="py-1.5 text-right font-medium text-slate-900">{String(v.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {hasRole("supervisor") && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</h3>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.filter((s) => s !== entry.status).map((s) => (
                <Button
                  key={s}
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setError(null);
                    statusMutation.mutate(s);
                  }}
                >
                  Mark {s}
                </Button>
              ))}
            </div>
            {error && (
              <div className="mt-2">
                <ErrorMessage message={error} />
              </div>
            )}
          </div>
        )}

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">History</h3>
          <EntryHistoryPanel modelName="productionentry" objectId={entry.id} />
        </div>
      </div>
    </Modal>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-slate-800">{value}</div>
    </div>
  );
}

export function ProductionEntriesPage() {
  const { siteId } = useSiteFilter();
  const { data: sections } = useLookup<Section>("sections", siteId ? { site: siteId } : undefined);
  const { data: machines } = useLookup<Machine>("machines", siteId ? { site: siteId } : undefined);
  const { data: shiftInstances } = useLookup<ShiftInstance>(
    "shift-instances",
    siteId ? { site: siteId, ordering: "-date" } : undefined,
  );

  const [sectionId, setSectionId] = useState<number | null>(null);
  const [machineId, setMachineId] = useState<number | null>(null);
  const [shiftInstanceId, setShiftInstanceId] = useState<number | null>(null);
  const [status, setStatus] = useState<string>("");
  const [selected, setSelected] = useState<ProductionEntry | null>(null);

  const sectionName = (id: number) => sections?.find((s) => s.id === id)?.name ?? id;
  const machineLabel = (id: number | null) => {
    if (!id) return "—";
    const m = machines?.find((m) => m.id === id);
    return m ? `${m.machine_type_code.toUpperCase()} ${m.fleet_number}` : id;
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ["production-entries", siteId, sectionId, machineId, shiftInstanceId, status],
    queryFn: async () => {
      const { data } = await api.get<Paginated<ProductionEntry>>("/production-entries/", {
        params: {
          site: siteId,
          section: sectionId ?? undefined,
          machine: machineId ?? undefined,
          shift_instance: shiftInstanceId ?? undefined,
          status: status || undefined,
          page_size: 100,
          ordering: "-slot_start_at",
        },
      });
      return data.results;
    },
    enabled: siteId !== null,
  });

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-slate-900">Production Entries</h1>

      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={sectionId ?? ""}
          onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : null)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">All sections</option>
          {sections?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={machineId ?? ""}
          onChange={(e) => setMachineId(e.target.value ? Number(e.target.value) : null)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">All machines</option>
          {machines?.map((m) => (
            <option key={m.id} value={m.id}>
              {m.machine_type_code.toUpperCase()} {m.fleet_number}
            </option>
          ))}
        </select>
        <ShiftInstancePicker
          shiftInstances={shiftInstances}
          value={shiftInstanceId}
          onChange={setShiftInstanceId}
          placeholder="All shifts"
          showStatus={false}
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <LoadingSpinner />}
      {isError && <ErrorMessage message="Failed to load entries." />}

      {data && (
        <Card padded={false} className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Slot Start</th>
                <th className="px-4 py-3 font-medium">Section</th>
                <th className="px-4 py-3 font-medium">Machine</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-2">
                    <EmptyState message="No entries match these filters." />
                  </td>
                </tr>
              )}
              {data.map((entry) => (
                <tr
                  key={entry.id}
                  onClick={() => setSelected(entry)}
                  className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-3">
                    {entry.slot_start_at ? new Date(entry.slot_start_at).toLocaleString() : "(shift total)"}
                  </td>
                  <td className="px-4 py-3">{sectionName(entry.section)}</td>
                  <td className="px-4 py-3">{machineLabel(entry.machine)}</td>
                  <td className="px-4 py-3">{entry.entry_type}</td>
                  <td className="px-4 py-3">
                    <Badge label={entry.status} color={ENTRY_STATUS_COLOR[entry.status]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {selected && <EntryDetailModal entry={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
