import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { supabase } from "@/integrations/supabase/client";
import { AdminCard, AdminCardContent } from "@/components/admin/AdminCard";
import { 
  AdminButton, AdminBadge, AdminInput,
  AdminTabs, AdminTabsList, AdminTabsTrigger,
  AdminDialog, AdminDialogContent, AdminDialogHeader, AdminDialogTitle,
} from "@/components/admin";
import { AdminScrollArea } from "@/components/admin/AdminScrollArea";
import { 
  Inbox, 
  Mail, 
  Search, 
  User, 
  Users, 
  Palette, 
  Handshake,
  Music,
  Clock,
  ArrowLeft,
  RefreshCw,
  Wine,
  Package,
  AlertCircle,
  Check,
  X,
  Copy,
  HelpCircle,
  ChevronRight,
  Sparkles,
  ListTodo,
  CheckCircle2,
  MessageCircle,
  MessageSquareText,
  Headphones,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ChatLogsTab, ContactFormsTab, SupportTab } from "./inbox-tabs";
import { ThreadedPendingImports } from "./ThreadedPendingImports";
import { EmailViewerDialog } from "./EmailViewerDialog";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

interface EmailThread {
  id: string;
  entity_type: string;
  entity_id: string;
  subject: string;
  last_message_at: string;
  message_count: number;
  is_read: boolean;
  entity_name?: string;
  entity_email?: string;
}

interface EmailMessage {
  id: string;
  thread_id: string;
  direction: "inbound" | "outbound";
  from_email: string;
  from_name: string | null;
  to_emails: string[];
  cc_emails: string[];
  subject: string;
  body_html: string;
  body_text: string | null;
  sent_at: string;
}

interface ArtistReply {
  id: string;
  artist_id: string | null;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  received_at: string;
  is_read: boolean;
  artist_name?: string;
}

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

const ENTITY_ICONS: Record<string, any> = {
  vendor: Package,
  artisan: Palette,
  volunteer: Users,
  partner: Handshake,
  artist: Music,
  winecamp: Wine,
};

// Admin-compliant entity badge intents
const ENTITY_INTENTS: Record<string, "info" | "success" | "warning" | "neutral" | "danger"> = {
  vendor: "info",
  artisan: "neutral",
  volunteer: "success",
  partner: "warning",
  artist: "neutral",
  winecamp: "neutral",
};

// Simple tab button for cleaner navigation
function TabButton({ 
  active, 
  onClick, 
  children, 
  badge, 
  badgeIntent = "neutral" 
}: { 
  active: boolean; 
  onClick: () => void; 
  children: React.ReactNode; 
  badge?: number; 
  badgeIntent?: "danger" | "neutral";
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-2 text-sm font-medium transition-all relative flex items-center gap-1.5",
        active 
          ? "text-[hsl(var(--admin-foreground))]" 
          : "text-[hsl(var(--admin-text-muted))] hover:text-[hsl(var(--admin-foreground))]"
      )}
    >
      {children}
      {badge !== undefined && (
        <span className={cn(
          "px-1.5 py-0.5 text-xs font-medium rounded-full",
          badgeIntent === "danger" 
            ? "bg-[hsl(var(--admin-danger))] text-white" 
            : "bg-[hsl(var(--admin-hover))] text-[hsl(var(--admin-text-muted))]"
        )}>
          {badge}
        </span>
      )}
      {active && (
        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[hsl(var(--admin-info))]" />
      )}
    </button>
  );
}

export default function UnifiedInbox() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedThread, setSelectedThread] = useState<EmailThread | null>(null);
  const [selectedArtistReply, setSelectedArtistReply] = useState<ArtistReply | null>(null);
  const [selectedImport, setSelectedImport] = useState<PendingImport | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"all" | "production" | "artists" | "pending" | "chatbots" | "contact" | "support">("pending");
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [emailViewerItem, setEmailViewerItem] = useState<PendingImport | null>(null);

  // Fetch pending imports (including raw email content for viewer)
  const { data: pendingImports, isLoading: loadingPending, refetch: refetchPending } = useAuthQuery({
    queryKey: ["pending-email-imports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pending_email_imports")
        .select("*, raw_email_html, raw_email_text")
        .eq("status", "pending")
        .order("received_at", { ascending: false });
      if (error) throw error;
      return data as PendingImport[];
    },
  });

  // Fetch recently auto-processed imports (last 24 hours) for "Recently Processed" section
  const { data: recentlyProcessed, refetch: refetchRecent } = useAuthQuery({
    queryKey: ["recently-processed-imports"],
    queryFn: async () => {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("pending_email_imports")
        .select("id, source_email, source_subject, parsed_company, recommended_category, status, confirmed_at, created_entity_type, created_entity_id, merged_with_entity_id")
        .in("status", ["auto_merged", "merged", "auto_confirmed", "confirmed"])
        .gte("confirmed_at", twentyFourHoursAgo)
        .order("confirmed_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch production email threads
  const { data: productionThreads, isLoading: loadingProduction, refetch: refetchProduction } = useAuthQuery({
    queryKey: ["unified-inbox-production"],
    queryFn: async () => {
      const { data: threads, error } = await supabase
        .from("production_email_threads")
        .select("*")
        .order("last_message_at", { ascending: false })
        .limit(100);

      if (error) throw error;

      const enrichedThreads: EmailThread[] = [];
      for (const thread of threads || []) {
        let entityName = "Unknown";
        let entityEmail = "";

        if (thread.entity_type === "vendor") {
          const { data } = await supabase.from("vendors").select("name, email").eq("id", thread.entity_id).single();
          if (data) { entityName = data.name; entityEmail = data.email || ""; }
        } else if (thread.entity_type === "artisan") {
          const { data } = await supabase.from("artisans").select("name, email").eq("id", thread.entity_id).single();
          if (data) { entityName = data.name; entityEmail = data.email || ""; }
        } else if (thread.entity_type === "volunteer") {
          const { data } = await supabase.from("volunteer_interests").select("name, email").eq("id", thread.entity_id).single();
          if (data) { entityName = data.name; entityEmail = data.email || ""; }
        } else if (thread.entity_type === "partner") {
          const { data } = await supabase.from("partners").select("name, email").eq("id", thread.entity_id).single();
          if (data) { entityName = data.name; entityEmail = data.email || ""; }
        }

        enrichedThreads.push({ ...thread, entity_name: entityName, entity_email: entityEmail, is_read: true });
      }
      return enrichedThreads;
    },
  });

  // Fetch artist email replies
  const { data: artistReplies, isLoading: loadingArtists, refetch: refetchArtists } = useAuthQuery({
    queryKey: ["unified-inbox-artists"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("artist_email_replies")
        .select(`id, artist_id, from_email, from_name, subject, body_html, body_text, received_at, is_read, artists(name)`)
        .order("received_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data?.map(r => ({ ...r, artist_name: (r.artists as any)?.name || "Unknown Artist" })) || [];
    },
  });

  // Confirm import mutation
  const confirmImportMutation = useMutation({
    mutationFn: async ({ importId, action, category, mergeId, mergeType, notes, selectedContacts, pipelineStage, nextStep, entityName }: any) => {
      const { data, error } = await supabase.functions.invoke("confirm-email-import", {
        body: { 
          import_id: importId, 
          action, 
          confirmed_category: category, 
          merge_with_entity_id: mergeId, 
          merge_with_entity_type: mergeType,
          custom_notes: notes,
          selected_contacts: selectedContacts,
          pipeline_stage: pipelineStage,
          next_step: nextStep,
          custom_entity_name: entityName,
        }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-email-imports"] });
      setSelectedImport(null);
      toast.success("Import processed successfully");
    },
    onError: (error: any) => toast.error(error.message || "Failed to process import"),
  });

  // Fetch messages for selected thread
  const { data: threadMessages, isLoading: loadingMessages } = useAuthQuery({
    queryKey: ["thread-messages", selectedThread?.id],
    queryFn: async () => {
      if (!selectedThread) return [];
      const { data, error } = await supabase.from("production_email_messages").select("*").eq("thread_id", selectedThread.id).order("sent_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedThread,
  });

  const handleRefresh = () => { refetchProduction(); refetchArtists(); refetchPending(); refetchRecent(); };

  const filteredProductionThreads = productionThreads?.filter(t => 
    t.subject?.toLowerCase().includes(searchQuery.toLowerCase()) || t.entity_name?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const filteredArtistReplies = artistReplies?.filter(r =>
    r.subject?.toLowerCase().includes(searchQuery.toLowerCase()) || r.from_email?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const filteredPendingImports = pendingImports?.filter(i =>
    i.source_subject?.toLowerCase().includes(searchQuery.toLowerCase()) || i.source_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (i.parsed_company as any)?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const allItems = [
    ...filteredProductionThreads.map(t => ({ type: "thread" as const, data: t, date: new Date(t.last_message_at) })),
    ...filteredArtistReplies.map(r => ({ type: "artist_reply" as const, data: r, date: new Date(r.received_at) })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const isLoading = loadingProduction || loadingArtists || loadingPending;
  const pendingCount = pendingImports?.length || 0;

  return (
    <div className="space-y-6">
      {/* Minimal Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-gradient-to-br from-[hsl(var(--admin-info))/0.15] to-[hsl(var(--admin-info))/0.05]">
              <Inbox className="h-5 w-5 text-[hsl(var(--admin-info))]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Inbox</h2>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText("inbox@example.org");
                  toast.success("Copied!");
                }}
                className="text-xs text-[hsl(var(--admin-text-muted))] hover:text-[hsl(var(--admin-info))] transition-colors flex items-center gap-1 group"
              >
                <code className="font-mono">inbox@example.org</code>
                <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AdminButton 
            variant="ghost" 
            size="sm" 
            onClick={() => setShowHowItWorks(!showHowItWorks)}
            className={cn("text-xs", showHowItWorks && "bg-[hsl(var(--admin-hover))]")}
          >
            <HelpCircle className="h-3.5 w-3.5 mr-1" />
            Help
          </AdminButton>
          <AdminButton variant="ghost" size="sm" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          </AdminButton>
        </div>
      </div>

      {/* Condensed How It Works */}
      {showHowItWorks && (
        <div className="flex items-center gap-6 px-4 py-3 rounded-lg bg-[hsl(var(--admin-info))/0.05] border border-[hsl(var(--admin-info))/0.15]">
          <div className="flex items-center gap-6 flex-1">
            {[
              { icon: Mail, label: "Forward email" },
              { icon: Sparkles, label: "AI extracts contacts" },
              { icon: ListTodo, label: "Review & assign" },
              { icon: CheckCircle2, label: "Track in pipeline" },
            ].map((step, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm">
                <step.icon className="h-4 w-4 text-[hsl(var(--admin-info))]" />
                <span className="text-[hsl(var(--admin-text-muted))]">{step.label}</span>
                {idx < 3 && <ChevronRight className="h-3 w-3 text-[hsl(var(--admin-border))] ml-2" />}
              </div>
            ))}
          </div>
          <button onClick={() => setShowHowItWorks(false)} className="text-[hsl(var(--admin-text-muted))] hover:text-[hsl(var(--admin-foreground))]">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Cleaner Tabs */}
      <div className="flex items-center justify-between gap-4 border-b border-[hsl(var(--admin-border))] pb-px">
        <div className="flex items-center gap-1">
          <TabButton 
            active={activeTab === "pending"} 
            onClick={() => setActiveTab("pending")}
            badge={pendingCount > 0 ? pendingCount : undefined}
            badgeIntent="danger"
          >
            Pending
          </TabButton>
          <TabButton active={activeTab === "all"} onClick={() => setActiveTab("all")}>
            All Mail
          </TabButton>
          <TabButton active={activeTab === "production"} onClick={() => setActiveTab("production")}>
            Production
          </TabButton>
          <TabButton active={activeTab === "artists"} onClick={() => setActiveTab("artists")}>
            Artists
          </TabButton>
          <div className="w-px h-4 bg-[hsl(var(--admin-border))] mx-2" />
          <TabButton active={activeTab === "chatbots"} onClick={() => setActiveTab("chatbots")}>
            <MessageCircle className="h-3.5 w-3.5" />
          </TabButton>
          <TabButton active={activeTab === "support"} onClick={() => setActiveTab("support")}>
            <Headphones className="h-3.5 w-3.5" />
          </TabButton>
          <TabButton active={activeTab === "contact"} onClick={() => setActiveTab("contact")}>
            <MessageSquareText className="h-3.5 w-3.5" />
          </TabButton>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[hsl(var(--admin-text-muted))]" />
          <AdminInput
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 w-48 text-sm"
          />
        </div>
      </div>

      {/* Pending Review Tab Content */}
      {activeTab === "pending" && (
        <div className="space-y-4">
          {/* Recently Processed Section - Smart Learning auto-matches from last 24h */}
          {recentlyProcessed && recentlyProcessed.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--admin-success))]" />
                <span className="text-sm font-medium text-[hsl(var(--admin-text-muted))]">
                  Recently Processed ({recentlyProcessed.length})
                </span>
                <span className="text-xs text-[hsl(var(--admin-text-muted))] opacity-60">Last 24 hours</span>
              </div>
              <AdminCard className="bg-[hsl(var(--admin-success))/0.03] border-[hsl(var(--admin-success))/0.15]">
                <AdminCardContent className="py-2 px-3">
                  <div className="divide-y divide-[hsl(var(--admin-border))/0.5]">
                    {recentlyProcessed.slice(0, 5).map((item: any) => {
                      const EntityIcon = ENTITY_ICONS[item.created_entity_type] || User;
                      const isAuto = item.status === "auto_merged" || item.status === "auto_confirmed";
                      const entityName = (item.parsed_company as any)?.name || item.source_subject || "Unknown";
                      
                      return (
                        <div key={item.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="p-1.5 rounded-md bg-[hsl(var(--admin-success))/0.1]">
                              <EntityIcon className="h-3.5 w-3.5 text-[hsl(var(--admin-success))]" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{entityName}</div>
                              <div className="text-xs text-[hsl(var(--admin-text-muted))]">
                                {isAuto ? "Auto-matched" : "Manually assigned"} • {item.created_entity_type}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {isAuto && (
                              <AdminBadge intent="success" className="text-xs">
                                Smart Learning
                              </AdminBadge>
                            )}
                            <span className="text-xs text-[hsl(var(--admin-text-muted))]">
                              {item.confirmed_at && formatDistanceToNow(new Date(item.confirmed_at), { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    {recentlyProcessed.length > 5 && (
                      <div className="pt-2 text-center">
                        <span className="text-xs text-[hsl(var(--admin-text-muted))]">
                          +{recentlyProcessed.length - 5} more processed
                        </span>
                      </div>
                    )}
                  </div>
                </AdminCardContent>
              </AdminCard>
            </div>
          )}

          {/* Quick Start Card - only show when empty */}
          {!showHowItWorks && filteredPendingImports.length === 0 && (!recentlyProcessed || recentlyProcessed.length === 0) && (
            <AdminCard className="border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-hover))/0.5]">
              <AdminCardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="p-2 rounded-full bg-[hsl(var(--admin-info))/0.1] shrink-0">
                    <Mail className="h-5 w-5 text-[hsl(var(--admin-info))]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm mb-1">Forward Emails to Track Conversations</h3>
                    <p className="text-sm text-[hsl(var(--admin-text-muted))] mb-3">
                      Already talking to someone? Forward your email conversation and we'll extract contacts, 
                      categorize the relationship, and create a record automatically.
                    </p>
                    <div className="flex items-center gap-2 p-2 rounded-md bg-[hsl(var(--admin-surface))] border border-[hsl(var(--admin-border))] w-fit">
                      <code className="text-sm font-mono text-[hsl(var(--admin-info))]">inbox@example.org</code>
                      <AdminButton
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => {
                          navigator.clipboard.writeText("inbox@example.org");
                          toast.success("Email address copied!");
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </AdminButton>
                    </div>
                  </div>
                </div>
              </AdminCardContent>
            </AdminCard>
          )}

          {loadingPending ? (
            <AdminCard>
              <AdminCardContent className="flex justify-center py-12">
                <div className="animate-spin h-8 w-8 border-4 border-[hsl(var(--admin-info))] border-t-transparent rounded-full" />
              </AdminCardContent>
            </AdminCard>
          ) : filteredPendingImports.length === 0 ? (
            <AdminCard>
              <AdminCardContent className="text-center py-12 text-[hsl(var(--admin-text-muted))]">
                <Inbox className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="font-medium">No pending imports</p>
                <p className="text-sm mt-1">Forward emails to process them automatically</p>
              </AdminCardContent>
            </AdminCard>
          ) : (
            <ThreadedPendingImports
              imports={filteredPendingImports}
              onConfirm={(importId, category, notes, selectedContacts, pipelineStage, nextStep, entityName) => 
                confirmImportMutation.mutate({ 
                  importId, 
                  action: "confirm", 
                  category,
                  notes,
                  selectedContacts,
                  pipelineStage,
                  nextStep,
                  entityName,
                })
              }
              onConfirmThread={async (importIds, category, notes, selectedContacts, pipelineStage, nextStep, entityName) => {
                // Process first import with full data, mark others as processed
                for (let i = 0; i < importIds.length; i++) {
                  if (i === 0) {
                    // First one creates the entity
                    confirmImportMutation.mutate({ 
                      importId: importIds[i], 
                      action: "confirm", 
                      category,
                      notes,
                      selectedContacts,
                      pipelineStage,
                      nextStep,
                      entityName,
                    });
                  } else {
                    // Others just get rejected (already processed as part of thread)
                    confirmImportMutation.mutate({ importId: importIds[i], action: "reject" });
                  }
                }
              }}
              onReject={(importId) => confirmImportMutation.mutate({ importId, action: "reject" })}
              onRejectThread={(importIds) => {
                for (const importId of importIds) {
                  confirmImportMutation.mutate({ importId, action: "reject" });
                }
              }}
              onMerge={(importId, entityId, entityType, notes) => confirmImportMutation.mutate({ 
                importId, 
                action: "merge", 
                mergeId: entityId, 
                mergeType: entityType,
                notes
              })}
              onViewEmail={(item) => setEmailViewerItem(item)}
              isProcessing={confirmImportMutation.isPending}
            />
          )}

          {/* Email Viewer Dialog */}
          <EmailViewerDialog
            item={emailViewerItem}
            open={!!emailViewerItem}
            onOpenChange={(open) => !open && setEmailViewerItem(null)}
            onConfirm={(category, notes, selectedContacts, pipelineStage, nextStep, entityName) => {
              if (emailViewerItem) {
                confirmImportMutation.mutate({ 
                  importId: emailViewerItem.id, 
                  action: "confirm", 
                  category,
                  notes,
                  selectedContacts,
                  pipelineStage,
                  nextStep,
                  entityName,
                });
              }
            }}
            onReject={() => {
              if (emailViewerItem) {
                confirmImportMutation.mutate({ importId: emailViewerItem.id, action: "reject" });
              }
            }}
            onMerge={(entityId, entityType, notes) => {
              if (emailViewerItem) {
                confirmImportMutation.mutate({ 
                  importId: emailViewerItem.id, 
                  action: "merge", 
                  mergeId: entityId, 
                  mergeType: entityType,
                  notes
                });
              }
            }}
            isProcessing={confirmImportMutation.isPending}
          />
        </div>
      )}

      {/* New consolidated tabs */}
      {activeTab === "chatbots" && <ChatLogsTab searchQuery={searchQuery} />}
      {activeTab === "support" && <SupportTab searchQuery={searchQuery} />}
      {activeTab === "contact" && <ContactFormsTab searchQuery={searchQuery} />}

      {/* Email List - for email-related tabs only */}
      {(activeTab === "all" || activeTab === "production" || activeTab === "artists") && (
        <AdminCard>
          <AdminCardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin h-8 w-8 border-4 border-[hsl(var(--admin-info))] border-t-transparent rounded-full" />
              </div>
            ) : allItems.length === 0 ? (
              <div className="text-center py-12 text-[hsl(var(--admin-text-muted))]">
                <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No emails found</p>
              </div>
            ) : (
              <AdminScrollArea className="h-[600px]">
                <div className="divide-y divide-[hsl(var(--admin-border))]">
                  {(activeTab === "all" ? allItems : 
                    activeTab === "production" ? filteredProductionThreads.map(t => ({ type: "thread" as const, data: t, date: new Date(t.last_message_at) })) :
                    filteredArtistReplies.map(r => ({ type: "artist_reply" as const, data: r, date: new Date(r.received_at) }))
                  ).map((item, idx) => {
                    if (item.type === "thread") {
                      const thread = item.data as EmailThread;
                      const Icon = ENTITY_ICONS[thread.entity_type] || User;
                      const intent = ENTITY_INTENTS[thread.entity_type] || "neutral";
                      
                      return (
                        <button
                          key={`thread-${thread.id}`}
                          className="w-full text-left p-4 hover:bg-[hsl(var(--admin-hover))] transition-colors flex items-start gap-3"
                          onClick={() => setSelectedThread(thread)}
                        >
                          <div className="p-2 rounded-full shrink-0 bg-[hsl(var(--admin-hover))]">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium truncate">{thread.entity_name}</span>
                              <AdminBadge intent={intent} size="sm" className="text-xs capitalize shrink-0">
                                {thread.entity_type}
                              </AdminBadge>
                              {thread.message_count > 1 && (
                                <AdminBadge intent="neutral" size="sm" className="text-xs shrink-0">
                                  {thread.message_count} msgs
                                </AdminBadge>
                              )}
                            </div>
                            <div className="text-sm text-[hsl(var(--admin-text-muted))] truncate">
                              {thread.subject}
                            </div>
                          </div>
                          <div className="text-xs text-[hsl(var(--admin-text-muted))] shrink-0 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(thread.last_message_at), { addSuffix: true })}
                          </div>
                        </button>
                      );
                    } else {
                      const reply = item.data as ArtistReply;
                      const Icon = ENTITY_ICONS.artist;
                      
                      return (
                        <button
                          key={`reply-${reply.id}`}
                          className={cn(
                            "w-full text-left p-4 hover:bg-[hsl(var(--admin-hover))] transition-colors flex items-start gap-3",
                            !reply.is_read && "bg-[hsl(var(--admin-info))/0.05]"
                          )}
                          onClick={() => setSelectedArtistReply(reply)}
                        >
                          <div className="p-2 rounded-full shrink-0 bg-[hsl(var(--admin-hover))]">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium truncate">
                                {reply.from_name || reply.from_email}
                              </span>
                              <AdminBadge intent="neutral" size="sm" className="text-xs shrink-0">
                                Artist
                              </AdminBadge>
                              {!reply.is_read && (
                                <AdminBadge intent="info" size="sm" className="text-xs shrink-0">New</AdminBadge>
                              )}
                            </div>
                            <div className="text-sm text-[hsl(var(--admin-text-muted))] truncate">
                              {reply.subject || "(No subject)"}
                            </div>
                            <div className="text-xs text-[hsl(var(--admin-text-muted))] mt-1">
                              {reply.artist_name}
                            </div>
                          </div>
                          <div className="text-xs text-[hsl(var(--admin-text-muted))] shrink-0 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(reply.received_at), { addSuffix: true })}
                          </div>
                        </button>
                      );
                    }
                  })}
                </div>
              </AdminScrollArea>
            )}
          </AdminCardContent>
        </AdminCard>
      )}

      {/* Thread Detail Dialog */}
      <AdminDialog open={!!selectedThread} onOpenChange={() => setSelectedThread(null)}>
        <AdminDialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <AdminDialogHeader>
            <AdminDialogTitle className="flex items-center gap-2">
              <AdminButton variant="ghost" size="sm" onClick={() => setSelectedThread(null)}>
                <ArrowLeft className="h-4 w-4" />
              </AdminButton>
              {selectedThread?.entity_name} - {selectedThread?.subject}
            </AdminDialogTitle>
          </AdminDialogHeader>
          <AdminScrollArea className="flex-1">
            {loadingMessages ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin h-6 w-6 border-2 border-[hsl(var(--admin-info))] border-t-transparent rounded-full" />
              </div>
            ) : (
              <div className="space-y-4 p-4">
                {threadMessages?.map((msg) => (
                  <div 
                    key={msg.id} 
                    className={cn(
                      "p-4 rounded-lg",
                      msg.direction === "outbound" ? "bg-[hsl(var(--admin-info))/0.1] ml-8" : "bg-[hsl(var(--admin-hover))] mr-8"
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium text-sm">
                        {msg.direction === "outbound" ? "You" : msg.from_name || msg.from_email}
                      </div>
                      <div className="text-xs text-[hsl(var(--admin-text-muted))]">
                        {format(new Date(msg.sent_at), "PPp")}
                      </div>
                    </div>
                    <div 
                      className="prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(msg.body_html || msg.body_text || "") }}
                    />
                  </div>
                ))}
              </div>
            )}
          </AdminScrollArea>
        </AdminDialogContent>
      </AdminDialog>

      {/* Artist Reply Detail Dialog */}
      <AdminDialog open={!!selectedArtistReply} onOpenChange={() => setSelectedArtistReply(null)}>
        <AdminDialogContent className="max-w-2xl">
          <AdminDialogHeader>
            <AdminDialogTitle>
              Reply from {selectedArtistReply?.from_name || selectedArtistReply?.from_email}
            </AdminDialogTitle>
          </AdminDialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-sm text-[hsl(var(--admin-text-muted))]">
              <span>Artist: {selectedArtistReply?.artist_name}</span>
              <span>•</span>
              <span>{selectedArtistReply && format(new Date(selectedArtistReply.received_at), "PPp")}</span>
            </div>
            <div className="font-medium">{selectedArtistReply?.subject || "(No subject)"}</div>
            <div 
              className="prose prose-sm max-w-none p-4 bg-[hsl(var(--admin-hover))] rounded-lg"
              dangerouslySetInnerHTML={{ 
                __html: sanitizeHtml(selectedArtistReply?.body_html || selectedArtistReply?.body_text || "")
              }}
            />
          </div>
        </AdminDialogContent>
      </AdminDialog>
    </div>
  );
}
