import type { FormSchemaParameter } from "@/types";

export type FieldValue = string | number | boolean | undefined;

/** Web port of mobile/src/components/DynamicField.tsx — renders one form
 * control per Parameter.data_type, driven entirely by the form-schema
 * contract (GET /machine-types/{id}/form-schema/), same as mobile. */
export function DynamicField({
  parameter,
  value,
  onChange,
}: {
  parameter: FormSchemaParameter;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
}) {
  const label = `${parameter.name}${parameter.uom ? ` (${parameter.uom})` : ""}${parameter.is_required ? " *" : ""}`;

  if (parameter.data_type === "boolean") {
    return (
      <label className="mb-3 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-5 w-5 rounded border-slate-300"
        />
      </label>
    );
  }

  if (parameter.data_type === "select") {
    return (
      <div className="mb-3">
        <div className="mb-1 text-sm font-medium text-slate-700">{label}</div>
        <div className="flex flex-wrap gap-2">
          {parameter.choices.map((choice) => {
            const selected = value === choice.value;
            return (
              <button
                key={choice.value}
                type="button"
                onClick={() => onChange(choice.value)}
                className={`rounded-md border-2 px-3 py-1.5 text-sm font-medium ${
                  selected
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {choice.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const isNumeric = parameter.data_type === "number" || parameter.data_type === "integer";

  return (
    <div className="mb-3">
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <input
        type={isNumeric ? "number" : "text"}
        value={value === undefined ? "" : String(value)}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          isNumeric && (parameter.min_value || parameter.max_value)
            ? `${parameter.min_value ?? ""}–${parameter.max_value ?? ""}`
            : undefined
        }
        className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
      />
    </div>
  );
}
