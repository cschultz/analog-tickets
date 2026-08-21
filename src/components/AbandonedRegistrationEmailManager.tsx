import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminButton, AdminConfirmDialog } from "@/components/admin";
import { AdminCard, AdminCardContent, AdminCardDescription, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import { Mail, Send, Clock, AlertTriangle, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export function AbandonedRegistrationEmailManager() {
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [activeEventTitle, setActiveEventTitle] = useState<string | null>(null);
  const [abandonedCount, setAbandonedCount] = useState<number | null>(null);

  useEffect(() => {
    fetchActiveEventAndCount();
  }, []);

  const fetchActiveEventAndCount = async () => {
    // Get active event
    const { data: event } = await supabase
      .from('event_details')
      .select('id, title')
      .eq('is_active', true)
      .maybeSingle();
    
    if (event) {
      setActiveEventTitle(event.title);
      
      // Count yesterday's abandoned registrations for this event only
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStart = new Date(yesterday.setHours(0, 0, 0, 0)).toISOString();
      const yesterdayEnd = new Date(yesterday.setHours(23, 59, 59, 999)).toISOString();
      
      const { count } = await supabase
        .from('registrations')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', event.id)
        .in('payment_status', ['pending', 'failed'])
        .gte('created_at', yesterdayStart)
        .lte('created_at', yesterdayEnd);
      
      setAbandonedCount(count || 0);
    }
  };

  const sendTestMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "send-abandoned-registration-emails"
      );

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(
        `Sent ${data.sent} email(s), skipped ${data.skipped}, ${data.errors} errors`
      );
      setTestDialogOpen(false);
      fetchActiveEventAndCount();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to send emails");
    },
  });

  return (
    <AdminCard>
      <AdminCardHeader>
        <AdminCardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Abandoned Registration Emails
        </AdminCardTitle>
        <AdminCardDescription>
          Automatic follow-up emails for incomplete registrations
        </AdminCardDescription>
      </AdminCardHeader>
      <AdminCardContent className="space-y-4">
        {/* Safety Notice */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-green-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-green-800 flex items-center gap-2">
                Protected: Only Active Event
              </h3>
              <p className="text-sm text-green-700 mt-1">
                These emails will <strong>only</strong> be sent to registrations for{" "}
                <strong>{activeEventTitle || "the active event"}</strong>.
                Past event registrations are never contacted.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-[hsl(var(--admin-surface-hover))] p-4 rounded-lg space-y-2">
          <h3 className="font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4" />
            How It Works
          </h3>
          <ul className="text-sm space-y-1 list-disc list-inside text-[hsl(var(--admin-text-muted))]">
            <li>
              Runs automatically every day at 10:00 AM to check for abandoned
              registrations from the previous day
            </li>
            <li>
              <strong>Only targets the active event</strong> - past events are never included
            </li>
            <li>
              Sends one email per person (not per failed attempt) if payment is
              pending or failed
            </li>
            <li>
              Checks if they completed payment elsewhere before sending
            </li>
            <li>Won't send duplicate emails within 7 days</li>
            <li>
              Uses the email template you can customize in the Email Template tab
            </li>
          </ul>
        </div>

        {abandonedCount !== null && (
          <div className="p-3 rounded-lg bg-[hsl(var(--admin-surface-hover))] border border-[hsl(var(--admin-border))]">
            <p className="text-sm">
              <strong>{abandonedCount}</strong> abandoned registration{abandonedCount !== 1 ? 's' : ''} from yesterday
              {abandonedCount === 0 && " (nothing to send)"}
            </p>
          </div>
        )}

        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-4 rounded-lg">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            <strong>Note:</strong> This email is scheduled to run automatically
            every day. You can test it manually below, but it will only check for
            registrations from yesterday for the active event.
          </p>
        </div>

        <AdminButton
          onClick={() => setTestDialogOpen(true)}
          variant="adminOutline"
          className="w-full"
          disabled={abandonedCount === 0}
        >
          <Send className="h-4 w-4 mr-2" />
          Send Abandoned Emails Now
        </AdminButton>

        <AdminConfirmDialog
          open={testDialogOpen}
          onOpenChange={setTestDialogOpen}
          title="Send Abandoned Registration Emails?"
          description={`This will send reminder emails to ${abandonedCount || 0} people who started registering for ${activeEventTitle} yesterday but didn't complete payment.`}
          consequences={[
            `Only ${activeEventTitle} registrations (no past events)`,
            "Only from yesterday (not old data)",
            "Skips anyone who completed payment elsewhere",
            "Skips anyone emailed in the last 7 days",
          ]}
          scope="Safety checks will be applied automatically"
          actionType="warning"
          actionLabel={sendTestMutation.isPending ? "Sending..." : `Send ${abandonedCount || 0} Email${(abandonedCount || 0) !== 1 ? 's' : ''}`}
          icon="warning"
          onConfirm={() => sendTestMutation.mutate()}
          isLoading={sendTestMutation.isPending}
        />
      </AdminCardContent>
    </AdminCard>
  );
}