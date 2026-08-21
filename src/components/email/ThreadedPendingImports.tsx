/**
 * ThreadedPendingImports
 * 
 * Groups pending email imports by sender email into collapsible threads.
 * Allows confirming all emails from the same sender at once.
 */

import { useState, useMemo } from "react";
import { AdminCard, AdminCardContent } from "@/components/admin/AdminCard";
import { 
  AdminButton, AdminBadge,
  AdminSelect, AdminSelectItem,
} from "@/components/admin";
import {
  AdminCollapsible,
  AdminCollapsibleTrigger,
  AdminCollapsibleContent,
} from "@/components/admin/AdminCollapsible";
import { 
  Check, 
  X, 
  ChevronDown,
  Clock,
  User,
  Package,
  Palette,
  Users,
  Handshake,
  Music,
  Wine,
  Eye,
  Sparkles,
  Link2,
  FileText,
  Mail,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { usePipelineConfig, usePipelineStages } from "@/hooks/usePipelineConfig";

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

interface ThreadedPendingImportsProps {
  imports: PendingImport[];
  onConfirm: (importId: string, category: string, notes: string, selectedContacts: any[], pipelineStage: string | null, nextStep: string | null, entityName: string) => void;
  onConfirmThread: (importIds: string[], category: string, notes: string, selectedContacts: any[], pipelineStage: string | null, nextStep: string | null, entityName: string) => void;
  onReject: (importId: string) => void;
  onRejectThread: (importIds: string[]) => void;
  onMerge: (importId: string, entityId: string, entityType: string, notes: string) => void;
  onViewEmail: (item: PendingImport) => void;
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

const ENTITY_INTENTS: Record<string, "info" | "success" | "warning" | "neutral" | "danger"> = {
  vendor: "info",
  artisan: "neutral",
  volunteer: "success",
  partner: "warning",
  artist: "neutral",
  winecamp: "neutral",
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

interface EmailThread {
  senderEmail: string;
  senderName: string;
  imports: PendingImport[];
  latestDate: Date;
  recommendedCategory: string;
  avgConfidence: number;
  allContacts: any[];
  duplicates: any[];
  company: any;
}

export function ThreadedPendingImports({
  imports,
  onConfirm,
  onConfirmThread,
  onReject,
  onRejectThread,
  onMerge,
  onViewEmail,
  isProcessing,
}: ThreadedPendingImportsProps) {
  // Group imports by parsed entity name (not source email, since forwards come from admin)
  const threads = useMemo(() => {
    const grouped = new Map<string, PendingImport[]>();
    
    for (const imp of imports) {
      // Use parsed company name as the grouping key, or fall back to source email
      // This handles forwarded emails where source_email is the admin who forwarded
      const entityName = imp.parsed_company?.name?.toLowerCase()?.trim() || 
                         imp.parsed_contacts?.[0]?.name?.toLowerCase()?.trim() ||
                         imp.source_email.toLowerCase();
      
      // Create a key that combines entity name with category to avoid cross-category grouping
      const groupKey = `${entityName}::${imp.recommended_category || 'unknown'}`;
      
      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, []);
      }
      grouped.get(groupKey)!.push(imp);
    }
    
    const result: EmailThread[] = [];
    for (const [groupKey, imps] of grouped.entries()) {
      // Extract display info from groupKey
      const [entityName] = groupKey.split("::");
      
      // Sort by date, newest first
      imps.sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
      
      // Aggregate data from all imports
      const allContacts: any[] = [];
      const seenEmails = new Set<string>();
      let duplicates: any[] = [];
      let company = {};
      
      for (const imp of imps) {
        // Merge contacts without duplicates
        for (const contact of imp.parsed_contacts || []) {
          const contactEmail = contact.email?.toLowerCase();
          if (contactEmail && !seenEmails.has(contactEmail)) {
            seenEmails.add(contactEmail);
            allContacts.push(contact);
          }
        }
        
        // Take first company found
        if (!company || Object.keys(company).length === 0) {
          company = imp.parsed_company || {};
        }
        
        // Merge duplicates
        duplicates = [...duplicates, ...(imp.potential_duplicates || [])];
      }
      
      // Dedupe duplicates
      const seenDupIds = new Set<string>();
      duplicates = duplicates.filter(d => {
        const id = d.entity_id || d.id;
        if (seenDupIds.has(id)) return false;
        seenDupIds.add(id);
        return true;
      });
      
      // Get most common recommended category
      const categoryCounts = new Map<string, number>();
      for (const imp of imps) {
        const cat = imp.recommended_category;
        categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
      }
      let recommendedCategory = imps[0].recommended_category;
      let maxCount = 0;
      for (const [cat, count] of categoryCounts.entries()) {
        if (count > maxCount) {
          maxCount = count;
          recommendedCategory = cat;
        }
      }
      
      // Average confidence
      const avgConfidence = imps.reduce((sum, imp) => sum + (imp.category_confidence || 0), 0) / imps.length;
      
      // Use parsed company name for display, fallback to source email
      const displayName = imps[0].parsed_company?.name || 
                         imps[0].parsed_contacts?.[0]?.name ||
                         imps[0].source_email;
      
      result.push({
        senderEmail: imps[0].source_email, // Keep original for reference
        senderName: displayName,
        imports: imps,
        latestDate: new Date(imps[0].received_at),
        recommendedCategory,
        avgConfidence,
        allContacts,
        duplicates,
        company,
      });
    }
    
    // Sort threads by latest date
    result.sort((a, b) => b.latestDate.getTime() - a.latestDate.getTime());
    
    return result;
  }, [imports]);

  // Render single email vs thread
  return (
    <div className="grid gap-4">
      {threads.map((thread) => (
        thread.imports.length === 1 ? (
          <SingleImportCard
            key={thread.senderEmail}
            item={thread.imports[0]}
            onConfirm={(category, notes, contacts, stage, next, name) => 
              onConfirm(thread.imports[0].id, category, notes, contacts, stage, next, name)
            }
            onReject={() => onReject(thread.imports[0].id)}
            onMerge={(entityId, entityType, notes) => onMerge(thread.imports[0].id, entityId, entityType, notes)}
            onViewEmail={() => onViewEmail(thread.imports[0])}
            isProcessing={isProcessing}
          />
        ) : (
          <ThreadCard
            key={thread.senderEmail}
            thread={thread}
            onConfirmThread={(category, notes, contacts, stage, next, name) => 
              onConfirmThread(thread.imports.map(i => i.id), category, notes, contacts, stage, next, name)
            }
            onRejectThread={() => onRejectThread(thread.imports.map(i => i.id))}
            onConfirmSingle={(importId, category, notes, contacts, stage, next, name) =>
              onConfirm(importId, category, notes, contacts, stage, next, name)
            }
            onRejectSingle={onReject}
            onMerge={onMerge}
            onViewEmail={onViewEmail}
            isProcessing={isProcessing}
          />
        )
      ))}
    </div>
  );
}

// Thread card for multiple emails from same sender
function ThreadCard({
  thread,
  onConfirmThread,
  onRejectThread,
  onConfirmSingle,
  onRejectSingle,
  onMerge,
  onViewEmail,
  isProcessing,
}: {
  thread: EmailThread;
  onConfirmThread: (category: string, notes: string, selectedContacts: any[], pipelineStage: string | null, nextStep: string | null, entityName: string) => void;
  onRejectThread: () => void;
  onConfirmSingle: (importId: string, category: string, notes: string, selectedContacts: any[], pipelineStage: string | null, nextStep: string | null, entityName: string) => void;
  onRejectSingle: (importId: string) => void;
  onMerge: (importId: string, entityId: string, entityType: string, notes: string) => void;
  onViewEmail: (item: PendingImport) => void;
  isProcessing: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(thread.recommendedCategory || "");
  const [notes, setNotes] = useState("");
  const [entityName, setEntityName] = useState((thread.company as any)?.name || thread.senderName || "");
  const [selectedContactIds, setSelectedContactIds] = useState<Set<number>>(
    new Set(thread.allContacts.map((_, i) => i))
  );
  const [selectedStage, setSelectedStage] = useState<string>("");
  const [selectedNextStep, setSelectedNextStep] = useState<string>("");
  const [showNotes, setShowNotes] = useState(false);
  
  const pipelineSlug = CATEGORY_TO_PIPELINE[selectedCategory] || "";
  const { data: pipelineConfig } = usePipelineConfig(pipelineSlug);
  const { data: pipelineStages } = usePipelineStages(pipelineConfig?.id);
  
  const CategoryIcon = ENTITY_ICONS[selectedCategory] || ENTITY_ICONS[thread.recommendedCategory] || User;
  const confidence = Math.round(thread.avgConfidence * 100);
  
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
    thread.allContacts.filter((_, i) => selectedContactIds.has(i));

  const getConfidenceIntent = (): "success" | "warning" | "danger" => {
    if (confidence >= 90) return "success";
    if (confidence >= 70) return "warning";
    return "danger";
  };

  // Get AI summary from latest email
  const latestSummary = thread.imports[0].parsed_summary || {};
  const aiSummary = (latestSummary as any).rawSummary || (latestSummary as any).raw_summary || "";

  return (
    <AdminCard className="overflow-hidden hover:shadow-md transition-shadow">
      <AdminCardContent className="p-0">
        {/* Section 1: Entity Header */}
        <div className="p-4 border-b border-[hsl(var(--admin-border))]">
          <div className="flex items-start gap-3">
            <div 
              className="p-2.5 rounded-xl shrink-0"
              style={{ 
                backgroundColor: selectedCategory 
                  ? `hsl(var(--admin-${ENTITY_INTENTS[selectedCategory] || 'info'}) / 0.1)` 
                  : 'hsl(var(--admin-hover))'
              }}
            >
              <CategoryIcon className="h-5 w-5" />
            </div>
            
            <div className="flex-1 min-w-0">
              <input
                type="text"
                value={entityName}
                onChange={(e) => setEntityName(e.target.value)}
                className="text-base font-semibold w-full bg-transparent border-b-2 border-transparent hover:border-[hsl(var(--admin-border))] focus:border-[hsl(var(--admin-info))] focus:outline-none transition-colors pb-0.5"
                placeholder="Enter entity name..."
              />
              
              <div className="flex items-center gap-2 mt-1 text-sm text-[hsl(var(--admin-text-muted))]">
                <span className="truncate">{thread.senderEmail}</span>
                <span className="text-xs whitespace-nowrap opacity-60">
                  {formatDistanceToNow(thread.latestDate, { addSuffix: true })}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <AdminBadge intent="info" size="sm" className="flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {thread.imports.length}
              </AdminBadge>
              <AdminBadge intent={getConfidenceIntent()} size="sm">{confidence}%</AdminBadge>
            </div>
          </div>
        </div>

        {/* Section 2: AI Summary */}
        {aiSummary && (
          <div className="px-4 py-3 bg-gradient-to-r from-[hsl(var(--admin-info))/0.04] to-transparent border-b border-[hsl(var(--admin-border))]">
            <div className="flex items-start gap-2.5">
              <Sparkles className="h-4 w-4 text-[hsl(var(--admin-info))] shrink-0 mt-0.5" />
              <p className="text-sm leading-relaxed text-[hsl(var(--admin-foreground))/0.85]">{aiSummary}</p>
            </div>
          </div>
        )}

        {/* Section 3: Pipeline Selection */}
        <div className="px-4 py-3 border-b border-[hsl(var(--admin-border))] space-y-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {CATEGORY_OPTIONS.map((opt) => {
              const Icon = ENTITY_ICONS[opt.value] || User;
              const isSelected = selectedCategory === opt.value;
              const isRecommended = opt.value === thread.recommendedCategory;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setSelectedCategory(opt.value); setSelectedStage(""); }}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                    isSelected
                      ? "bg-[hsl(var(--admin-foreground))] text-[hsl(var(--admin-surface))] shadow-sm"
                      : "bg-[hsl(var(--admin-hover))] text-[hsl(var(--admin-text-muted))] hover:text-[hsl(var(--admin-foreground))]"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {opt.label}
                  {isRecommended && !isSelected && (
                    <Sparkles className="h-3 w-3 text-[hsl(var(--admin-warning))]" />
                  )}
                </button>
              );
            })}
          </div>

          {selectedCategory && pipelineStages && pipelineStages.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[hsl(var(--admin-text-muted))] font-medium shrink-0">Stage:</span>
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
                        backgroundColor: isSelected ? stage.color : `${stage.color}15`,
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
        </div>

        {/* Section 4: Contacts */}
        {thread.allContacts.length > 0 && (
          <div className="px-4 py-3 border-b border-[hsl(var(--admin-border))]">
            <div className="flex items-center gap-2 mb-2">
              <User className="h-3.5 w-3.5 text-[hsl(var(--admin-text-muted))]" />
              <span className="text-xs text-[hsl(var(--admin-text-muted))] font-medium">
                Contacts ({selectedContactIds.size}/{thread.allContacts.length})
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {thread.allContacts.map((contact: any, idx: number) => {
                const isSelected = selectedContactIds.has(idx);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleContact(idx)}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all",
                      isSelected
                        ? "bg-[hsl(var(--admin-info))/0.1] text-[hsl(var(--admin-foreground))] ring-1 ring-[hsl(var(--admin-info))/0.3]"
                        : "bg-[hsl(var(--admin-hover))] text-[hsl(var(--admin-text-muted))] opacity-60"
                    )}
                  >
                    {isSelected && <Check className="h-3 w-3 text-[hsl(var(--admin-info))]" />}
                    <span className={cn(!isSelected && "line-through")}>{contact.name}</span>
                    {contact.role && <span className="opacity-50">• {contact.role}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Section 5: Duplicate/Match Detection */}
        {thread.duplicates.length > 0 && (() => {
          // Detect strong matches: same name (fuzzy) AND same category
          const strongMatches = thread.duplicates.filter((dup: any) => {
            const dupName = (dup.entity_name || dup.name || "").toLowerCase().trim();
            const currentName = entityName.toLowerCase().trim();
            const dupType = dup.entity_type || dup.type || "";
            const nameMatch = dupName === currentName || 
              dupName.includes(currentName) || 
              currentName.includes(dupName);
            const categoryMatch = dupType === selectedCategory || dupType === thread.recommendedCategory;
            return nameMatch && categoryMatch;
          });
          
          const weakMatches = thread.duplicates.filter((dup: any) => !strongMatches.includes(dup));
          
          // If there's a strong match, show it prominently
          if (strongMatches.length > 0) {
            const bestMatch = strongMatches[0];
            return (
              <div className="px-4 py-3 bg-[hsl(var(--admin-success))/0.08] border-b border-[hsl(var(--admin-success))/0.2]">
                <div className="flex items-center gap-3">
                  <div className="p-1.5 rounded-full bg-[hsl(var(--admin-success))/0.15]">
                    <Check className="h-4 w-4 text-[hsl(var(--admin-success))]" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Strong Match</span>
                      <AdminBadge intent="success" size="sm">Recommended</AdminBadge>
                    </div>
                    <p className="text-xs text-[hsl(var(--admin-text-muted))] mt-0.5">
                      "{entityName}" matches existing {bestMatch.entity_type || bestMatch.type}: <strong>{bestMatch.entity_name || bestMatch.name}</strong>
                    </p>
                  </div>
                  <AdminButton
                    size="sm"
                    onClick={() => onMerge(thread.imports[0].id, bestMatch.entity_id || bestMatch.id, bestMatch.entity_type || bestMatch.type, notes)}
                    disabled={isProcessing}
                    className="shrink-0 bg-[hsl(var(--admin-success))] hover:bg-[hsl(var(--admin-success))]/90"
                  >
                    <Link2 className="h-3.5 w-3.5 mr-1.5" />
                    Link to {bestMatch.entity_name || bestMatch.name}
                  </AdminButton>
                </div>
                {weakMatches.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-[hsl(var(--admin-success))/0.15] flex items-center gap-2">
                    <span className="text-xs text-[hsl(var(--admin-text-muted))]">Other matches:</span>
                    {weakMatches.slice(0, 2).map((dup: any, idx: number) => (
                      <button
                        key={idx}
                        onClick={() => onMerge(thread.imports[0].id, dup.entity_id || dup.id, dup.entity_type || dup.type, notes)}
                        disabled={isProcessing}
                        className="text-xs text-[hsl(var(--admin-info))] hover:underline"
                      >
                        {dup.entity_name || dup.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          
          // Standard weak matches
          return (
            <div className="px-4 py-3 bg-[hsl(var(--admin-warning))/0.05] border-b border-[hsl(var(--admin-border))]">
              <div className="flex items-center gap-3">
                <Link2 className="h-4 w-4 text-[hsl(var(--admin-warning))] shrink-0" />
                <span className="text-sm flex-1">
                  Found {thread.duplicates.length} possible match{thread.duplicates.length > 1 ? "es" : ""}
                </span>
                {thread.duplicates.slice(0, 2).map((dup: any, idx: number) => (
                  <AdminButton
                    key={idx}
                    size="sm"
                    variant="outline"
                    onClick={() => onMerge(thread.imports[0].id, dup.entity_id || dup.id, dup.entity_type || dup.type, notes)}
                    disabled={isProcessing}
                    className="shrink-0 text-xs"
                  >
                    <Link2 className="h-3.5 w-3.5 mr-1" />
                    Link to {dup.entity_name || dup.name}
                  </AdminButton>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Section 6: Notes (collapsible) */}
        {showNotes && (
          <div className="px-4 py-3 border-b border-[hsl(var(--admin-border))]">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes or context..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] resize-none focus:outline-none focus:ring-2 focus:ring-[hsl(var(--admin-info))/0.3]"
              rows={2}
            />
          </div>
        )}

        {/* Section 7: Action Footer */}
        <div className="p-4 bg-[hsl(var(--admin-hover))/0.5] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowNotes(!showNotes)}
              className="text-xs text-[hsl(var(--admin-text-muted))] hover:text-[hsl(var(--admin-foreground))] flex items-center gap-1"
            >
              <FileText className="h-3.5 w-3.5" />
              {showNotes ? "Hide notes" : "Add notes"}
            </button>
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs text-[hsl(var(--admin-text-muted))] hover:text-[hsl(var(--admin-foreground))] flex items-center gap-1"
            >
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-180")} />
              {isExpanded ? "Collapse" : `View ${thread.imports.length} emails`}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <AdminButton
              variant="ghost"
              size="sm"
              onClick={onRejectThread}
              disabled={isProcessing}
              className="text-[hsl(var(--admin-text-muted))] hover:text-[hsl(var(--admin-danger))] hover:bg-[hsl(var(--admin-danger))/0.1]"
            >
              <X className="h-4 w-4 mr-1" />
              Discard ({thread.imports.length})
            </AdminButton>

            <AdminButton
              size="sm"
              onClick={() => onConfirmThread(selectedCategory, notes, getSelectedContacts(), selectedStage || null, selectedNextStep || null, entityName)}
              disabled={isProcessing || !selectedCategory || selectedContactIds.size === 0 || !entityName.trim()}
              className="px-4"
            >
              <Check className="h-4 w-4 mr-1.5" />
              Create {entityName || "Record"}
            </AdminButton>
          </div>
        </div>

        {/* Expanded individual emails */}
        {isExpanded && (
          <div className="border-t border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))]">
            <div className="p-2 text-xs text-[hsl(var(--admin-text-muted))] border-b border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-hover))]">
              Individual emails in this thread
            </div>
            <div className="divide-y divide-[hsl(var(--admin-border))]">
              {thread.imports.map((imp) => (
                <div key={imp.id} className="p-3 hover:bg-[hsl(var(--admin-hover))]">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{imp.source_subject || "(No subject)"}</div>
                      <div className="text-xs text-[hsl(var(--admin-text-muted))]">
                        {formatDistanceToNow(new Date(imp.received_at), { addSuffix: true })}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <AdminButton
                        variant="ghost"
                        size="sm"
                        onClick={() => onViewEmail(imp)}
                        className="h-7 text-xs"
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View
                      </AdminButton>
                      <AdminButton
                        variant="ghost"
                        size="sm"
                        onClick={() => onRejectSingle(imp.id)}
                        disabled={isProcessing}
                        className="h-7 text-xs text-[hsl(var(--admin-text-muted))] hover:text-[hsl(var(--admin-danger))]"
                      >
                        <X className="h-3 w-3" />
                      </AdminButton>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </AdminCardContent>
    </AdminCard>
  );
}

// Single import card (same as before but extracted)
function SingleImportCard({
  item,
  onConfirm,
  onReject,
  onMerge,
  onViewEmail,
  isProcessing,
}: {
  item: PendingImport;
  onConfirm: (category: string, notes: string, selectedContacts: any[], pipelineStage: string | null, nextStep: string | null, entityName: string) => void;
  onReject: () => void;
  onMerge: (entityId: string, entityType: string, notes: string) => void;
  onViewEmail: () => void;
  isProcessing: boolean;
}) {
  const company = item.parsed_company || {};
  const defaultEntityName = (company as any).name || item.source_name || item.source_email || "";
  
  const [selectedCategory, setSelectedCategory] = useState(item.recommended_category || "");
  const [notes, setNotes] = useState("");
  const [entityName, setEntityName] = useState(defaultEntityName);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<number>>(
    new Set((item.parsed_contacts || []).map((_, i) => i))
  );
  const [selectedStage, setSelectedStage] = useState<string>("");
  const [selectedNextStep, setSelectedNextStep] = useState<string>("");
  const [showNotes, setShowNotes] = useState(false);
  
  const pipelineSlug = CATEGORY_TO_PIPELINE[selectedCategory] || "";
  const { data: pipelineConfig } = usePipelineConfig(pipelineSlug);
  const { data: pipelineStages } = usePipelineStages(pipelineConfig?.id);
  
  const contacts = item.parsed_contacts || [];
  const summary = item.parsed_summary || {};
  const duplicates = item.potential_duplicates || [];
  const confidence = Math.round((item.category_confidence || 0) * 100);
  
  const aiSummary = (summary as any).rawSummary || (summary as any).raw_summary || "";
  
  const CategoryIcon = ENTITY_ICONS[selectedCategory] || ENTITY_ICONS[item.recommended_category] || User;
  
  const toggleContact = (idx: number) => {
    const newSet = new Set(selectedContactIds);
    if (newSet.has(idx)) newSet.delete(idx);
    else newSet.add(idx);
    setSelectedContactIds(newSet);
  };
  
  const getSelectedContacts = () => contacts.filter((_, i) => selectedContactIds.has(i));

  const confidenceColor = confidence >= 90 ? "success" : confidence >= 70 ? "warning" : "danger";

  return (
    <AdminCard className="overflow-hidden hover:shadow-md transition-shadow">
      <AdminCardContent className="p-0">
        {/* Section 1: Entity Header */}
        <div className="p-4 border-b border-[hsl(var(--admin-border))]">
          <div className="flex items-start gap-3">
            {/* Icon with category color hint */}
            <div 
              className="p-2.5 rounded-xl shrink-0 transition-colors"
              style={{ 
                backgroundColor: selectedCategory 
                  ? `hsl(var(--admin-${ENTITY_INTENTS[selectedCategory] || 'info'}) / 0.1)` 
                  : 'hsl(var(--admin-hover))'
              }}
            >
              <CategoryIcon className="h-5 w-5" />
            </div>
            
            <div className="flex-1 min-w-0">
              {/* Editable entity name - prominent */}
              <input
                type="text"
                value={entityName}
                onChange={(e) => setEntityName(e.target.value)}
                className="text-base font-semibold w-full bg-transparent border-b-2 border-transparent hover:border-[hsl(var(--admin-border))] focus:border-[hsl(var(--admin-info))] focus:outline-none transition-colors pb-0.5"
                placeholder="Enter entity name..."
              />
              
              {/* Subject & timestamp */}
              <div className="flex items-center gap-2 mt-1 text-sm text-[hsl(var(--admin-text-muted))]">
                <span className="truncate flex-1">{item.source_subject || "(No subject)"}</span>
                <span className="text-xs whitespace-nowrap opacity-60">
                  {formatDistanceToNow(new Date(item.received_at), { addSuffix: true })}
                </span>
              </div>
            </div>

            {/* Confidence badge */}
            <AdminBadge intent={confidenceColor as any} size="sm" className="shrink-0">
              {confidence}%
            </AdminBadge>
          </div>
        </div>

        {/* Section 2: AI Summary (if available) */}
        {aiSummary && (
          <div className="px-4 py-3 bg-gradient-to-r from-[hsl(var(--admin-info))/0.04] to-transparent border-b border-[hsl(var(--admin-border))]">
            <div className="flex items-start gap-2.5">
              <Sparkles className="h-4 w-4 text-[hsl(var(--admin-info))] shrink-0 mt-0.5" />
              <p className="text-sm leading-relaxed text-[hsl(var(--admin-foreground))/0.85]">{aiSummary}</p>
            </div>
          </div>
        )}

        {/* Section 3: Pipeline Selection */}
        <div className="px-4 py-3 border-b border-[hsl(var(--admin-border))] space-y-3">
          {/* Pipeline buttons - horizontal scroll */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {CATEGORY_OPTIONS.map((opt) => {
              const Icon = ENTITY_ICONS[opt.value] || User;
              const isSelected = selectedCategory === opt.value;
              const isRecommended = opt.value === item.recommended_category;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setSelectedCategory(opt.value); setSelectedStage(""); }}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                    isSelected
                      ? "bg-[hsl(var(--admin-foreground))] text-[hsl(var(--admin-surface))] shadow-sm"
                      : "bg-[hsl(var(--admin-hover))] text-[hsl(var(--admin-text-muted))] hover:bg-[hsl(var(--admin-hover))] hover:text-[hsl(var(--admin-foreground))]"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {opt.label}
                  {isRecommended && !isSelected && (
                    <Sparkles className="h-3 w-3 text-[hsl(var(--admin-warning))]" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Stage pills - show when pipeline selected */}
          {selectedCategory && pipelineStages && pipelineStages.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[hsl(var(--admin-text-muted))] font-medium shrink-0">Stage:</span>
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
                        backgroundColor: isSelected ? stage.color : `${stage.color}15`,
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
        </div>

        {/* Section 4: Contacts */}
        {contacts.length > 0 && (
          <div className="px-4 py-3 border-b border-[hsl(var(--admin-border))]">
            <div className="flex items-center gap-2 mb-2">
              <User className="h-3.5 w-3.5 text-[hsl(var(--admin-text-muted))]" />
              <span className="text-xs text-[hsl(var(--admin-text-muted))] font-medium">
                Contacts ({selectedContactIds.size}/{contacts.length})
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {contacts.map((contact: any, idx: number) => {
                const isSelected = selectedContactIds.has(idx);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleContact(idx)}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all",
                      isSelected
                        ? "bg-[hsl(var(--admin-info))/0.1] text-[hsl(var(--admin-foreground))] ring-1 ring-[hsl(var(--admin-info))/0.3]"
                        : "bg-[hsl(var(--admin-hover))] text-[hsl(var(--admin-text-muted))] opacity-60"
                    )}
                  >
                    {isSelected && <Check className="h-3 w-3 text-[hsl(var(--admin-info))]" />}
                    <span className={cn(!isSelected && "line-through")}>{contact.name}</span>
                    {contact.role && <span className="opacity-50">• {contact.role}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Section 5: Duplicate/Match Detection */}
        {duplicates.length > 0 && (() => {
          // Detect strong matches: same name (fuzzy) AND same category
          const strongMatches = duplicates.filter((dup: any) => {
            const dupName = (dup.entity_name || dup.name || "").toLowerCase().trim();
            const currentName = entityName.toLowerCase().trim();
            const dupType = dup.entity_type || dup.type || "";
            const nameMatch = dupName === currentName || 
              dupName.includes(currentName) || 
              currentName.includes(dupName);
            const categoryMatch = dupType === selectedCategory || dupType === item.recommended_category;
            return nameMatch && categoryMatch;
          });
          
          const weakMatches = duplicates.filter((dup: any) => !strongMatches.includes(dup));
          
          // If there's a strong match, show it prominently
          if (strongMatches.length > 0) {
            const bestMatch = strongMatches[0];
            return (
              <div className="px-4 py-3 bg-[hsl(var(--admin-success))/0.08] border-b border-[hsl(var(--admin-success))/0.2]">
                <div className="flex items-center gap-3">
                  <div className="p-1.5 rounded-full bg-[hsl(var(--admin-success))/0.15]">
                    <Check className="h-4 w-4 text-[hsl(var(--admin-success))]" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Strong Match</span>
                      <AdminBadge intent="success" size="sm">Recommended</AdminBadge>
                    </div>
                    <p className="text-xs text-[hsl(var(--admin-text-muted))] mt-0.5">
                      "{entityName}" matches existing {bestMatch.entity_type || bestMatch.type}: <strong>{bestMatch.entity_name || bestMatch.name}</strong>
                    </p>
                  </div>
                  <AdminButton
                    size="sm"
                    onClick={() => onMerge(
                      bestMatch.entity_id || bestMatch.id, 
                      bestMatch.entity_type || bestMatch.type, 
                      notes
                    )}
                    disabled={isProcessing}
                    className="shrink-0 bg-[hsl(var(--admin-success))] hover:bg-[hsl(var(--admin-success))]/90"
                  >
                    <Link2 className="h-3.5 w-3.5 mr-1.5" />
                    Link to {bestMatch.entity_name || bestMatch.name}
                  </AdminButton>
                </div>
                {weakMatches.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-[hsl(var(--admin-success))/0.15] flex items-center gap-2">
                    <span className="text-xs text-[hsl(var(--admin-text-muted))]">Other matches:</span>
                    {weakMatches.slice(0, 2).map((dup: any, idx: number) => (
                      <button
                        key={idx}
                        onClick={() => onMerge(dup.entity_id || dup.id, dup.entity_type || dup.type, notes)}
                        disabled={isProcessing}
                        className="text-xs text-[hsl(var(--admin-info))] hover:underline"
                      >
                        {dup.entity_name || dup.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          
          // Standard weak matches
          return (
            <div className="px-4 py-3 bg-[hsl(var(--admin-warning))/0.05] border-b border-[hsl(var(--admin-border))]">
              <div className="flex items-center gap-3">
                <Link2 className="h-4 w-4 text-[hsl(var(--admin-warning))] shrink-0" />
                <span className="text-sm flex-1">
                  Possible match: <strong>{duplicates[0]?.entity_name || duplicates[0]?.name}</strong>
                </span>
                <AdminButton
                  size="sm"
                  variant="outline"
                  onClick={() => onMerge(
                    duplicates[0].entity_id || duplicates[0].id, 
                    duplicates[0].entity_type || duplicates[0].type, 
                    notes
                  )}
                  disabled={isProcessing}
                  className="shrink-0"
                >
                  <Link2 className="h-3.5 w-3.5 mr-1.5" />
                  Merge
                </AdminButton>
              </div>
            </div>
          );
        })()}

        {/* Section 6: Notes (collapsible) */}
        {showNotes && (
          <div className="px-4 py-3 border-b border-[hsl(var(--admin-border))]">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes or context..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] resize-none focus:outline-none focus:ring-2 focus:ring-[hsl(var(--admin-info))/0.3]"
              rows={2}
            />
          </div>
        )}

        {/* Section 7: Action Footer */}
        <div className="p-4 bg-[hsl(var(--admin-hover))/0.5] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowNotes(!showNotes)}
              className="text-xs text-[hsl(var(--admin-text-muted))] hover:text-[hsl(var(--admin-foreground))] flex items-center gap-1"
            >
              <FileText className="h-3.5 w-3.5" />
              {showNotes ? "Hide notes" : "Add notes"}
            </button>
            <button
              type="button"
              onClick={onViewEmail}
              className="text-xs text-[hsl(var(--admin-text-muted))] hover:text-[hsl(var(--admin-info))] flex items-center gap-1"
            >
              <Eye className="h-3.5 w-3.5" />
              View email
            </button>
          </div>

          <div className="flex items-center gap-2">
            <AdminButton
              variant="ghost"
              size="sm"
              onClick={onReject}
              disabled={isProcessing}
              className="text-[hsl(var(--admin-text-muted))] hover:text-[hsl(var(--admin-danger))] hover:bg-[hsl(var(--admin-danger))/0.1]"
            >
              <X className="h-4 w-4" />
            </AdminButton>

            <AdminButton
              size="sm"
              onClick={() => onConfirm(
                selectedCategory, 
                notes, 
                getSelectedContacts(), 
                selectedStage || null, 
                selectedNextStep || null, 
                entityName
              )}
              disabled={isProcessing || !selectedCategory || selectedContactIds.size === 0 || !entityName.trim()}
              className="px-4"
            >
              <Check className="h-4 w-4 mr-1.5" />
              Create
            </AdminButton>
          </div>
        </div>
      </AdminCardContent>
    </AdminCard>
  );
}
