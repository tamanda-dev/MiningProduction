import { router } from "expo-router";
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/src/api/client";
import { tokenStore } from "@/src/api/tokenStore";
import type { Me, Role } from "@/src/api/types";

interface AuthContextValue {
  user: Me | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (role: Role) => boolean;
  accessibleSiteIds: number[] | null;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    const { data } = await api.get<Me>("/auth/me/");
    setUser(data);
    return data;
  }, []);

  useEffect(() => {
    (async () => {
      await tokenStore.load();
      if (!tokenStore.getAccessSync()) {
        setIsLoading(false);
        return;
      }
      try {
        await fetchMe();
      } catch {
        await tokenStore.clear();
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [fetchMe]);

  const login = useCallback(
    async (username: string, password: string) => {
      const { data } = await api.post("/auth/login/", { username, password });
      await tokenStore.setTokens(data.access, data.refresh);
      await fetchMe();
    },
    [fetchMe],
  );

  const logout = useCallback(async () => {
    await tokenStore.clear();
    setUser(null);
    // Whichever screen the operator signed out from (site-select,
    // machine-select, a session tab) stays mounted otherwise — its
    // now-unauthenticated API calls fail/return empty, surfacing as a
    // confusing "No sites available" rather than the login screen. The
    // imperative router (usable outside a component's render tree) is the
    // single place this needs handling, regardless of which screen
    // initiated the sign-out.
    router.replace("/login");
  }, []);

  const hasRole = useCallback((role: Role) => Boolean(user?.roles.includes(role)), [user]);

  const accessibleSiteIds = useMemo(() => {
    if (!user) return [];
    if (user.roles.includes("admin")) return null;
    if (user.roles.includes("manager") && user.site_accesses.length === 0) return null;
    return user.site_accesses.map((a) => a.site);
  }, [user]);

  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated: Boolean(user),
    login,
    logout,
    hasRole,
    accessibleSiteIds,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
