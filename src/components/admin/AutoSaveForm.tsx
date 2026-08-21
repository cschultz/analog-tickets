/**
 * AutoSaveForm - Form wrapper with auto-save draft functionality
 * 
 * Features:
 * - Auto-saves form state to localStorage as you type
 * - Shows draft recovery banner when draft exists
 * - Undo capability for form submissions
 */

import { ReactNode, useEffect, useState } from "react";
import { useFormAutoSave } from "@/hooks/useFormAutoSave";
import { useUndoableAction } from "@/hooks/useUndoableAction";
import { AdminButton } from "@/components/admin";
import { AlertCircle, Clock, Undo2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface AutoSaveFormProps<T extends Record<string, any>> {
  formId: string;
  data: T;
  onRestore: (data: T) => void;
  onSubmit: (data: T) => Promise<void>;
  onUndo?: (data: T, previousState: T) => Promise<void>;
  debounceMs?: number;
  children: ReactNode;
  className?: string;
  showDraftBanner?: boolean;
  enableUndo?: boolean;
  undoTimeoutMs?: number;
  successMessage?: string;
}

export function AutoSaveForm<T extends Record<string, any>>({
  formId,
  data,
  onRestore,
  onSubmit,
  onUndo,
  debounceMs = 1000,
  children,
  className,
  showDraftBanner = true,
  enableUndo = true,
  undoTimeoutMs = 5000,
  successMessage = "Changes saved",
}: AutoSaveFormProps<T>) {
  const [showBanner, setShowBanner] = useState(true);

  const { hasDraft, lastSaved, restoreDraft, discardDraft } = useFormAutoSave({
    formId,
    data,
    onRestore,
    debounceMs,
  });

  const { execute, isExecuting } = useUndoableAction({
    onExecute: onSubmit,
    onUndo: onUndo || (async () => {}),
    undoTimeoutMs,
    successMessage,
    undoMessage: "Changes reverted",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enableUndo && onUndo) {
      await execute(data, data);
    } else {
      await onSubmit(data);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-4", className)}>
      {/* Draft Recovery Banner */}
      {showDraftBanner && hasDraft && showBanner && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-[hsl(var(--admin-info)/0.1)] border border-[hsl(var(--admin-info)/0.3)] rounded-lg">
          <div className="flex items-center gap-2 text-sm">
            <AlertCircle className="h-4 w-4 text-[hsl(var(--admin-info))]" />
            <span className="text-[hsl(var(--admin-text))]">
              You have unsaved changes from{" "}
              {lastSaved && formatDistanceToNow(lastSaved, { addSuffix: true })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <AdminButton
              type="button"
              variant="adminOutline"
              size="sm"
              onClick={restoreDraft}
            >
              <Undo2 className="h-3 w-3 mr-1" />
              Restore
            </AdminButton>
            <AdminButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                discardDraft();
                setShowBanner(false);
              }}
            >
              <X className="h-3 w-3" />
            </AdminButton>
          </div>
        </div>
      )}

      {/* Last saved indicator */}
      {lastSaved && !hasDraft && (
        <div className="flex items-center gap-1.5 text-xs text-[hsl(var(--admin-text-muted))]">
          <Clock className="h-3 w-3" />
          <span>Draft saved {formatDistanceToNow(lastSaved, { addSuffix: true })}</span>
        </div>
      )}

      {children}
    </form>
  );
}

/**
 * Hook version for more control
 */
export function useAutoSaveForm<T extends Record<string, any>>({
  formId,
  data,
  onRestore,
  debounceMs = 1000,
}: {
  formId: string;
  data: T;
  onRestore: (data: T) => void;
  debounceMs?: number;
}) {
  return useFormAutoSave({
    formId,
    data,
    onRestore,
    debounceMs,
  });
}
