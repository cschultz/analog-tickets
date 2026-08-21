import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  AdminButton,
  AdminBadge,
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminCardTitle,
  AdminCardDescription,
  AdminDialog,
  AdminDialogContent,
  AdminDialogDescription,
  AdminDialogFooter,
  AdminDialogHeader,
  AdminDialogTitle,
} from "@/components/admin";
import { Bell, Send, Loader2, Mail, CheckCircle2, RefreshCw, ChevronDown, ChevronUp, Clock } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface BookingWithNotification {
  id: string;
  email: string;
  guest_notified: boolean;
  notified_at: string | null;
  assignee_name: string | null;
  assignee_type: string;
  assigned_unit_id: string | null;
  registrations: { name: string } | null;
  accommodation_units: {
    unit_name: string;
    product_type: string;
  } | null;
}

interface NotificationControlsProps {
  bookings: BookingWithNotification[];
}

export function NotificationControls({ bookings }: NotificationControlsProps) {
  const queryClient = useQueryClient();
  const [isSending, setIsSending] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [showNotified, setShowNotified] = useState(false);

  // Categorize bookings
  const pendingNotifications = bookings.filter(
    (b) => b.assigned_unit_id && !b.guest_notified
  );
  const notifiedBookings = bookings.filter((b) => b.guest_notified);
  const unassignedBookings = bookings.filter((b) => !b.assigned_unit_id);

  const notifiedCount = notifiedBookings.length;
  const pendingCount = pendingNotifications.length;
  const unassignedCount = unassignedBookings.length;

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["lodging-booking-assignments"] });
    queryClient.invalidateQueries({ queryKey: ["lodging-booking-assignments-ops"] });
  };

  const handleSendIndividual = async (bookingId: string) => {
    setSendingId(bookingId);
    try {
      const { data, error } = await supabase.functions.invoke("send-assignment-notification", {
        body: { bookingIds: [bookingId] },
      });

      if (error) throw error;
      if (data?.sent > 0) {
        toast.success("Notification sent");
        invalidateQueries();
      } else {
        toast.error("Failed to send notification");
      }
    } catch (error: any) {
      console.error("Send notification error:", error);
      toast.error(error.message || "Failed to send notification");
    } finally {
      setSendingId(null);
    }
  };

  const handleResend = async (bookingId: string) => {
    setSendingId(bookingId);
    try {
      // Reset guest_notified so the edge function will re-send
      const { error: resetError } = await supabase
        .from("lodging_bookings")
        .update({ guest_notified: false, notified_at: null })
        .eq("id", bookingId);

      if (resetError) throw resetError;

      const { data, error } = await supabase.functions.invoke("send-assignment-notification", {
        body: { bookingIds: [bookingId] },
      });

      if (error) throw error;
      if (data?.sent > 0) {
        toast.success("Notification re-sent");
        invalidateQueries();
      } else {
        toast.error("Failed to re-send notification");
      }
    } catch (error: any) {
      console.error("Re-send notification error:", error);
      toast.error(error.message || "Failed to re-send notification");
    } finally {
      setSendingId(null);
    }
  };

  const handleSendAll = async () => {
    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-assignment-notification", {
        body: { sendAll: true },
      });

      if (error) throw error;
      toast.success(`Sent ${data?.sent || 0} notification(s)`);
      invalidateQueries();
      setConfirmDialogOpen(false);
    } catch (error: any) {
      console.error("Send all notifications error:", error);
      toast.error(error.message || "Failed to send notifications");
    } finally {
      setIsSending(false);
    }
  };

  const getDisplayName = (booking: BookingWithNotification) => {
    return booking.assignee_name || booking.registrations?.name || booking.email;
  };

  if (pendingCount === 0 && notifiedCount === 0 && unassignedCount === 0) {
    return null;
  }

  return (
    <>
      <AdminCard>
        <AdminCardHeader icon={Bell}>
          <div className="flex items-center justify-between w-full">
            <div>
              <AdminCardTitle>Guest Notifications</AdminCardTitle>
              <AdminCardDescription>
                Control when guests receive their unit assignment emails
              </AdminCardDescription>
            </div>
            {pendingCount > 0 && (
              <AdminButton
                variant="admin"
                size="sm"
                onClick={() => setConfirmDialogOpen(true)}
              >
                <Send className="h-4 w-4 mr-2" />
                Send All ({pendingCount})
              </AdminButton>
            )}
          </div>
        </AdminCardHeader>
        <AdminCardContent>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="p-3 bg-[hsl(var(--admin-surface))] rounded-lg">
              <p className="text-xs text-[hsl(var(--admin-text-muted))] uppercase tracking-wider">
                Unassigned
              </p>
              <p className={`text-2xl font-semibold ${unassignedCount > 0 ? "text-[hsl(var(--admin-text-muted))]" : "text-[hsl(var(--admin-success))]"}`}>
                {unassignedCount}
              </p>
            </div>
            <div className="p-3 bg-[hsl(var(--admin-surface))] rounded-lg">
              <p className="text-xs text-[hsl(var(--admin-warning))] uppercase tracking-wider">
                Pending
              </p>
              <p className="text-2xl font-semibold text-[hsl(var(--admin-warning))]">
                {pendingCount}
              </p>
            </div>
            <div className="p-3 bg-[hsl(var(--admin-surface))] rounded-lg">
              <p className="text-xs text-[hsl(var(--admin-success))] uppercase tracking-wider">
                Notified
              </p>
              <p className="text-2xl font-semibold text-[hsl(var(--admin-success))]">
                {notifiedCount}
              </p>
            </div>
          </div>

          {/* Pending Notifications */}
          {pendingCount > 0 && (
            <div className="space-y-2 mb-4">
              <p className="text-xs text-[hsl(var(--admin-text-muted))] uppercase tracking-wider mb-2">
                Pending Notifications
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {pendingNotifications.map((booking) => (
                  <div
                    key={booking.id}
                    className="flex items-center justify-between p-3 bg-[hsl(var(--admin-surface))] rounded-lg"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">
                          {getDisplayName(booking)}
                        </p>
                        {booking.assignee_type !== "guest" && (
                          <AdminBadge intent="info" className="text-[10px] px-1.5 py-0">
                            {booking.assignee_type}
                          </AdminBadge>
                        )}
                      </div>
                      <p className="text-xs text-[hsl(var(--admin-text-muted))]">
                        {booking.accommodation_units?.product_type === "cabin" ? "Cabin" : "Tent"}{" "}
                        {booking.accommodation_units?.unit_name}
                      </p>
                    </div>
                    <AdminButton
                      size="sm"
                      variant="adminOutline"
                      onClick={() => handleSendIndividual(booking.id)}
                      disabled={sendingId === booking.id}
                    >
                      {sendingId === booking.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Mail className="h-3 w-3 mr-1" />
                          Notify
                        </>
                      )}
                    </AdminButton>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All notified success message */}
          {pendingCount === 0 && notifiedCount > 0 && unassignedCount === 0 && (
            <div className="text-center py-4 text-[hsl(var(--admin-success))]">
              <CheckCircle2 className="h-6 w-6 mx-auto mb-2" />
              <p className="text-sm">All guests have been notified</p>
            </div>
          )}

          {/* Notified Guests (collapsible) */}
          {notifiedCount > 0 && (
            <div className="space-y-2">
              <AdminButton
                variant="adminGhost"
                size="sm"
                onClick={() => setShowNotified(!showNotified)}
                className="w-full justify-between text-xs uppercase tracking-wider text-[hsl(var(--admin-text-muted))] hover:text-[hsl(var(--admin-foreground))]"
              >
                <span>Notified Guests ({notifiedCount})</span>
                {showNotified ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </AdminButton>
              
              {showNotified && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {notifiedBookings.map((booking) => (
                    <div
                      key={booking.id}
                      className="flex items-center justify-between p-3 bg-[hsl(var(--admin-surface))] rounded-lg"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-[hsl(var(--admin-success))]" />
                          <p className="font-medium text-sm truncate">
                            {getDisplayName(booking)}
                          </p>
                          {booking.assignee_type !== "guest" && (
                            <AdminBadge intent="info" className="text-[10px] px-1.5 py-0">
                              {booking.assignee_type}
                            </AdminBadge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-5.5">
                          <p className="text-xs text-[hsl(var(--admin-text-muted))]">
                            {booking.accommodation_units?.product_type === "cabin" ? "Cabin" : "Tent"}{" "}
                            {booking.accommodation_units?.unit_name}
                          </p>
                          {booking.notified_at && (
                            <span className="text-xs text-[hsl(var(--admin-text-muted))] flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {format(new Date(booking.notified_at), "MMM d, h:mm a")}
                            </span>
                          )}
                        </div>
                      </div>
                      <AdminButton
                        size="sm"
                        variant="adminGhost"
                        onClick={() => handleResend(booking.id)}
                        disabled={sendingId === booking.id}
                        title="Re-send notification"
                      >
                        {sendingId === booking.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                      </AdminButton>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </AdminCardContent>
      </AdminCard>

      {/* Confirm Send All Dialog */}
      <AdminDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AdminDialogContent className="max-w-md">
          <AdminDialogHeader>
            <AdminDialogTitle>Send All Notifications</AdminDialogTitle>
            <AdminDialogDescription>
              This will email {pendingCount} guest(s) their unit assignment details. This action
              cannot be undone.
            </AdminDialogDescription>
          </AdminDialogHeader>
          <AdminDialogFooter>
            <AdminButton variant="adminOutline" onClick={() => setConfirmDialogOpen(false)}>
              Cancel
            </AdminButton>
            <AdminButton onClick={handleSendAll} disabled={isSending}>
              {isSending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send {pendingCount} Email(s)
                </>
              )}
            </AdminButton>
          </AdminDialogFooter>
        </AdminDialogContent>
      </AdminDialog>
    </>
  );
}
