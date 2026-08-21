import { usePipeline } from "../PipelineContext";
import { AdminButton, AdminBadge } from "@/components/admin";
import { AdminCard, AdminCardContent } from "@/components/admin/AdminCard";
import { Mail, Send, Users } from "lucide-react";
import { EntityEmailHistory } from "@/components/production/EntityEmailHistory";
import { PipelineEmailComposer } from "./PipelineEmailComposer";
import { PipelineBulkEmailer } from "./PipelineBulkEmailer";
import { useState } from "react";

export function PipelineEmailModule() {
  const { config, selectedRecord } = usePipeline();
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isBulkEmailerOpen, setIsBulkEmailerOpen] = useState(false);

  if (!config?.has_email || !selectedRecord) return null;

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <AdminCard className="bg-[hsl(var(--admin-surface))]">
        <AdminCardContent className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[hsl(var(--admin-foreground))]">Send Email</p>
              <p className="text-xs text-[hsl(var(--admin-muted-foreground))]">
                Compose a message to this {config.name_singular.toLowerCase()}
              </p>
            </div>
            <div className="flex gap-2">
              <AdminButton variant="adminOutline" size="sm" onClick={() => setIsBulkEmailerOpen(true)}>
                <Users className="w-3.5 h-3.5 mr-1.5" />
                Bulk Email
              </AdminButton>
              <AdminButton variant="admin" size="sm" onClick={() => setIsComposerOpen(true)}>
                <Send className="w-3.5 h-3.5 mr-1.5" />
                Compose
              </AdminButton>
            </div>
          </div>
        </AdminCardContent>
      </AdminCard>

      {/* Email History */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-[hsl(var(--admin-foreground))]">
          Email History
        </h3>
        <EntityEmailHistory 
          entityType={config.slug as "vendor" | "artisan" | "partner"} 
          entityId={selectedRecord.id as string} 
        />
      </div>

      {/* Email Composer Dialog */}
      <PipelineEmailComposer 
        isOpen={isComposerOpen} 
        onClose={() => setIsComposerOpen(false)} 
      />

      {/* Bulk Emailer Sheet */}
      <PipelineBulkEmailer
        isOpen={isBulkEmailerOpen}
        onClose={() => setIsBulkEmailerOpen(false)}
      />
    </div>
  );
}
