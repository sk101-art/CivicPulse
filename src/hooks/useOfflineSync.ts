import { useEffect, useState, useCallback } from 'react';
import { openDB, IDBPDatabase } from 'idb';

export interface QueuedOfflineReport {
  id: string;
  category: string;
  payload?: {
    lat: number;
    lng: number;
    accuracy: number;
    capturedAt: string;
    nonce: string;
    photoHash: string;
    role: string;
  };
  signature?: string;
  photoBase64?: string;
  mimeType?: string;
  note?: string;
  title?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  photoData?: string;
  sizeClass?: string;
  blockedShare?: string;
  address?: string;
  offline?: boolean;
  /** Stable uuid sent with every attempt so the server stores the report once. */
  clientReportId?: string;
  createdAt: number;
  synced: boolean;
}

export type QueuedReportInput =
  | (Omit<QueuedOfflineReport, 'synced' | 'createdAt' | 'id'> & { id?: string })
  | {
      id?: string;
      title?: string;
      description?: string;
      category: string;
      latitude?: number;
      longitude?: number;
      lat?: number;
      lng?: number;
      photoData?: string;
    };

const DB_NAME = 'CivicPulseDB';
const STORE_NAME = 'reports_queue';

/** Minimal store surface the sync loop needs (an idb database satisfies it). */
export interface QueueStore {
  getAll(store: string): Promise<unknown[]>;
  put(store: string, value: unknown): Promise<unknown>;
  delete(store: string, key: string): Promise<void>;
}

export function newClientReportId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // RFC 4122 v4 fallback for very old browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// One sync at a time per page, even when several components use the hook.
let syncInFlight: Promise<number> | null = null;

/**
 * Sends every queued report once. Each IndexedDB call runs in its own short transaction and no
 * network request ever happens inside a transaction (that is what made deletes fail with
 * TransactionInactiveError and caused re-submissions). A report is removed from the queue when the
 * server has stored it, including the "already stored" answer for a resubmitted clientReportId.
 */
export async function flushQueue(
  db: QueueStore,
  send: (body: Record<string, unknown>) => Promise<{ ok: boolean; status: number }>
): Promise<number> {
  const queued = (await db.getAll(STORE_NAME)) as QueuedOfflineReport[];
  let synced = 0;
  for (const report of queued) {
    let item = report;
    if (!item.clientReportId) {
      item = { ...item, clientReportId: newClientReportId() };
      await db.put(STORE_NAME, item); // persist before sending so a retry reuses the same id
    }
    const { id: _id, createdAt: _createdAt, synced: _synced, ...body } = item;
    void _id; void _createdAt; void _synced;
    let res: { ok: boolean; status: number };
    try {
      res = await send({
        ...body,
        lat: item.payload?.lat ?? item.lat ?? item.latitude,
        lng: item.payload?.lng ?? item.lng ?? item.longitude,
      });
    } catch (err) {
      console.warn('Offline report not sent yet (network):', item.id, err);
      continue;
    }
    // 2xx = stored now or earlier; 4xx (except 408/429) = the server will never accept it.
    const permanent = res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429;
    if (res.ok || permanent) {
      await db.delete(STORE_NAME, item.id);
      if (res.ok) synced += 1;
      else console.warn('Offline report rejected by server, removed from queue:', item.id, res.status);
    }
  }
  return synced;
}

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [db, setDb] = useState<IDBPDatabase | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);

  useEffect(() => {
    let ignore = false;
    async function loadCount() {
      if (!db) return;
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const count = await tx.objectStore(STORE_NAME).count();
        if (!ignore) {
          setPendingCount(count);
        }
      } catch {
        // ignore
      }
    }

    const handleCountChange = () => {
      void loadCount();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('civicpulse:queue-changed', handleCountChange);
    }

    void loadCount();

    return () => {
      ignore = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener('civicpulse:queue-changed', handleCountChange);
      }
    };
  }, [db]);

  useEffect(() => {
    let isMounted = true;
    const initDB = async () => {
      try {
        const database = await openDB(DB_NAME, 1, {
          upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
              db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
          },
        });
        if (isMounted) {
          setDb(database);
        }
      } catch (err) {
        console.error('Failed to open offline reports IndexedDB:', err);
      }
    };

    void initDB();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      isMounted = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const syncReports = useCallback(async () => {
    if (!db || !isOnline) return;
    if (syncInFlight) {
      await syncInFlight.catch(() => 0);
      return;
    }

    syncInFlight = (async () => {
      // Ensure device key is registered so offline signatures are accepted
      try {
        const { initDeviceKey } = await import('@/lib/evidence/deviceKey');
        await initDeviceKey();
      } catch {
        // proceed
      }
      return flushQueue(db, (body) =>
        fetch('/api/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      );
    })();

    try {
      const syncedCount = await syncInFlight;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('civicpulse:queue-changed'));
        if (syncedCount > 0) {
          window.dispatchEvent(new CustomEvent('civicpulse:synced'));
        }
      }
    } catch (err) {
      console.error('Offline sync error:', err);
    } finally {
      syncInFlight = null;
    }
  }, [db, isOnline]);

  const queueReport = useCallback(
    async (reportData: QueuedReportInput) => {
      if (!db) return;

      const fullReport: QueuedOfflineReport = {
        ...reportData,
        id: reportData.id || `offline-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        clientReportId: ('clientReportId' in reportData && reportData.clientReportId) || newClientReportId(),
        createdAt: Date.now(),
        synced: false,
        offline: true,
      };

      await db.put(STORE_NAME, fullReport);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('civicpulse:queue-changed'));
      }

      if (isOnline) {
        await syncReports();
      }
    },
    [db, isOnline, syncReports]
  );

  useEffect(() => {
    if (isOnline && db) {
      void syncReports();
    }
  }, [isOnline, db, syncReports]);

  return { isOnline, pendingCount, queueReport, syncReports };
}
