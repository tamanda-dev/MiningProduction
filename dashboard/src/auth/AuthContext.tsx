import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { tokenStore } from "@/lib/tokenStore";
import type { Me, Role } from "@/types";

interface AuthContextValue {
  user: Me | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  hasRole: (role: Role) => boolean;
  accessibleSiteIds: number[] | null; // null = unrestricted (Admin, or Manager with no grants)
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
    if (!tokenStore.getAccess()) {
      setIsLoading(false);
      return;
    }
    fetchMe()
      .catch(() => {
        tokenStore.clear();
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, [fetchMe]);

  const login = useCallback(
    async (username: string, password: string) => {
      const { data } = await api.post("/auth/login/", { username, password });
      tokenStore.setTokens(data.access, data.refresh);
      await fetchMe();
    },
    [fetchMe],
  );

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
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
