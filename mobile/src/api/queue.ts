import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { api } from "@/src/api/client";

export type QueueEndpoint =
  | "production-entries"
  | "breakdown-logs"
  | "crusher-entries"
  | "delivery-entries"
  | "hourly-checklist-entries"
  | "hourly-breakdown-entries"
  | "breakdown-incidents";

export type QueueItemStatus = "pending" | "synced" | "failed" | "conflict";

/** "create" (the default, and the only kind every other resource ever
 * used) batches into POST /{endpoint}/bulk/ as before. "update" targets an
 * already-synced server row directly — needed for BreakdownIncident, where
 * a second device/user (the assigned artisan) acts on an incident it never
 * created and so has no client_uuid for, only the server id. See
 * mobile/README.md's "Breakdown incident hand-off" section.
 */
export type QueueOperation = "create" | "update";

export interface QueueItem {
  clientUuid: string;
  endpoint: QueueEndpoint;
  payload: Record<string, unknown>;
  status: QueueItemStatus;
  attempts: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  operation?: QueueOperation;
  /** Server-side row id being updated. Required when operation === "update". */
  targetId?: number;
  /** Detail-route action to POST to (e.g. "assign", "resolve"). When
   * omitted for an "update" item, a plain PATCH to the detail endpoint is
   * used instead. */
  actionPath?: string;
}

const QUEUE_KEY = "mps_offline_queue";
const RETRY_BACKOFF_MS = [0, 5_000, 15_000, 60_000, 300_000]; // caps at 5 min between retries

async function readQueue(): Promise<QueueItem[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? (JSON.parse(raw) as QueueItem[]) : [];
}

async function writeQueue(items: QueueItem[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

/** Queues an entry for sync. Saves immediately to local storage — the
 * caller should treat this as "submitted" from the operator's perspective
 * even with zero connectivity, per the offline-first requirement.
 *
 * `options.operation: "update"` queues a PATCH/action against an existing
 * server row (`options.targetId`, optionally `options.actionPath`) instead
 * of a bulk create — the payload still doesn't need a client_uuid for
 * matching purposes, but one is generated anyway so the queue's per-item
 * key/status-pill machinery works identically for every item.
 */
export async function enqueue(
  endpoint: QueueEndpoint,
  payload: Record<string, unknown>,
  options?: { operation?: QueueOperation; targetId?: number; actionPath?: string },
): Promise<QueueItem> {
  const clientUuid = Crypto.randomUUID();
  const now = new Date().toISOString();
  const item: QueueItem = {
    clientUuid,
    endpoint,
    payload: options?.operation === "update" ? payload : { ...payload, client_uuid: clientUuid },
    status: "pending",
    attempts: 0,
    createdAt: now,
    updatedAt: now,
    operation: options?.operation ?? "create",
    targetId: options?.targetId,
    actionPath: options?.actionPath,
  };
  const queue = await readQueue();
  queue.push(item);
  await writeQueue(queue);
  return item;
}

export async function getQueue(): Promise<QueueItem[]> {
  return readQueue();
}

export async function removeSynced(): Promise<void> {
  const queue = await readQueue();
  await writeQueue(queue.filter((i) => i.status !== "synced"));
}

export async function discardItem(clientUuid: string): Promise<void> {
  const queue = await readQueue();
  await writeQueue(queue.filter((i) => i.clientUuid !== clientUuid));
}

function isSyncable(item: QueueItem): boolean {
  return item.status === "pending" || item.status === "failed";
}

function dueForRetry(item: QueueItem): boolean {
  if (!isSyncable(item)) return false;
  const backoff = RETRY_BACKOFF_MS[Math.min(item.attempts, RETRY_BACKOFF_MS.length - 1)];
  return Date.now() - new Date(item.updatedAt).getTime() >= backoff;
}

function isConflictError(errors: unknown): boolean {
  const text = JSON.stringify(errors ?? "").toLowerCase();
  return (
    text.includes("slot_conflict") ||
    text.includes("already exists") ||
    text.includes("already claimed")
  );
}

/** Axios sets `.response` only once the server actually replied — its
 * absence means the request never got a response at all (offline, DNS,
 * timeout), the routine case underground, not a real per-item rejection.
 */
function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== "object") return true;
  return !("response" in error) || (error as { response?: unknown }).response === undefined;
}

export interface SyncResult {
  syncedCount: number;
  failedCount: number;
  conflictCount: number;
}

/** Groups due items by endpoint and POSTs each group to its bulk endpoint
 * in one request, matching results back by client_uuid so only the items
 * that actually failed need to be retried later.
 *
 * `force` bypasses the retry backoff — the backoff exists to stop the
 * automatic background poll from hammering a flaky connection, but an
 * operator explicitly tapping "Sync Now" has already decided to retry
 * right now, and making them wait out a timer they can't see would be a
 * confusing dead button.
 */
export async function syncQueue(options: { force?: boolean } = {}): Promise<SyncResult> {
  const queue = await readQueue();
  const due = queue.filter((item) => (options.force ? isSyncable(item) : dueForRetry(item)));
  const result: SyncResult = { syncedCount: 0, failedCount: 0, conflictCount: 0 };
  if (due.length === 0) return result;

  const updates = new Map<string, Partial<QueueItem>>();

  const createItems = due.filter((item) => (item.operation ?? "create") === "create");
  const updateItems = due.filter((item) => item.operation === "update");

  const byEndpoint = new Map<QueueEndpoint, QueueItem[]>();
  for (const item of createItems) {
    const list = byEndpoint.get(item.endpoint) ?? [];
    list.push(item);
    byEndpoint.set(item.endpoint, list);
  }

  for (const [endpoint, items] of byEndpoint) {
    try {
      const { data } = await api.post<
        { client_uuid: string; success: boolean; id?: number; errors?: unknown }[]
      >(`/${endpoint}/bulk/`, items.map((i) => i.payload));

      for (const outcome of data) {
        if (outcome.success) {
          updates.set(outcome.client_uuid, { status: "synced" });
          result.syncedCount += 1;
        } else if (isConflictError(outcome.errors)) {
          updates.set(outcome.client_uuid, {
            status: "conflict",
            lastError: JSON.stringify(outcome.errors),
          });
          result.conflictCount += 1;
        } else {
          const failedItem = items.find((i) => i.clientUuid === outcome.client_uuid);
          updates.set(outcome.client_uuid, {
            status: "failed",
            attempts: (failedItem?.attempts ?? 0) + 1,
            lastError: JSON.stringify(outcome.errors),
          });
          result.failedCount += 1;
        }
      }
    } catch (networkError) {
      // The whole batch request never got a response (offline, timeout,
      // 5xx) — this is the expected, routine case underground, not a real
      // failure, so it stays "pending" (bumping attempts for backoff) and
      // the UI shows it as "waiting to sync", not the alarming "failed"
      // status reserved for a server-confirmed per-item rejection below.
      for (const item of items) {
        updates.set(item.clientUuid, {
          status: "pending",
          attempts: item.attempts + 1,
          lastError: networkError instanceof Error ? networkError.message : "Network error",
        });
      }
    }
  }

  // "update" items target one specific server row each, so they sync one
  // request at a time rather than batching (there is no bulk-PATCH/action
  // endpoint, and each targets a different id/action anyway).
  for (const item of updateItems) {
    try {
      const path = item.actionPath
        ? `/${item.endpoint}/${item.targetId}/${item.actionPath}/`
        : `/${item.endpoint}/${item.targetId}/`;
      if (item.actionPath) {
        await api.post(path, item.payload);
      } else {
        await api.patch(path, item.payload);
      }
      updates.set(item.clientUuid, { status: "synced" });
      result.syncedCount += 1;
    } catch (error) {
      if (isNetworkError(error)) {
        updates.set(item.clientUuid, {
          status: "pending",
          attempts: item.attempts + 1,
          lastError: error instanceof Error ? error.message : "Network error",
        });
        continue;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errors = (error as any)?.response?.data;
      if (isConflictError(errors)) {
        updates.set(item.clientUuid, { status: "conflict", lastError: JSON.stringify(errors) });
        result.conflictCount += 1;
      } else {
        updates.set(item.clientUuid, {
          status: "failed",
          attempts: item.attempts + 1,
          lastError: JSON.stringify(errors),
        });
        result.failedCount += 1;
      }
    }
  }

  const now = new Date().toISOString();
  const next = queue.map((item) => {
    const patch = updates.get(item.clientUuid);
    return patch ? { ...item, ...patch, updatedAt: now } : item;
  });
  await writeQueue(next);
  return result;
}
