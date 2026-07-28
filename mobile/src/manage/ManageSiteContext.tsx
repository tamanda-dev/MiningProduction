import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { createContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/src/api/client";
import type { Paginated, Site } from "@/src/api/types";
import { useAuth } from "@/src/auth/useAuth";

const MANAGE_SITE_KEY = "mps_manage_site_id";

interface ManageSiteContextValue {
  sites: Site[];
  siteId: number | null;
  setSiteId: (id: number | null) => void;
  isLoading: boolean;
}

// eslint-disable-next-line react-refresh/only-export-components
export const ManageSiteContext = createContext<ManageSiteContextValue | undefined>(undefined);

/** Admin/Supervisor equivalent of the operator side's SessionContext
 * selected-site concept, but for "which site's dashboard am I viewing"
 * rather than "which site am I activating a machine at" — kept as its own
 * context (and its own AsyncStorage key) rather than reusing SessionContext,
 * since that one's semantics and screens are operator-specific. Mirrors
 * dashboard/src/lib/SiteFilterContext.tsx.
 */
export function ManageSiteProvider({ children }: { children: ReactNode }) {
  const { accessibleSiteIds } = useAuth();
  const [siteId, setSiteIdState] = useState<number | null>(null);
  const [restored, setRestored] = useState(false);

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
    (async () => {
      const stored = await AsyncStorage.getItem(MANAGE_SITE_KEY);
      if (stored) setSiteIdState(Number(stored));
      setRestored(true);
    })();
  }, []);

  useEffect(() => {
    if (restored && siteId === null && sites.length > 0) {
      setSiteIdState(sites[0].id);
    }
  }, [restored, sites, siteId]);

  function setSiteId(id: number | null) {
    setSiteIdState(id);
    if (id !== null) {
      AsyncStorage.setItem(MANAGE_SITE_KEY, String(id));
    } else {
      AsyncStorage.removeItem(MANAGE_SITE_KEY);
    }
  }

  const value: ManageSiteContextValue = { sites, siteId, setSiteId, isLoading };

  return <ManageSiteContext.Provider value={value}>{children}</ManageSiteContext.Provider>;
}
