import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/api/client";
import type { Machine, Paginated } from "@/src/api/types";

/** Builds an `id -> "TYPE fleet_number"` label map for every machine at a
 * site. BreakdownLog rows only carry a bare `machine: number` id (the API
 * intentionally doesn't denormalize a label onto the log — see the
 * "General-fleet breakdown/repair workflow" section of mobile/src/api/
 * types.ts), so any screen rendering a BreakdownLog list resolves labels
 * via this shared hook instead (Artisan's unclaimed/my-repairs queues,
 * the Operator's "awaiting your confirmation" list on session/breakdown).
 */
export function useMachineLabels(siteId: number | null) {
  const query = useQuery({
    queryKey: ["machines", "lookup", siteId],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Machine>>("/machines/", {
        params: { site: siteId, page_size: 500 },
      });
      return data.results;
    },
    enabled: siteId !== null,
    staleTime: 5 * 60_000,
  });

  const labels: Record<number, string> = {};
  for (const machine of query.data ?? []) {
    labels[machine.id] = `${machine.machine_type_code.toUpperCase()} ${machine.fleet_number}`;
  }

  return { labels, isLoading: query.isLoading };
}
