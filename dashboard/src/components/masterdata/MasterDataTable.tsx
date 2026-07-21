import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ErrorMessage, extractErrorMessage } from "@/components/common/ErrorMessage";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { Modal } from "@/components/common/Modal";
import { api } from "@/lib/api";
import type { Paginated } from "@/types";

export interface FieldOption {
  value: string | number;
  label: string;
}

export interface FieldConfig {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "boolean" | "select" | "multiselect" | "time" | "date";
  options?: FieldOption[];
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
}

type FormValues = Record<string, unknown>;

function fieldDefault(field: FieldConfig): unknown {
  if (field.type === "boolean") return true;
  if (field.type === "multiselect") return [];
  return "";
}

export function MasterDataTable<T extends { id: number }>({ config }: { config: MasterDataResourceConfig<T> }) {
  const { resource, title, columns, fields, canWrite, defaultValues, extraParams } = config;
  const queryClient = useQueryClient();
  const queryKey = [resource, extraParams ?? {}];

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data } = await api.get<Paginated<T>>(`/${resource}/`, {
        params: { page_size: 500, ...extraParams },
      });
      return data.results;
    },
  });

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
    saveMutation.mutate(formValues);
  }

  function updateField(key: string, value: unknown) {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        {canWrite && (
          <button
            type="button"
            onClick={openCreate}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            + Add
          </button>
        )}
      </div>

      {isLoading && <LoadingSpinner />}
      {isError && <ErrorMessage message="Failed to load data." />}

      {data && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                {columns.map((col) => (
                  <th key={col.key} className="px-4 py-2 font-medium">
                    {col.label}
                  </th>
                ))}
                {canWrite && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody>
              {data.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="px-4 py-6 text-center text-slate-400">
                    No records yet.
                  </td>
                </tr>
              )}
              {data.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-2 text-slate-700">
                      {col.render
                        ? col.render(row)
                        : String((row as Record<string, unknown>)[col.key] ?? "")}
                    </td>
                  ))}
                  {canWrite && (
                    <td className="whitespace-nowrap px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="mr-3 text-brand-600 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(row.id)}
                        className="text-red-600 hover:underline"
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
                  {field.options?.map((opt) => {
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
                  {field.options?.map((opt) => (
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
                    updateField(field.key, field.type === "number" ? e.target.valueAsNumber : e.target.value)
                  }
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                />
              )}
              {field.helpText && <p className="mt-1 text-xs text-slate-400">{field.helpText}</p>}
            </div>
          ))}

          {formError && <ErrorMessage message={formError} />}

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {saveMutation.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={confirmDeleteId !== null} onClose={() => setConfirmDeleteId(null)} title="Delete record?">
        <p className="text-sm text-slate-600">This action cannot be undone.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmDeleteId(null)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirmDeleteId !== null) deleteMutation.mutate(confirmDeleteId);
            }}
            disabled={deleteMutation.isPending}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {deleteMutation.isPending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
