import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

interface QueuedAction {
  id: string;
  type: string;
  data: any;
  timestamp: number;
}

const QUEUE_STORAGE_KEY = "admin_offline_queue";

export function useOfflineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [wasOffline, setWasOffline] = useState(false);
  const [actionQueue, setActionQueue] = useState<QueuedAction[]>(() => {
    try {
      const stored = localStorage.getItem(QUEUE_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Persist queue to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(actionQueue));
    } catch (error) {
      console.error("Failed to save offline queue:", error);
    }
  }, [actionQueue]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (wasOffline) {
        toast.success("You're back online!", {
          description: actionQueue.length > 0
            ? `${actionQueue.length} queued actions will sync`
            : undefined,
        });
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
      toast.warning("You're offline", {
        description: "Changes will be saved when you reconnect",
        duration: 5000,
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [wasOffline, actionQueue.length]);

  const queueAction = useCallback((type: string, data: any) => {
    const action: QueuedAction = {
      id: crypto.randomUUID(),
      type,
      data,
      timestamp: Date.now(),
    };
    setActionQueue((prev) => [...prev, action]);
    return action.id;
  }, []);

  const removeFromQueue = useCallback((id: string) => {
    setActionQueue((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clearQueue = useCallback(() => {
    setActionQueue([]);
    localStorage.removeItem(QUEUE_STORAGE_KEY);
  }, []);

  const processQueue = useCallback(
    async (processor: (action: QueuedAction) => Promise<boolean>) => {
      if (!isOnline || actionQueue.length === 0) return;

      const results = await Promise.allSettled(
        actionQueue.map(async (action) => {
          const success = await processor(action);
          if (success) {
            removeFromQueue(action.id);
          }
          return { id: action.id, success };
        })
      );

      const successCount = results.filter(
        (r) => r.status === "fulfilled" && r.value.success
      ).length;

      if (successCount > 0) {
        toast.success(`Synced ${successCount} queued actions`);
      }
    },
    [isOnline, actionQueue, removeFromQueue]
  );

  return {
    isOnline,
    isOffline: !isOnline,
    actionQueue,
    queuedCount: actionQueue.length,
    queueAction,
    removeFromQueue,
    clearQueue,
    processQueue,
  };
}
