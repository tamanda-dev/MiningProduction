import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/common/Button";
import { DownloadPdfButton } from "@/components/common/DownloadPdfButton";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorMessage, extractErrorMessage } from "@/components/common/ErrorMessage";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { Modal } from "@/components/common/Modal";
import { Pagination } from "@/components/common/Pagination";
import { api } from "@/lib/api";
import type { Paginated } from "@/types";

const PAGE_SIZE = 25;

export interface FieldOption {
  value: string | number;
  label: string;
}

export interface FieldConfig {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "boolean" | "select" | "multiselect" | "time" | "date";
  // A function lets a field's choices depend on another field's current
  // value in the same form (e.g. "Section" narrowed to the selected
  // "Site") instead of always listing every row from the lookup.
  options?: FieldOption[] | ((values: FormValues) => FieldOption[]);
  required?: boolean;
  helpText?: string;
}

export interface ColumnConfig<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
}

export interface MasterDataResourceConfig<T extends { id: number }> {
  resource: string;
  title: string;
  columns: ColumnConfig<T>[];
  fields: FieldConfig[];
  canWrite: boolean;
  defaultValues?: Record<string, unknown>;
  extraParams?: Record<string, string | number>;
  /** Raw field name (not necessarily a rendered column) to expose a From/To
   * date range filter for — sent to the server as `{field}__gte`/`__lte`
   * so it narrows the actual query instead of just hiding already-fetched
   * rows client-side. Opt-in: most master data (Sites, Parameters, ...) has
   * no meaningful date to filter by; operational/log-like resources
   * (Plan Targets, Shift Instances) do.
   */
  dateField?: keyof T & string;
  /** Which raw field values the search box matches against (case-
   * insensitive substring). Defaults to every configured column's key. */
  searchKeys?: (keyof T & string)[];
}

type FormValues = Record<string, unknown>;

function resolveOptions(field: FieldConfig, values: FormValues): FieldOption[] {
  if (typeof field.options === "function") return field.options(values);
  return field.options ?? [];
}

function buildPayload(fields: FieldConfig[], values: FormValues): FormValues {
  const payload: FormValues = { ...values };
  fields.forEach((f) => {
    if (f.required || payload[f.key] !== "") return;
    // DRF's non-char fields (numbers, dates/times, FK selects) reject an
    // empty string outright ("A valid integer is required.", etc.) even
    // when the underlying model field is null=True/blank=True with a
    // default — only CharField-backed types treat "" as a real value.
    // Leaving an optional field like this untouched should mean "use the
    // model's default/null", so omit it rather than send a "" the API
    // will always reject.
    if (f.type !== "text" && f.type !== "textarea") {
      delete payload[f.key];
    }
  });
  return payload;
}

function fieldDefault(field: FieldConfig): unknown {
  if (field.type === "boolean") return true;
  if (field.type === "multiselect") return [];
  return "";
}

export function MasterDataTable<T extends { id: number }>({ config }: { config: MasterDataResourceConfig<T> }) {
  const { resource, title, columns, fields, canWrite, defaultValues, extraParams, dateField, searchKeys } = config;
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const dateParams = dateField
    ? { [`${dateField}__gte`]: dateFrom || undefined, [`${dateField}__lte`]: dateTo || undefined }
    : {};
  const queryKey = [resource, extraParams ?? {}, dateParams];

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data } = await api.get<Paginated<T>>(`/${resource}/`, {
        params: { page_size: 500, ...extraParams, ...dateParams },
      });
      return data.results;
    },
  });

  const effectiveSearchKeys = searchKeys ?? columns.map((c) => c.key as keyof T & string);
  const filtered = useMemo(() => {
    if (!data) return undefined;
    if (!search.trim()) return data;
    const needle = search.trim().toLowerCase();
    return data.filter((row) =>
      effectiveSearchKeys.some((key) =>
        String((row as Record<string, unknown>)[key] ?? "").toLowerCase().includes(needle),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, search]);

  const pageCount = filtered ? Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)) : 1;
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered?.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function cellText(row: T, col: ColumnConfig<T>): string {
    if (col.render) {
      const rendered = col.render(row);
      return typeof rendered === "string" || typeof rendered === "number" ? String(rendered) : "";
    }
    return String((row as Record<string, unknown>)[col.key] ?? "");
  }

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [formValues, setFormValues] = useState<FormValues>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  function openCreate() {
    const initial: FormValues = { ...defaultValues };
    fields.forEach((f) => {
      if (!(f.key in initial)) initial[f.key] = fieldDefault(f);
    });
    setEditing(null);
    setFormValues(initial);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(row: T) {
    const initial: FormValues = {};
    fields.forEach((f) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initial[f.key] = (row as any)[f.key];
    });
    setEditing(row);
    setFormValues(initial);
    setFormError(null);
    setModalOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (editing) {
        return api.patch(`/${resource}/${editing.id}/`, values);
      }
      return api.post(`/${resource}/`, values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [resource] });
      setModalOpen(false);
    },
    onError: (err) => setFormError(extractErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/${resource}/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [resource] });
      setConfirmDeleteId(null);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    saveMutation.mutate(buildPayload(fields, formValues));
  }

  function updateField(key: string, value: unknown) {
    setFormValues((prev) => {
      const next = { ...prev, [key]: value };
      // A field whose options depend on another field (e.g. "Section"
      // narrowed by "Site") can end up holding a value that's no longer a
      // valid choice once the field it depends on changes — clear it
      // rather than silently submitting a stale, now-hidden option.
      fields.forEach((f) => {
        if (f.key === key || typeof f.options !== "function") return;
        const allowed = f.options(next);
        if (allowed.length > 0 && !allowed.some((opt) => String(opt.value) === String(next[f.key]))) {
          next[f.key] = "";
        }
      });
      return next;
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        {canWrite && (
          <Button onClick={openCreate}>+ Add</Button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Search</label>
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
        </div>
        {dateField && (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
          </>
        )}
        <DownloadPdfButton
          title={title}
          columns={columns.map((c) => ({ key: c.key, label: c.label }))}
          rows={(filtered ?? []).map((row) =>
            Object.fromEntries(columns.map((c) => [c.key, cellText(row, c)])),
          )}
        />
      </div>

      {isLoading && <LoadingSpinner />}
      {isError && <ErrorMessage message="Failed to load data." />}

      {pageRows && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {columns.map((col) => (
                  <th key={col.key} className="px-4 py-3 font-medium">
                    {col.label}
                  </th>
                ))}
                {canWrite && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="px-4 py-2">
                    <EmptyState message={search || dateFrom || dateTo ? "No records match these filters." : "No records yet."} />
                  </td>
                </tr>
              )}
              {pageRows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-slate-700">
                      {col.render
                        ? col.render(row)
                        : String((row as Record<string, unknown>)[col.key] ?? "")}
                    </td>
                  ))}
                  {canWrite && (
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="mr-3 font-medium text-brand-600 hover:text-brand-700 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(row.id)}
                        className="font-medium text-red-600 hover:text-red-700 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered && (
        <Pagination
          page={currentPage}
          pageCount={pageCount}
          totalCount={filtered.length}
          onChange={setPage}
        />
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${title}` : `New ${title}`}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {fields.map((field) => (
            <div key={field.key}>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {field.label}
                {field.required && <span className="text-red-500"> *</span>}
              </label>

              {field.type === "boolean" ? (
                <input
                  type="checkbox"
                  checked={Boolean(formValues[field.key])}
                  onChange={(e) => updateField(field.key, e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
              ) : field.type === "multiselect" ? (
                <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-md border border-slate-200 p-2">
                  {resolveOptions(field, formValues).map((opt) => {
                    const selected = Array.isArray(formValues[field.key])
                      ? (formValues[field.key] as (string | number)[])
                      : [];
                    const checked = selected.includes(opt.value);
                    return (
                      <label key={opt.value} className="flex items-center gap-1.5 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...selected, opt.value]
                              : selected.filter((v) => v !== opt.value);
                            updateField(field.key, next);
                          }}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        {opt.label}
                      </label>
                    );
                  })}
                </div>
              ) : field.type === "select" ? (
                <select
                  value={String(formValues[field.key] ?? "")}
                  required={field.required}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                >
                  <option value="">—</option>
                  {resolveOptions(field, formValues).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : field.type === "textarea" ? (
                <textarea
                  value={String(formValues[field.key] ?? "")}
                  required={field.required}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                />
              ) : (
                <input
                  type={field.type === "number" ? "number" : field.type === "time" ? "time" : field.type === "date" ? "date" : "text"}
                  value={String(formValues[field.key] ?? "")}
                  required={field.required}
                  onChange={(e) =>
                    updateField(
                      field.key,
                      // A cleared number input's valueAsNumber is NaN, not
                      // "" — left as NaN it would sail past buildPayload's
                      // `=== ""` blank-field check, then JSON.stringify to
                      // `null` and get rejected by DRF's non-nullable
                      // fields (or silently null out one that IS nullable
                      // but shouldn't be touched). Normalize to "" so a
                      // cleared number field is indistinguishable from any
                      // other untouched-optional-field case.
                      field.type === "number" ? (e.target.value === "" ? "" : e.target.valueAsNumber) : e.target.value,
                    )
                  }
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                />
              )}
              {field.helpText && <p className="mt-1 text-xs text-slate-400">{field.helpText}</p>}
            </div>
          ))}

          {formError && <ErrorMessage message={formError} />}

          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={confirmDeleteId !== null} onClose={() => setConfirmDeleteId(null)} title="Delete record?">
        <p className="text-sm text-slate-600">This action cannot be undone.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmDeleteId(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (confirmDeleteId !== null) deleteMutation.mutate(confirmDeleteId);
            }}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
