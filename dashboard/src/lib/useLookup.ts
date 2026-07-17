import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Paginated } from "@/types";

/** Fetches the full (unpaginated-in-practice) list of a resource — used to
 * build <select> options for foreign-key fields in the master-data forms.
 */
export function useLookup<T>(resource: string, params?: Record<string, string | number>) {
  return useQuery({
    queryKey: [resource, "lookup", params ?? {}],
    queryFn: async () => {
      const { data } = await api.get<Paginated<T>>(`/${resource}/`, {
        params: { page_size: 500, ...params },
      });
      return data.results;
    },
  });
}
