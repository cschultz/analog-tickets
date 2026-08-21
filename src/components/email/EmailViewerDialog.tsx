/**
 * EmailViewerDialog
 * 
 * Full-screen dialog to view raw email content when AI parsing
 * didn't extract enough information. Allows manual naming and categorization.
 */

import { useState } from "react";
import {
  AdminDialog,
  AdminDialogContent,
  AdminDialogHeader,
  AdminDialogTitle,
  AdminButton,
  AdminBadge,
  AdminInput,
  AdminSelect,
  AdminSelectItem,
} from "@/components/admin";
import { AdminScrollArea } from "@/components/admin/AdminScrollArea";
import {
  Mail,
  User,
  Clock,
  Sparkles,
  Check,
  X,
  Package,
  Palette,
  Users,
  Handshake,
  Music,
  Wine,
  FileText,
  ExternalLink,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { usePipelineConfig, usePipelineStages } from "@/hooks/usePipelineConfig";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

interface PendingImport {
  id: string;
  source_email: string;
  source_name: string | null;
  source_subject: string | null;
  parsed_contacts: any[];
  parsed_company: any;
  parsed_summary: any;
  recommended_category: string;
  category_confidence: number;
  potential_duplicates: any[];
  received_at: string;
  status: string;
  raw_email_html?: string | null;
  raw_email_text?: string | null;
}

interface EmailViewerDialogProps {
  item: PendingImport | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (category: string, notes: string, selectedContacts: any[], pipelineStage: string | null, nextStep: string | null, entityName: string) => void;
  onReject: () => void;
  onMerge: (entityId: string, entityType: string, notes: string) => void;
  isProcessing: boolean;
}

const ENTITY_ICONS: Record<string, any> = {
  vendor: Package,
  artisan: Palette,
  volunteer: Users,
  partner: Handshake,
  artist: Music,
  winecamp: Wine,
};

const CATEGORY_TO_PIPELINE: Record<string, string> = {
  artist: "artist",
  partner: "partner",
  vendor: "vendor",
  artisan: "artisan",
  winecamp: "winecamp",
  volunteer: "volunteer",
};

const CATEGORY_OPTIONS = [
  { value: "artist", label: "Artist", description: "Musical acts for lineup" },
  { value: "partner", label: "Partner", description: "Sponsors & collaborators" },
  { value: "vendor", label: "Vendor", description: "Food, beverage & services" },
  { value: "artisan", label: "White Sage Market", description: "Artisan marketplace" },
  { value: "winecamp", label: "WineCamp", description: "Wine & beverage partners" },
  { value: "volunteer", label: "Volunteer", description: "Event staff & helpers" },
];

const NEXT_STEP_OPTIONS = [
  { value: "follow_up", label: "Follow Up" },
  { value: "send_contract", label: "Send Contract" },
  { value: "schedule_call", label: "Schedule Call" },
  { value: "request_info", label: "Request Info" },
  { value: "none", label: "No Action Needed" },
];

export function EmailViewerDialog({
  item,
  open,
  onOpenChange,
  onConfirm,
  onReject,
  onMerge,
  isProcessing,
}: EmailViewerDialogProps) {
  const company = item?.parsed_company || {};
  const defaultEntityName = (company as any).name || item?.source_name || "";
  
  const [selectedCategory, setSelectedCategory] = useState(item?.recommended_category || "");
  const [notes, setNotes] = useState("");
  const [entityName, setEntityName] = useState(defaultEntityName);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<number>>(
    new Set((item?.parsed_contacts || []).map((_: any, i: number) => i))
  );
  const [selectedStage, setSelectedStage] = useState<string>("");
  const [selectedNextStep, setSelectedNextStep] = useState<string>("");
  const [viewMode, setViewMode] = useState<"html" | "text">("html");
  
  const pipelineSlug = CATEGORY_TO_PIPELINE[selectedCategory] || "";
  const { data: pipelineConfig } = usePipelineConfig(pipelineSlug);
  const { data: pipelineStages } = usePipelineStages(pipelineConfig?.id);
  
  // Reset state when item changes
  if (item && entityName !== (defaultEntityName || entityName)) {
    // Only reset if it's a new item
  }
  
  if (!item) return null;
  
  const contacts = item.parsed_contacts || [];
  const duplicates = item.potential_duplicates || [];
  const confidence = Math.round((item.category_confidence || 0) * 100);
  
  const CategoryIcon = ENTITY_ICONS[selectedCategory] || ENTITY_ICONS[item.recommended_category] || User;
  
  const toggleContact = (idx: number) => {
    const newSet = new Set(selectedContactIds);
    if (newSet.has(idx)) {
      newSet.delete(idx);
    } else {
      newSet.add(idx);
    }
    setSelectedContactIds(newSet);
  };
  
  const getSelectedContacts = () => 
    contacts.filter((_: any, i: number) => selectedContactIds.has(i));

  const hasEmailContent = item.raw_email_html || item.raw_email_text;
  const displayContent = viewMode === "html" && item.raw_email_html 
    ? item.raw_email_html 
    : item.raw_email_text || item.raw_email_html || "";

  return (
    <AdminDialog open={open} onOpenChange={onOpenChange}>
      <AdminDialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <AdminDialogHeader className="p-4 border-b border-[hsl(var(--admin-border))] shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <AdminDialogTitle className="flex items-center gap-2 mb-1">
                <Mail className="h-4 w-4" />
                {item.source_subject || "(No subject)"}
              </AdminDialogTitle>
              <div className="text-sm text-[hsl(var(--admin-text-muted))] flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {item.source_name || item.source_email}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {format(new Date(item.received_at), "MMM d, yyyy 'at' h:mm a")}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <AdminBadge intent={confidence >= 70 ? "success" : "warning"} size="sm">
                {confidence}% confidence
              </AdminBadge>
              <AdminBadge intent="neutral" size="sm" className="capitalize">
                {CATEGORY_OPTIONS.find(c => c.value === item.recommended_category)?.label || item.recommended_category}
              </AdminBadge>
            </div>
          </div>
        </AdminDialogHeader>

        {/* Main content area - split view */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left panel - Email content */}
          <div className="flex-1 flex flex-col border-r border-[hsl(var(--admin-border))] min-w-0">
            {/* View toggle */}
            <div className="p-2 border-b border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-hover))] flex items-center gap-2">
              <span className="text-xs text-[hsl(var(--admin-text-muted))]">View:</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setViewMode("html")}
                  className={cn(
                    "px-2 py-1 rounded text-xs transition-colors",
                    viewMode === "html"
                      ? "bg-[hsl(var(--admin-info))/0.15] text-[hsl(var(--admin-info))]"
                      : "hover:bg-[hsl(var(--admin-hover))]"
                  )}
                  disabled={!item.raw_email_html}
                >
                  Formatted
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("text")}
                  className={cn(
                    "px-2 py-1 rounded text-xs transition-colors",
                    viewMode === "text"
                      ? "bg-[hsl(var(--admin-info))/0.15] text-[hsl(var(--admin-info))]"
                      : "hover:bg-[hsl(var(--admin-hover))]"
                  )}
                  disabled={!item.raw_email_text}
                >
                  Plain Text
                </button>
              </div>
            </div>

            {/* Email content */}
            <AdminScrollArea className="flex-1">
              <div className="p-4">
                {hasEmailContent ? (
                  viewMode === "html" && item.raw_email_html ? (
                    <div 
                      className="prose prose-sm max-w-none dark:prose-invert"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.raw_email_html) }}
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed">
                      {item.raw_email_text || "No text content available"}
                    </pre>
                  )
                ) : (
                  <div className="text-center py-12 text-[hsl(var(--admin-text-muted))]">
                    <Mail className="h-8 w-8 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">Email content not available</p>
                    <p className="text-xs mt-1">The raw email body was not stored for this import</p>
                  </div>
                )}
              </div>
            </AdminScrollArea>
          </div>

          {/* Right panel - Actions */}
          <div className="w-80 flex flex-col shrink-0 bg-[hsl(var(--admin-surface))]">
            <AdminScrollArea className="flex-1">
              <div className="p-4 space-y-5">
                {/* Entity Name */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-[hsl(var(--admin-text-muted))]">
                    Entity Name
                  </label>
                  <AdminInput
                    value={entityName}
                    onChange={(e) => setEntityName(e.target.value)}
                    placeholder="Enter name..."
                    className="w-full"
                  />
                  <p className="text-xs text-[hsl(var(--admin-text-muted))]">
                    Read the email to identify the correct name
                  </p>
                </div>

                {/* Pipeline Category */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-[hsl(var(--admin-text-muted))]">
                    Pipeline
                  </label>
                  <AdminSelect 
                    value={selectedCategory} 
                    onValueChange={(val) => { 
                      setSelectedCategory(val); 
                      setSelectedStage(""); 
                    }}
                  >
                    {CATEGORY_OPTIONS.map((opt) => {
                      const Icon = ENTITY_ICONS[opt.value] || User;
                      return (
                        <AdminSelectItem key={opt.value} value={opt.value}>
                          <div className="flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5" />
                            {opt.label}
                            {opt.value === item.recommended_category && (
                              <Sparkles className="h-3 w-3 text-[hsl(var(--admin-warning))]" />
                            )}
                          </div>
                        </AdminSelectItem>
                      );
                    })}
                  </AdminSelect>
                </div>

                {/* Pipeline Stage */}
                {selectedCategory && pipelineStages && pipelineStages.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-[hsl(var(--admin-text-muted))]">
                      Stage
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {pipelineStages.map((stage) => {
                        const isSelected = selectedStage === stage.slug;
                        return (
                          <button
                            key={stage.id}
                            type="button"
                            onClick={() => setSelectedStage(stage.slug)}
                            className={cn(
                              "px-2.5 py-1 rounded-full text-xs font-medium transition-all",
                              isSelected ? "text-white shadow-sm" : "hover:opacity-80"
                            )}
                            style={{ 
                              backgroundColor: isSelected ? stage.color : `${stage.color}20`,
                              color: isSelected ? '#fff' : stage.color
                            }}
                          >
                            {stage.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Next Step */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-[hsl(var(--admin-text-muted))]">
                    Next Step
                  </label>
                  <AdminSelect value={selectedNextStep || "none"} onValueChange={setSelectedNextStep}>
                    {NEXT_STEP_OPTIONS.map((opt) => (
                      <AdminSelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </AdminSelectItem>
                    ))}
                  </AdminSelect>
                </div>

                {/* Contacts */}
                {contacts.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-[hsl(var(--admin-text-muted))]">
                      Contacts ({selectedContactIds.size} selected)
                    </label>
                    <div className="space-y-1">
                      {contacts.map((contact: any, idx: number) => {
                        const isSelected = selectedContactIds.has(idx);
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => toggleContact(idx)}
                            className={cn(
                              "w-full text-left px-3 py-2 rounded-md text-sm transition-all flex items-center gap-2",
                              isSelected
                                ? "bg-[hsl(var(--admin-info))/0.1] border border-[hsl(var(--admin-info))/0.3]"
                                : "bg-[hsl(var(--admin-hover))] border border-transparent opacity-60"
                            )}
                          >
                            <div className={cn(
                              "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                              isSelected 
                                ? "bg-[hsl(var(--admin-info))] border-[hsl(var(--admin-info))]" 
                                : "border-[hsl(var(--admin-border))]"
                            )}>
                              {isSelected && <Check className="h-3 w-3 text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{contact.name}</div>
                              <div className="text-xs text-[hsl(var(--admin-text-muted))] truncate">
                                {contact.email}
                                {contact.role && ` • ${contact.role}`}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Duplicates / Merge Options */}
                {duplicates.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-[hsl(var(--admin-warning))]">
                      Possible Matches Found
                    </label>
                    <div className="space-y-1">
                      {duplicates.map((dup: any, idx: number) => (
                        <AdminButton
                          key={idx}
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            onMerge(dup.entity_id || dup.id, dup.entity_type || dup.type, notes);
                            onOpenChange(false);
                          }}
                          disabled={isProcessing}
                          className="w-full justify-start text-left"
                        >
                          <ExternalLink className="h-3 w-3 mr-2 shrink-0" />
                          Link to {dup.entity_name || dup.name}
                        </AdminButton>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-[hsl(var(--admin-text-muted))]">
                    Notes (optional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add context, follow-up notes..."
                    className="w-full px-3 py-2 text-sm rounded-md border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] resize-none focus:outline-none focus:ring-2 focus:ring-[hsl(var(--admin-info))/0.5]"
                    rows={3}
                  />
                </div>
              </div>
            </AdminScrollArea>

            {/* Action buttons */}
            <div className="p-4 border-t border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-hover))] space-y-2">
              <AdminButton
                className="w-full"
                onClick={() => {
                  onConfirm(
                    selectedCategory, 
                    notes, 
                    getSelectedContacts(), 
                    selectedStage || null, 
                    selectedNextStep || null, 
                    entityName
                  );
                  onOpenChange(false);
                }}
                disabled={isProcessing || !selectedCategory || selectedContactIds.size === 0 || !entityName.trim()}
              >
                <Check className="h-4 w-4 mr-2" />
                Create {entityName || "Record"}
              </AdminButton>
              <AdminButton
                variant="ghost"
                className="w-full text-[hsl(var(--admin-text-muted))] hover:text-[hsl(var(--admin-danger))]"
                onClick={() => {
                  onReject();
                  onOpenChange(false);
                }}
                disabled={isProcessing}
              >
                <X className="h-4 w-4 mr-2" />
                Discard
              </AdminButton>
            </div>
          </div>
        </div>
      </AdminDialogContent>
    </AdminDialog>
  );
}
