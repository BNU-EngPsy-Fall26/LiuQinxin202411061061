import { useCallback, useEffect, useState } from 'react';
import {
  flushQueue,
  pendingCount,
  subscribeSyncStatus,
  type SyncStatus,
} from '@/services/offlineQueue';

export function useSyncStatus(): SyncStatus & { retry: () => void } {
  const [status, setStatus] = useState<SyncStatus>({
    pending: 0,
    syncing: false,
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    lastError: null,
  });

  useEffect(() => {
    let mounted = true;
    const unsubscribe = subscribeSyncStatus((next) => {
      if (mounted) setStatus(next);
    });
    void pendingCount().then((pending) => {
      if (mounted) {
        setStatus((previous) => ({ ...previous, pending }));
      }
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const retry = useCallback(() => {
    void flushQueue();
  }, []);

  return { ...status, retry };
}
