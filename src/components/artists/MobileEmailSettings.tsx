/**
 * MobileEmailSettings
 * 
 * Collapsible settings section for mobile email composer.
 * Contains template, CC, reply-to, and merge fields.
 * Collapsed by default per Admin Mobile UX guidelines.
 * 
 * ADMIN STYLE GUIDE COMPLIANCE:
 * - Uses AdminButton, AdminInput
 * - All colors from admin tokens
 * - No custom button implementations
 */

import { ChevronDown, Settings } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { AdminButton, AdminInput, AdminLabel } from "@/components/admin";
import { AdminSelect, AdminSelectItem } from "@/components/admin/AdminSelect";
import MergeFieldToolbar from "./MergeFieldToolbar";

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  category: string;
}

interface MobileEmailSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: EmailTemplate[];
  selectedTemplateId: string;
  onTemplateChange: (templateId: string) => void;
  ccEmails: string;
  onCcChange: (value: string) => void;
  replyToEmail: string;
  onReplyToChange: (value: string) => void;
  onInsertField: (tag: string) => void;
}

export function MobileEmailSettings({
  open,
  onOpenChange,
  templates,
  selectedTemplateId,
  onTemplateChange,
  ccEmails,
  onCcChange,
  replyToEmail,
  onReplyToChange,
  onInsertField,
}: MobileEmailSettingsProps) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger asChild>
        <AdminButton
          variant="adminGhost"
          className={cn(
            "w-full justify-between h-auto py-3 px-4 rounded-none",
            "border-b border-[hsl(var(--admin-border))]"
          )}
        >
          <div className="flex items-center gap-3">
            <Settings className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
            <span className="text-sm font-medium text-[hsl(var(--admin-text))]">
              Email Settings
            </span>
          </div>
          <ChevronDown 
            className={cn(
              "h-4 w-4 text-[hsl(var(--admin-text-muted))] transition-transform",
              open && "rotate-180"
            )} 
          />
        </AdminButton>
      </CollapsibleTrigger>
      
      <CollapsibleContent>
        <div className="px-4 py-4 space-y-4 bg-[hsl(var(--admin-surface))] border-b border-[hsl(var(--admin-border))]">
          {/* Template Selection */}
          <div className="space-y-2">
            <AdminLabel className="text-xs">
              Template
            </AdminLabel>
            <AdminSelect value={selectedTemplateId} onValueChange={onTemplateChange} placeholder="Select template...">
              {templates.map(t => (
                <AdminSelectItem key={t.id} value={t.id}>{t.name}</AdminSelectItem>
              ))}
            </AdminSelect>
          </div>

          {/* CC Emails */}
          <div className="space-y-2">
            <AdminLabel className="text-xs">
              CC Your Team
            </AdminLabel>
            <AdminInput
              value={ccEmails}
              onChange={(e) => onCcChange(e.target.value)}
              placeholder="email1@team.com, email2@team.com"
            />
          </div>

          {/* Reply-To */}
          <div className="space-y-2">
            <AdminLabel className="text-xs">
              Reply-To
            </AdminLabel>
            <AdminInput
              value={replyToEmail}
              onChange={(e) => onReplyToChange(e.target.value)}
              placeholder="replies@team.com"
            />
          </div>

          {/* Merge Fields */}
          <div className="space-y-2">
            <AdminLabel className="text-xs">
              Insert Merge Field
            </AdminLabel>
            <MergeFieldToolbar onInsertField={onInsertField} />
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
