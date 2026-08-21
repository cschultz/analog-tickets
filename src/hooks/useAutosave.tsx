import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";

interface UseAutosaveOptions<T> {
  /** The data to autosave */
  data: T;
  /** Function to save the data */
  onSave: (data: T) => Promise<void>;
  /** Delay in milliseconds before autosaving (default: 1000ms) */
  delay?: number;
  /** Whether autosave is enabled (default: true) */
  enabled?: boolean;
  /** Key to identify this autosave instance for undo */
  key?: string;
}

interface UseAutosaveReturn {
  /** Whether the data is currently being saved */
  isSaving: boolean;
  /** Whether there are unsaved changes */
  hasUnsavedChanges: boolean;
  /** Last saved timestamp */
  lastSaved: Date | null;
  /** Force an immediate save */
  forceSave: () => void;
  /** Undo the last change (restores previous value) */
  undo: () => void;
  /** Whether undo is available */
  canUndo: boolean;
}

export function useAutosave<T>({
  data,
  onSave,
  delay = 1000,
  enabled = true,
  key = "default",
}: UseAutosaveOptions<T>): UseAutosaveReturn {
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [previousData, setPreviousData] = useState<T | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initialDataRef = useRef<T>(data);
  const lastSavedDataRef = useRef<T>(data);
  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check if data has changed
  useEffect(() => {
    const hasChanged = JSON.stringify(data) !== JSON.stringify(lastSavedDataRef.current);
    setHasUnsavedChanges(hasChanged);
  }, [data]);

  // Autosave logic
  useEffect(() => {
    if (!enabled || !hasUnsavedChanges) {
      return;
    }

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout for autosave
    timeoutRef.current = setTimeout(async () => {
      try {
        setIsSaving(true);
        
        // Store previous data for undo
        setPreviousData(lastSavedDataRef.current);
        
        await onSave(data);
        
        lastSavedDataRef.current = data;
        setLastSaved(new Date());
        setHasUnsavedChanges(false);
        setCanUndo(true);

        // Show save confirmation with undo option
        const toastId = toast.success("Changes saved", {
          action: {
            label: "Undo",
            onClick: () => {
              if (previousData) {
                undoChange();
              }
            },
          },
          duration: 5000,
        });

        // Clear undo availability after 30 seconds
        if (undoTimeoutRef.current) {
          clearTimeout(undoTimeoutRef.current);
        }
        undoTimeoutRef.current = setTimeout(() => {
          setCanUndo(false);
          setPreviousData(null);
        }, 30000);

      } catch (error) {
        console.error("Autosave failed:", error);
        toast.error("Failed to save changes");
      } finally {
        setIsSaving(false);
      }
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [data, enabled, hasUnsavedChanges, delay, onSave]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current);
      }
    };
  }, []);

  const forceSave = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    try {
      setIsSaving(true);
      setPreviousData(lastSavedDataRef.current);
      await onSave(data);
      lastSavedDataRef.current = data;
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
      setCanUndo(true);
      toast.success("Changes saved");
    } catch (error) {
      console.error("Save failed:", error);
      toast.error("Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  }, [data, onSave]);

  const undoChange = useCallback(async () => {
    if (!previousData || !canUndo) {
      return;
    }

    try {
      setIsSaving(true);
      await onSave(previousData);
      lastSavedDataRef.current = previousData;
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
      setCanUndo(false);
      setPreviousData(null);
      toast.info("Changes undone");
    } catch (error) {
      console.error("Undo failed:", error);
      toast.error("Failed to undo changes");
    } finally {
      setIsSaving(false);
    }
  }, [previousData, canUndo, onSave]);

  return {
    isSaving,
    hasUnsavedChanges,
    lastSaved,
    forceSave,
    undo: undoChange,
    canUndo,
  };
}

// Helper component to show autosave status
export function AutosaveIndicator({ 
  isSaving, 
  hasUnsavedChanges, 
  lastSaved 
}: { 
  isSaving: boolean; 
  hasUnsavedChanges: boolean; 
  lastSaved: Date | null;
}) {
  if (isSaving) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-[hsl(var(--admin-text-tertiary))]">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
        Saving...
      </span>
    );
  }

  if (hasUnsavedChanges) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-[hsl(var(--admin-text-tertiary))]">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Unsaved changes
      </span>
    );
  }

  if (lastSaved) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-[hsl(var(--admin-text-tertiary))]">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        Saved
      </span>
    );
  }

  return null;
}