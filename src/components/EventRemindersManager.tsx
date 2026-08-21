import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  AdminCard, AdminCardContent, AdminCardHeader, AdminCardTitle,
  AdminButton, AdminInput, AdminBadge,
  AdminTabs, AdminTabsContent, AdminTabsList, AdminTabsTrigger,
  AdminDialog, AdminDialogContent, AdminDialogHeader, AdminDialogTitle
} from "@/components/admin";
import { AdminLabel, AdminTextarea, AdminSwitch } from "@/components/admin/AdminFormPrimitives";
import { useToast } from "@/hooks/use-toast";
import { Bell, Save, Send, Eye, Ticket, CheckCircle2, Clock, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { formatTicketType } from "@/lib/utils";

interface TicketDeliveryStatus {
  id: string;
  name: string;
  email: string;
  ticket_type: string;
  quantity: number;
  payment_status: string;
  delivered: boolean;
  delivered_at?: string;
}

interface EventReminder {
  id: string;
  reminder_type: string;
  enabled: boolean;
  subject: string;
  heading: string;
  intro_text: string;
  body_text: string;
  footer_text: string;
  send_days_offset: number;
}

interface EventDetails {
  id: string;
  event_date: string;
  event_time: string;
  venue_name: string;
  venue_address: string;
  parking_info: string;
  check_in_instructions: string;
}

export const EventRemindersManager = () => {
  const [reminders, setReminders] = useState<EventReminder[]>([]);
  const [eventDetails, setEventDetails] = useState<EventDetails | null>(null);
  const [selectedReminder, setSelectedReminder] = useState<EventReminder | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [daysUntilEvent, setDaysUntilEvent] = useState<number | null>(null);
  const [isSendingTickets, setIsSendingTickets] = useState(false);
  const [isSendingTicketTest, setIsSendingTicketTest] = useState(false);
  const [deliveryStatuses, setDeliveryStatuses] = useState<TicketDeliveryStatus[]>([]);
  const [isLoadingStatuses, setIsLoadingStatuses] = useState(false);
  const [proofRegId, setProofRegId] = useState("");
  const [proofEmail, setProofEmail] = useState("");
  const [isSendingProof, setIsSendingProof] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchReminders();
    fetchEventDetails();
    fetchDeliveryStatuses();
  }, []);

  useEffect(() => {
    if (eventDetails) {
      const eventDate = new Date(eventDetails.event_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      eventDate.setHours(0, 0, 0, 0);
      const days = Math.floor((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      setDaysUntilEvent(days);
    }
  }, [eventDetails]);

  const fetchReminders = async () => {
    const { data, error } = await supabase
      .from("event_reminders")
      .select("*")
      .order("send_days_offset");

    if (!error && data) {
      setReminders(data);
      if (data.length > 0 && !selectedReminder) {
        setSelectedReminder(data[0]);
      }
    }
  };

  const fetchEventDetails = async () => {
    const { data, error } = await supabase
      .from("event_details")
      .select("*")
      .maybeSingle();

    if (!error && data) {
      setEventDetails(data);
    }
  };

  const fetchDeliveryStatuses = async () => {
    setIsLoadingStatuses(true);
    try {
      const { data: registrations, error: regError } = await supabase
        .from("registrations")
        .select("id, name, email, ticket_type, quantity, payment_status")
        .eq("payment_status", "paid")
        .order("created_at", { ascending: false });

      if (regError) throw regError;

      if (!registrations || registrations.length === 0) {
        setDeliveryStatuses([]);
        setIsLoadingStatuses(false);
        return;
      }

      const { data: deliveryLogs, error: logError } = await supabase
        .from("email_logs")
        .select("registration_id, sent_at")
        .eq("email_type", "tickets_delivery")
        .eq("status", "sent");

      if (logError) throw logError;

      const deliveredMap = new Map<string, string>();
      deliveryLogs?.forEach(log => {
        deliveredMap.set(log.registration_id, log.sent_at);
      });

      const statuses: TicketDeliveryStatus[] = registrations.map(reg => ({
        id: reg.id,
        name: reg.name,
        email: reg.email,
        ticket_type: reg.ticket_type,
        quantity: reg.quantity,
        payment_status: reg.payment_status || "pending",
        delivered: deliveredMap.has(reg.id),
        delivered_at: deliveredMap.get(reg.id),
      }));

      setDeliveryStatuses(statuses);
    } catch (error: any) {
      console.error("Error fetching delivery statuses:", error);
      toast({
        title: "Error loading delivery statuses",
        description: error.message,
        variant: "destructive",
      });
    }
    setIsLoadingStatuses(false);
  };

  const handleSaveReminder = async () => {
    if (!selectedReminder) return;

    setIsSaving(true);
    const { error } = await supabase
      .from("event_reminders")
      .update({
        enabled: selectedReminder.enabled,
        subject: selectedReminder.subject,
        heading: selectedReminder.heading,
        intro_text: selectedReminder.intro_text,
        body_text: selectedReminder.body_text,
        footer_text: selectedReminder.footer_text,
      })
      .eq("id", selectedReminder.id);

    if (error) {
      toast({
        title: "Error saving reminder",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Reminder saved",
        description: "Email template has been updated successfully",
      });
      fetchReminders();
    }
    setIsSaving(false);
  };

  const handleSaveEventDetails = async () => {
    if (!eventDetails) return;

    setIsSaving(true);
    const { error } = await supabase
      .from("event_details")
      .update({
        event_date: eventDetails.event_date,
        event_time: eventDetails.event_time,
        venue_name: eventDetails.venue_name,
        venue_address: eventDetails.venue_address,
        parking_info: eventDetails.parking_info,
        check_in_instructions: eventDetails.check_in_instructions,
      })
      .eq("id", eventDetails.id);

    if (error) {
      toast({
        title: "Error saving event details",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Event details saved",
        description: "Event information has been updated successfully",
      });
    }
    setIsSaving(false);
  };

  const handleSendTestReminder = async (reminderType: string) => {
    setIsSending(true);
    const { error } = await supabase.functions.invoke("send-event-reminders", {
      body: { reminderType },
    });

    if (error) {
      toast({
        title: "Error sending reminders",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Reminders sent",
        description: "Event reminder emails have been queued for delivery",
      });
    }
    setIsSending(false);
  };

  const handleSendTestEmail = async (reminderType: string) => {
    setIsSendingTest(true);
    
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user?.email) {
      toast({
        title: "Error",
        description: "Could not get admin email address",
        variant: "destructive",
      });
      setIsSendingTest(false);
      return;
    }

    const { error } = await supabase.functions.invoke("send-event-reminders", {
      body: { 
        reminderType,
        testEmail: user.email 
      },
    });

    if (error) {
      toast({
        title: "Error sending test email",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Test email sent",
        description: `Preview email sent to ${user.email}`,
      });
    }
    setIsSendingTest(false);
  };

  const getReminderLabel = (type: string) => {
    const labels: Record<string, string> = {
      week_before: "Week Before Event",
      day_before: "Day Before Event",
      day_of: "Day of Event",
      post_event: "Post-Event Thank You",
    };
    return labels[type] || type;
  };

  const getPreviewHtml = () => {
    if (!selectedReminder || !eventDetails) return "";

    const replaceVars = (text: string) => {
      if (!text) return text;
      return text
        .replace(/\{\{name\}\}/g, "John Doe")
        .replace(/\{\{event_date\}\}/g, format(new Date(eventDetails.event_date), "MMMM d, yyyy"))
        .replace(/\{\{event_time\}\}/g, eventDetails.event_time)
        .replace(/\{\{venue_name\}\}/g, eventDetails.venue_name)
        .replace(/\{\{venue_address\}\}/g, eventDetails.venue_address)
        .replace(/\{\{parking_info\}\}/g, eventDetails.parking_info || "")
        .replace(/\{\{check_in_instructions\}\}/g, eventDetails.check_in_instructions || "");
    };

    const emailHeading = replaceVars(selectedReminder.heading);
    const emailIntro = replaceVars(selectedReminder.intro_text);
    const emailBody = replaceVars(selectedReminder.body_text);
    const emailFooter = replaceVars(selectedReminder.footer_text || "");

    const formatText = (text: string) => {
      return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br/>');
    };

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #322821; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #C7A97A; color: #F3EEE6; padding: 30px; text-align: center; }
            .content { background: #F9F7F4; padding: 30px; }
            .footer { text-align: center; padding: 20px; color: #7B6E61; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0; font-size: 28px;">${emailHeading}</h1>
            </div>
            <div class="content">
              <p style="font-size: 16px;">${formatText(emailIntro)}</p>
              <div style="margin: 20px 0;">${formatText(emailBody)}</div>
              ${emailFooter ? `<p style="font-size: 14px; margin-top: 30px;">${formatText(emailFooter)}</p>` : ''}
            </div>
            <div class="footer">
              <p>© 2025 Analog. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  return (
    <AdminCard>
      <AdminCardHeader icon={Bell}>
        <AdminCardTitle>Event Reminders & Details</AdminCardTitle>
        {daysUntilEvent !== null && (
          <div className="text-sm mt-2 p-3 rounded bg-[hsl(var(--admin-hover))]">
            <strong>Auto-Scheduling Active:</strong> {daysUntilEvent} days until event. 
            {reminders.filter(r => r.enabled && r.send_days_offset === daysUntilEvent).length > 0 && (
              <span className="ml-2 text-[hsl(var(--admin-primary))] font-bold">
                ✓ Reminder scheduled for today at 10:00 AM
              </span>
            )}
          </div>
        )}
      </AdminCardHeader>
      <AdminCardContent>
        <AdminTabs defaultValue="tickets">
          <AdminTabsList className="grid w-full grid-cols-3 mb-6">
            <AdminTabsTrigger value="tickets">Ticket Delivery</AdminTabsTrigger>
            <AdminTabsTrigger value="reminders">Email Reminders</AdminTabsTrigger>
            <AdminTabsTrigger value="event">Event Details</AdminTabsTrigger>
          </AdminTabsList>

          <AdminTabsContent value="tickets">
            <div className="space-y-4">
              <div className="p-4 rounded-lg border-2 bg-[hsl(var(--admin-hover))] border-[hsl(var(--admin-primary)/0.3)]">
                <div className="flex items-start gap-3">
                  <Ticket className="w-6 h-6 text-[hsl(var(--admin-primary))] mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg text-[hsl(var(--admin-text))]">Anti-Scalping Ticket Delivery</h3>
                    <p className="text-sm mt-1 text-[hsl(var(--admin-text-muted))]">
                      To prevent scalping, tickets with QR codes are delivered <strong>7 days before the event</strong>. 
                      Confirmation emails already explain this to buyers.
                    </p>
                  </div>
                </div>
              </div>

              {daysUntilEvent !== null && (
                <div className="p-4 rounded-lg bg-[hsl(var(--admin-hover))] border-l-4 border-[hsl(var(--admin-primary))]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-[hsl(var(--admin-text))]">
                        {daysUntilEvent} days until event
                      </p>
                      <p className="text-sm mt-1 text-[hsl(var(--admin-text-muted))]">
                        {daysUntilEvent <= 7 
                          ? "✅ Tickets can be delivered now" 
                          : `Tickets will be ready to send in ${daysUntilEvent - 7} days`
                        }
                      </p>
                    </div>
                    {daysUntilEvent <= 7 && (
                      <div className="h-3 w-3 rounded-full bg-[hsl(var(--admin-success))] animate-pulse" />
                    )}
                  </div>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="p-4 border rounded-lg border-[hsl(var(--admin-border))]">
                  <h4 className="font-medium mb-2 text-[hsl(var(--admin-text))]">Test Ticket Email</h4>
                  <p className="text-sm mb-4 text-[hsl(var(--admin-text-muted))]">
                    Send a sample ticket email to yourself to preview how it looks.
                  </p>
                  <AdminButton
                    onClick={async () => {
                      setIsSendingTicketTest(true);
                      const { data: { user } } = await supabase.auth.getUser();
                      if (!user?.email) {
                        toast({
                          title: "Error",
                          description: "Could not get admin email address",
                          variant: "destructive",
                        });
                        setIsSendingTicketTest(false);
                        return;
                      }
                      const { error } = await supabase.functions.invoke("send-tickets-delivery", {
                        body: { testEmail: user.email },
                      });
                      if (error) {
                        toast({
                          title: "Error sending test",
                          description: error.message,
                          variant: "destructive",
                        });
                      } else {
                        toast({
                          title: "Test ticket sent",
                          description: `Sample ticket email sent to ${user.email}`,
                        });
                      }
                      setIsSendingTicketTest(false);
                    }}
                    disabled={isSendingTicketTest}
                    variant="secondary"
                    className="w-full"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    {isSendingTicketTest ? "Sending..." : "Send Test to Me"}
                  </AdminButton>
                </div>

                <div className="p-4 border rounded-lg border-[hsl(var(--admin-border))]">
                  <h4 className="font-medium mb-2 text-[hsl(var(--admin-text))]">Send Real Ticket as Proof</h4>
                  <p className="text-sm mb-3 text-[hsl(var(--admin-text-muted))]">
                    Sends a specific registration's actual ticket(s) (real QR codes, real assignments, real lodging) to an override email address. Does NOT mark as delivered.
                  </p>
                  <div className="space-y-2 mb-3">
                    <AdminInput
                      placeholder="Registration ID"
                      value={proofRegId}
                      onChange={(e) => setProofRegId(e.target.value)}
                    />
                    <AdminInput
                      placeholder="Send proof to email"
                      value={proofEmail}
                      onChange={(e) => setProofEmail(e.target.value)}
                    />
                  </div>
                  <AdminButton
                    onClick={async () => {
                      if (!proofRegId.trim() || !proofEmail.trim()) {
                        toast({ title: "Missing info", description: "Registration ID and email are required.", variant: "destructive" });
                        return;
                      }
                      setIsSendingProof(true);
                      const invokeProof = async (force: boolean) =>
                        supabase.functions.invoke("send-tickets-delivery", {
                          body: {
                            singleRegistrationId: proofRegId.trim(),
                            overrideEmail: proofEmail.trim(),
                            eventId: eventDetails?.id,
                            force,
                          },
                        });
                      let { data, error } = await invokeProof(false);
                      const recently = (data as any)?.requiresForce || (error as any)?.context?.status === 409;
                      if (recently) {
                        const ts = (data as any)?.recentlySentAt || "less than 30 min ago";
                        if (window.confirm(`Tickets for this registration were already sent at ${ts}. Send again anyway?`)) {
                          ({ data, error } = await invokeProof(true));
                        } else {
                          setIsSendingProof(false);
                          return;
                        }
                      }
                      if (error) {
                        toast({ title: "Error sending proof", description: error.message, variant: "destructive" });
                      } else {
                        toast({ title: "Proof sent", description: `Sent to ${proofEmail.trim()}` });
                      }
                      setIsSendingProof(false);
                    }}
                    disabled={isSendingProof}
                    variant="secondary"
                    className="w-full"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    {isSendingProof ? "Sending..." : "Send Proof"}
                  </AdminButton>
                </div>

                <div className={`p-4 border rounded-lg border-[hsl(var(--admin-border))] ${daysUntilEvent !== null && daysUntilEvent <= 7 ? 'bg-[hsl(var(--admin-success)/0.05)]' : ''}`}>
                  <h4 className="font-medium mb-2 text-[hsl(var(--admin-text))]">Deliver All Tickets</h4>
                  <p className="text-sm mb-4 text-[hsl(var(--admin-text-muted))]">
                    Send ticket emails with QR codes to all paid registrations.
                  </p>
                  <AdminButton
                    onClick={async () => {
                      if (daysUntilEvent !== null && daysUntilEvent > 7) {
                        const confirmed = window.confirm(
                          `The event is ${daysUntilEvent} days away. Are you sure you want to deliver tickets early? This bypasses anti-scalping protection.`
                        );
                        if (!confirmed) return;
                      }
                      setIsSendingTickets(true);
                      const { data, error } = await supabase.functions.invoke("send-tickets-delivery", {
                        body: { eventId: eventDetails?.id },
                      });
                      if (error) {
                        toast({
                          title: "Error delivering tickets",
                          description: error.message,
                          variant: "destructive",
                        });
                      } else {
                        toast({
                          title: "Tickets delivered",
                          description: `Sent: ${data.sentCount}, Skipped (already sent): ${data.skippedCount}, Errors: ${data.errorCount}`,
                        });
                      }
                      setIsSendingTickets(false);
                    }}
                    disabled={isSendingTickets}
                    className="w-full"
                  >
                    <Ticket className="w-4 h-4 mr-2" />
                    {isSendingTickets ? "Delivering..." : "Deliver All Tickets Now"}
                  </AdminButton>
                </div>
              </div>

              <div className="p-4 rounded-lg text-sm bg-[hsl(var(--admin-warning)/0.1)] text-[hsl(var(--admin-warning))]">
                <strong>Note:</strong> The system tracks which registrations have already received tickets. 
                Running "Deliver All Tickets" multiple times is safe — previously delivered tickets won't be re-sent.
              </div>

              {/* Delivery Status Table */}
              <div className="mt-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-lg text-[hsl(var(--admin-text))]">Delivery Status</h4>
                  <AdminButton
                    variant="secondary"
                    size="sm"
                    onClick={() => fetchDeliveryStatuses()}
                    disabled={isLoadingStatuses}
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${isLoadingStatuses ? "animate-spin" : ""}`} />
                    Refresh
                  </AdminButton>
                </div>

                {isLoadingStatuses ? (
                  <div className="text-center py-8 text-[hsl(var(--admin-text-muted))]">
                    Loading delivery statuses...
                  </div>
                ) : deliveryStatuses.length === 0 ? (
                  <div className="text-center py-8 border rounded-lg border-[hsl(var(--admin-border))] text-[hsl(var(--admin-text-muted))]">
                    No paid registrations found
                  </div>
                ) : (
                  <>
                    <div className="flex gap-4 mb-4 text-sm text-[hsl(var(--admin-text-muted))]">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[hsl(var(--admin-success))]" />
                        <span>Delivered: {deliveryStatuses.filter(s => s.delivered).length}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-[hsl(var(--admin-warning))]" />
                        <span>Pending: {deliveryStatuses.filter(s => !s.delivered).length}</span>
                      </div>
                    </div>

                    <div className="border rounded-lg overflow-hidden border-[hsl(var(--admin-border))]">
                      <div className="max-h-[400px] overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-[hsl(var(--admin-hover))]">
                            <tr className="border-b border-[hsl(var(--admin-border))]">
                              <th className="text-left p-3 font-medium text-[hsl(var(--admin-text))]">Name</th>
                              <th className="text-left p-3 font-medium text-[hsl(var(--admin-text))]">Email</th>
                              <th className="text-left p-3 font-medium text-[hsl(var(--admin-text))]">Ticket Type</th>
                              <th className="text-center p-3 font-medium text-[hsl(var(--admin-text))]">Qty</th>
                              <th className="text-center p-3 font-medium text-[hsl(var(--admin-text))]">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {deliveryStatuses.map((status) => (
                              <tr key={status.id} className="border-b border-[hsl(var(--admin-border))]">
                                <td className="p-3 text-[hsl(var(--admin-text))]">{status.name}</td>
                                <td className="p-3 text-[hsl(var(--admin-text-muted))]">{status.email}</td>
                                <td className="p-3 text-[hsl(var(--admin-text-muted))]">
                                  {formatTicketType(status.ticket_type)}
                                </td>
                                <td className="p-3 text-center text-[hsl(var(--admin-text-muted))]">{status.quantity}</td>
                                <td className="p-3 text-center">
                                  {status.delivered ? (
                                    <AdminBadge intent="success">
                                      <CheckCircle2 className="w-3 h-3 mr-1" />
                                      Delivered
                                    </AdminBadge>
                                  ) : (
                                    <AdminBadge intent="warning">
                                      <Clock className="w-3 h-3 mr-1" />
                                      Pending
                                    </AdminBadge>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </AdminTabsContent>

          <AdminTabsContent value="reminders">
            <div className="space-y-4">
              <div className="mb-4 p-3 rounded-lg bg-[hsl(var(--admin-hover))] border-l-3 border-[hsl(var(--admin-primary))]">
                <p className="text-sm text-[hsl(var(--admin-text-muted))]">
                  <strong>Automated scheduling is active!</strong> Reminders will automatically send at 10 AM daily based on your event date and the "Days Before Event" offset for each reminder type.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {reminders.map((reminder) => (
                  <AdminButton
                    key={reminder.id}
                    variant={selectedReminder?.id === reminder.id ? "default" : "secondary"}
                    onClick={() => setSelectedReminder(reminder)}
                    className="text-sm"
                  >
                    {getReminderLabel(reminder.reminder_type)}
                  </AdminButton>
                ))}
              </div>

              {selectedReminder && (
                <div className="space-y-4 p-4 border rounded-lg border-[hsl(var(--admin-border))]">
                  <div className="flex items-center justify-between">
                    <AdminLabel className="text-base font-semibold">
                      {getReminderLabel(selectedReminder.reminder_type)}
                    </AdminLabel>
                    <div className="flex items-center gap-2">
                      <AdminLabel htmlFor="enabled" className="text-sm">Enabled</AdminLabel>
                      <AdminSwitch
                        id="enabled"
                        checked={selectedReminder.enabled}
                        onCheckedChange={(checked) =>
                          setSelectedReminder({ ...selectedReminder, enabled: checked })
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <AdminLabel>Email Subject</AdminLabel>
                    <AdminInput
                      value={selectedReminder.subject}
                      onChange={(e) =>
                        setSelectedReminder({ ...selectedReminder, subject: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <AdminLabel>Heading</AdminLabel>
                    <AdminInput
                      value={selectedReminder.heading}
                      onChange={(e) =>
                        setSelectedReminder({ ...selectedReminder, heading: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <AdminLabel>Intro Text</AdminLabel>
                    <AdminTextarea
                      value={selectedReminder.intro_text}
                      onChange={(e) =>
                        setSelectedReminder({ ...selectedReminder, intro_text: e.target.value })
                      }
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <AdminLabel>Body Text (supports markdown-style formatting)</AdminLabel>
                    <AdminTextarea
                      value={selectedReminder.body_text}
                      onChange={(e) =>
                        setSelectedReminder({ ...selectedReminder, body_text: e.target.value })
                      }
                      rows={8}
                    />
                  </div>

                  <div className="space-y-2">
                    <AdminLabel>Footer Text</AdminLabel>
                    <AdminTextarea
                      value={selectedReminder.footer_text}
                      onChange={(e) =>
                        setSelectedReminder({ ...selectedReminder, footer_text: e.target.value })
                      }
                      rows={2}
                    />
                  </div>

                  <div className="text-xs p-3 rounded bg-[hsl(var(--admin-hover))] text-[hsl(var(--admin-text-muted))]">
                    <strong>Available variables:</strong> {"{"}
                    {"{"}name{"}"}
                    {"}"}, {"{"}
                    {"{"}event_date{"}"}
                    {"}"}, {"{"}
                    {"{"}event_time{"}"}
                    {"}"}, {"{"}
                    {"{"}venue_name{"}"}
                    {"}"}, {"{"}
                    {"{"}venue_address{"}"}
                    {"}"}, {"{"}
                    {"{"}parking_info{"}"}
                    {"}"}, {"{"}
                    {"{"}check_in_instructions{"}"}
                    {"}"}
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <AdminButton
                        onClick={handleSaveReminder}
                        disabled={isSaving}
                        className="flex-1"
                      >
                        <Save className="w-4 h-4 mr-2" />
                        {isSaving ? "Saving..." : "Save Template"}
                      </AdminButton>
                      <AdminButton
                        onClick={() => setShowPreview(true)}
                        variant="secondary"
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        Preview
                      </AdminButton>
                    </div>
                    <div className="flex gap-2">
                      <AdminButton
                        onClick={() => handleSendTestEmail(selectedReminder.reminder_type)}
                        disabled={isSendingTest || !selectedReminder.enabled}
                        variant="secondary"
                        className="flex-1"
                      >
                        <Send className="w-4 h-4 mr-2" />
                        {isSendingTest ? "Sending..." : "Send Test to Me"}
                      </AdminButton>
                      <AdminButton
                        onClick={() => handleSendTestReminder(selectedReminder.reminder_type)}
                        disabled={isSending || !selectedReminder.enabled}
                        variant="secondary"
                        className="flex-1"
                      >
                        <Send className="w-4 h-4 mr-2" />
                        Send to All
                      </AdminButton>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </AdminTabsContent>

          <AdminTabsContent value="event">
            {eventDetails && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <AdminLabel>Event Date</AdminLabel>
                    <AdminInput
                      type="date"
                      value={eventDetails.event_date}
                      onChange={(e) =>
                        setEventDetails({ ...eventDetails, event_date: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <AdminLabel>Event Time</AdminLabel>
                    <AdminInput
                      type="time"
                      value={eventDetails.event_time}
                      onChange={(e) =>
                        setEventDetails({ ...eventDetails, event_time: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <AdminLabel>Venue Name</AdminLabel>
                  <AdminInput
                    value={eventDetails.venue_name}
                    onChange={(e) =>
                      setEventDetails({ ...eventDetails, venue_name: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <AdminLabel>Venue Address</AdminLabel>
                  <AdminInput
                    value={eventDetails.venue_address}
                    onChange={(e) =>
                      setEventDetails({ ...eventDetails, venue_address: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <AdminLabel>Parking Information</AdminLabel>
                  <AdminTextarea
                    value={eventDetails.parking_info}
                    onChange={(e) =>
                      setEventDetails({ ...eventDetails, parking_info: e.target.value })
                    }
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <AdminLabel>Check-In Instructions</AdminLabel>
                  <AdminTextarea
                    value={eventDetails.check_in_instructions}
                    onChange={(e) =>
                      setEventDetails({ ...eventDetails, check_in_instructions: e.target.value })
                    }
                    rows={3}
                  />
                </div>

                <AdminButton
                  onClick={handleSaveEventDetails}
                  disabled={isSaving}
                  className="w-full"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {isSaving ? "Saving..." : "Save Event Details"}
                </AdminButton>
              </div>
            )}
          </AdminTabsContent>
        </AdminTabs>
      </AdminCardContent>

      <AdminDialog open={showPreview} onOpenChange={setShowPreview}>
        <AdminDialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <AdminDialogHeader>
            <AdminDialogTitle>Email Preview - {selectedReminder && getReminderLabel(selectedReminder.reminder_type)}</AdminDialogTitle>
          </AdminDialogHeader>
          <div className="border rounded-lg overflow-hidden">
            <iframe
              srcDoc={getPreviewHtml()}
              className="w-full h-[600px]"
              title="Email Preview"
            />
          </div>
        </AdminDialogContent>
      </AdminDialog>
    </AdminCard>
  );
};
