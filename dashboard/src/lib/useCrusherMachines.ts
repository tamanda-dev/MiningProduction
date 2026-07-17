import { useLookup } from "@/lib/useLookup";
import type { Machine, MachineType } from "@/types";

/** Crusher Plant pages operate on machines.Machine rows of type "cru" —
 * NOT masterdata.CrusherUnit (a separate, pre-existing model used only for
 * throughput-tonnage bookkeeping via crusher-entries). See the backend
 * crusher_ops app's design notes for why these stay distinct.
 */
export function useCrusherMachines(siteId: number | null) {
  const { data: machineTypes } = useLookup<MachineType>("machine-types");
  const crusherTypeId = machineTypes?.find((mt) => mt.code === "cru")?.id ?? null;

  const query = useLookup<Machine>(
    "machines",
    siteId && crusherTypeId ? { site: siteId, machine_type: crusherTypeId } : undefined,
  );

  return crusherTypeId ? query : { ...query, data: undefined };
}
