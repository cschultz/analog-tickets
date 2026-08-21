/**
 * Brand Voice History
 * 
 * Admin UI for viewing and restoring previous brand voice versions
 */

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminCard, AdminCardContent, AdminCardDescription, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import { AdminButton } from "@/components/admin";
import { AdminConfirmDialog } from "@/components/admin/AdminConfirmDialog";
import { toast } from "sonner";
import { History, RotateCcw, Eye, ChevronDown, ChevronUp } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { format } from "date-fns";

interface BrandVoice {
  id: string;
  version: number;
  name: string;
  is_active: boolean;
  tone_description: string;
  message_pillars: string[];
  writing_rules: string[];
  anti_patterns: string[];
  system_prompt: string;
  created_at: string;
  updated_at: string;
  notes: string | null;
}

export function BrandVoiceHistory() {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<BrandVoice | null>(null);

  // Fetch all brand voice versions
  const { data: versions, isLoading } = useAuthQuery({
    queryKey: ["brand-voice-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_brand_voice")
        .select("*")
        .order("version", { ascending: false });
      
      if (error) throw error;
      return data as BrandVoice[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Restore mutation - deactivate all then activate selected
  const restoreMutation = useMutation({
    mutationFn: async (targetVersion: BrandVoice) => {
      // First, deactivate all versions
      const { error: deactivateError } = await supabase
        .from("social_brand_voice")
        .update({ is_active: false })
        .neq("id", "00000000-0000-0000-0000-000000000000"); // Match all

      if (deactivateError) throw deactivateError;

      // Then activate the target version
      const { error: activateError } = await supabase
        .from("social_brand_voice")
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq("id", targetVersion.id);

      if (activateError) throw activateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brand-voice-history"] });
      queryClient.invalidateQueries({ queryKey: ["brand-voice-active"] });
      toast.success("Brand voice restored");
      setRestoreTarget(null);
    },
    onError: (error) => {
      console.error("Failed to restore brand voice:", error);
      toast.error("Failed to restore brand voice");
    },
  });

  if (isLoading) {
    return (
      <AdminCard>
        <AdminCardContent className="py-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[hsl(var(--admin-primary))]" />
          </div>
        </AdminCardContent>
      </AdminCard>
    );
  }

  if (!versions?.length) {
    return null;
  }

  // Only show if there's more than one version
  if (versions.length <= 1) {
    return null;
  }

  return (
    <>
      <AdminCard>
        <AdminCardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
            <AdminCardTitle className="text-base font-semibold">Voice History</AdminCardTitle>
          </div>
          <AdminCardDescription className="text-xs">
            {versions.length} version{versions.length !== 1 ? "s" : ""} saved
          </AdminCardDescription>
        </AdminCardHeader>

        <AdminCardContent className="space-y-2">
          {versions.map((version) => (
            <div
              key={version.id}
              className={`border rounded-lg transition-colors ${
                version.is_active
                  ? "border-[hsl(var(--admin-accent))] bg-[hsl(var(--admin-accent)/0.05)]"
                  : "border-[hsl(var(--admin-border))]"
              }`}
            >
              {/* Header row */}
              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{version.name}</span>
                      {version.is_active && (
                        <span className="px-1.5 py-0.5 text-xs rounded bg-[hsl(var(--admin-accent)/0.15)] text-[hsl(var(--admin-accent))]">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[hsl(var(--admin-text-muted))]">
                      v{version.version} • Updated {format(new Date(version.updated_at), "MMM d, yyyy")}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-1">
                  {!version.is_active && (
                    <AdminButton
                      variant="ghost"
                      size="sm"
                      onClick={() => setRestoreTarget(version)}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Restore
                    </AdminButton>
                  )}
                  <AdminButton
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpandedId(expandedId === version.id ? null : version.id)}
                  >
                    {expandedId === version.id ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </AdminButton>
                </div>
              </div>

              {/* Expanded details */}
              {expandedId === version.id && (
                <div className="px-3 pb-3 pt-0 border-t border-[hsl(var(--admin-border))] mt-0">
                  <div className="pt-3 space-y-3">
                    {version.notes && (
                      <div>
                        <span className="text-xs text-[hsl(var(--admin-text-muted))]">Notes:</span>
                        <p className="text-sm">{version.notes}</p>
                      </div>
                    )}
                    
                    <div>
                      <span className="text-xs text-[hsl(var(--admin-text-muted))]">Tone:</span>
                      <p className="text-sm">{version.tone_description}</p>
                    </div>

                    <div>
                      <span className="text-xs text-[hsl(var(--admin-text-muted))]">Pillars:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {version.message_pillars?.map((pillar, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 text-xs rounded-full bg-[hsl(var(--admin-surface-hover))]"
                          >
                            {pillar}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-xs text-[hsl(var(--admin-text-muted))]">Anti-patterns:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {version.anti_patterns?.map((pattern, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 text-xs rounded-full bg-[hsl(var(--admin-error)/0.1)] text-[hsl(var(--admin-error))]"
                          >
                            {pattern}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </AdminCardContent>
      </AdminCard>

      {/* Restore confirmation dialog */}
      <AdminConfirmDialog
        open={!!restoreTarget}
        onOpenChange={(open) => !open && setRestoreTarget(null)}
        onConfirm={() => restoreTarget && restoreMutation.mutate(restoreTarget)}
        title="Restore Brand Voice"
        description={`This will make "${restoreTarget?.name}" (v${restoreTarget?.version}) the active brand voice. All caption generation will use this version.`}
        actionLabel="Restore"
        actionType="warning"
        icon="warning"
        isLoading={restoreMutation.isPending}
      />
    </>
  );
}
