import type { ShiftInstance } from "@/types";

export function ShiftInstancePicker({
  shiftInstances,
  value,
  onChange,
  placeholder,
  showStatus = true,
  className = "rounded-md border border-slate-300 px-2 py-1.5 text-sm",
}: {
  shiftInstances: ShiftInstance[] | undefined;
  value: number | null;
  onChange: (id: number | null) => void;
  placeholder?: string; // if provided, renders as the empty/unselected option
  showStatus?: boolean;
  className?: string;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      className={className}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {shiftInstances?.map((si) => (
        <option key={si.id} value={si.id}>
          {si.date} — {si.shift_name}
          {showStatus ? ` (${si.status})` : ""}
        </option>
      ))}
    </select>
  );
}
