import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { supabase } from "@/integrations/supabase/client";
import { useAdminEvent } from "@/hooks/useAdminEvent";
import { AdminButton, AdminBadge, AdminInput } from "@/components/admin/AdminUI";
import { AdminSelect, AdminSelectItem } from "@/components/admin/AdminSelect";
import { AdminDialog, AdminDialogContent, AdminDialogDescription, AdminDialogHeader, AdminDialogTitle } from "@/components/admin/AdminDialog";
import { AdminLabel, AdminSwitch } from "@/components/admin/AdminFormPrimitives";
import { toast } from "sonner";
import { Plus, Send, Eye, FileText, RefreshCw, ExternalLink } from "lucide-react";
import { RichTextEditor } from "@/components/RichTextEditor";
import { format } from "date-fns";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

interface Contract {
  id: string;
  event_id: string;
  template_id: string | null;
  entity_type: string;
  entity_id: string;
  title: string;
  content_html: string | null;
  pdf_path: string | null;
  requires_countersign: boolean;
  status: string;
  sent_at: string | null;
  viewed_at: string | null;
  expires_at: string | null;
  access_token: string | null;
  created_at: string;
}

interface ContractTemplate {
  id: string;
  name: string;
  content_html: string;
  requires_countersign: boolean;
  merge_fields: string[] | null;
}

interface EntityContractManagerProps {
  entityType: "vendor" | "artisan" | "partner" | "artist";
  entityId: string;
  entityName: string;
  entityEmail?: string | null;
}

const STATUS_INTENTS: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  sent: "info",
  viewed: "warning",
  signed: "success",
  countersigned: "success",
  completed: "success",
  declined: "danger",
  expired: "neutral",
};

export function EntityContractManager({ entityType, entityId, entityName, entityEmail }: EntityContractManagerProps) {
  const { selectedEventId } = useAdminEvent();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [pdfSignedUrl, setPdfSignedUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  
  // Form state
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [contentHtml, setContentHtml] = useState("");
  const [requiresCountersign, setRequiresCountersign] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState("30");

  // Fetch contracts for this specific entity
  const { data: contracts, isLoading } = useAuthQuery({
    queryKey: ["entity-contracts", selectedEventId, entityType, entityId],
    queryFn: async () => {
      if (!selectedEventId) return [];
      const { data, error } = await supabase
        .from("contracts")
        .select("*")
        .eq("event_id", selectedEventId)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Contract[];
    },
    enabled: !!selectedEventId && !!entityId,
  });

  // Fetch templates
  const { data: templates } = useAuthQuery({
    queryKey: ["contract-templates", entityType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_templates")
        .select("id, name, content_html, requires_countersign, merge_fields")
        .eq("entity_type", entityType)
        .eq("is_active", true);
      if (error) throw error;
      return data as ContractTemplate[];
    },
  });

  // Fetch event details for merge fields
  const { data: eventDetails } = useAuthQuery({
    queryKey: ["event-details", selectedEventId],
    queryFn: async () => {
      if (!selectedEventId) return null;
      const { data, error } = await supabase
        .from("event_details")
        .select("title, event_date, venue_address")
        .eq("id", selectedEventId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedEventId,
  });

  // Fetch entity details for merge fields
  const { data: entityDetails } = useAuthQuery({
    queryKey: [entityType, entityId],
    queryFn: async () => {
      const tableName = entityType === "artisan" ? "artisans" : 
                        entityType === "partner" ? "partners" : 
                        entityType === "artist" ? "artists" : "vendors";
      const { data, error } = await supabase
        .from(tableName)
        .select("*")
        .eq("id", entityId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!entityId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedEventId) throw new Error("No event selected");
      
      const accessToken = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + parseInt(expiresInDays));

      const { data, error } = await supabase
        .from("contracts")
        .insert([{
          event_id: selectedEventId,
          template_id: selectedTemplateId || null,
          entity_type: entityType,
          entity_id: entityId,
          title: title || `Contract for ${entityName}`,
          content_html: contentHtml,
          requires_countersign: requiresCountersign,
          access_token: accessToken,
          expires_at: expiresAt.toISOString(),
          status: "draft",
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entity-contracts"] });
      toast.success("Contract created");
      resetForm();
      setIsCreateOpen(false);
    },
    onError: (error) => {
      toast.error("Failed to create contract: " + error.message);
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (contractId: string) => {
      const { error } = await supabase.functions.invoke("send-contract", {
        body: { contract_id: contractId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entity-contracts"] });
      toast.success("Contract sent");
    },
    onError: (error) => {
      toast.error("Failed to send contract: " + error.message);
    },
  });

  const resendMutation = useMutation({
    mutationFn: async (contractId: string) => {
      const { error } = await supabase.functions.invoke("send-contract", {
        body: { contract_id: contractId, resend: true },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entity-contracts"] });
      toast.success("Reminder sent");
    },
    onError: (error) => {
      toast.error("Failed to resend: " + error.message);
    },
  });

  const resetForm = () => {
    setSelectedTemplateId("");
    setTitle("");
    setContentHtml("");
    setRequiresCountersign(false);
    setExpiresInDays("30");
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates?.find(t => t.id === templateId);
    if (template) {
      // Apply merge fields
      let html = template.content_html;
      
      // Event fields
      html = html.replace(/\{\{event_name\}\}/g, eventDetails?.title || "");
      html = html.replace(/\{\{event_date\}\}/g, eventDetails?.event_date ? format(new Date(eventDetails.event_date), "MMMM d, yyyy") : "");
      html = html.replace(/\{\{venue_address\}\}/g, eventDetails?.venue_address || "");
      
      // Entity fields - cast to any for dynamic property access
      if (entityDetails) {
        const entity = entityDetails as any;
        html = html.replace(/\{\{vendor_name\}\}/g, entity.name || "");
        html = html.replace(/\{\{artisan_name\}\}/g, entity.name || "");
        html = html.replace(/\{\{partner_name\}\}/g, entity.name || "");
        html = html.replace(/\{\{artist_name\}\}/g, entity.name || "");
        html = html.replace(/\{\{business_name\}\}/g, entity.business_name || "");
        html = html.replace(/\{\{company_name\}\}/g, entity.company_name || "");
        html = html.replace(/\{\{booth_number\}\}/g, entity.booth_number || "");
        html = html.replace(/\{\{craft_type\}\}/g, entity.craft_type || "");
        html = html.replace(/\{\{booth_fee\}\}/g, entity.booth_fee?.toString() || "");
        html = html.replace(/\{\{deal_value\}\}/g, entity.deal_value?.toString() || "");
        html = html.replace(/\{\{tier\}\}/g, entity.tier || "");
        html = html.replace(/\{\{performance_date\}\}/g, entity.performance_date || "");
        html = html.replace(/\{\{set_time\}\}/g, entity.set_time || "");
        html = html.replace(/\{\{set_length_minutes\}\}/g, entity.set_length_minutes?.toString() || "");
        html = html.replace(/\{\{stage_name\}\}/g, entity.stage_name || "");
      }
      
      setContentHtml(html);
      setRequiresCountersign(template.requires_countersign);
      setTitle(template.name.replace("Standard ", "") + " - " + entityName);
    }
  };

  if (!selectedEventId) {
    return (
      <div className="text-center py-6 text-sm text-[hsl(var(--admin-muted-foreground))]">
        Please select an event first
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with action */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-[hsl(var(--admin-muted-foreground))]">
          {contracts?.length || 0} contract{contracts?.length !== 1 ? "s" : ""}
        </p>
        <AdminButton variant="adminOutline" size="sm" onClick={() => setIsCreateOpen(true)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          New Contract
        </AdminButton>
      </div>

      {/* Contracts List */}
      {isLoading ? (
        <div className="py-6 text-center text-sm text-[hsl(var(--admin-muted-foreground))]">
          Loading...
        </div>
      ) : !contracts?.length ? (
        <div className="py-8 text-center border border-dashed border-[hsl(var(--admin-border))] rounded-lg">
          <FileText className="w-8 h-8 mx-auto mb-2 text-[hsl(var(--admin-muted-foreground))]" />
          <p className="text-sm text-[hsl(var(--admin-muted-foreground))] mb-3">No contracts yet</p>
          <AdminButton variant="admin" size="sm" onClick={() => setIsCreateOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Create Contract
          </AdminButton>
        </div>
      ) : (
        <div className="space-y-2">
          {contracts.map((contract) => (
            <div
              key={contract.id}
              className="flex items-center justify-between p-3 border border-[hsl(var(--admin-border))] rounded-lg bg-[hsl(var(--admin-card))] hover:bg-[hsl(var(--admin-hover))] transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="w-4 h-4 text-[hsl(var(--admin-muted-foreground))] shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{contract.title}</p>
                  <p className="text-xs text-[hsl(var(--admin-muted-foreground))]">
                    {contract.sent_at 
                      ? `Sent ${format(new Date(contract.sent_at), "MMM d, yyyy")}`
                      : `Created ${format(new Date(contract.created_at), "MMM d, yyyy")}`
                    }
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <AdminBadge intent={STATUS_INTENTS[contract.status] || "neutral"}>
                  {contract.status}
                </AdminBadge>
                <div className="flex gap-1">
                  <AdminButton
                    variant="adminGhost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={async () => {
                      setSelectedContract(contract);
                      setPdfSignedUrl(null);
                      setIsViewOpen(true);
                      if (contract.pdf_path) {
                        setPdfLoading(true);
                        try {
                          const { data, error } = await supabase.storage
                            .from("production-documents")
                            .createSignedUrl(contract.pdf_path, 3600);
                          if (!error && data) {
                            setPdfSignedUrl(data.signedUrl);
                          }
                        } catch (e) {
                          console.error("Failed to get PDF URL", e);
                        } finally {
                          setPdfLoading(false);
                        }
                      }
                    }}
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </AdminButton>
                  {contract.status === "draft" && (
                    <AdminButton
                      variant="adminGhost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => sendMutation.mutate(contract.id)}
                      disabled={sendMutation.isPending}
                    >
                      <Send className="w-3.5 h-3.5" />
                    </AdminButton>
                  )}
                  {["sent", "viewed"].includes(contract.status) && (
                    <AdminButton
                      variant="adminGhost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => resendMutation.mutate(contract.id)}
                      disabled={resendMutation.isPending}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </AdminButton>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <AdminDialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <AdminDialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <AdminDialogHeader>
            <AdminDialogTitle>Create Contract for {entityName}</AdminDialogTitle>
            <AdminDialogDescription>
              Select a template and customize the contract content
            </AdminDialogDescription>
          </AdminDialogHeader>

          <div className="space-y-4 py-4">
            {/* Template Selection */}
            <div>
              <AdminLabel>Template</AdminLabel>
              <AdminSelect
                value={selectedTemplateId}
                onValueChange={handleTemplateSelect}
                placeholder="Select a template..."
              >
                {templates?.map((template) => (
                  <AdminSelectItem key={template.id} value={template.id}>
                    {template.name}
                  </AdminSelectItem>
                ))}
              </AdminSelect>
            </div>

            {/* Title */}
            <div>
              <AdminLabel>Contract Title</AdminLabel>
              <AdminInput
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`Contract for ${entityName}`}
              />
            </div>

            {/* Content Editor */}
            <div>
              <AdminLabel>Contract Content</AdminLabel>
              <div className="border border-[hsl(var(--admin-border))] rounded-lg overflow-hidden">
                <RichTextEditor content={contentHtml} onChange={setContentHtml} />
              </div>
            </div>

            {/* Options */}
            <div className="flex items-center justify-between">
              <div>
                <AdminLabel>Expires In (days)</AdminLabel>
                <AdminInput
                  type="number"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value)}
                  className="w-24"
                />
              </div>
              <div className="flex items-center gap-2">
                <AdminSwitch
                  checked={requiresCountersign}
                  onCheckedChange={setRequiresCountersign}
                />
                <AdminLabel>Requires countersignature</AdminLabel>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4 border-t border-[hsl(var(--admin-border))]">
              <AdminButton variant="adminOutline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </AdminButton>
              <AdminButton
                variant="admin"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !contentHtml}
              >
                {createMutation.isPending ? "Creating..." : "Create Contract"}
              </AdminButton>
            </div>
          </div>
        </AdminDialogContent>
      </AdminDialog>

      {/* View Dialog */}
      <AdminDialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <AdminDialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <AdminDialogHeader>
            <AdminDialogTitle>{selectedContract?.title}</AdminDialogTitle>
            <AdminDialogDescription>
              Status: {selectedContract?.status} | Created {selectedContract && format(new Date(selectedContract.created_at), "MMM d, yyyy")}
            </AdminDialogDescription>
          </AdminDialogHeader>

          {selectedContract?.content_html && (
            <div 
              className="prose prose-sm max-w-none p-4 border border-[hsl(var(--admin-border))] rounded-lg bg-[hsl(var(--admin-card))]"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedContract.content_html) }}
            />
          )}

          {selectedContract?.pdf_path && (
            <div className="border border-[hsl(var(--admin-border))] rounded-lg overflow-hidden">
              {pdfLoading ? (
                <div className="flex items-center justify-center py-12 text-sm text-[hsl(var(--admin-muted-foreground))]">
                  Loading PDF…
                </div>
              ) : pdfSignedUrl ? (
                <iframe
                  src={pdfSignedUrl}
                  className="w-full h-[60vh] border-0"
                  title="Contract PDF"
                />
              ) : (
                <div className="p-4 text-sm text-[hsl(var(--admin-muted-foreground))]">
                  Unable to load PDF preview
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <AdminButton variant="adminOutline" onClick={() => setIsViewOpen(false)}>
              Close
            </AdminButton>
            {selectedContract?.status === "draft" && (
              <AdminButton
                variant="admin"
                onClick={() => {
                  sendMutation.mutate(selectedContract.id);
                  setIsViewOpen(false);
                }}
                disabled={sendMutation.isPending}
              >
                <Send className="w-3.5 h-3.5 mr-1.5" />
                Send Contract
              </AdminButton>
            )}
          </div>
        </AdminDialogContent>
      </AdminDialog>
    </div>
  );
}