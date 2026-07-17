import { secureStorage } from "@/src/api/secureStorage";

const ACCESS_KEY = "mps_access_token";
const REFRESH_KEY = "mps_refresh_token";

// In-memory cache so the axios interceptor (which must stay synchronous)
// doesn't need to await SecureStore on every single request.
let cachedAccess: string | null = null;

export const tokenStore = {
  getAccessSync: (): string | null => cachedAccess,

  async load(): Promise<void> {
    cachedAccess = await secureStorage.getItem(ACCESS_KEY);
  },

  async getRefresh(): Promise<string | null> {
    return secureStorage.getItem(REFRESH_KEY);
  },

  async setTokens(access: string, refresh?: string): Promise<void> {
    cachedAccess = access;
    await secureStorage.setItem(ACCESS_KEY, access);
    if (refresh) await secureStorage.setItem(REFRESH_KEY, refresh);
  },

  async clear(): Promise<void> {
    cachedAccess = null;
    await secureStorage.removeItem(ACCESS_KEY);
    await secureStorage.removeItem(REFRESH_KEY);
  },
};
