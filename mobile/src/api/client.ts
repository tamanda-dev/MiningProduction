import axios, { type InternalAxiosRequestConfig } from "axios";
import { tokenStore } from "@/src/api/tokenStore";

export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api";

export const api = axios.create({ baseURL: API_BASE_URL, timeout: 15000 });

api.interceptors.request.use((config) => {
  const token = tokenStore.getAccessSync();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refresh = await tokenStore.getRefresh();
  if (!refresh) throw new Error("No refresh token available");
  const { data } = await axios.post(`${API_BASE_URL}/auth/refresh/`, { refresh });
  await tokenStore.setTokens(data.access, data.refresh);
  return data.access as string;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as RetryableConfig | undefined;
    const isAuthEndpoint =
      originalRequest?.url?.includes("/auth/login/") || originalRequest?.url?.includes("/auth/refresh/");

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = refreshAccessToken().finally(() => {
            refreshPromise = null;
          });
        }
        const newAccess = await refreshPromise;
        originalRequest.headers.Authorization = `Bearer ${newAccess}`;
        return api(originalRequest);
      } catch (refreshError) {
        await tokenStore.clear();
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  },
);
