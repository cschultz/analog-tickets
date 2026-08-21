/**
 * DrawerEditableNotes
 * 
 * Persistent editable notes field at the top of the Overview tab.
 * Saves to the record's `notes` column with auto-save on blur.
 */

import { useState, useEffect, useRef } from "react";
import { usePipeline } from "../PipelineContext";
import { AdminTextarea, AdminLabel } from "@/components/admin";
import { StickyNote, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function DrawerEditableNotes() {
  const { selectedRecord, updateRecord, isUpdating } = usePipeline();
  const [value, setValue] = useState("");
  const [isSaved, setIsSaved] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const lastSavedRef = useRef("");

  useEffect(() => {
    const notes = String(selectedRecord?.notes || "");
    setValue(notes);
    lastSavedRef.current = notes;
  }, [selectedRecord?.id, selectedRecord?.notes]);

  const handleSave = (text: string) => {
    if (!selectedRecord?.id || text === lastSavedRef.current) return;
    lastSavedRef.current = text;
    updateRecord({ id: selectedRecord.id, notes: text || null });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setValue(text);
    // Auto-save after 1s of inactivity
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => handleSave(text), 1000);
  };

  const handleBlur = () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    handleSave(value);
  };

  if (!selectedRecord) return null;

  return (
    <div className="rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-card))] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))]">
        <div className="flex items-center gap-2">
          <StickyNote className="w-3.5 h-3.5 text-[hsl(var(--admin-muted-foreground))]" />
          <AdminLabel className="text-xs font-medium text-[hsl(var(--admin-foreground))] m-0">
            Notes
          </AdminLabel>
        </div>
        <div className="flex items-center gap-1.5">
          {isUpdating && (
            <Loader2 className="w-3 h-3 animate-spin text-[hsl(var(--admin-muted-foreground))]" />
          )}
          {isSaved && !isUpdating && (
            <span className="flex items-center gap-1 text-[10px] text-[hsl(var(--admin-success))]">
              <Check className="w-3 h-3" />
              Saved
            </span>
          )}
        </div>
      </div>
      <div className="p-3">
        <AdminTextarea
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder="Add notes about this record... These are visible only to admins."
          className={cn(
            "min-h-[80px] resize-y text-sm border-none bg-transparent shadow-none focus-visible:ring-0 p-0",
            "placeholder:text-[hsl(var(--admin-muted-foreground)/0.5)]"
          )}
        />
      </div>
    </div>
  );
}
