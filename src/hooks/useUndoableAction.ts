import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";

interface UndoableActionOptions<T> {
  onExecute: (data: T) => Promise<void>;
  onUndo: (data: T, previousState: any) => Promise<void>;
  undoTimeoutMs?: number;
  successMessage?: string;
  undoMessage?: string;
}

export function useUndoableAction<T>({
  onExecute,
  onUndo,
  undoTimeoutMs = 5000,
  successMessage = "Action completed",
  undoMessage = "Action undone",
}: UndoableActionOptions<T>) {
  const [isExecuting, setIsExecuting] = useState(false);
  const pendingActionRef = useRef<{
    data: T;
    previousState: any;
    timeoutId: NodeJS.Timeout;
  } | null>(null);

  const execute = useCallback(
    async (data: T, previousState: any) => {
      // Clear any pending undo
      if (pendingActionRef.current) {
        clearTimeout(pendingActionRef.current.timeoutId);
        pendingActionRef.current = null;
      }

      setIsExecuting(true);

      try {
        await onExecute(data);

        // Create undo timeout
        const timeoutId = setTimeout(() => {
          pendingActionRef.current = null;
        }, undoTimeoutMs);

        pendingActionRef.current = { data, previousState, timeoutId };

        toast.success(successMessage, {
          action: {
            label: "Undo",
            onClick: async () => {
              if (pendingActionRef.current) {
                clearTimeout(pendingActionRef.current.timeoutId);
                const { data: actionData, previousState: prevState } = pendingActionRef.current;
                pendingActionRef.current = null;
                
                try {
                  await onUndo(actionData, prevState);
                  toast.success(undoMessage);
                } catch (error) {
                  toast.error("Failed to undo action");
                  console.error("Undo failed:", error);
                }
              }
            },
          },
          duration: undoTimeoutMs,
        });
      } catch (error) {
        toast.error("Action failed");
        console.error("Action failed:", error);
        throw error;
      } finally {
        setIsExecuting(false);
      }
    },
    [onExecute, onUndo, undoTimeoutMs, successMessage, undoMessage]
  );

  const cancelPending = useCallback(() => {
    if (pendingActionRef.current) {
      clearTimeout(pendingActionRef.current.timeoutId);
      pendingActionRef.current = null;
    }
  }, []);

  return { execute, isExecuting, cancelPending };
}
