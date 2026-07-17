import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/auth/useAuth";
import { api } from "@/lib/api";
import type { Paginated, Site } from "@/types";

interface SiteFilterContextValue {
  sites: Site[];
  siteId: number | null;
  setSiteId: (id: number | null) => void;
  isLoading: boolean;
}

const SiteFilterContext = createContext<SiteFilterContextValue | undefined>(undefined);

export function SiteFilterProvider({ children }: { children: ReactNode }) {
  const { accessibleSiteIds } = useAuth();
  const [siteId, setSiteId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["sites", "all"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Site>>("/sites/", { params: { page_size: 500 } });
      return data.results;
    },
  });

  const sites = useMemo(() => {
    const all = data ?? [];
    if (accessibleSiteIds === null) return all;
    return all.filter((s) => accessibleSiteIds.includes(s.id));
  }, [data, accessibleSiteIds]);

  useEffect(() => {
    if (siteId === null && sites.length > 0) {
      setSiteId(sites[0].id);
    }
  }, [sites, siteId]);

  const value: SiteFilterContextValue = { sites, siteId, setSiteId, isLoading };

  return <SiteFilterContext.Provider value={value}>{children}</SiteFilterContext.Provider>;
}

export function useSiteFilter() {
  const ctx = useContext(SiteFilterContext);
  if (!ctx) throw new Error("useSiteFilter must be used within a SiteFilterProvider");
  return ctx;
}
