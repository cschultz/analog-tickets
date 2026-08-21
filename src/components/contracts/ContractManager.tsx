import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { supabase } from "@/integrations/supabase/client";
import { useAdminEvent } from "@/hooks/useAdminEvent";
import { AdminButton, AdminInput, AdminBadge, AdminTable, AdminTableBody, AdminTableCell, AdminTableHead, AdminTableHeader, AdminTableRow } from "@/components/admin/AdminUI";
import { AdminSelect, AdminSelectItem } from "@/components/admin/AdminSelect";
import { AdminDialog, AdminDialogContent, AdminDialogDescription, AdminDialogHeader, AdminDialogTitle } from "@/components/admin/AdminDialog";
import { AdminLabel, AdminTextarea, AdminSwitch } from "@/components/admin/AdminFormPrimitives";
import { AdminCard, AdminCardContent } from "@/components/admin/AdminCard";
import { toast } from "sonner";
import { Plus, Send, Eye, FileText, Upload, RefreshCw, CheckCircle } from "lucide-react";
import { RichTextEditor } from "@/components/RichTextEditor";
import { format } from "date-fns";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

interface Contract {
  id: string;
  event_id: string;
  template_id: string | null;
  entity_type: "vendor" | "artisan" | "partner" | "artist";
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
}

interface Entity {
  id: string;
  name: string;
  email: string | null;
  company?: string;
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

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-[hsl(var(--admin-text-muted))]",
  sent: "bg-[hsl(var(--admin-info))]",
  viewed: "bg-[hsl(var(--admin-warning))]",
  signed: "bg-[hsl(var(--admin-success))]",
  countersigned: "bg-[hsl(var(--admin-success))]",
  completed: "bg-[hsl(var(--admin-success))]",
  declined: "bg-[hsl(var(--admin-error))]",
  expired: "bg-[hsl(var(--admin-text-muted))]",
};

interface ContractManagerProps {
  entityType: "vendor" | "artisan" | "partner" | "artist";
}

export function ContractManager({ entityType }: ContractManagerProps) {
  const { selectedEventId } = useAdminEvent();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isUploadSignedOpen, setIsUploadSignedOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  
  // Form state for new contract
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [contentHtml, setContentHtml] = useState("");
  const [requiresCountersign, setRequiresCountersign] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState("30");
  const [uploadedPdf, setUploadedPdf] = useState<File | null>(null);
  const [useUploadedPdf, setUseUploadedPdf] = useState(false);
  
  // Form state for upload signed contract
  const [uploadSignedEntityId, setUploadSignedEntityId] = useState("");
  const [uploadSignedTitle, setUploadSignedTitle] = useState("");
  const [uploadSignedFile, setUploadSignedFile] = useState<File | null>(null);
  const [uploadSignedDate, setUploadSignedDate] = useState("");
  const [uploadSignedNotes, setUploadSignedNotes] = useState("");

  // Fetch contracts
  const { data: contracts, isLoading } = useAuthQuery({
    queryKey: ["contracts", selectedEventId, entityType],
    queryFn: async () => {
      if (!selectedEventId) return [];
      const { data, error } = await supabase
        .from("contracts")
        .select("*")
        .eq("event_id", selectedEventId)
        .eq("entity_type", entityType)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Contract[];
    },
    enabled: !!selectedEventId,
  });

  // Fetch entities
  const { data: entities } = useAuthQuery({
    queryKey: [entityType + "s", selectedEventId],
    queryFn: async () => {
      if (!selectedEventId) return [];
      const tableName = entityType === "artisan" ? "artisans" : 
                        entityType === "partner" ? "partners" : 
                        entityType === "artist" ? "artists" : "vendors";
      const { data, error } = await supabase
        .from(tableName)
        .select("id, name, email, business_name, company_name")
        .eq("event_id", selectedEventId);
      if (error) throw error;
      return data.map((e: any) => ({
        id: e.id,
        name: e.name,
        email: e.email,
        company: e.business_name || e.company_name,
      })) as Entity[];
    },
    enabled: !!selectedEventId,
  });

  // Fetch templates
  const { data: templates } = useAuthQuery({
    queryKey: ["contract-templates", selectedEventId, entityType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_templates")
        .select("id, name, content_html, requires_countersign")
        .eq("entity_type", entityType)
        .eq("is_active", true)
        .or(`event_id.eq.${selectedEventId},event_id.is.null`);
      if (error) throw error;
      return data as ContractTemplate[];
    },
    enabled: !!selectedEventId,
  });

  // Fetch signatures for selected contract
  const { data: signatures } = useAuthQuery({
    queryKey: ["contract-signatures", selectedContract?.id],
    queryFn: async () => {
      if (!selectedContract) return [];
      const { data, error } = await supabase
        .from("contract_signatures")
        .select("*")
        .eq("contract_id", selectedContract.id)
        .order("signed_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedContract,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedEventId || !selectedEntityId) throw new Error("Missing required fields");
      
      const entity = entities?.find(e => e.id === selectedEntityId);
      if (!entity) throw new Error("Entity not found");

      let pdfPath = null;
      if (useUploadedPdf && uploadedPdf) {
        const fileName = `${selectedEventId}/${entityType}/${selectedEntityId}/${Date.now()}-${uploadedPdf.name}`;
        const { error: uploadError } = await supabase.storage
          .from("production-documents")
          .upload(fileName, uploadedPdf);
        if (uploadError) throw uploadError;
        pdfPath = fileName;
      }

      // Generate access token
      const accessToken = crypto.randomUUID();
      
      // Calculate expiration
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + parseInt(expiresInDays));

      const { data, error } = await supabase
        .from("contracts")
        .insert([{
          event_id: selectedEventId,
          template_id: selectedTemplateId || null,
          entity_type: entityType,
          entity_id: selectedEntityId,
          title: title || `Contract for ${entity.name}`,
          content_html: useUploadedPdf ? null : contentHtml,
          pdf_path: pdfPath,
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
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
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
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
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
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      toast.success("Contract resent");
    },
    onError: (error) => {
      toast.error("Failed to resend contract: " + error.message);
    },
  });

  // Upload externally signed contract
  const uploadSignedMutation = useMutation({
    mutationFn: async () => {
      if (!selectedEventId || !uploadSignedEntityId || !uploadSignedFile) {
        throw new Error("Missing required fields");
      }
      
      const entity = entities?.find(e => e.id === uploadSignedEntityId);
      if (!entity) throw new Error("Entity not found");

      // Upload the signed PDF
      const fileName = `${selectedEventId}/${entityType}/${uploadSignedEntityId}/signed-${Date.now()}-${uploadSignedFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("production-documents")
        .upload(fileName, uploadSignedFile);
      if (uploadError) throw uploadError;

      // Create contract record marked as completed
      const { data, error } = await supabase
        .from("contracts")
        .insert([{
          event_id: selectedEventId,
          entity_type: entityType,
          entity_id: uploadSignedEntityId,
          title: uploadSignedTitle || `Signed Contract - ${entity.name}`,
          pdf_path: fileName,
          status: "completed",
          notes: uploadSignedNotes || null,
          access_token: crypto.randomUUID(),
        }])
        .select()
        .single();
      
      if (error) throw error;

      // Create signature record for the externally signed contract
      if (data) {
        await supabase.from("contract_signatures").insert([{
          contract_id: data.id,
          signer_name: entity.name,
          signer_email: entity.email || "external@signing.com",
          signer_type: "external",
          agreement_text: "Signed externally and uploaded",
        }]);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      toast.success("Signed contract uploaded successfully");
      resetUploadSignedForm();
      setIsUploadSignedOpen(false);
    },
    onError: (error) => {
      toast.error("Failed to upload signed contract: " + error.message);
    },
  });

  const resetForm = () => {
    setSelectedEntityId("");
    setSelectedTemplateId("");
    setTitle("");
    setContentHtml("");
    setRequiresCountersign(false);
    setExpiresInDays("30");
    setUploadedPdf(null);
    setUseUploadedPdf(false);
  };

  const resetUploadSignedForm = () => {
    setUploadSignedEntityId("");
    setUploadSignedTitle("");
    setUploadSignedFile(null);
    setUploadSignedDate("");
    setUploadSignedNotes("");
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates?.find(t => t.id === templateId);
    if (template) {
      setContentHtml(template.content_html);
      setRequiresCountersign(template.requires_countersign);
      
      // Apply merge fields if entity selected
      if (selectedEntityId) {
        applyMergeFields(template.content_html);
      }
    }
  };

  const applyMergeFields = (html: string) => {
    const entity = entities?.find(e => e.id === selectedEntityId);
    if (!entity) return html;
    
    let result = html
      .replace(/\{\{name\}\}/g, entity.name)
      .replace(/\{\{company\}\}/g, entity.company || entity.name)
      .replace(/\{\{email\}\}/g, entity.email || "")
      .replace(/\{\{today_date\}\}/g, format(new Date(), "MMMM d, yyyy"));
    
    setContentHtml(result);
    return result;
  };

  const getEntityName = (entityId: string) => {
    return entities?.find(e => e.id === entityId)?.name || "Unknown";
  };

  const viewContract = (contract: Contract) => {
    setSelectedContract(contract);
    setIsViewOpen(true);
  };

  if (!selectedEventId) {
    return (
      <div className="text-center py-8 text-[hsl(var(--admin-text-muted))]">
        Please select an event first
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold capitalize">{entityType} Contracts</h2>
          <p className="text-sm text-[hsl(var(--admin-text-muted))]">
            Manage and track {entityType} agreements
          </p>
        </div>
        <div className="flex gap-2">
          <AdminButton variant="adminOutline" onClick={() => setIsUploadSignedOpen(true)}>
            <CheckCircle className="w-4 h-4 mr-2" />
            Upload Signed Contract
          </AdminButton>
          <AdminButton variant="admin" onClick={() => setIsCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Contract
          </AdminButton>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-[hsl(var(--admin-text-muted))]">Loading...</div>
      ) : !contracts?.length ? (
        <AdminCard>
          <AdminCardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="w-12 h-12 text-[hsl(var(--admin-text-muted))] mb-4" />
            <p className="text-[hsl(var(--admin-text-muted))] mb-4">No contracts yet</p>
            <div className="flex gap-2">
              <AdminButton variant="adminOutline" onClick={() => setIsUploadSignedOpen(true)}>
                <CheckCircle className="w-4 h-4 mr-2" />
                Upload Signed Contract
              </AdminButton>
              <AdminButton variant="admin" onClick={() => setIsCreateOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                New Contract
              </AdminButton>
            </div>
          </AdminCardContent>
        </AdminCard>
      ) : (
        <AdminTable>
          <AdminTableHeader>
            <AdminTableRow>
              <AdminTableHead>Title</AdminTableHead>
              <AdminTableHead>{entityType}</AdminTableHead>
              <AdminTableHead>Status</AdminTableHead>
              <AdminTableHead>Sent</AdminTableHead>
              <AdminTableHead>Expires</AdminTableHead>
              <AdminTableHead className="text-right">Actions</AdminTableHead>
            </AdminTableRow>
          </AdminTableHeader>
          <AdminTableBody>
            {contracts.map((contract) => (
              <AdminTableRow key={contract.id}>
                <AdminTableCell className="font-medium">{contract.title}</AdminTableCell>
                <AdminTableCell>{getEntityName(contract.entity_id)}</AdminTableCell>
                <AdminTableCell>
                  <AdminBadge intent={STATUS_INTENTS[contract.status] || "neutral"}>
                    {contract.status}
                  </AdminBadge>
                </AdminTableCell>
                <AdminTableCell>
                  {contract.sent_at
                    ? format(new Date(contract.sent_at), "MMM d, yyyy")
                    : "-"}
                </AdminTableCell>
                <AdminTableCell>
                  {contract.expires_at
                    ? format(new Date(contract.expires_at), "MMM d, yyyy")
                    : "-"}
                </AdminTableCell>
                <AdminTableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <AdminButton
                      variant="adminGhost"
                      size="icon"
                      onClick={() => viewContract(contract)}
                    >
                      <Eye className="w-4 h-4" />
                    </AdminButton>
                    {contract.status === "draft" && (
                      <AdminButton
                        variant="adminGhost"
                        size="icon"
                        onClick={() => sendMutation.mutate(contract.id)}
                        disabled={sendMutation.isPending}
                      >
                        <Send className="w-4 h-4" />
                      </AdminButton>
                    )}
                    {["sent", "viewed"].includes(contract.status) && (
                      <AdminButton
                        variant="adminGhost"
                        size="icon"
                        onClick={() => resendMutation.mutate(contract.id)}
                        disabled={resendMutation.isPending}
                      >
                        <RefreshCw className="w-4 h-4" />
                      </AdminButton>
                    )}
                  </div>
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </AdminTableBody>
        </AdminTable>
      )}

      {/* Create Contract Dialog */}
      <AdminDialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <AdminDialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <AdminDialogHeader>
            <AdminDialogTitle>Create New Contract</AdminDialogTitle>
            <AdminDialogDescription>
              Create a contract from a template or upload a custom PDF
            </AdminDialogDescription>
          </AdminDialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <AdminLabel>Select {entityType}</AdminLabel>
                <AdminSelect value={selectedEntityId} onValueChange={(v) => {
                  setSelectedEntityId(v);
                  if (contentHtml) applyMergeFields(contentHtml);
                }}>
                  {entities?.map((entity) => (
                    <AdminSelectItem key={entity.id} value={entity.id}>
                      {entity.name} {entity.company && `(${entity.company})`}
                    </AdminSelectItem>
                  ))}
                </AdminSelect>
              </div>
              <div className="space-y-2">
                <AdminLabel>Contract Title</AdminLabel>
                <AdminInput
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Vendor Agreement 2026"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <AdminSwitch
                id="use-pdf"
                checked={useUploadedPdf}
                onCheckedChange={setUseUploadedPdf}
              />
              <AdminLabel htmlFor="use-pdf">Upload custom PDF instead of using template</AdminLabel>
            </div>

            {useUploadedPdf ? (
              <div className="space-y-2">
                <AdminLabel>Upload Contract PDF</AdminLabel>
                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setUploadedPdf(e.target.files?.[0] || null)}
                    className="hidden"
                    id="pdf-upload"
                  />
                  <label htmlFor="pdf-upload" className="cursor-pointer">
                    <Upload className="w-8 h-8 mx-auto text-[hsl(var(--admin-text-muted))] mb-2" />
                    {uploadedPdf ? (
                      <p className="text-sm">{uploadedPdf.name}</p>
                    ) : (
                      <p className="text-sm text-[hsl(var(--admin-text-muted))]">
                        Click to upload or drag and drop
                      </p>
                    )}
                  </label>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <AdminLabel>Use Template (optional)</AdminLabel>
                  <AdminSelect value={selectedTemplateId} onValueChange={handleTemplateSelect}>
                    {templates?.map((template) => (
                      <AdminSelectItem key={template.id} value={template.id}>
                        {template.name}
                      </AdminSelectItem>
                    ))}
                  </AdminSelect>
                </div>

                <div className="space-y-2">
                  <AdminLabel>Contract Content</AdminLabel>
                  <RichTextEditor
                    content={contentHtml}
                    onChange={setContentHtml}
                  />
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <AdminLabel>Expires in (days)</AdminLabel>
                <AdminInput
                  type="number"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value)}
                  min={1}
                  max={365}
                />
              </div>
              <div className="flex items-center space-x-2 pt-6">
                <AdminSwitch
                  id="countersign"
                  checked={requiresCountersign}
                  onCheckedChange={setRequiresCountersign}
                />
                <AdminLabel htmlFor="countersign">Requires admin countersignature</AdminLabel>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <AdminButton variant="adminOutline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </AdminButton>
              <AdminButton 
                variant="admin"
                onClick={() => createMutation.mutate()} 
                disabled={createMutation.isPending || !selectedEntityId}
              >
                {createMutation.isPending ? "Creating..." : "Create Contract"}
              </AdminButton>
            </div>
          </div>
        </AdminDialogContent>
      </AdminDialog>

      {/* View Contract Dialog */}
      <AdminDialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <AdminDialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <AdminDialogHeader>
            <AdminDialogTitle>{selectedContract?.title}</AdminDialogTitle>
            <AdminDialogDescription>
              Status: <AdminBadge intent={STATUS_INTENTS[selectedContract?.status || "draft"]}>
                {selectedContract?.status}
              </AdminBadge>
            </AdminDialogDescription>
          </AdminDialogHeader>

          {selectedContract && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-[hsl(var(--admin-text-muted))]">Sent:</span>{" "}
                  {selectedContract.sent_at
                    ? format(new Date(selectedContract.sent_at), "PPp")
                    : "Not sent"}
                </div>
                <div>
                  <span className="text-[hsl(var(--admin-text-muted))]">Viewed:</span>{" "}
                  {selectedContract.viewed_at
                    ? format(new Date(selectedContract.viewed_at), "PPp")
                    : "Not viewed"}
                </div>
                <div>
                  <span className="text-[hsl(var(--admin-text-muted))]">Expires:</span>{" "}
                  {selectedContract.expires_at
                    ? format(new Date(selectedContract.expires_at), "PPp")
                    : "No expiration"}
                </div>
                <div>
                  <span className="text-[hsl(var(--admin-text-muted))]">Countersign:</span>{" "}
                  {selectedContract.requires_countersign ? "Required" : "Not required"}
                </div>
              </div>

              {selectedContract.content_html && (
                <div className="border rounded-lg p-4">
                  <div
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedContract.content_html) }}
                    className="prose prose-sm max-w-none"
                  />
                </div>
              )}

              {selectedContract.pdf_path && (
                <div className="text-center p-4 border rounded-lg">
                  <FileText className="w-12 h-12 mx-auto text-[hsl(var(--admin-text-muted))] mb-2" />
                  <p className="text-sm text-[hsl(var(--admin-text-muted))]">Custom PDF uploaded</p>
                  <AdminButton
                    variant="adminOutline"
                    className="mt-2"
                    onClick={async () => {
                      const { data } = await supabase.storage
                        .from("production-documents")
                        .createSignedUrl(selectedContract.pdf_path!, 3600);
                      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                    }}
                  >
                    View PDF
                  </AdminButton>
                </div>
              )}

              {signatures && signatures.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-medium">Signatures</h3>
                  {signatures.map((sig: any) => (
                    <div key={sig.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">{sig.signer_name}</p>
                        <p className="text-sm text-[hsl(var(--admin-text-muted))]">{sig.signer_email}</p>
                        {sig.signer_title && (
                          <p className="text-sm text-[hsl(var(--admin-text-muted))]">{sig.signer_title}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <AdminBadge intent="neutral" className="capitalize">{sig.signer_type}</AdminBadge>
                        <p className="text-xs text-[hsl(var(--admin-text-muted))] mt-1">
                          {format(new Date(sig.signed_at), "PPp")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </AdminDialogContent>
      </AdminDialog>

      {/* Upload Signed Contract Dialog */}
      <AdminDialog open={isUploadSignedOpen} onOpenChange={setIsUploadSignedOpen}>
        <AdminDialogContent className="max-w-lg">
          <AdminDialogHeader>
            <AdminDialogTitle>Upload Signed Contract</AdminDialogTitle>
            <AdminDialogDescription>
              Upload a contract that was signed outside of this application
            </AdminDialogDescription>
          </AdminDialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <AdminLabel>Select {entityType}</AdminLabel>
              <AdminSelect value={uploadSignedEntityId} onValueChange={setUploadSignedEntityId}>
                {entities?.map((entity) => (
                  <AdminSelectItem key={entity.id} value={entity.id}>
                    {entity.name} {entity.company && `(${entity.company})`}
                  </AdminSelectItem>
                ))}
              </AdminSelect>
            </div>

            <div className="space-y-2">
              <AdminLabel>Contract Title</AdminLabel>
              <AdminInput
                value={uploadSignedTitle}
                onChange={(e) => setUploadSignedTitle(e.target.value)}
                placeholder="e.g., Vendor Agreement 2026 (Signed)"
              />
            </div>

            <div className="space-y-2">
              <AdminLabel>Signed Contract PDF</AdminLabel>
              <div className="border-2 border-dashed rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setUploadSignedFile(e.target.files?.[0] || null)}
                  className="hidden"
                  id="signed-pdf-upload"
                />
                <label htmlFor="signed-pdf-upload" className="cursor-pointer">
                  <Upload className="w-8 h-8 mx-auto text-[hsl(var(--admin-text-muted))] mb-2" />
                  {uploadSignedFile ? (
                    <div>
                      <p className="text-sm font-medium">{uploadSignedFile.name}</p>
                      <p className="text-xs text-[hsl(var(--admin-text-muted))]">
                        {(uploadSignedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-[hsl(var(--admin-text-muted))]">
                      Click to upload the signed PDF
                    </p>
                  )}
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <AdminLabel>Notes (optional)</AdminLabel>
              <AdminTextarea
                value={uploadSignedNotes}
                onChange={(e) => setUploadSignedNotes(e.target.value)}
                placeholder="Any additional notes about this contract..."
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <AdminButton variant="adminOutline" onClick={() => setIsUploadSignedOpen(false)}>
                Cancel
              </AdminButton>
              <AdminButton 
                variant="admin"
                onClick={() => uploadSignedMutation.mutate()} 
                disabled={uploadSignedMutation.isPending || !uploadSignedEntityId || !uploadSignedFile}
              >
                {uploadSignedMutation.isPending ? "Uploading..." : "Upload Contract"}
              </AdminButton>
            </div>
          </div>
        </AdminDialogContent>
      </AdminDialog>
    </div>
  );
}
