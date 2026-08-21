import { useState } from "react";
import { AdminButton } from "@/components/admin";
import { AdminCard, AdminCardContent, AdminCardDescription, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, XCircle, AlertCircle, Loader2 } from "lucide-react";

export const VerifyPendingPayments = () => {
  const [isVerifying, setIsVerifying] = useState(false);
  const [results, setResults] = useState<any>(null);

  const handleVerify = async () => {
    setIsVerifying(true);
    setResults(null);

    try {
      const { data, error } = await supabase.functions.invoke('verify-pending-payments');

      if (error) {
        toast.error('Failed to verify payments');
        console.error('Error:', error);
        return;
      }

      setResults(data);
      
      if (data.verified > 0) {
        toast.success(`Successfully verified ${data.verified} payment${data.verified > 1 ? 's' : ''}`);
      } else {
        toast.info('No new payments to verify');
      }
    } catch (error) {
      console.error('Error verifying payments:', error);
      toast.error('An error occurred while verifying payments');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <AdminCard>
      <AdminCardHeader>
        <AdminCardTitle>Verify Pending Payments</AdminCardTitle>
        <AdminCardDescription>
          Check Stripe for completed payments that haven't been verified yet. 
          This fixes payments where customers closed the window after paying.
        </AdminCardDescription>
      </AdminCardHeader>
      <AdminCardContent className="space-y-4">
        <AdminButton 
          variant="admin"
          onClick={handleVerify} 
          disabled={isVerifying}
          className="w-full"
        >
          {isVerifying ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Verifying Payments...
            </>
          ) : (
            'Verify Pending Payments'
          )}
        </AdminButton>

        {results && (
          <div className="space-y-3 pt-4 border-t border-[hsl(var(--admin-border))]">
            <div className="text-sm font-medium">Verification Results:</div>
            
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--admin-success))]" />
                <span className="font-medium">{results.verified}</span>
                <span className="text-[hsl(var(--admin-text-muted))]">verified and updated</span>
              </div>

              {results.notPaid > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <AlertCircle className="h-4 w-4 text-[hsl(var(--admin-warning))]" />
                  <span className="font-medium">{results.notPaid}</span>
                  <span className="text-[hsl(var(--admin-text-muted))]">still unpaid in Stripe</span>
                </div>
              )}

              {results.failed > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <XCircle className="h-4 w-4 text-[hsl(var(--admin-error))]" />
                  <span className="font-medium">{results.failed}</span>
                  <span className="text-[hsl(var(--admin-text-muted))]">failed to process</span>
                </div>
              )}
            </div>

            <div className="text-xs text-[hsl(var(--admin-text-muted))] pt-2">
              Checked {results.total} pending registration{results.total !== 1 ? 's' : ''}
            </div>
          </div>
        )}
      </AdminCardContent>
    </AdminCard>
  );
};
