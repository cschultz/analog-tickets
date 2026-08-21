import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { 
  X, 
  FileText, 
  Files, 
  Mail, 
  LayoutList,
  Phone,
  Globe,
  Instagram,
  ExternalLink
} from "lucide-react";
import { 
  AdminSheet, 
  AdminSheetContent, 
  AdminSheetHeader, 
  AdminSheetTitle, 
  AdminSheetDescription 
} from "@/components/admin/AdminSheet";
import { AdminTabs, AdminTabsList, AdminTabsTrigger, AdminTabsContent } from "@/components/admin/AdminUI";
import { AdminButton, AdminBadge } from "@/components/admin";
import { AdminAvatar, TypeLabel, ActivityTimestamp } from "@/components/admin/AdminPrimitives";
import { OwnerPicker, OwnerDisplay } from "@/components/admin/OwnerPicker";
import { PipelineStatusSelect } from "@/components/production/PipelineStatusSelect";
import { PipelineStatus } from "@/components/production/PipelineStatusBadge";
import { AdminCard, AdminCardContent } from "@/components/admin/AdminCard";

export interface RecordDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  
  // Entity info
  entityType: "vendor" | "artisan" | "partner" | "artist";
  entity: {
    id: string;
    name: string;
    company?: string | null;
    email?: string | null;
    phone?: string | null;
    website_url?: string | null;
    instagram_url?: string | null;
    pipeline_status?: PipelineStatus | null;
    category?: string | null;
    updated_at?: string | null;
  };
  
  // Ownership
  ownerId: string | null;
  collaboratorIds: string[];
  onOwnerChange: (userId: string | null) => Promise<void>;
  onAddCollaborator: (userId: string) => Promise<void>;
  onRemoveCollaborator: (userId: string) => Promise<void>;
  ownershipLoading?: boolean;
  
  // Status
  onStatusChange?: (status: PipelineStatus) => void;
  statusLoading?: boolean;
  
  // Actions
  onEdit?: () => void;
  onDelete?: () => void;
  
  // Tab content
  overviewContent?: ReactNode;
  contractsContent?: ReactNode;
  documentsContent?: ReactNode;
  emailContent?: ReactNode;
  
  // Quick stats
  contactCount?: number;
  contractCount?: number;
  documentCount?: number;
  
  className?: string;
}

export function RecordDrawer({
  open,
  onOpenChange,
  entityType,
  entity,
  ownerId,
  collaboratorIds,
  onOwnerChange,
  onAddCollaborator,
  onRemoveCollaborator,
  ownershipLoading,
  onStatusChange,
  statusLoading,
  onEdit,
  onDelete,
  overviewContent,
  contractsContent,
  documentsContent,
  emailContent,
  contactCount = 0,
  contractCount = 0,
  documentCount = 0,
  className,
}: RecordDrawerProps) {
  return (
    <AdminSheet open={open} onOpenChange={onOpenChange}>
      <AdminSheetContent 
        side="right" 
        className={cn("w-full sm:max-w-xl overflow-y-auto", className)}
      >
        {/* Header */}
        <AdminSheetHeader className="pb-4 border-b border-[hsl(var(--admin-border))]">
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
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
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
              </div>
            </div>
          </div>
        </AdminSheetHeader>

        {/* Quick Info Bar */}
        <AdminCard className="my-4">
          <AdminCardContent className="py-3">
            <div className="flex flex-wrap items-center gap-4">
              {/* Status */}
              {onStatusChange && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[hsl(var(--admin-muted-foreground))]">Status:</span>
                  <PipelineStatusSelect
                    value={entity.pipeline_status}
                    onValueChange={onStatusChange}
                    disabled={statusLoading}
                  />
                </div>
              )}
              
              {/* Owner */}
              <div className="flex items-center gap-2">
                <OwnerPicker
                  ownerId={ownerId}
                  onOwnerChange={onOwnerChange}
                  collaboratorIds={collaboratorIds}
                  onAddCollaborator={onAddCollaborator}
                  onRemoveCollaborator={onRemoveCollaborator}
                  disabled={ownershipLoading}
                  compact
                />
              </div>
              
              {/* Contact links */}
              {entity.email && (
                <a
                  href={`mailto:${entity.email}`}
                  className="flex items-center gap-1.5 text-xs text-[hsl(var(--admin-info))] hover:underline"
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
                  <ExternalLink className="w-3 h-3" />
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

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <AdminCard>
            <AdminCardContent className="py-3 text-center">
              <p className="text-xl font-semibold text-[hsl(var(--admin-foreground))]">{contactCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--admin-muted-foreground))]">Contacts</p>
            </AdminCardContent>
          </AdminCard>
          <AdminCard>
            <AdminCardContent className="py-3 text-center">
              <p className="text-xl font-semibold text-[hsl(var(--admin-foreground))]">{contractCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--admin-muted-foreground))]">Contracts</p>
            </AdminCardContent>
          </AdminCard>
          <AdminCard>
            <AdminCardContent className="py-3 text-center">
              <p className="text-xl font-semibold text-[hsl(var(--admin-foreground))]">{documentCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--admin-muted-foreground))]">Documents</p>
            </AdminCardContent>
          </AdminCard>
        </div>

        {/* Tabs */}
        <AdminTabs defaultValue="overview" className="flex-1">
          <AdminTabsList className="bg-transparent border-b border-[hsl(var(--admin-border))] rounded-none p-0 gap-0 w-full justify-start">
            <AdminTabsTrigger
              value="overview"
              className="relative h-9 px-3 py-2 rounded-none bg-transparent text-sm font-medium text-[hsl(var(--admin-text-secondary))] hover:text-[hsl(var(--admin-text))] data-[state=active]:text-[hsl(var(--admin-text))] data-[state=active]:shadow-none data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-[hsl(var(--admin-primary))] transition-colors"
            >
              <LayoutList className="h-3.5 w-3.5 mr-1.5" />
              Overview
            </AdminTabsTrigger>
            <AdminTabsTrigger
              value="contracts"
              className="relative h-9 px-3 py-2 rounded-none bg-transparent text-sm font-medium text-[hsl(var(--admin-text-secondary))] hover:text-[hsl(var(--admin-text))] data-[state=active]:text-[hsl(var(--admin-text))] data-[state=active]:shadow-none data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-[hsl(var(--admin-primary))] transition-colors"
            >
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              Contracts
              {contractCount > 0 && (
                <AdminBadge intent="neutral" className="ml-1.5 text-[10px] px-1.5">
                  {contractCount}
                </AdminBadge>
              )}
            </AdminTabsTrigger>
            <AdminTabsTrigger
              value="documents"
              className="relative h-9 px-3 py-2 rounded-none bg-transparent text-sm font-medium text-[hsl(var(--admin-text-secondary))] hover:text-[hsl(var(--admin-text))] data-[state=active]:text-[hsl(var(--admin-text))] data-[state=active]:shadow-none data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-[hsl(var(--admin-primary))] transition-colors"
            >
              <Files className="h-3.5 w-3.5 mr-1.5" />
              Documents
              {documentCount > 0 && (
                <AdminBadge intent="neutral" className="ml-1.5 text-[10px] px-1.5">
                  {documentCount}
                </AdminBadge>
              )}
            </AdminTabsTrigger>
            <AdminTabsTrigger
              value="email"
              className="relative h-9 px-3 py-2 rounded-none bg-transparent text-sm font-medium text-[hsl(var(--admin-text-secondary))] hover:text-[hsl(var(--admin-text))] data-[state=active]:text-[hsl(var(--admin-text))] data-[state=active]:shadow-none data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-[hsl(var(--admin-primary))] transition-colors"
            >
              <Mail className="h-3.5 w-3.5 mr-1.5" />
              Email
            </AdminTabsTrigger>
          </AdminTabsList>

          <AdminTabsContent value="overview" className="mt-4">
            {overviewContent || (
              <div className="text-center py-8 text-[hsl(var(--admin-text-muted))]">
                Overview content
              </div>
            )}
          </AdminTabsContent>

          <AdminTabsContent value="contracts" className="mt-4">
            {contractsContent || (
              <div className="text-center py-8 text-[hsl(var(--admin-text-muted))]">
                Contracts content
              </div>
            )}
          </AdminTabsContent>

          <AdminTabsContent value="documents" className="mt-4">
            {documentsContent || (
              <div className="text-center py-8 text-[hsl(var(--admin-text-muted))]">
                Documents content
              </div>
            )}
          </AdminTabsContent>

          <AdminTabsContent value="email" className="mt-4">
            {emailContent || (
              <div className="text-center py-8 text-[hsl(var(--admin-text-muted))]">
                Email history
              </div>
            )}
          </AdminTabsContent>
        </AdminTabs>

        {/* Footer Actions */}
        {(onEdit || onDelete) && (
          <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-[hsl(var(--admin-border))]">
            {onDelete && (
              <AdminButton variant="adminDestructive" size="sm" onClick={onDelete}>
                Delete
              </AdminButton>
            )}
            {onEdit && (
              <AdminButton variant="admin" size="sm" onClick={onEdit}>
                Edit
              </AdminButton>
            )}
          </div>
        )}
      </AdminSheetContent>
    </AdminSheet>
  );
}
