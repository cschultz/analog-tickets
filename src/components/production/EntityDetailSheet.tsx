import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { AdminSheetHeader, AdminSheetTitle, AdminSheetDescription } from "@/components/admin/AdminSheet";
import { AdminButton, AdminBadge, OwnerPicker } from "@/components/admin";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Trash2, 
  Edit, 
  Phone, 
  Mail, 
  Globe, 
  ChevronDown,
  FileText,
  Users,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Instagram,
  UserCircle
} from "lucide-react";
import { PipelineStatus } from "./PipelineStatusBadge";
import { PipelineStatusSelect } from "./PipelineStatusSelect";
import { HealthIndicators } from "./HealthIndicators";
import { EntityEmailHistory } from "./EntityEmailHistory";
import { AdminCard, AdminCardContent, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import { AdminAvatar, StatusDot, StatValue, TypeLabel, ActivityTimestamp } from "@/components/admin/AdminPrimitives";
import { useEntityOwnership, EntityType } from "@/hooks/useEntityOwnership";
import { useAdminEvent } from "@/hooks/useAdminEvent";
import { cn } from "@/lib/utils";

// Shared types
export interface EntityContact {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string | null;
  is_primary: boolean | null;
}

export interface EntityContract {
  id: string;
  title: string;
  description: string | null;
  amount: number | null;
  status: string;
  sent_at: string | null;
  signed_at: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface EntityDocument {
  id: string;
  document_type: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  expiration_date: string | null;
  notes: string | null;
  created_at: string;
}

interface EntityDetailSheetProps {
  entityType: "vendor" | "artisan" | "partner";
  entity: {
    id: string;
    name: string;
    company?: string | null;
    email?: string | null;
    phone?: string | null;
    website_url?: string | null;
    instagram_url?: string | null;
    pipeline_status?: PipelineStatus | null;
    notes?: string | null;
    category?: string | null;
    tier?: string | null;
    value?: number | null;
    booth_number?: string | null;
    updated_at?: string | null;
  };
  contacts: EntityContact[];
  contracts: EntityContract[];
  documents: EntityDocument[];
  expiringDocs: EntityDocument[];
  expiredDocs: EntityDocument[];
  onDelete: () => void;
  onUpdate: () => void;
  documentTypes: { value: string; label: string }[];
  contractStatuses: { value: string; label: string; color: string }[];
  additionalContent?: React.ReactNode;
}

const CONTRACT_STATUSES = [
  { value: "draft", label: "Draft", color: "bg-[hsl(var(--admin-surface))] text-[hsl(var(--admin-muted-foreground))] border-[hsl(var(--admin-border))]" },
  { value: "sent", label: "Sent", color: "bg-[hsl(var(--admin-info)/0.1)] text-[hsl(var(--admin-info))] border-[hsl(var(--admin-info)/0.3)]" },
  { value: "signed", label: "Signed", color: "bg-[hsl(var(--admin-success)/0.1)] text-[hsl(var(--admin-success))] border-[hsl(var(--admin-success)/0.3)]" },
  { value: "completed", label: "Completed", color: "bg-[hsl(262,83%,58%,0.1)] text-[hsl(262,83%,58%)] border-[hsl(262,83%,58%,0.3)]" },
  { value: "cancelled", label: "Cancelled", color: "bg-[hsl(var(--admin-error)/0.1)] text-[hsl(var(--admin-error))] border-[hsl(var(--admin-error)/0.3)]" },
];

export function EntityDetailSheet({
  entityType,
  entity,
  contacts,
  contracts,
  documents,
  expiringDocs,
  expiredDocs,
  onDelete,
  onUpdate,
  documentTypes,
  contractStatuses = CONTRACT_STATUSES,
  additionalContent,
}: EntityDetailSheetProps) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(true);
  const [contractsOpen, setContractsOpen] = useState(true);
  const [documentsOpen, setDocumentsOpen] = useState(true);
  
  const { selectedEventId } = useAdminEvent();
  
  // Ownership hook
  const {
    ownerId,
    collaboratorIds,
    setOwner,
    addCollaborator,
    removeCollaborator,
    isUpdating: ownershipUpdating,
  } = useEntityOwnership({
    entityType: entityType as EntityType,
    entityId: entity.id,
    eventId: selectedEventId,
  });

  // Status update mutation
  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const table = entityType === "vendor" ? "vendors" : entityType === "artisan" ? "artisans" : "partners";
      const { error } = await supabase
        .from(table)
        .update({ pipeline_status: newStatus as Database["public"]["Enums"]["pipeline_status"] })
        .eq("id", entity.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${entityType}s`] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-items"] });
      toast.success("Status updated");
      onUpdate();
    },
    onError: () => {
      toast.error("Failed to update status");
    },
  });

  const hasAlerts = expiredDocs.length > 0 || expiringDocs.length > 0;

  return (
    <div className="space-y-4">
      {/* Header with Avatar */}
      <AdminSheetHeader>
        <div className="flex items-start gap-4">
          <AdminAvatar 
            name={entity.company || entity.name} 
            type={entityType}
            size="lg"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <AdminSheetTitle className="text-lg text-[hsl(var(--admin-foreground))]">
                  {entity.company || entity.name}
                </AdminSheetTitle>
                {entity.company && (
                  <AdminSheetDescription className="text-[hsl(var(--admin-muted-foreground))]">
                    {entity.name}
                  </AdminSheetDescription>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <TypeLabel type={entityType} />
                  {entity.category && (
                    <>
                      <span className="text-[hsl(var(--admin-muted-foreground))]">·</span>
                      <span className="text-[11px] text-[hsl(var(--admin-muted-foreground))]">{entity.category}</span>
                    </>
                  )}
                  <ActivityTimestamp date={entity.updated_at} />
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <AdminButton 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setIsEditing(!isEditing)}
                  className="h-8"
                >
                  <Edit className="w-4 h-4" />
                </AdminButton>
                <AdminButton 
                  variant="destructive" 
                  size="sm" 
                  onClick={onDelete}
                  className="h-8"
                >
                  <Trash2 className="w-4 h-4" />
                </AdminButton>
              </div>
            </div>
          </div>
        </div>
      </AdminSheetHeader>

      {/* Health Alerts */}
      {hasAlerts && (
        <AdminCard className="border-red-200 bg-red-50">
          <AdminCardContent className="py-3">
            <HealthIndicators
              hasExpiredDocs={expiredDocs.length > 0}
              hasExpiringDocs={expiringDocs.length > 0}
              expiredCount={expiredDocs.length}
              expiringCount={expiringDocs.length}
            />
          </AdminCardContent>
        </AdminCard>
      )}

      {/* Quick Info Bar */}
      <AdminCard>
        <AdminCardContent className="py-3">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[hsl(var(--admin-muted-foreground))]">Status:</span>
              <PipelineStatusSelect
                value={entity.pipeline_status}
                onValueChange={(status) => updateStatusMutation.mutate(status)}
                disabled={updateStatusMutation.isPending}
              />
            </div>
            
            {/* Owner Picker */}
            <div className="flex items-center gap-2">
              <UserCircle className="w-3.5 h-3.5 text-[hsl(var(--admin-muted-foreground))]" />
              <OwnerPicker
                ownerId={ownerId}
                onOwnerChange={setOwner}
                collaboratorIds={collaboratorIds}
                onAddCollaborator={addCollaborator}
                onRemoveCollaborator={removeCollaborator}
                disabled={ownershipUpdating}
                compact
              />
            </div>
            
            {entity.email && (
              <a
                href={`mailto:${entity.email}`}
                className="flex items-center gap-1.5 text-xs text-[hsl(var(--admin-accent))] hover:underline"
              >
                <Mail className="w-3.5 h-3.5" />
                {entity.email}
              </a>
            )}
            
            {entity.phone && (
              <a
                href={`tel:${entity.phone}`}
                className="flex items-center gap-1.5 text-xs text-[hsl(var(--admin-muted-foreground))] hover:text-[hsl(var(--admin-foreground))]"
              >
                <Phone className="w-3.5 h-3.5" />
                {entity.phone}
              </a>
            )}
            
            {entity.website_url && (
              <a
                href={entity.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-[hsl(var(--admin-muted-foreground))] hover:text-[hsl(var(--admin-foreground))]"
              >
                <Globe className="w-3.5 h-3.5" />
                Website
              </a>
            )}

            {entity.instagram_url && (
              <a
                href={entity.instagram_url.startsWith("http") ? entity.instagram_url : `https://instagram.com/${entity.instagram_url.replace("@", "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-[hsl(var(--admin-muted-foreground))] hover:text-[hsl(var(--admin-foreground))]"
              >
                <Instagram className="w-3.5 h-3.5" />
                Instagram
              </a>
            )}
          </div>
        </AdminCardContent>
      </AdminCard>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3">
        <AdminCard>
          <AdminCardContent className="py-4">
            <StatValue label="Contacts" value={contacts.length} />
          </AdminCardContent>
        </AdminCard>
        <AdminCard>
          <AdminCardContent className="py-4">
            <StatValue label="Contracts" value={contracts.length} />
          </AdminCardContent>
        </AdminCard>
        <AdminCard>
          <AdminCardContent className="py-4">
            <StatValue label="Documents" value={documents.length} />
          </AdminCardContent>
        </AdminCard>
      </div>

      {/* Additional Content (entity-specific) */}
      {additionalContent}

      {/* Email History */}
      <EntityEmailHistory entityType={entityType} entityId={entity.id} />

      {/* Collapsible Sections */}
      <div className="space-y-3">
        {/* Contacts Section */}
        <Collapsible open={contactsOpen} onOpenChange={setContactsOpen}>
          <AdminCard>
            <CollapsibleTrigger asChild>
              <AdminCardHeader className="cursor-pointer hover:bg-[hsl(var(--admin-surface))] transition-colors py-3">
                <div className="flex items-center justify-between w-full">
                  <AdminCardTitle className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-[hsl(var(--admin-muted-foreground))]" />
                    Contacts
                    <AdminBadge intent="neutral" className="ml-1 text-[10px] px-1.5">
                      {contacts.length}
                    </AdminBadge>
                  </AdminCardTitle>
                  <ChevronDown className={cn("w-4 h-4 text-[hsl(var(--admin-muted-foreground))] transition-transform", contactsOpen && "rotate-180")} />
                </div>
              </AdminCardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <AdminCardContent className="pt-0">
                {contacts.length === 0 ? (
                  <p className="text-xs text-[hsl(var(--admin-muted-foreground))] text-center py-4">No contacts added</p>
                ) : (
                  <div className="space-y-2">
                    {contacts.map((contact) => (
                      <div key={contact.id} className="flex items-center justify-between p-3 border border-[hsl(var(--admin-border))] rounded-lg bg-[hsl(var(--admin-background))]">
                        <div className="flex items-center gap-3">
                          <AdminAvatar name={contact.name} size="sm" />
                          <div>
                            <p className="font-medium text-sm text-[hsl(var(--admin-foreground))] flex items-center gap-2">
                              {contact.name}
                              {contact.is_primary && (
                                <AdminBadge intent="neutral" className="text-[9px] px-1 py-0">
                                  Primary
                                </AdminBadge>
                              )}
                            </p>
                            <p className="text-[11px] text-[hsl(var(--admin-muted-foreground))]">{contact.role || "Contact"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <a href={`mailto:${contact.email}`} className="text-[hsl(var(--admin-accent))] hover:underline text-xs">
                            {contact.email}
                          </a>
                          {contact.phone && (
                            <a href={`tel:${contact.phone}`} className="text-[hsl(var(--admin-muted-foreground))] hover:text-[hsl(var(--admin-foreground))]">
                              <Phone className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </AdminCardContent>
            </CollapsibleContent>
          </AdminCard>
        </Collapsible>

        {/* Contracts Section */}
        <Collapsible open={contractsOpen} onOpenChange={setContractsOpen}>
          <AdminCard>
            <CollapsibleTrigger asChild>
              <AdminCardHeader className="cursor-pointer hover:bg-[hsl(var(--admin-surface))] transition-colors py-3">
                <div className="flex items-center justify-between w-full">
                  <AdminCardTitle className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[hsl(var(--admin-muted-foreground))]" />
                    Contracts
                    <AdminBadge intent="neutral" className="ml-1 text-[10px] px-1.5">
                      {contracts.length}
                    </AdminBadge>
                  </AdminCardTitle>
                  <ChevronDown className={cn("w-4 h-4 text-[hsl(var(--admin-muted-foreground))] transition-transform", contractsOpen && "rotate-180")} />
                </div>
              </AdminCardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <AdminCardContent className="pt-0">
                {contracts.length === 0 ? (
                  <p className="text-xs text-[hsl(var(--admin-muted-foreground))] text-center py-4">No contracts added</p>
                ) : (
                  <div className="space-y-2">
                    {contracts.map((contract) => {
                      const statusConfig = contractStatuses.find(s => s.value === contract.status);
                      return (
                        <div key={contract.id} className="flex items-center justify-between p-3 border border-[hsl(var(--admin-border))] rounded-lg bg-[hsl(var(--admin-background))]">
                          <div className="flex items-center gap-3">
                            <StatusDot status={contract.status} />
                            <div>
                              <p className="font-medium text-sm text-[hsl(var(--admin-foreground))]">{contract.title}</p>
                              {contract.amount && (
                                <p className="text-xs text-emerald-600 font-medium">${contract.amount.toLocaleString()}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <AdminBadge className={cn("text-[10px]", statusConfig?.color)}>{statusConfig?.label || contract.status}</AdminBadge>
                            {contract.signed_at && (
                              <span className="text-[10px] text-[hsl(var(--admin-muted-foreground))] flex items-center gap-1">
                                <CheckCircle className="w-3 h-3 text-emerald-600" />
                                {format(new Date(contract.signed_at), "MMM d")}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </AdminCardContent>
            </CollapsibleContent>
          </AdminCard>
        </Collapsible>

        {/* Documents Section */}
        <Collapsible open={documentsOpen} onOpenChange={setDocumentsOpen}>
          <AdminCard className={expiredDocs.length > 0 ? "border-red-200" : expiringDocs.length > 0 ? "border-amber-200" : ""}>
            <CollapsibleTrigger asChild>
              <AdminCardHeader className="cursor-pointer hover:bg-[hsl(var(--admin-surface))] transition-colors py-3">
                <div className="flex items-center justify-between w-full">
                  <AdminCardTitle className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[hsl(var(--admin-muted-foreground))]" />
                    Documents
                    <AdminBadge intent="neutral" className="ml-1 text-[10px] px-1.5">
                      {documents.length}
                    </AdminBadge>
                    {(expiredDocs.length > 0 || expiringDocs.length > 0) && (
                      <AlertTriangle className={cn(
                        "w-4 h-4 ml-1",
                        expiredDocs.length > 0 ? "text-[hsl(var(--admin-error))]" : "text-[hsl(var(--admin-warning))]"
                      )} />
                    )}
                  </AdminCardTitle>
                  <ChevronDown className={cn("w-4 h-4 text-[hsl(var(--admin-muted-foreground))] transition-transform", documentsOpen && "rotate-180")} />
                </div>
              </AdminCardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <AdminCardContent className="pt-0">
                {documents.length === 0 ? (
                  <p className="text-xs text-[hsl(var(--admin-muted-foreground))] text-center py-4">No documents uploaded</p>
                ) : (
                  <div className="space-y-2">
                    {documents.map((doc) => {
                      const isExpired = doc.expiration_date && new Date(doc.expiration_date) < new Date();
                      const isExpiring = doc.expiration_date && !isExpired && 
                        new Date(doc.expiration_date) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                      const docType = documentTypes.find(t => t.value === doc.document_type);
                      
                      return (
                        <div 
                          key={doc.id} 
                          className={cn(
                            "flex items-center justify-between p-3 border rounded-lg",
                            isExpired && "border-[hsl(var(--admin-error)/0.3)] bg-[hsl(var(--admin-error)/0.05)]",
                            isExpiring && !isExpired && "border-[hsl(var(--admin-warning)/0.3)] bg-[hsl(var(--admin-warning)/0.05)]",
                            !isExpired && !isExpiring && "border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-background))]"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <FileText className="w-4 h-4 text-[hsl(var(--admin-muted-foreground))]" />
                            <div>
                              <p className="font-medium text-sm text-[hsl(var(--admin-foreground))]">{doc.file_name}</p>
                              <p className="text-[11px] text-[hsl(var(--admin-muted-foreground))]">
                                {docType?.label || doc.document_type}
                                {doc.expiration_date && (
                                  <span className={cn(
                                    "ml-2",
                                    isExpired && "text-[hsl(var(--admin-error))]",
                                    isExpiring && !isExpired && "text-[hsl(var(--admin-warning))]"
                                  )}>
                                    {isExpired ? "Expired: " : "Expires: "}
                                    {format(new Date(doc.expiration_date), "MMM d, yyyy")}
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                          <AdminButton 
                            variant="ghost" 
                            size="sm" 
                            asChild
                            className="h-7 w-7 p-0"
                          >
                            <a href={doc.file_path} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </AdminButton>
                        </div>
                      );
                    })}
                  </div>
                )}
              </AdminCardContent>
            </CollapsibleContent>
          </AdminCard>
        </Collapsible>
      </div>

      {/* Notes Section */}
      {entity.notes && (
        <AdminCard>
          <AdminCardHeader className="py-3">
            <AdminCardTitle>Notes</AdminCardTitle>
          </AdminCardHeader>
          <AdminCardContent className="pt-0">
            <p className="text-sm text-[hsl(var(--admin-muted-foreground))] whitespace-pre-wrap">{entity.notes}</p>
          </AdminCardContent>
        </AdminCard>
      )}
    </div>
  );
}
