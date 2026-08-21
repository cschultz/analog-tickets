import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminCard, AdminCardContent, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import { AdminButton, AdminBadge } from "@/components/admin/AdminUI";
import { RefreshCw, Users, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getFunctionUrl } from "@/platform/config/env";

interface SyncResult {
  success: boolean;
  audience_id?: string;
  audience_name?: string;
  users_synced?: number;
  synced_at?: string;
  error?: string;
}

export function MetaAudienceSync() {
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("You must be logged in");
        return;
      }

      const res = await fetch(
        getFunctionUrl('sync-meta-audience'),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({}),
        }
      );

      const data: SyncResult = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Sync failed");
      }

      setLastResult(data);
      toast.success(`Synced ${data.users_synced} purchasers to Meta`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Audience sync failed: ${msg}`);
      setLastResult({ success: false, error: msg });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <AdminCard>
      <AdminCardHeader>
        <div className="flex items-center justify-between">
          <AdminCardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Meta Exclude Audience
          </AdminCardTitle>
          <AdminButton
            onClick={handleSync}
            disabled={syncing}
            size="sm"
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {syncing ? "Syncing…" : "Sync Now"}
          </AdminButton>
        </div>
      </AdminCardHeader>
      <AdminCardContent>
        <p className="text-sm text-[hsl(var(--admin-text-muted))] mb-3">
          Pushes all ticket purchaser emails to a Meta Custom Audience called{" "}
          <span className="font-medium text-[hsl(var(--admin-text))]">"Cosmico 2026 Ticket Purchasers"</span>.
          Use this as an exclusion audience in Ads Manager. Auto-syncs daily.
        </p>

        {lastResult && (
          <div className="flex items-center gap-3 mt-3 p-3 rounded-lg bg-[hsl(var(--admin-surface-alt))]">
            {lastResult.success ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--admin-success))] shrink-0" />
                <div className="text-sm">
                  <span className="font-medium text-[hsl(var(--admin-text))]">
                    {lastResult.users_synced} purchasers synced
                  </span>
                  <span className="text-[hsl(var(--admin-text-muted))] ml-2">
                    {lastResult.synced_at && new Date(lastResult.synced_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}
                  </span>
                </div>
                <AdminBadge intent="success" className="ml-auto">
                  Live
                </AdminBadge>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 text-[hsl(var(--admin-error))] shrink-0" />
                <span className="text-sm text-[hsl(var(--admin-error))]">
                  {lastResult.error}
                </span>
              </>
            )}
          </div>
        )}
      </AdminCardContent>
    </AdminCard>
  );
}
