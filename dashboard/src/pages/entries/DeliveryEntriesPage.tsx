import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card } from "@/components/common/Card";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { StatTile } from "@/components/common/StatTile";
import { api } from "@/lib/api";
import { useSiteFilter } from "@/lib/SiteFilterContext";
import { useLookup } from "@/lib/useLookup";
import type { DeliveryDestination, DeliveryEntry, Paginated } from "@/types";

export function DeliveryEntriesPage() {
  const { siteId } = useSiteFilter();
  const { data: destinations } = useLookup<DeliveryDestination>(
    "delivery-destinations",
    siteId ? { site: siteId } : undefined,
  );
  const [destinationId, setDestinationId] = useState<number | null>(null);

  const destinationLabel = (id: number) => destinations?.find((d) => d.id === id)?.name ?? id;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["delivery-entries", siteId, destinationId],
    queryFn: async () => {
      const { data } = await api.get<Paginated<DeliveryEntry>>("/delivery-entries/", {
        params: {
          site: siteId,
          delivery_destination: destinationId ?? undefined,
          page_size: 200,
          ordering: "-slot_start_at",
        },
      });
      return data.results;
    },
    enabled: siteId !== null,
  });

  // Totals by destination — a small, honest summary rather than a full
  // chart: this page mirrors ProductionEntriesPage/BreakdownLogsPage's
  // plain-table pattern, not the dashboard's dedicated Pareto/Trend
  // endpoints, since deliveries don't (yet) have one of those.
  const totalsByDestination = useMemo(() => {
    const totals = new Map<number, { tonnes: number; trips: number }>();
    for (const row of data ?? []) {
      const prev = totals.get(row.delivery_destination) ?? { tonnes: 0, trips: 0 };
      totals.set(row.delivery_destination, {
        tonnes: prev.tonnes + Number(row.tonnes),
        trips: prev.trips + row.trip_count,
      });
    }
    return totals;
  }, [data]);

  const grandTotalTonnes = data?.reduce((sum, row) => sum + Number(row.tonnes), 0) ?? 0;
  const grandTotalTrips = data?.reduce((sum, row) => sum + row.trip_count, 0) ?? 0;

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-slate-900">Delivery Entries</h1>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total Tonnes" value={grandTotalTonnes.toLocaleString(undefined, { maximumFractionDigits: 1 })} />
        <StatTile label="Total Trips" value={grandTotalTrips} />
        {Array.from(totalsByDestination.entries()).map(([id, totals]) => (
          <StatTile
            key={id}
            label={String(destinationLabel(id))}
            value={totals.tonnes.toLocaleString(undefined, { maximumFractionDigits: 1 })}
            sublabel={`${totals.trips} trip${totals.trips === 1 ? "" : "s"}`}
          />
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={destinationId ?? ""}
          onChange={(e) => setDestinationId(e.target.value ? Number(e.target.value) : null)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">All destinations</option>
          {destinations?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <LoadingSpinner />}
      {isError && <ErrorMessage message="Failed to load delivery entries." />}

      {data && (
        <Card padded={false} className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Destination</th>
                <th className="px-4 py-3 font-medium">Tonnes</th>
                <th className="px-4 py-3 font-medium">Trips</th>
                <th className="px-4 py-3 font-medium">Comments</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-2">
                    <EmptyState message="No delivery entries match these filters." />
                  </td>
                </tr>
              )}
              {data.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-700">
                    {row.slot_start_at ? new Date(row.slot_start_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{destinationLabel(row.delivery_destination)}</td>
                  <td className="px-4 py-3 text-slate-700">{Number(row.tonnes).toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-700">{row.trip_count}</td>
                  <td className="px-4 py-3 text-slate-500">{row.comments || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
