import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminButton, AdminBadge } from "@/components/admin/AdminUI";
import { AdminCard, AdminCardContent, AdminCardDescription, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import { Loader2, RefreshCw, AlertCircle, CheckCircle, Clock, XCircle } from "lucide-react";
import { toast } from "sonner";

interface SyncResult {
  total: number;
  synced: number;
  expired: number;
  abandoned: number;
  declined: number;
  completed: number;
  errors: number;
  details: Array<{
    id: string;
    name: string;
    status: string;
    checkoutStatus: string | null;
    errorCode: string | null;
    errorMessage?: string | null;
  }>;
}

// Human-readable decline code explanations
const DECLINE_REASONS: Record<string, string> = {
  'card_declined': 'Card was declined by the issuer',
  'insufficient_funds': 'Insufficient funds in account',
  'lost_card': 'Card reported lost',
  'stolen_card': 'Card reported stolen',
  'expired_card': 'Card has expired',
  'incorrect_cvc': 'Incorrect CVC code entered',
  'processing_error': 'Processing error occurred',
  'incorrect_number': 'Invalid card number',
  'authentication_required': 'Additional authentication needed (3D Secure)',
  'card_not_supported': 'Card type not supported',
  'currency_not_supported': 'Currency not supported by card',
  'duplicate_transaction': 'Duplicate transaction detected',
  'fraudulent': 'Transaction flagged as potentially fraudulent',
  'generic_decline': 'Card declined - contact bank for details',
  'invalid_account': 'Invalid account',
  'invalid_amount': 'Invalid amount',
  'new_account_information_available': 'Account info has changed',
  'no_action_taken': 'No action taken by issuer',
  'not_permitted': 'Transaction not permitted',
  'pickup_card': 'Card should be picked up',
  'restricted_card': 'Card is restricted',
  'revocation_of_all_authorizations': 'All authorizations revoked',
  'revocation_of_authorization': 'Authorization revoked',
  'security_violation': 'Security violation',
  'service_not_allowed': 'Service not allowed',
  'stop_payment_order': 'Stop payment order on card',
  'transaction_not_allowed': 'Transaction not allowed',
  'try_again_later': 'Temporary issue - try again later',
  'withdrawal_count_limit_exceeded': 'Withdrawal limit exceeded',
};

export function SyncPendingCheckouts() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-pending-checkouts");

      if (error) throw error;

      setLastResult(data);
      
      if (data.synced > 0) {
        toast.success(`Synced ${data.synced} registrations`, {
          description: `${data.expired} expired, ${data.abandoned} abandoned, ${data.declined} declined, ${data.completed} completed`
        });
      } else if (data.total === 0) {
        toast.info("No pending registrations to sync");
      } else {
        toast.warning("Sync completed with issues", {
          description: `${data.errors} errors occurred`
        });
      }
    } catch (error: any) {
      console.error("Sync error:", error);
      toast.error("Failed to sync checkouts", {
        description: error.message
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const getStatusBadge = (checkoutStatus: string | null) => {
    switch (checkoutStatus) {
      case 'expired':
        return <AdminBadge intent="neutral" className="gap-1"><Clock className="h-3 w-3" /> Expired</AdminBadge>;
      case 'abandoned':
        return <AdminBadge intent="warning" className="gap-1"><AlertCircle className="h-3 w-3" /> Abandoned</AdminBadge>;
      case 'declined':
        return <AdminBadge intent="danger" className="gap-1"><XCircle className="h-3 w-3" /> Declined</AdminBadge>;
      case 'complete':
        return <AdminBadge intent="success" className="gap-1"><CheckCircle className="h-3 w-3" /> Completed</AdminBadge>;
      default:
        return <AdminBadge intent="neutral">{checkoutStatus || 'Unknown'}</AdminBadge>;
    }
  };

  return (
    <AdminCard>
      <AdminCardHeader>
        <AdminCardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          Sync Pending Checkouts
        </AdminCardTitle>
        <AdminCardDescription>
          Check all pending registrations against Stripe to identify expired, abandoned, or declined payments
        </AdminCardDescription>
      </AdminCardHeader>
      <AdminCardContent className="space-y-4">
        <AdminButton 
          onClick={handleSync} 
          disabled={isSyncing}
          variant="admin"
          className="w-full"
        >
          {isSyncing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Syncing with Stripe...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Sync Pending Registrations
            </>
          )}
        </AdminButton>

        {lastResult && (
          <div className="space-y-4">
            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-[hsl(var(--admin-surface-hover))]">
                <div className="text-2xl font-bold">{lastResult.total}</div>
                <div className="text-xs text-[hsl(var(--admin-text-muted))]">Total Pending</div>
              </div>
              <div className="p-3 rounded-lg bg-[hsl(var(--admin-surface-hover))]">
                <div className="text-2xl font-bold text-amber-500">{lastResult.expired}</div>
                <div className="text-xs text-[hsl(var(--admin-text-muted))]">Expired</div>
              </div>
              <div className="p-3 rounded-lg bg-[hsl(var(--admin-surface-hover))]">
                <div className="text-2xl font-bold text-[hsl(var(--admin-warning))]">{lastResult.abandoned}</div>
                <div className="text-xs text-[hsl(var(--admin-text-muted))]">Abandoned</div>
              </div>
              <div className="p-3 rounded-lg bg-[hsl(var(--admin-surface-hover))]">
                <div className="text-2xl font-bold text-[hsl(var(--admin-error))]">{lastResult.declined}</div>
                <div className="text-xs text-[hsl(var(--admin-text-muted))]">Declined</div>
              </div>
              <div className="p-3 rounded-lg bg-[hsl(var(--admin-surface-hover))]">
                <div className="text-2xl font-bold text-green-500">{lastResult.completed}</div>
                <div className="text-xs text-[hsl(var(--admin-text-muted))]">Completed</div>
              </div>
              <div className="p-3 rounded-lg bg-[hsl(var(--admin-surface-hover))]">
                <div className="text-2xl font-bold text-red-400">{lastResult.errors}</div>
                <div className="text-xs text-[hsl(var(--admin-text-muted))]">Errors</div>
              </div>
            </div>

            {/* Detailed Results */}
            {lastResult.details.length > 0 && (
              <div className="border border-[hsl(var(--admin-border))] rounded-lg overflow-hidden">
                <div className="p-3 bg-[hsl(var(--admin-surface-hover))] border-b border-[hsl(var(--admin-border))]">
                  <h4 className="font-medium text-sm">Sync Details</h4>
                </div>
                <div className="max-h-64 overflow-y-auto">
                    {lastResult.details.map((detail) => (
                      <div 
                        key={detail.id} 
                        className="p-3 border-b border-[hsl(var(--admin-border))] last:border-b-0"
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-sm">{detail.name}</div>
                          {getStatusBadge(detail.checkoutStatus)}
                        </div>
                        {detail.errorCode && (
                          <div className="mt-2 p-2 rounded bg-red-500/10 border border-red-500/20">
                            <div className="text-xs font-medium text-red-400">
                              {DECLINE_REASONS[detail.errorCode] || detail.errorCode}
                            </div>
                            {detail.errorMessage && (
                              <div className="text-xs text-[hsl(var(--admin-text-muted))] mt-1">
                                {detail.errorMessage}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </AdminCardContent>
    </AdminCard>
  );
}
