/**
 * PipelineNotesCard
 * 
 * Interaction history log for pipeline records.
 * Track calls, emails, meetings, and general notes.
 */

import { useState } from "react";
import { usePipeline } from "../PipelineContext";
import { AdminTextarea } from "@/components/admin";
import { usePipelineNotes, NoteType } from "@/hooks/usePipelineNotes";
import { AdminButton, AdminLabel } from "@/components/admin";
import { 
  History, 
  Plus, 
  Trash2, 
  Loader2, 
  MessageSquare,
  Phone,
  Mail,
  Calendar,
  StickyNote,
  MessageCircle,
  Pencil,
  Check,
  X
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
  const noteType = NOTE_TYPES.find(t => t.value === type);
  return noteType?.icon || StickyNote;
}

function getNoteTypeLabel(type: NoteType) {
  const noteType = NOTE_TYPES.find(t => t.value === type);
  return noteType?.label || "Note";
}

export function PipelineNotesCard() {
  const { selectedRecord, config } = usePipeline();
  const [newNote, setNewNote] = useState("");
  const [noteType, setNoteType] = useState<NoteType>("note");
  const [isAdding, setIsAdding] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  
  const entityType = config?.slug || "artist";
  const entityId = selectedRecord?.id;
  
  const { notes, isLoading, addNote, updateNote, deleteNote, isAddingNote, isUpdatingNote, isDeletingNote } = usePipelineNotes(
    entityType,
    entityId
  );

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    
    await addNote(newNote.trim(), noteType);
    setNewNote("");
    setNoteType("note");
    setIsAdding(false);
  };

  const handleStartEdit = (noteId: string, content: string) => {
    setEditingNoteId(noteId);
    setEditingContent(content);
  };

  const handleSaveEdit = async () => {
    if (!editingNoteId || !editingContent.trim()) return;
    await updateNote(editingNoteId, editingContent.trim());
    setEditingNoteId(null);
    setEditingContent("");
  };

  if (!selectedRecord) return null;

  return (
    <div className="rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-card))] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))]">
        <div className="flex items-center gap-2">
          <History className="w-3.5 h-3.5 text-[hsl(var(--admin-muted-foreground))]" />
          <AdminLabel className="text-xs font-medium text-[hsl(var(--admin-foreground))] m-0">
            Interaction History
          </AdminLabel>
          {notes.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[hsl(var(--admin-muted)/0.5)] text-[hsl(var(--admin-muted-foreground))]">
              {notes.length}
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
            {/* Type Selector */}
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
                onClick={() => {
                  setIsAdding(false);
                  setNewNote("");
                  setNoteType("note");
                }}
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
                  <>
                    <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Plus className="w-3 h-3 mr-1.5" />
                    Log {getNoteTypeLabel(noteType)}
                  </>
                )}
              </AdminButton>
            </div>
          </div>
        )}

        {/* Notes List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-6 text-[hsl(var(--admin-muted-foreground))]">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <MessageSquare className="w-8 h-8 text-[hsl(var(--admin-border))] mb-2" />
            <p className="text-xs text-[hsl(var(--admin-muted-foreground))] mb-1">
              No interactions logged yet
            </p>
            <p className="text-[10px] text-[hsl(var(--admin-muted-foreground))] opacity-70 mb-3">
              Track calls, emails, and meetings
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
          <div className="space-y-0 max-h-[350px] overflow-y-auto">
            {notes.map((note, index) => {
              const Icon = getNoteTypeIcon(note.note_type);
              const isLast = index === notes.length - 1;
              
              return (
                <div key={note.id} className="relative flex gap-3 group">
                  {/* Timeline line */}
                  {!isLast && (
                    <div className="absolute left-[11px] top-7 bottom-0 w-px bg-[hsl(var(--admin-border))]" />
                  )}
                  
                  {/* Icon */}
                  <div className="relative z-10 flex-shrink-0 w-6 h-6 rounded-full bg-[hsl(var(--admin-surface))] border border-[hsl(var(--admin-border))] flex items-center justify-center">
                    <Icon className="w-3 h-3 text-[hsl(var(--admin-muted-foreground))]" />
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 pb-4 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-medium text-[hsl(var(--admin-foreground))] uppercase tracking-wide">
                          {getNoteTypeLabel(note.note_type)}
                        </span>
                        <span className="text-[10px] text-[hsl(var(--admin-muted-foreground))]" title={format(new Date(note.created_at), "PPpp")}>
                          {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 shrink-0">
                        <AdminButton
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStartEdit(note.id, note.content)}
                          className="h-5 w-5 p-0 text-[hsl(var(--admin-muted-foreground))] hover:text-[hsl(var(--admin-foreground))] hover:bg-[hsl(var(--admin-surface))]"
                        >
                          <Pencil className="w-3 h-3" />
                        </AdminButton>
                        <AdminButton
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteNote(note.id)}
                          disabled={isDeletingNote === note.id}
                          className="h-5 w-5 p-0 text-[hsl(var(--admin-muted-foreground))] hover:text-[hsl(var(--admin-destructive))] hover:bg-[hsl(var(--admin-destructive)/0.1)]"
                        >
                          {isDeletingNote === note.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                        </AdminButton>
                      </div>
                    </div>
                    {editingNoteId === note.id ? (
                      <div className="mt-1 space-y-2">
                        <AdminTextarea
                          value={editingContent}
                          onChange={(e) => setEditingContent(e.target.value)}
                          autoFocus
                          className="min-h-[60px] resize-none text-sm"
                        />
                        <div className="flex items-center gap-1.5 justify-end">
                          <AdminButton
                            variant="ghost"
                            size="sm"
                            onClick={() => { setEditingNoteId(null); setEditingContent(""); }}
                            className="h-6 px-2 text-[10px]"
                          >
                            <X className="w-3 h-3 mr-1" />
                            Cancel
                          </AdminButton>
                          <AdminButton
                            variant="admin"
                            size="sm"
                            onClick={handleSaveEdit}
                            disabled={!editingContent.trim() || isUpdatingNote}
                            className="h-6 px-2 text-[10px]"
                          >
                            {isUpdatingNote ? (
                              <Loader2 className="w-3 h-3 animate-spin mr-1" />
                            ) : (
                              <Check className="w-3 h-3 mr-1" />
                            )}
                            Save
                          </AdminButton>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-[hsl(var(--admin-foreground))] whitespace-pre-wrap mt-1">
                        {note.content}
                      </p>
                    )}
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
