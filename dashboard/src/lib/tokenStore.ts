const ACCESS_KEY = "mps_access_token";
const REFRESH_KEY = "mps_refresh_token";

// sessionStorage, not localStorage: each browser tab gets its own
// independent login. localStorage is shared by every tab of the same
// origin, so logging into a different account in one tab would silently
// switch every other open tab to that same session on its next API call —
// a real bug when testing multiple roles side by side. The tradeoff is
// that a tab's session doesn't survive a full browser restart, only page
// reloads/new tabs opened from an existing one via link/duplicate.
export const tokenStore = {
  getAccess: (): string | null => sessionStorage.getItem(ACCESS_KEY),
  getRefresh: (): string | null => sessionStorage.getItem(REFRESH_KEY),
  setTokens: (access: string, refresh?: string) => {
    sessionStorage.setItem(ACCESS_KEY, access);
    if (refresh) sessionStorage.setItem(REFRESH_KEY, refresh);
  },
  clear: () => {
    sessionStorage.removeItem(ACCESS_KEY);
    sessionStorage.removeItem(REFRESH_KEY);
  },
};
