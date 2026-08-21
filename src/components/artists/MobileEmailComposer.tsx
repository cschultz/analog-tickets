/**
 * MobileEmailComposer
 * 
 * Focused, full-width message composer for mobile.
 * Minimal chrome, message-first design.
 * 
 * ADMIN STYLE GUIDE COMPLIANCE:
 * - Uses AdminButton, AdminInput
 * - All colors from admin tokens
 * - No custom button implementations
 */

import { AdminButton, AdminInput } from "@/components/admin";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Eye, Edit } from "lucide-react";
import { cn } from "@/lib/utils";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

interface ArtistContact {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface MobileEmailComposerProps {
  subject: string;
  onSubjectChange: (value: string) => void;
  body: string;
  onBodyChange: (value: string) => void;
  previewSubject: string;
  previewBody: string;
  viewMode: "edit" | "preview";
  onViewModeChange: (mode: "edit" | "preview") => void;
  recipientContacts: ArtistContact[];
}

export function MobileEmailComposer({
  subject,
  onSubjectChange,
  body,
  onBodyChange,
  previewSubject,
  previewBody,
  viewMode,
  onViewModeChange,
  recipientContacts,
}: MobileEmailComposerProps) {
  return (
    <div className="flex flex-col flex-1 bg-[hsl(var(--admin-surface))]">
      {/* Minimal Header with View Toggle */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[hsl(var(--admin-border))]">
        <div className="text-xs text-[hsl(var(--admin-text-muted))]">
          To: {recipientContacts.map(c => c.name).join(", ")}
        </div>
        <div className="flex items-center gap-1">
          <AdminButton
            variant={viewMode === "edit" ? "admin" : "adminGhost"}
            size="icon"
            onClick={() => onViewModeChange("edit")}
            className="h-8 w-8"
          >
            <Edit className="h-4 w-4" />
          </AdminButton>
          <AdminButton
            variant={viewMode === "preview" ? "admin" : "adminGhost"}
            size="icon"
            onClick={() => onViewModeChange("preview")}
            className="h-8 w-8"
          >
            <Eye className="h-4 w-4" />
          </AdminButton>
        </div>
      </div>

      {/* Composer Content */}
      <div className="flex-1 overflow-auto">
        {viewMode === "edit" ? (
          <div className="p-4 space-y-4">
            {/* Subject Field - Using AdminInput with minimal styling */}
            <div>
              <AdminInput
                value={subject}
                onChange={(e) => onSubjectChange(e.target.value)}
                placeholder="Subject..."
                className={cn(
                  "border-0 border-b border-[hsl(var(--admin-border))] rounded-none",
                  "px-0 py-2 h-auto text-base font-medium",
                  "bg-transparent focus-visible:ring-0"
                )}
              />
            </div>

            {/* Message Body */}
            <div className="min-h-[200px]">
              <RichTextEditor content={body} onChange={onBodyChange} />
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {/* Preview Subject */}
            <div className="pb-3 border-b border-[hsl(var(--admin-border))]">
              <div className="text-xs text-[hsl(var(--admin-text-muted))] mb-1">Subject</div>
              <div className="text-base font-medium text-[hsl(var(--admin-text))]">
                {previewSubject}
              </div>
            </div>

            {/* Preview Body */}
            <div>
              <div className="text-xs text-[hsl(var(--admin-text-muted))] mb-2">Message</div>
              <div 
                className="prose prose-sm max-w-none text-[hsl(var(--admin-text))]"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewBody) }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
