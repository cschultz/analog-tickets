import { useState } from "react";
import { useAdminEvent } from "@/hooks/useAdminEvent";
import CustomOfferManager from "@/components/CustomOfferManager";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminButton } from "@/components/admin/AdminUI";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Bell, Loader2, Gift, Zap } from "lucide-react";

export default function CustomOffersPage() {
  const { selectedEventId, isLoading: eventLoading } = useAdminEvent();
  const [isSendingReminders, setIsSendingReminders] = useState(false);
  const [isSendingUrgency, setIsSendingUrgency] = useState(false);

  if (eventLoading || !selectedEventId) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          icon={Gift}
          title="Custom Offers"
          subtitle="Create and manage personalized ticket packages for special guests"
        />
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[hsl(var(--admin-primary))]"></div>
        </div>
      </div>
    );
  }

  const handleSendExpiryReminders = async () => {
    setIsSendingReminders(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-offer-expiry-reminders");
      
      if (error) throw error;
      
      if (data.emails_sent > 0) {
        toast.success(`Sent ${data.emails_sent} expiry reminder${data.emails_sent > 1 ? 's' : ''}`);
      } else {
        toast.info("No offers expiring in the next 24-25 hours");
      }
    } catch (error: any) {
      toast.error(`Failed to send reminders: ${error.message}`);
    } finally {
      setIsSendingReminders(false);
    }
  };

  const handleSendUrgencyNudge = async () => {
    if (!confirm("Send an urgency email to ALL recipients with pending (unaccepted) offers?")) return;
    setIsSendingUrgency(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-offer-urgency-nudge", { body: {} });
      if (error) throw error;
      if (data?.emails_sent > 0) {
        toast.success(`Sent ${data.emails_sent} urgency nudge${data.emails_sent > 1 ? "s" : ""}`);
      } else {
        toast.info("No pending offers to nudge");
      }
      if (data?.errors?.length) console.warn("Send errors:", data.errors);
    } catch (error: any) {
      toast.error(`Failed to send nudges: ${error.message}`);
    } finally {
      setIsSendingUrgency(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={Gift}
        title="Custom Offers"
        subtitle="Create and manage personalized ticket packages for special guests"
        actions={
          <div className="flex gap-2">
            <AdminButton
              variant="adminOutline"
              size="sm"
              onClick={handleSendExpiryReminders}
              disabled={isSendingReminders}
              className="gap-2"
            >
              {isSendingReminders ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
              Send Expiry Reminders
            </AdminButton>
            <AdminButton
              variant="adminOutline"
              size="sm"
              onClick={handleSendUrgencyNudge}
              disabled={isSendingUrgency}
              className="gap-2"
            >
              {isSendingUrgency ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Nudge All Pending
            </AdminButton>
          </div>
        }
      />

      <CustomOfferManager eventId={selectedEventId} />
    </div>
  );
}
