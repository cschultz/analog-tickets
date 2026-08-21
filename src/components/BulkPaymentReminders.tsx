import { useState } from "react";
import { AdminButton } from "@/components/admin";
import { AdminCard, AdminCardContent, AdminCardDescription, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import { AdminScrollArea } from "@/components/admin/AdminScrollArea";
import {
  AdminDialog,
  AdminDialogContent,
  AdminDialogHeader,
  AdminDialogTitle,
} from "@/components/admin/AdminDialog";
import { AdminConfirmDialog } from "@/components/admin/AdminConfirmDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mail, Loader2, AlertTriangle, Eye } from "lucide-react";

interface Props {
  pendingCount: number;
  eventTitle?: string;
  onComplete?: () => void;
}

interface PendingRegistration {
  id: string;
  email: string;
  name: string;
}

export const BulkPaymentReminders = ({ pendingCount, eventTitle = "the current event", onComplete }: Props) => {
  const [isSending, setIsSending] = useState(false);
  const [results, setResults] = useState<{ sent: number; failed: number } | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showDryRunDialog, setShowDryRunDialog] = useState(false);
  const [dryRunRecipients, setDryRunRecipients] = useState<PendingRegistration[]>([]);
  const [isLoadingDryRun, setIsLoadingDryRun] = useState(false);

  const handleDryRun = async () => {
    setIsLoadingDryRun(true);
    try {
      const { data: activeEvent } = await supabase
        .from('event_details')
        .select('id')
        .eq('is_active', true)
        .maybeSingle();

      if (!activeEvent) {
        toast.error('No active event found');
        return;
      }

      const { data: pendingRegistrations, error } = await supabase
        .from('registrations')
        .select('id, email, name')
        .eq('payment_status', 'pending')
        .eq('event_id', activeEvent.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setDryRunRecipients(pendingRegistrations || []);
      setShowDryRunDialog(true);
    } catch (error) {
      console.error('Error fetching dry run data:', error);
      toast.error('Failed to load recipient preview');
    } finally {
      setIsLoadingDryRun(false);
    }
  };

  const handleSendReminders = async () => {
    setShowConfirmDialog(false);
    setIsSending(true);
    setResults(null);

    try {
      // Fetch all pending registrations for the active event only
      const { data: activeEvent } = await supabase
        .from('event_details')
        .select('id, title')
        .eq('is_active', true)
        .maybeSingle();

      if (!activeEvent) {
        toast.error('No active event found');
        setIsSending(false);
        return;
      }

      const { data: pendingRegistrations, error: fetchError } = await supabase
        .from('registrations')
        .select('id, email, name')
        .eq('payment_status', 'pending')
        .eq('event_id', activeEvent.id);

      if (fetchError) throw fetchError;

      if (!pendingRegistrations || pendingRegistrations.length === 0) {
        toast.info('No pending registrations to send reminders to');
        return;
      }

      let sent = 0;
      let failed = 0;

      // Send reminders one by one
      for (const registration of pendingRegistrations) {
        try {
          const { error } = await supabase.functions.invoke('send-payment-reminder', {
            body: { registrationId: registration.id }
          });

          if (error) {
            console.error(`Failed to send reminder for registration ${registration.id}:`, error);
            failed++;
          } else {
            sent++;
          }

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error(`Error sending reminder for registration ${registration.id}:`, error);
          failed++;
        }
      }

      setResults({ sent, failed });
      
      if (sent > 0) {
        toast.success(`Sent ${sent} payment reminder${sent > 1 ? 's' : ''}`);
      }
      
      if (failed > 0) {
        toast.error(`Failed to send ${failed} reminder${failed > 1 ? 's' : ''}`);
      }

      onComplete?.();
    } catch (error) {
      console.error('Error sending bulk reminders:', error);
      toast.error('Failed to send payment reminders');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle>Bulk Payment Reminders</AdminCardTitle>
          <AdminCardDescription>
            Send payment reminders to customers with pending purchases for {eventTitle}
          </AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-sm">
            <p className="font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Only sends to active event registrations
            </p>
            <p className="mt-1 text-amber-700">
              Reminders will only be sent to pending registrations for the currently active event, not past events.
            </p>
          </div>

          <div className="text-sm text-muted-foreground">
            {pendingCount} pending registration{pendingCount !== 1 ? 's' : ''} found
          </div>

          <div className="flex gap-2">
            <AdminButton
              variant="adminOutline"
              onClick={handleDryRun}
              disabled={isSending || pendingCount === 0 || isLoadingDryRun}
              className="flex-1"
            >
              {isLoadingDryRun ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Eye className="mr-2 h-4 w-4" />
              )}
              Preview Recipients
            </AdminButton>
            <AdminButton
              variant="admin"
              onClick={() => setShowConfirmDialog(true)}
              disabled={isSending || pendingCount === 0}
              className="flex-1"
            >
              {isSending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Send All
                </>
              )}
            </AdminButton>
          </div>

          {results && (
            <div className="pt-4 border-t space-y-2">
              <div className="text-sm">
                <span className="font-medium text-green-600">{results.sent}</span> sent successfully
              </div>
              {results.failed > 0 && (
                <div className="text-sm">
                  <span className="font-medium text-red-600">{results.failed}</span> failed to send
                </div>
              )}
            </div>
          )}
        </AdminCardContent>
      </AdminCard>

      <AdminDialog open={showDryRunDialog} onOpenChange={setShowDryRunDialog}>
        <AdminDialogContent className="bg-[hsl(var(--admin-surface))] sm:max-w-[500px] max-h-[80vh]">
          <AdminDialogHeader>
            <AdminDialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-[hsl(var(--admin-accent))]" />
              Dry Run Preview - Payment Reminders
            </AdminDialogTitle>
          </AdminDialogHeader>
          
          <div className="space-y-4">
            <div className="bg-[hsl(var(--admin-info-muted))] border border-[hsl(var(--admin-info))]/30 rounded-lg p-4 text-[hsl(var(--admin-info))]">
              <p className="font-semibold flex items-center gap-2">
                <Eye className="h-4 w-4" />
                This is a preview - no emails will be sent
              </p>
              <p className="text-sm mt-1 text-[hsl(var(--admin-text-secondary))]">
                Review the {dryRunRecipients.length} recipients below before sending.
              </p>
            </div>

            <div>
              <p className="text-sm font-medium mb-2 text-[hsl(var(--admin-text))]">
                {dryRunRecipients.length} pending registration{dryRunRecipients.length !== 1 ? 's' : ''} will receive payment reminders:
              </p>
              <AdminScrollArea className="h-[250px] border border-[hsl(var(--admin-border))] rounded-md">
                <div className="p-2 space-y-1">
                  {dryRunRecipients.map((reg, index) => (
                    <div 
                      key={reg.id} 
                      className="flex items-center gap-3 p-2 rounded-md hover:bg-[hsl(var(--admin-hover))]"
                    >
                      <span className="text-xs text-[hsl(var(--admin-text-muted))] w-6">{index + 1}.</span>
                      <div>
                        <p className="text-sm font-medium text-[hsl(var(--admin-text))]">{reg.name}</p>
                        <p className="text-xs text-[hsl(var(--admin-text-muted))]">{reg.email}</p>
                      </div>
                    </div>
                  ))}
                  {dryRunRecipients.length === 0 && (
                    <div className="p-4 text-center text-[hsl(var(--admin-text-muted))]">
                      No pending registrations found
                    </div>
                  )}
                </div>
              </AdminScrollArea>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <AdminButton variant="adminOutline" onClick={() => setShowDryRunDialog(false)}>
                Close Preview
              </AdminButton>
              <AdminButton
                variant="admin"
                onClick={() => {
                  setShowDryRunDialog(false);
                  setShowConfirmDialog(true);
                }}
                disabled={dryRunRecipients.length === 0}
                className="gap-2"
              >
                <Mail className="w-4 h-4" />
                Proceed to Send
              </AdminButton>
            </div>
          </div>
        </AdminDialogContent>
      </AdminDialog>

      <AdminConfirmDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        title="Confirm Bulk Payment Reminders"
        description={`You are about to send payment reminder emails to ${pendingCount} people with pending registrations for ${eventTitle}.`}
        consequences={[
          "You want to remind these users to complete their payment",
          "The email template has been reviewed",
          "This will only send to the active event's pending registrations",
        ]}
        scope={`${pendingCount} pending registration${pendingCount !== 1 ? 's' : ''}`}
        actionType="warning"
        actionLabel={`Yes, Send ${pendingCount} Reminder${pendingCount !== 1 ? 's' : ''}`}
        onConfirm={handleSendReminders}
        icon="warning"
      />
    </>
  );
};
