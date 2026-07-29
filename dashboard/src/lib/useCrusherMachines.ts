import { useLookup } from "@/lib/useLookup";
import type { Machine, MachineType } from "@/types";

/** Crusher Plant pages operate on machines.Machine rows of type "cru" —
 * there is deliberately only ever one such Machine (a single crushing
 * plant), configured via the ordinary Master Data > Machines page like any
 * other machine.
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
