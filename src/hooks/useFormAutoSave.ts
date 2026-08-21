import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";

interface UseFormAutoSaveOptions<T> {
  formId: string;
  data: T;
  debounceMs?: number;
  onRestore?: (data: T) => void;
  enabled?: boolean;
}

const STORAGE_KEY_PREFIX = "admin_form_draft_";

export function useFormAutoSave<T extends Record<string, any>>({
  formId,
  data,
  debounceMs = 1000,
  onRestore,
  enabled = true,
}: UseFormAutoSaveOptions<T>) {
  const storageKey = `${STORAGE_KEY_PREFIX}${formId}`;
  const [hasDraft, setHasDraft] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initialLoadRef = useRef(true);

  // Check for existing draft on mount
  useEffect(() => {
    if (!enabled) return;

    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const { data: savedData, timestamp } = JSON.parse(stored);
        const age = Date.now() - timestamp;
        
        // Only offer to restore if less than 24 hours old
        if (age < 24 * 60 * 60 * 1000) {
          setHasDraft(true);
        } else {
          // Clear old drafts
          localStorage.removeItem(storageKey);
        }
      }
    } catch (error) {
      console.error("Failed to check for draft:", error);
    }
  }, [storageKey, enabled]);

  // Debounced save
  useEffect(() => {
    if (!enabled || initialLoadRef.current) {
      initialLoadRef.current = false;
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      try {
        const toSave = { data, timestamp: Date.now() };
        localStorage.setItem(storageKey, JSON.stringify(toSave));
        setLastSaved(new Date());
        setHasDraft(true);
      } catch (error) {
        console.error("Failed to save draft:", error);
      }
    }, debounceMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [data, storageKey, debounceMs, enabled]);

  const restoreDraft = useCallback(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const { data: savedData } = JSON.parse(stored);
        onRestore?.(savedData);
        toast.success("Draft restored");
        return savedData;
      }
    } catch (error) {
      console.error("Failed to restore draft:", error);
      toast.error("Failed to restore draft");
    }
    return null;
  }, [storageKey, onRestore]);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(storageKey);
    setHasDraft(false);
    setLastSaved(null);
  }, [storageKey]);

  const discardDraft = useCallback(() => {
    clearDraft();
    toast.info("Draft discarded");
  }, [clearDraft]);

  return {
    hasDraft,
    lastSaved,
    restoreDraft,
    clearDraft,
    discardDraft,
  };
}
