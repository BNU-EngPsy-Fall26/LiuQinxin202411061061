/**
 * Durable client-side outbox for experiment data.
 *
 * Every session, trial and completion record is written to IndexedDB before a
 * network attempt. Uploads are idempotent server-side. If the connection drops,
 * records stay queued and are retried when the browser comes back online.
 */

import type {
  CompletionSubmission,
  SessionSubmission,
  TrialSubmission,
} from '@shared/types';

const DB_NAME = 'dreamy-cognitive-lab';
const DB_VERSION = 1;
const STORE = 'outbox';
const SYNC_EVENT = 'dcl-sync-status';

export type QueueKind = 'session' | 'trial' | 'completion';

export interface QueueItem {
  key: string;
  kind: QueueKind;
  endpoint: string;
  payload: SessionSubmission | TrialSubmission | CompletionSubmission;
  createdAt: string;
  attempts: number;
  lastAttemptAt: string | null;
  lastError: string | null;
}

export interface SyncStatus {
  pending: number;
  syncing: boolean;
  online: boolean;
  lastError: string | null;
}

let dbPromise: Promise<IDBDatabase> | null = null;
let syncing = false;
let lastError: string | null = null;
let flushPromise: Promise<number> | null = null;
let initialized = false;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB 不可用'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开本地数据库'));
  });
  return dbPromise;
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

async function putItem(item: QueueItem): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(item);
    await transactionDone(tx);
  } catch {
    // Fallback: a minimal localStorage mirror keeps the app usable if IDB is
    // blocked (e.g. strict private browsing). Large traces may not fit.
    const fallbackKey = `dcl-outbox:${item.key}`;
    try {
      localStorage.setItem(fallbackKey, JSON.stringify(item));
    } catch {
      lastError = '本地缓存空间不足，请保持网络连接后重试。';
    }
  }
  await broadcastStatus();
}

async function removeItem(key: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    await transactionDone(tx);
  } catch {
    localStorage.removeItem(`dcl-outbox:${key}`);
  }
}

async function getAllItems(): Promise<QueueItem[]> {
  let items: QueueItem[] = [];
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).getAll();
    items = await new Promise<QueueItem[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as QueueItem[]);
      request.onerror = () => reject(request.error);
    });
  } catch {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith('dcl-outbox:')) continue;
      try {
        items.push(JSON.parse(localStorage.getItem(key) ?? '') as QueueItem);
      } catch {
        // Ignore malformed local entries.
      }
    }
  }
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function pendingCount(): Promise<number> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).count();
    return await new Promise<number>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return (await getAllItems()).length;
  }
}

export async function pendingItems(): Promise<QueueItem[]> {
  return getAllItems();
}

async function broadcastStatus(): Promise<void> {
  const pending = await pendingCount();
  const detail: SyncStatus = {
    pending,
    syncing,
    online: navigator.onLine,
    lastError,
  };
  window.dispatchEvent(new CustomEvent<SyncStatus>(SYNC_EVENT, { detail }));
}

export function subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void {
  const handler = (event: Event) => {
    listener((event as CustomEvent<SyncStatus>).detail);
  };
  window.addEventListener(SYNC_EVENT, handler);
  return () => window.removeEventListener(SYNC_EVENT, handler);
}

function itemKey(kind: QueueKind, id: string): string {
  return `${kind}:${id}`;
}

async function enqueue(
  kind: QueueKind,
  id: string,
  endpoint: string,
  payload: QueueItem['payload'],
): Promise<void> {
  const existing = await getAllItems();
  const previous = existing.find((item) => item.key === itemKey(kind, id));
  await putItem({
    key: itemKey(kind, id),
    kind,
    endpoint,
    payload,
    createdAt: previous?.createdAt ?? new Date().toISOString(),
    attempts: previous?.attempts ?? 0,
    lastAttemptAt: previous?.lastAttemptAt ?? null,
    lastError: previous?.lastError ?? null,
  });
}

export async function queueSession(payload: SessionSubmission): Promise<void> {
  initSync();
  await enqueue('session', payload.session_id, '/api/sessions', payload);
  void flushQueue();
}

export async function queueTrial(payload: TrialSubmission): Promise<void> {
  initSync();
  await enqueue('trial', payload.trial_id, '/api/trials', payload);
  void flushQueue();
}

export async function queueCompletion(
  payload: CompletionSubmission,
): Promise<void> {
  initSync();
  await enqueue(
    'completion',
    payload.session_id,
    `/api/sessions/${encodeURIComponent(payload.session_id)}/complete`,
    payload,
  );
  void flushQueue();
}

async function uploadItem(item: QueueItem): Promise<boolean> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(item.endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item.payload),
      signal: controller.signal,
    });
    if (response.ok) {
      lastError = null;
      return true;
    }
    if (response.status >= 500) {
      lastError = `服务器暂时不可用 (${response.status})`;
      return false;
    }
    if (response.status === 409) {
      lastError = '会话正在建立，数据将在稍后重试。';
      return false;
    }
    let message = `上传失败 (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Keep the generic message.
    }
    lastError = message;
    return false;
  } catch {
    lastError = navigator.onLine ? '网络连接中断，数据已暂存。' : '当前离线，数据已暂存。';
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Upload queued records strictly in order, so session rows are always created
 * before their trials. Returns the number still pending.
 */
export function flushQueue(): Promise<number> {
  if (flushPromise) return flushPromise;
  flushPromise = (async () => {
    if (syncing) return pendingCount();
    syncing = true;
    await broadcastStatus();
    try {
      if (!navigator.onLine) {
        lastError = '当前离线，数据保存在此浏览器中。';
        return await pendingCount();
      }
      const items = await getAllItems();
      for (const item of items) {
        const ok = await uploadItem(item);
        if (!ok) break;
        await removeItem(item.key);
      }
      return await pendingCount();
    } finally {
      syncing = false;
      await broadcastStatus();
      flushPromise = null;
    }
  })();
  return flushPromise;
}

export function initSync(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  window.addEventListener('online', () => {
    lastError = null;
    void flushQueue();
  });
  window.addEventListener('offline', () => {
    void broadcastStatus();
  });
  window.setInterval(() => {
    if (navigator.onLine) void flushQueue();
  }, 30000);
  void flushQueue();
}

export function downloadQueueBackup(items: QueueItem[]): void {
  const payload = {
    exported_at: new Date().toISOString(),
    note: 'Dreamy Attention Lab 本地未上传数据备份',
    records: items,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `dreamy-lab-local-backup-${new Date()
    .toISOString()
    .slice(0, 19)
    .replaceAll(':', '-')}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
