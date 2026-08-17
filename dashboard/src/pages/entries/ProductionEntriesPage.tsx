import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useAuth } from "@/auth/useAuth";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { DownloadPdfButton } from "@/components/common/DownloadPdfButton";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorMessage, extractErrorMessage } from "@/components/common/ErrorMessage";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { Modal } from "@/components/common/Modal";
import { Pagination } from "@/components/common/Pagination";
import { ShiftInstancePicker } from "@/components/common/ShiftInstancePicker";
import { DynamicField, type FieldValue } from "@/components/operate/DynamicField";
import { EntryHistoryPanel } from "@/components/entries/EntryHistoryPanel";
import { api } from "@/lib/api";
import { ENTRY_STATUS_COLOR } from "@/lib/chartTheme";
import { useSiteFilter } from "@/lib/SiteFilterContext";
import { useLookup } from "@/lib/useLookup";
import type {
  EntryStatus,
  FormSchemaParameter,
  Machine,
  Paginated,
  ProductionEntry,
  Section,
  ShiftInstance,
} from "@/types";

const PAGE_SIZE = 25;

const STATUS_OPTIONS: EntryStatus[] = ["submitted", "flagged", "corrected", "approved"];

function EditEntryForm({
  entry,
  machineTypeId,
  onCancel,
  onSaved,
  requireOverrideReason,
}: {
  entry: ProductionEntry;
  machineTypeId: number;
  onCancel: () => void;
  onSaved: () => void;
  requireOverrideReason: boolean;
}) {
  const queryClient = useQueryClient();
  const [comments, setComments] = useState(entry.comments);
  const [overrideReason, setOverrideReason] = useState("");
  const [values, setValues] = useState<Record<string, FieldValue>>(() => {
    const seeded: Record<string, FieldValue> = {};
    for (const v of entry.values_display) {
      seeded[v.parameter_code] = v.value === null ? undefined : (v.value as FieldValue);
    }
    return seeded;
  });
  const [error, setError] = useState<string | null>(null);

  const schemaQuery = useQuery({
    queryKey: ["form-schema", machineTypeId, entry.section],
    queryFn: async () => {
      const { data } = await api.get<FormSchemaParameter[]>(`/machine-types/${machineTypeId}/form-schema/`, {
        params: { section: entry.section },
      });
      return data;
    },
  });
  // Mirrors OperateEntryPage's split: an hourly entry only takes
  // hourly/machine-scoped parameters, a shift-total entry only takes
  // shift-scoped ones — entry_type itself isn't editable here, so this
  // just re-derives the same fixed set the entry was originally created
  // with.
  const parameters = (schemaQuery.data ?? []).filter((p) =>
    entry.entry_type === "shift_total" ? p.scope === "shift" : p.scope !== "shift",
  );

  const saveMutation = useMutation({
    mutationFn: async () =>
      api.patch(`/production-entries/${entry.id}/`, {
        comments,
        override_reason: requireOverrideReason ? overrideReason : undefined,
        values: parameters
          .filter((p) => values[p.code] !== undefined && values[p.code] !== "")
          .map((p) => ({ parameter: p.code, value: values[p.code] })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-entries"] });
      onSaved();
    },
    onError: (err) => setError(extractErrorMessage(err)),
  });

  return (
    <div className="flex flex-col gap-4">
      {schemaQuery.isLoading && <p className="text-sm text-slate-400">Loading form…</p>}
      {parameters.map((param) => (
        <DynamicField
          key={param.code}
          parameter={param}
          value={values[param.code]}
          onChange={(v) => setValues((prev) => ({ ...prev, [param.code]: v }))}
        />
      ))}

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Comments</label>
        <textarea
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
      </div>

      {requireOverrideReason && (
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Reason (required — this shift instance is no longer open)
          </label>
          <textarea
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
      )}

      {error && <ErrorMessage message={error} />}

      <div className="flex gap-2">
        <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Saving…" : "Save"}
        </Button>
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function EntryDetailModal({
  entry,
  onClose,
  machines,
}: {
  entry: ProductionEntry;
  onClose: () => void;
  machines?: Machine[];
}) {
  const { hasRole, user } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const statusMutation = useMutation({
    mutationFn: async (status: EntryStatus) => api.patch(`/production-entries/${entry.id}/`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["production-entries"] }),
    onError: (err) => setError(extractErrorMessage(err)),
  });

  const { data: shiftInstance } = useQuery({
    queryKey: ["shift-instance", entry.shift_instance],
    queryFn: async () => {
      const { data } = await api.get<ShiftInstance>(`/shift-instances/${entry.shift_instance}/`);
      return data;
    },
  });

  const machine = machines?.find((m) => m.id === entry.machine);
  const shiftOpen = shiftInstance?.status === "open";
  const isOwnEntry = user?.id === entry.operator;
  // An operator may fix their own mistake, but only while the shift is
  // still open — once closed/approved, correcting it is a Supervisor+
  // call (and requires an override reason server-side; see
  // entries/services.py::enforce_shift_window).
  const canEdit = machine !== undefined && (hasRole("supervisor") || (isOwnEntry && shiftOpen));

  return (
    <Modal open onClose={onClose} title={`Production Entry #${entry.id}`} wide>
      {editing && machine ? (
        <EditEntryForm
          entry={entry}
          machineTypeId={machine.machine_type}
          requireOverrideReason={hasRole("supervisor") && !shiftOpen}
          onCancel={() => setEditing(false)}
          onSaved={onClose}
        />
      ) : (
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

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</h3>
            <div className="flex flex-wrap gap-2">
              {canEdit && (
                <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              )}
              {hasRole("supervisor") &&
                STATUS_OPTIONS.filter((s) => s !== entry.status).map((s) => (
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

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">History</h3>
            <EntryHistoryPanel modelName="productionentry" objectId={entry.id} />
          </div>
        </div>
      )}
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
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ProductionEntry | null>(null);

  const sectionName = (id: number) => sections?.find((s) => s.id === id)?.name ?? id;
  const machineLabel = (id: number | null) => {
    if (!id) return "—";
    const m = machines?.find((m) => m.id === id);
    return m ? `${m.machine_type_code.toUpperCase()} ${m.fleet_number}` : id;
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ["production-entries", siteId, sectionId, machineId, shiftInstanceId, status, dateFrom, dateTo],
    queryFn: async () => {
      const { data } = await api.get<Paginated<ProductionEntry>>("/production-entries/", {
        params: {
          site: siteId,
          section: sectionId ?? undefined,
          machine: machineId ?? undefined,
          shift_instance: shiftInstanceId ?? undefined,
          status: status || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          page_size: 500,
          ordering: "-slot_start_at",
        },
      });
      return data.results;
    },
    enabled: siteId !== null,
  });

  const filtered = useMemo(() => {
    if (!data) return undefined;
    if (!search.trim()) return data;
    const needle = search.trim().toLowerCase();
    return data.filter((entry) =>
      [sectionName(entry.section), machineLabel(entry.machine), entry.entry_type, entry.status, entry.comments]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, search, sections, machines]);

  const pageCount = filtered ? Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)) : 1;
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered?.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

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
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search…"
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
        <DownloadPdfButton
          title="Production Entries"
          columns={[
            { key: "slot", label: "Slot Start" },
            { key: "section", label: "Section" },
            { key: "machine", label: "Machine" },
            { key: "type", label: "Type" },
            { key: "status", label: "Status" },
          ]}
          rows={(filtered ?? []).map((entry) => ({
            slot: entry.slot_start_at ? new Date(entry.slot_start_at).toLocaleString() : "(shift total)",
            section: String(sectionName(entry.section)),
            machine: String(machineLabel(entry.machine)),
            type: entry.entry_type,
            status: entry.status,
          }))}
        />
      </div>

      {isLoading && <LoadingSpinner />}
      {isError && <ErrorMessage message="Failed to load entries." />}

      {pageRows && (
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
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-2">
                    <EmptyState message="No entries match these filters." />
                  </td>
                </tr>
              )}
              {pageRows.map((entry) => (
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

      {filtered && (
        <Pagination page={currentPage} pageCount={pageCount} totalCount={filtered.length} onChange={setPage} />
      )}

      {selected && (
        <EntryDetailModal entry={selected} onClose={() => setSelected(null)} machines={machines} />
      )}
    </div>
  );
}
