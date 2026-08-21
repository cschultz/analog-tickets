import { useState, useMemo } from "react";
import { usePipeline } from "./PipelineContext";
import { PipelineStatusBadge } from "./PipelineStatusBadge";
import { ProgressDots } from "./ProgressDots";
import { NextStepBadge } from "./NextStepBadge";
import { getFieldDisplayValue } from "@/hooks/usePipelineData";
import { useRecordProgress } from "@/hooks/useRecordProgress";
import { usePipelinePaymentsBulk } from "@/hooks/usePipelinePaymentsBulk";
import { FieldHeaderEditor } from "./inline/FieldHeaderEditor";
import { AddFieldButton } from "./inline/AddFieldButton";
import { DollarSign, Check } from "lucide-react";
import {
  AdminTable,
  AdminTableBody,
  AdminTableCell,
  AdminTableHead,
  AdminTableHeader,
  AdminTableRow,
} from "@/components/admin/AdminUI";
import { AdminCheckbox } from "@/components/admin/AdminFormPrimitives";
import { AdminAvatar } from "@/components/admin/AdminPrimitives";
import { AdminButton } from "@/components/admin";
import { TableSkeleton } from "@/components/admin/DatabaseView";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { 
  ChevronDown, 
  Mail, 
  FileText,
  ExternalLink,
  Plus
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { supabase } from "@/integrations/supabase/client";

// Fetch owner data for display
function useOwnerData(eventId: string | undefined, entityType: string | undefined) {
  return useAuthQuery({
    queryKey: ["entity-owners", eventId, entityType],
    queryFn: async () => {
      if (!eventId || !entityType) return { ownership: {}, profiles: {} };
      
      // Fetch ownership data
      const { data: ownershipData } = await supabase
        .from("entity_ownership")
        .select("entity_id, owner_id")
        .eq("event_id", eventId)
        .eq("entity_type", entityType);
      
      const ownership: Record<string, string> = {};
      const ownerIds = new Set<string>();
      
      for (const o of ownershipData || []) {
        if (o.owner_id) {
          ownership[o.entity_id] = o.owner_id;
          ownerIds.add(o.owner_id);
        }
      }
      
      // Fetch profile data for owners
      const profiles: Record<string, { name: string; avatar?: string }> = {};
      if (ownerIds.size > 0) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", Array.from(ownerIds));
        
        for (const p of profileData || []) {
          profiles[p.id] = {
            name: p.full_name || "Unknown",
            avatar: p.avatar_url || undefined,
          };
        }
      }
      
      return { ownership, profiles };
    },
    enabled: !!eventId && !!entityType,
  });
}

export function PipelineTableView() {
  const navigate = useNavigate();
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  
  const {
    config,
    stages,
    fields,
    tableFields,
    records,
    isLoading,
    selectedRecord,
    setSelectedRecord,
    setIsDrawerOpen,
    selectedIds,
    toggleSelection,
    selectAll,
    clearSelection,
    getStage,
    updateStatus,
  } = usePipeline();

  // Get owner data
  const { data: ownerData } = useOwnerData(
    records[0]?.event_id, 
    config?.slug
  );

  // Get record progress data for all records
  const recordIds = useMemo(() => records.map(r => r.id), [records]);
  const { data: progressData } = useRecordProgress({
    entityType: config?.slug || "vendor",
    recordIds,
    enabled: !!config?.slug && recordIds.length > 0,
  });

  // Get payment data for pipelines with payments enabled
  const { data: paymentsData } = usePipelinePaymentsBulk({
    pipelineConfigId: config?.id,
    entityIds: recordIds,
    eventId: records[0]?.event_id || null,
  });

  if (isLoading) {
    return <TableSkeleton />;
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center border border-dashed border-[hsl(var(--admin-border))] rounded-lg bg-[hsl(var(--admin-surface))]">
        <div className="w-14 h-14 rounded-full bg-[hsl(var(--admin-accent-subtle))] flex items-center justify-center mb-4">
          <Plus className="w-7 h-7 text-[hsl(var(--admin-accent))]" />
        </div>
        <h3 className="text-base font-medium text-[hsl(var(--admin-foreground))] mb-1">
          No {config?.name_plural?.toLowerCase() || "records"} yet
        </h3>
        <p className="text-sm text-[hsl(var(--admin-muted-foreground))] mb-4 max-w-[280px]">
          Add your first {config?.name_singular?.toLowerCase() || "record"} to start managing your pipeline
        </p>
        <AdminButton variant="admin" size="sm" onClick={() => {
          // Trigger add dialog via context - this is handled in parent
          const addButton = document.querySelector('[data-add-trigger]') as HTMLButtonElement;
          addButton?.click();
        }}>
          <Plus className="w-4 h-4 mr-1.5" />
          Add {config?.name_singular || "Record"}
        </AdminButton>
      </div>
    );
  }

  const handleRowClick = (record: typeof records[0]) => {
    setSelectedRecord(record);
    setIsDrawerOpen(true);
  };

  const handleStatusChange = (recordId: string, newStatus: string) => {
    updateStatus(recordId, newStatus);
  };

  const handleEmailClick = (e: React.MouseEvent, record: typeof records[0]) => {
    e.stopPropagation();
    // Navigate to email composer with this entity
    navigate(`/admin/${config?.slug}s?compose=${record.id}`);
  };

  const allSelected = records.length > 0 && selectedIds.length === records.length;
  const someSelected = selectedIds.length > 0 && selectedIds.length < records.length;

  // Get name field (first 'header' group field with 'name' in slug)
  const nameField = tableFields.find(f => f.field_group === "header" && f.slug.includes("name"));
  const companyField = tableFields.find(f => f.slug === "company_name" || f.slug === "business_name");
  const statusField = tableFields.find(f => f.slug === "pipeline_status");
  
  // Other displayable fields (excluding already handled)
  const otherFields = tableFields.filter(f => 
    f.slug !== nameField?.slug && 
    f.slug !== companyField?.slug && 
    f.slug !== "pipeline_status"
  ).slice(0, 3); // Limit to make room for owner column

  return (
    <div className="border border-[hsl(var(--admin-border))] rounded-lg overflow-x-auto">
      <AdminTable className="min-w-[800px]">
        <AdminTableHeader className="bg-[hsl(var(--admin-surface))]">
          <AdminTableRow>
            <AdminTableHead className="w-10">
              <AdminCheckbox
                checked={allSelected}
                // @ts-ignore - indeterminate is valid
                indeterminate={someSelected}
                onCheckedChange={() => allSelected ? clearSelection() : selectAll()}
              />
            </AdminTableHead>
            <AdminTableHead className="min-w-[200px]">
              {config?.name_singular || "Name"}
            </AdminTableHead>
            {statusField && (
              <AdminTableHead className="w-[140px]">Status</AdminTableHead>
            )}
            <AdminTableHead className="w-[120px]">Progress</AdminTableHead>
            {config?.has_payments && (
              <AdminTableHead className="w-[100px]">Deposit</AdminTableHead>
            )}
            <AdminTableHead className="w-[100px]">Owner</AdminTableHead>
            {otherFields.map(field => (
              <AdminTableHead 
                key={field.id} 
                className="whitespace-nowrap"
                style={{ width: field.column_width }}
              >
                <FieldHeaderEditor field={field}>
                  {field.name}
                </FieldHeaderEditor>
              </AdminTableHead>
            ))}
            <AdminTableHead className="w-[100px]">Updated</AdminTableHead>
            <AdminTableHead className="w-[80px]">
              {config && (
                <AddFieldButton pipelineId={config.id} existingFieldCount={tableFields.length} />
              )}
            </AdminTableHead>
          </AdminTableRow>
        </AdminTableHeader>
        <AdminTableBody>
          {records.map((record) => {
            const stage = getStage(String(record.pipeline_status || ""));
            const name = nameField ? String(record[nameField.slug] || "") : String(record.name || "");
            const company = companyField ? String(record[companyField.slug] || "") : "";
            const isHovered = hoveredRow === record.id;
            
            // Get owner info
            const ownerId = ownerData?.ownership[record.id];
            const ownerProfile = ownerId ? ownerData?.profiles[ownerId] : null;
            
            // Get progress info
            const progress = progressData?.[record.id] || {
              hasContact: false,
              hasContract: false,
              hasDocument: false,
              hasEmail: false,
            };
            
            return (
              <AdminTableRow
                key={record.id}
                className={cn(
                  "cursor-pointer transition-colors",
                  isHovered 
                    ? "bg-[hsl(var(--admin-surface-hover))]" 
                    : "hover:bg-[hsl(var(--admin-surface-hover))]"
                )}
                onClick={() => handleRowClick(record)}
                onMouseEnter={() => setHoveredRow(record.id)}
                onMouseLeave={() => setHoveredRow(null)}
              >
                <AdminTableCell onClick={(e) => e.stopPropagation()}>
                  <AdminCheckbox
                    checked={selectedIds.includes(record.id)}
                    onCheckedChange={() => toggleSelection(record.id)}
                  />
                </AdminTableCell>
                <AdminTableCell>
                  <div className="flex items-center gap-3">
                    <AdminAvatar name={company || name} type={(config?.slug as "vendor" | "artist" | "artisan" | "partner") || "default"} size="sm" />
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-[hsl(var(--admin-foreground))] truncate">
                        {company || name}
                      </p>
                      {company && name && (
                        <p className="text-xs text-[hsl(var(--admin-muted-foreground))] truncate">
                          {name}
                        </p>
                      )}
                    </div>
                  </div>
                </AdminTableCell>
                {statusField && (
                  <AdminTableCell onClick={(e) => e.stopPropagation()}>
                    {/* Inline Status Dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <AdminButton variant="ghost" size="sm" className="h-auto p-0 gap-1 group">
                          <PipelineStatusBadge stage={stage} size="sm" />
                          <ChevronDown className="w-3 h-3 text-[hsl(var(--admin-muted-foreground))] opacity-0 group-hover:opacity-100 transition-opacity" />
                        </AdminButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-40 bg-[hsl(var(--admin-overlay-bg))] border-[hsl(var(--admin-overlay-border))]">
                        {stages.map(s => (
                          <DropdownMenuItem
                            key={s.id}
                            onClick={() => handleStatusChange(record.id, s.slug)}
                            className={cn(
                              "flex items-center gap-2 cursor-pointer",
                              record.pipeline_status === s.slug && "bg-[hsl(var(--admin-surface))]"
                            )}
                          >
                            <span 
                              className="w-2 h-2 rounded-full" 
                              style={{ backgroundColor: s.color }}
                            />
                            {s.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </AdminTableCell>
                )}
                {/* Progress Column - Stage */}
                <AdminTableCell>
                  {stage && (
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: stage.color }}
                      />
                      <span className="text-[11px] font-medium text-[hsl(var(--admin-foreground))] truncate max-w-[80px]">
                        {stage.name}
                      </span>
                    </div>
                  )}
                </AdminTableCell>
                {/* Deposit Column */}
                {config?.has_payments && (
                  <AdminTableCell>
                    {(() => {
                      const payment = paymentsData?.[record.id];
                      if (!payment?.deposit_amount) {
                        return <span className="text-xs text-[hsl(var(--admin-muted-foreground))]">—</span>;
                      }
                      return (
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-[hsl(var(--admin-success))] bg-[hsl(var(--admin-success)/0.1)] px-2 py-0.5 rounded-full">
                            <Check className="w-3 h-3" />
                            ${payment.deposit_amount.toLocaleString()}
                          </span>
                        </div>
                      );
                    })()}
                  </AdminTableCell>
                )}
                {/* Owner Column */}
                <AdminTableCell>
                  {ownerProfile ? (
                    <div className="flex items-center gap-2" title={ownerProfile.name}>
                      {ownerProfile.avatar ? (
                        <img 
                          src={ownerProfile.avatar} 
                          alt={ownerProfile.name}
                          className="w-6 h-6 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-[hsl(var(--admin-accent-subtle))] flex items-center justify-center">
                          <span className="text-xs font-medium text-[hsl(var(--admin-accent))]">
                            {ownerProfile.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <span className="text-xs text-[hsl(var(--admin-muted-foreground))] truncate max-w-[60px]">
                        {ownerProfile.name.split(" ")[0]}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-[hsl(var(--admin-muted-foreground))]">—</span>
                  )}
                </AdminTableCell>
                {otherFields.map(field => (
                  <AdminTableCell key={field.id}>
                    <span className="text-sm text-[hsl(var(--admin-foreground))]">
                      {getFieldDisplayValue(record, field)}
                    </span>
                  </AdminTableCell>
                ))}
                <AdminTableCell>
                  <span className="text-xs text-[hsl(var(--admin-muted-foreground))]">
                    {record.updated_at 
                      ? formatDistanceToNow(new Date(record.updated_at), { addSuffix: true })
                      : "—"
                    }
                  </span>
                </AdminTableCell>
                {/* Quick Actions Column */}
                <AdminTableCell onClick={(e) => e.stopPropagation()}>
                  <div className={cn(
                    "flex items-center gap-1 transition-opacity",
                    isHovered ? "opacity-100" : "opacity-0"
                  )}>
                    <AdminButton
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => handleEmailClick(e, record)}
                      title="Send email"
                    >
                      <Mail className="w-3.5 h-3.5" />
                    </AdminButton>
                    <AdminButton
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRowClick(record);
                      }}
                      title="View details"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </AdminButton>
                  </div>
                </AdminTableCell>
              </AdminTableRow>
            );
          })}
        </AdminTableBody>
      </AdminTable>
    </div>
  );
}
