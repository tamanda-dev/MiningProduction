import type { FieldValue } from "@/components/operate/DynamicField";
import type { FormSchemaParameter } from "@/types";

/** Web port of mobile/src/api/validation.ts — client-side mirror of the
 * backend's entries/services.py::coerce_value validation, so the operator
 * sees an obvious mistake immediately rather than waiting on a round trip.
 */
export function validateField(parameter: FormSchemaParameter, value: FieldValue): string | null {
  const isEmpty = value === undefined || value === "" || value === null;

  if (parameter.is_required && isEmpty) {
    return `${parameter.name} is required.`;
  }
  if (isEmpty) return null;

  if (parameter.data_type === "number" || parameter.data_type === "integer") {
    const num = Number(value);
    if (Number.isNaN(num)) return `${parameter.name} must be a number.`;
    if (parameter.data_type === "integer" && !Number.isInteger(num)) {
      return `${parameter.name} must be a whole number.`;
    }
    if (parameter.min_value !== null && num < Number(parameter.min_value)) {
      return `${parameter.name} must be at least ${parameter.min_value}.`;
    }
    if (parameter.max_value !== null && num > Number(parameter.max_value)) {
      return `${parameter.name} must be at most ${parameter.max_value}.`;
    }
  }

  if (parameter.data_type === "select") {
    const valid = parameter.choices.some((c) => c.value === value);
    if (!valid) return `Choose a value for ${parameter.name}.`;
  }

  return null;
}

export function validateAll(parameters: FormSchemaParameter[], values: Record<string, FieldValue>): string[] {
  return parameters.map((p) => validateField(p, values[p.code])).filter((error): error is string => error !== null);
}
