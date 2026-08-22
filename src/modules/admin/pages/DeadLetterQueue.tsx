import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, RefreshCw, Trash2, RotateCcw, Loader2, Inbox } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard, AdminCardContent, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import {
  AdminButton,
  AdminBadge,
  AdminTable,
  AdminTableBody,
  AdminTableCell,
  AdminTableHead,
  AdminTableHeader,
  AdminTableRow,
  AdminConfirmDialog,
  AdminEmptyState,
} from "@/components/admin";

interface DeadLetterEntry {
  id: string;
  original_table: string;
  original_id: string | null;
  operation_type: string;
  payload: Record<string, unknown>;
  error_message: string | null;
  failed_at: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  resolution: string | null;
}

export default function DeadLetterQueuePage() {
  const queryClient = useQueryClient();
  const [selectedEntry, setSelectedEntry] = useState<DeadLetterEntry | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isRetrying, setIsRetrying] = useState<string | null>(null);

  const { data: entries = [], isLoading } = useAuthQuery({
    queryKey: ["dead-letter-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dead_letter_queue")
        .select("*")
        .is("reviewed_at", null)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as DeadLetterEntry[];
    },
    staleTime: 30 * 1000,
  });

  const handleRetry = async (entry: DeadLetterEntry) => {
    setIsRetrying(entry.id);
    try {
      // For checkout.session.completed, trigger webhook retry processor
      if (entry.operation_type === "checkout.session.completed") {
        const { error } = await supabase.functions.invoke("process-webhook-retries");
        if (error) throw error;
        toast.success("Retry triggered - check webhook logs");
      } else {
        toast.info("Manual retry not supported for this operation type");
      }
      queryClient.invalidateQueries({ queryKey: ["dead-letter-queue"] });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Retry failed: ${msg}`);
    } finally {
      setIsRetrying(null);
    }
  };

  const handleResolve = async () => {
    if (!selectedEntry) return;
    try {
      const { error } = await supabase
        .from("dead_letter_queue")
        .update({
          reviewed_at: new Date().toISOString(),
          resolution: "Manually resolved by admin",
        })
        .eq("id", selectedEntry.id);

      if (error) throw error;
      toast.success("Entry marked as resolved");
      queryClient.invalidateQueries({ queryKey: ["dead-letter-queue"] });
      setShowDeleteConfirm(false);
      setSelectedEntry(null);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to resolve: ${msg}`);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Dead Letter Queue"
        subtitle="Failed operations requiring manual review"
        icon={AlertTriangle}
        actions={
          <AdminButton
            variant="adminOutline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["dead-letter-queue"] })}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </AdminButton>
        }
      />

      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle>Pending Failed Operations ({entries.length})</AdminCardTitle>
        </AdminCardHeader>
        <AdminCardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--admin-text-muted))]" />
            </div>
          ) : entries.length === 0 ? (
            <AdminEmptyState
              icon={<Inbox className="w-12 h-12" />}
              title="No failed operations"
              description="All operations are processing normally"
            />
          ) : (
            <AdminTable>
              <AdminTableHeader>
                <AdminTableRow className="bg-[hsl(var(--admin-hover))]">
                  <AdminTableHead>Time</AdminTableHead>
                  <AdminTableHead>Operation</AdminTableHead>
                  <AdminTableHead>Source</AdminTableHead>
                  <AdminTableHead>Error</AdminTableHead>
                  <AdminTableHead className="text-right">Actions</AdminTableHead>
                </AdminTableRow>
              </AdminTableHeader>
              <AdminTableBody>
                {entries.map((entry) => (
                  <AdminTableRow key={entry.id} className="hover:bg-[hsl(var(--admin-hover))]">
                    <AdminTableCell className="text-sm text-[hsl(var(--admin-text-muted))]">
                      {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                    </AdminTableCell>
                    <AdminTableCell>
                      <AdminBadge intent="danger" size="sm">
                        {entry.operation_type}
                      </AdminBadge>
                    </AdminTableCell>
                    <AdminTableCell className="text-sm font-mono">
                      {entry.original_table}
                    </AdminTableCell>
                    <AdminTableCell className="max-w-xs truncate text-sm text-[hsl(var(--admin-error))]">
                      {entry.error_message || "—"}
                    </AdminTableCell>
                    <AdminTableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <AdminButton
                          variant="adminGhost"
                          size="sm"
                          onClick={() => handleRetry(entry)}
                          disabled={isRetrying === entry.id}
                        >
                          {isRetrying === entry.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RotateCcw className="w-4 h-4" />
                          )}
                        </AdminButton>
                        <AdminButton
                          variant="adminGhost"
                          size="sm"
                          onClick={() => {
                            setSelectedEntry(entry);
                            setShowDeleteConfirm(true);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </AdminButton>
                      </div>
                    </AdminTableCell>
                  </AdminTableRow>
                ))}
              </AdminTableBody>
            </AdminTable>
          )}
        </AdminCardContent>
      </AdminCard>

      <AdminConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Resolve Entry"
        description="Mark this failed operation as resolved? It will be removed from the queue but preserved in history."
        actionLabel="Resolve"
        onConfirm={handleResolve}
      />
    </div>
  );
}
