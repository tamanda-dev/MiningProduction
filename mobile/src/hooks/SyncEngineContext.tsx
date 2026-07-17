import { useNetworkState } from "expo-network";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { getQueue, syncQueue, type QueueItem } from "@/src/api/queue";

const POLL_INTERVAL_MS = 30_000;

interface SyncEngineContextValue {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAt: Date | null;
  pendingCount: number;
  conflictCount: number;
  failedCount: number;
  queue: QueueItem[];
  runSync: (options?: { force?: boolean }) => Promise<void>;
  refreshQueue: () => Promise<void>;
}

// eslint-disable-next-line react-refresh/only-export-components
const SyncEngineContext = createContext<SyncEngineContextValue | undefined>(undefined);

/** Single shared instance of the offline-queue sync loop, mounted once per
 * active session (see app/session/_layout.tsx) — every screen that shows
 * queue/sync state (the header status bar, each entry list's per-item
 * status pills) reads from this one source of truth instead of running
 * its own independent poll, so they can never show conflicting statuses
 * for the same queued item.
 */
export function SyncEngineProvider({ children }: { children: ReactNode }) {
  const network = useNetworkState();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const syncingRef = useRef(false);

  const refreshQueue = useCallback(async () => {
    setQueue(await getQueue());
  }, []);

  const runSync = useCallback(
    async (options?: { force?: boolean }) => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      setIsSyncing(true);
      try {
        await syncQueue(options);
        setLastSyncAt(new Date());
      } finally {
        await refreshQueue();
        setIsSyncing(false);
        syncingRef.current = false;
      }
    },
    [refreshQueue],
  );

  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  useEffect(() => {
    if (network.isConnected && network.isInternetReachable !== false) {
      runSync();
    }
  }, [network.isConnected, network.isInternetReachable, runSync]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (network.isConnected) runSync();
    }, POLL_INTERVAL_MS);

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && network.isConnected) runSync();
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [network.isConnected, runSync]);

  const pendingCount = queue.filter((i) => i.status === "pending" || i.status === "failed").length;
  const conflictCount = queue.filter((i) => i.status === "conflict").length;
  const failedCount = queue.filter((i) => i.status === "failed").length;

  const value: SyncEngineContextValue = {
    isOnline: Boolean(network.isConnected),
    isSyncing,
    lastSyncAt,
    pendingCount,
    conflictCount,
    failedCount,
    queue,
    runSync,
    refreshQueue,
  };

  return <SyncEngineContext.Provider value={value}>{children}</SyncEngineContext.Provider>;
}

export function useSyncEngineContext() {
  const ctx = useContext(SyncEngineContext);
  if (!ctx) throw new Error("useSyncEngineContext must be used within a SyncEngineProvider");
  return ctx;
}
