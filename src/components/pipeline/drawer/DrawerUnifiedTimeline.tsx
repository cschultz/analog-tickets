/**
 * DrawerUnifiedTimeline
 * 
 * Merged Activity Feed + Interaction History into one chronological timeline.
 */

import { useState } from "react";
import { usePipeline } from "../PipelineContext";
import { usePipelineNotes, NoteType } from "@/hooks/usePipelineNotes";
import { usePipelineActivityLog, ActivityLogEntry } from "@/hooks/usePipelineActivityLog";
import { AdminButton, AdminLabel, AdminTextarea } from "@/components/admin";
import { 
  Plus, 
  Trash2, 
  Loader2, 
  MessageSquare,
  Phone,
  Mail,
  Calendar,
  StickyNote,
  MessageCircle,
  ArrowRight,
  Activity,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";

const NOTE_TYPES: { value: NoteType; label: string; icon: React.ElementType }[] = [
  { value: "note", label: "Note", icon: StickyNote },
  { value: "call", label: "Call", icon: Phone },
  { value: "email", label: "Email", icon: Mail },
  { value: "meeting", label: "Meeting", icon: Calendar },
  { value: "message", label: "Message", icon: MessageCircle },
];

function getNoteTypeIcon(type: NoteType) {
  return NOTE_TYPES.find(t => t.value === type)?.icon || StickyNote;
}

function getNoteTypeLabel(type: NoteType) {
  return NOTE_TYPES.find(t => t.value === type)?.label || "Note";
}

type TimelineEntry = 
  | { kind: "note"; data: { id: string; content: string; note_type: NoteType; created_at: string }; date: Date }
  | { kind: "activity"; data: ActivityLogEntry; date: Date };

export function DrawerUnifiedTimeline() {
  const { selectedRecord, config } = usePipeline();
  const [newNote, setNewNote] = useState("");
  const [noteType, setNoteType] = useState<NoteType>("note");
  const [isAdding, setIsAdding] = useState(false);

  const entityType = config?.slug || "artist";
  const entityId = selectedRecord?.id;

  const { notes, isLoading: notesLoading, addNote, deleteNote, isAddingNote, isDeletingNote } = usePipelineNotes(entityType, entityId);
  const { activities, isLoading: activityLoading } = usePipelineActivityLog();

  const isLoading = notesLoading || activityLoading;

  // Merge into one sorted timeline
  const timeline: TimelineEntry[] = [
    ...notes.map(n => ({ kind: "note" as const, data: n, date: new Date(n.created_at) })),
    ...activities.map(a => ({ kind: "activity" as const, data: a, date: new Date(a.created_at) })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    await addNote(newNote.trim(), noteType);
    setNewNote("");
    setNoteType("note");
    setIsAdding(false);
  };

  if (!selectedRecord) return null;

  return (
    <div className="rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-card))] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))]">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-[hsl(var(--admin-muted-foreground))]" />
          <AdminLabel className="text-xs font-medium text-[hsl(var(--admin-foreground))] m-0">
            Timeline
          </AdminLabel>
          {timeline.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[hsl(var(--admin-muted)/0.5)] text-[hsl(var(--admin-muted-foreground))]">
              {timeline.length}
            </span>
          )}
        </div>
        {!isAdding && (
          <AdminButton
            variant="ghost"
            size="sm"
            onClick={() => setIsAdding(true)}
            className="h-6 px-2 text-[10px] text-[hsl(var(--admin-muted-foreground))] hover:text-[hsl(var(--admin-foreground))]"
          >
            <Plus className="w-3 h-3 mr-1" />
            Log
          </AdminButton>
        )}
      </div>

      <div className="p-3 space-y-3">
        {/* Add New Note */}
        {isAdding && (
          <div className="space-y-3 p-3 rounded-lg bg-[hsl(var(--admin-bg))] border border-[hsl(var(--admin-border))]">
            <div className="flex items-center gap-1 flex-wrap">
              {NOTE_TYPES.map((type) => {
                const Icon = type.icon;
                return (
                  <AdminButton
                    key={type.value}
                    variant="ghost"
                    size="sm"
                    onClick={() => setNoteType(type.value)}
                    className={cn(
                      "h-7 px-2.5 text-xs rounded-full",
                      noteType === type.value
                        ? "bg-[hsl(var(--admin-foreground))] text-[hsl(var(--admin-bg))]"
                        : "text-[hsl(var(--admin-muted-foreground))] hover:bg-[hsl(var(--admin-surface))]"
                    )}
                  >
                    <Icon className="w-3 h-3 mr-1.5" />
                    {type.label}
                  </AdminButton>
                );
              })}
            </div>

            <AdminTextarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder={`Log ${getNoteTypeLabel(noteType).toLowerCase()} details...`}
              autoFocus
              className="min-h-[80px] resize-none"
            />
            <div className="flex items-center gap-2 justify-end">
              <AdminButton
                variant="ghost"
                size="sm"
                onClick={() => { setIsAdding(false); setNewNote(""); setNoteType("note"); }}
                className="h-7 text-xs"
              >
                Cancel
              </AdminButton>
              <AdminButton
                variant="admin"
                size="sm"
                onClick={handleAddNote}
                disabled={!newNote.trim() || isAddingNote}
                className="h-7 text-xs"
              >
                {isAddingNote ? (
                  <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Saving...</>
                ) : (
                  <><Plus className="w-3 h-3 mr-1.5" />Log {getNoteTypeLabel(noteType)}</>
                )}
              </AdminButton>
            </div>
          </div>
        )}

        {/* Timeline */}
        {isLoading ? (
          <div className="flex items-center justify-center py-6 text-[hsl(var(--admin-muted-foreground))]">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : timeline.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <MessageSquare className="w-8 h-8 text-[hsl(var(--admin-border))] mb-2" />
            <p className="text-xs text-[hsl(var(--admin-muted-foreground))] mb-1">No activity yet</p>
            <p className="text-[10px] text-[hsl(var(--admin-muted-foreground))] opacity-70 mb-3">
              Status changes, interactions, and notes appear here
            </p>
            {!isAdding && (
              <AdminButton
                variant="adminOutline"
                size="sm"
                onClick={() => setIsAdding(true)}
                className="w-full max-w-[200px] h-8 text-xs"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Log Interaction
              </AdminButton>
            )}
          </div>
        ) : (
          <div className="space-y-0 max-h-[400px] overflow-y-auto">
            {timeline.map((entry, index) => {
              const isLast = index === timeline.length - 1;

              if (entry.kind === "note") {
                const note = entry.data;
                const Icon = getNoteTypeIcon(note.note_type);
                return (
                  <div key={`note-${note.id}`} className="relative flex gap-3 group">
                    {!isLast && <div className="absolute left-[11px] top-7 bottom-0 w-px bg-[hsl(var(--admin-border))]" />}
                    <div className="relative z-10 flex-shrink-0 w-6 h-6 rounded-full bg-[hsl(var(--admin-surface))] border border-[hsl(var(--admin-border))] flex items-center justify-center">
                      <Icon className="w-3 h-3 text-[hsl(var(--admin-muted-foreground))]" />
                    </div>
                    <div className="flex-1 pb-4 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-medium text-[hsl(var(--admin-foreground))] uppercase tracking-wide">
                            {getNoteTypeLabel(note.note_type)}
                          </span>
                          <span className="text-[10px] text-[hsl(var(--admin-muted-foreground))]" title={format(entry.date, "PPpp")}>
                            {formatDistanceToNow(entry.date, { addSuffix: true })}
                          </span>
                        </div>
                        <AdminButton
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteNote(note.id)}
                          disabled={isDeletingNote === note.id}
                          className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 text-[hsl(var(--admin-muted-foreground))] hover:text-[hsl(var(--admin-destructive))] hover:bg-[hsl(var(--admin-destructive)/0.1)] shrink-0"
                        >
                          {isDeletingNote === note.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        </AdminButton>
                      </div>
                      <p className="text-sm text-[hsl(var(--admin-foreground))] whitespace-pre-wrap mt-1">{note.content}</p>
                    </div>
                  </div>
                );
              }

              // Activity entry
              const activity = entry.data;
              return (
                <div key={`activity-${activity.id}`} className="relative flex gap-3">
                  {!isLast && <div className="absolute left-[11px] top-7 bottom-0 w-px bg-[hsl(var(--admin-border))]" />}
                  <div className="relative z-10 flex-shrink-0 w-6 h-6 rounded-full bg-[hsl(var(--admin-bg))] border border-[hsl(var(--admin-border)/0.5)] flex items-center justify-center">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      activity.action === "status_change" ? "bg-[hsl(var(--admin-info))]" : "bg-[hsl(var(--admin-muted-foreground)/0.4)]"
                    )} />
                  </div>
                  <div className="flex-1 pb-4 min-w-0">
                    {activity.action === "status_change" ? (
                      <p className="text-xs text-[hsl(var(--admin-muted-foreground))]">
                        Status changed
                        <span className="inline-flex items-center gap-1 mx-1">
                          <span className="capitalize">{activity.old_value?.replace(/_/g, " ") || "—"}</span>
                          <ArrowRight className="w-3 h-3" />
                          <span className="font-medium text-[hsl(var(--admin-foreground))] capitalize">{activity.new_value?.replace(/_/g, " ")}</span>
                        </span>
                      </p>
                    ) : (
                      <p className="text-xs text-[hsl(var(--admin-muted-foreground))] capitalize">
                        {activity.action.replace(/_/g, " ")}
                      </p>
                    )}
                    <div className="flex items-center gap-1 mt-0.5 text-[10px] text-[hsl(var(--admin-muted-foreground)/0.7)]">
                      <Clock className="w-3 h-3" />
                      {formatDistanceToNow(entry.date, { addSuffix: true })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}