import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mail, Loader2, Send, Search, Check, Clock, Eye, AlertTriangle, FileText, Users, Calendar, FlaskConical, X, Pause, Play } from "lucide-react";
import { RichTextEditor } from "@/components/RichTextEditor";
import { TemplatePicker, UnifiedTemplate, AUDIENCE_CONFIG, TemplateAudience } from "@/components/email/TemplateGallery";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format, addHours } from "date-fns";
import { 
  AdminButton, AdminInput, AdminBadge,
  AdminTabs, AdminTabsList, AdminTabsTrigger
} from "@/components/admin";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface Registration {
  id: string;
  email: string;
  name: string;
}

interface AnnouncementComposerProps {
  registrations: Registration[];
  isOpen: boolean;
  onClose: () => void;
  onSendComplete?: () => void;
}

const generateEmailPreviewHtml = (
  subject: string, 
  message: string, 
  recipientName: string = "Attendee",
  eventTitle: string = "Event Announcement",
  signatureLine: string = "✌️&❤️,",
  signatureName: string = "Demo Organizers"
) => {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #322821; margin: 0; padding: 0; background: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #C7A97A 0%, #A37552 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .header h1 { margin: 0; font-size: 24px; }
          .content { background: #F3EEE6; padding: 30px; border-radius: 0 0 10px 10px; }
          .content p { margin: 0 0 16px 0; }
          .content ul, .content ol { margin: 0 0 16px 0; padding-left: 24px; }
          .content li { margin-bottom: 8px; }
          .content a { color: #A37552; text-decoration: underline; }
          .footer { text-align: center; margin-top: 30px; color: #7B6E61; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${eventTitle}</h1>
          </div>
          <div class="content">
            <p>Hi ${recipientName.split(' ')[0] || 'there'},</p>
            ${message || '<p style="color: #999; font-style: italic;">Your message content will appear here...</p>'}
            <p style="margin-top: 30px;">${signatureLine}<br>${signatureName}</p>
          </div>
          <div class="footer">
            <p>You received this email because you registered for our event.</p>
          </div>
        </div>
      </body>
    </html>
  `;
};

export function AnnouncementComposer({ 
  registrations, 
  isOpen, 
  onClose,
  onSendComplete 
}: AnnouncementComposerProps) {
  const [isSending, setIsSending] = useState(false);
  const [isSendingPreview, setIsSendingPreview] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [previewEmail, setPreviewEmail] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [eventTitle, setEventTitle] = useState("Event Announcement");
  const [eventId, setEventId] = useState<string | null>(null);
  const [signatureLine, setSignatureLine] = useState("✌️&❤️,");
  const [signatureName, setSignatureName] = useState("Demo Organizers");
  const [showPreviewPanel, setShowPreviewPanel] = useState(true);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [selectedTemplateAudience, setSelectedTemplateAudience] = useState<TemplateAudience>("customer");
  
  // Scheduling state
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  
  // A/B Testing state
  const [abTestEnabled, setAbTestEnabled] = useState(false);
  const [abVariantBSubject, setAbVariantBSubject] = useState("");
  const [abVariantBMessage, setAbVariantBMessage] = useState("");
  const [abTestSize, setAbTestSize] = useState(20);
  const [activeVariant, setActiveVariant] = useState<"a" | "b">("a");
  
  // Send progress state for undo capability
  const [sendingProgress, setSendingProgress] = useState<{
    total: number;
    sent: number;
    failed: number;
    cancelled: boolean;
  } | null>(null);
  const [canCancel, setCanCancel] = useState(false);
  
  // Recipient selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [recentlyEmailed, setRecentlyEmailed] = useState<Map<string, Date>>(new Map());

  // Filter registrations by search
  const filteredRegistrations = useMemo(() => {
    if (!searchQuery.trim()) return registrations;
    const query = searchQuery.toLowerCase();
    return registrations.filter(
      (reg) =>
        reg.name.toLowerCase().includes(query) ||
        reg.email.toLowerCase().includes(query)
    );
  }, [registrations, searchQuery]);

  // Check if all filtered are selected
  const allFilteredSelected = filteredRegistrations.length > 0 && 
    filteredRegistrations.every((reg) => selectedIds.has(reg.id));
  
  // Check if some (but not all) filtered are selected
  const someFilteredSelected = filteredRegistrations.some((reg) => selectedIds.has(reg.id)) && !allFilteredSelected;

  // Fetch recently emailed registrations
  const fetchRecentlyEmailed = async () => {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
      .from("email_logs")
      .select("registration_id, sent_at")
      .gte("sent_at", twentyFourHoursAgo)
      .eq("status", "sent")
      .order("sent_at", { ascending: false });

    if (!error && data) {
      const emailedMap = new Map<string, Date>();
      data.forEach((log) => {
        if (!emailedMap.has(log.registration_id)) {
          emailedMap.set(log.registration_id, new Date(log.sent_at));
        }
      });
      setRecentlyEmailed(emailedMap);
    }
  };

  const fetchEventAndSettings = async () => {
    const { data: eventData } = await supabase
      .from("event_details")
      .select("id, title")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (eventData) {
      setEventTitle(eventData.title);
      setEventId(eventData.id);
    }

    const { data: settingsData } = await supabase
      .from("email_settings")
      .select("signature_line, signature_name")
      .limit(1)
      .maybeSingle();

    if (settingsData) {
      setSignatureLine(settingsData.signature_line || "✌️&❤️,");
      setSignatureName(settingsData.signature_name || "Demo Organizers");
    }
  };

  // Initialize when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set(registrations.map((r) => r.id)));
      setSearchQuery("");
      setSubject("");
      setMessage("");
      setCampaignName("");
      setIsScheduled(false);
      setScheduledDate("");
      setScheduledTime("");
      setAbTestEnabled(false);
      setAbVariantBSubject("");
      setAbVariantBMessage("");
      setAbTestSize(20);
      setActiveVariant("a");
      setSendingProgress(null);
      setCanCancel(false);
      fetchEventAndSettings();
      fetchRecentlyEmailed();
    }
  }, [isOpen, registrations]);

  const handleSelectAll = () => {
    if (allFilteredSelected) {
      const newSet = new Set(selectedIds);
      filteredRegistrations.forEach((reg) => newSet.delete(reg.id));
      setSelectedIds(newSet);
    } else {
      const newSet = new Set(selectedIds);
      filteredRegistrations.forEach((reg) => newSet.add(reg.id));
      setSelectedIds(newSet);
    }
  };

  const handleToggleRecipient = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleTemplateSelect = (template: UnifiedTemplate) => {
    setSubject(template.subject);
    setMessage(template.body_html);
    setSelectedTemplateAudience(template.audience);
    toast.success(`Loaded: ${template.name}`);
  };

  const handleSendPreview = async () => {
    if (!subject || !message) {
      toast.error("Please fill in subject and message");
      return;
    }

    if (!previewEmail) {
      toast.error("Please enter a preview email address");
      return;
    }

    setIsSendingPreview(true);

    try {
      const { error } = await supabase.functions.invoke("send-bulk-announcement", {
        body: {
          to: previewEmail,
          name: "Preview Recipient",
          subject: `[PREVIEW] ${subject}`,
          message,
          isHtml: true,
          isPreview: true,
        },
      });

      if (error) throw error;

      toast.success(`Preview sent to ${previewEmail}`);
    } catch (error) {
      console.error("Error sending preview:", error);
      toast.error("Failed to send preview email");
    } finally {
      setIsSendingPreview(false);
    }
  };

  const handleSendClick = () => {
    if (!subject || !message) {
      toast.error("Please fill in all fields");
      return;
    }

    if (selectedIds.size === 0) {
      toast.error("Please select at least one recipient");
      return;
    }

    setShowConfirmDialog(true);
  };

  const handleCancelSend = () => {
    if (sendingProgress) {
      setSendingProgress({ ...sendingProgress, cancelled: true });
      setCanCancel(false);
      toast.info("Cancelling remaining emails...");
    }
  };

  const getScheduledDateTime = () => {
    if (!isScheduled || !scheduledDate || !scheduledTime) return null;
    return new Date(`${scheduledDate}T${scheduledTime}`);
  };

  const handleSchedule = async () => {
    setShowConfirmDialog(false);
    
    const scheduledFor = getScheduledDateTime();
    if (!scheduledFor) {
      toast.error("Please set a valid date and time");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from("bulk_email_campaigns")
        .insert({
          name: campaignName || null,
          subject,
          body_html: message,
          audience: selectedTemplateAudience,
          recipient_count: selectedIds.size,
          event_id: eventId,
          sent_by: user?.id,
          status: "scheduled",
          scheduled_for: scheduledFor.toISOString(),
          ab_test_enabled: abTestEnabled,
          ab_variant_b_subject: abTestEnabled ? abVariantBSubject : null,
          ab_variant_b_body: abTestEnabled ? abVariantBMessage : null,
          ab_test_size_percent: abTestEnabled ? abTestSize : null,
        });

      if (error) throw error;

      toast.success(`Campaign scheduled for ${format(scheduledFor, "MMM d, yyyy 'at' h:mm a")}`);
      onClose();
      onSendComplete?.();
    } catch (error) {
      console.error("Error scheduling campaign:", error);
      toast.error("Failed to schedule campaign");
    }
  };

  const handleSend = async () => {
    setShowConfirmDialog(false);
    setIsSending(true);
    setCanCancel(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Create campaign record first
      const { data: campaign, error: campaignError } = await supabase
        .from("bulk_email_campaigns")
        .insert({
          name: campaignName || null,
          subject,
          body_html: message,
          audience: selectedTemplateAudience,
          recipient_count: selectedIds.size,
          event_id: eventId,
          sent_by: user?.id,
          status: "sending",
          ab_test_enabled: abTestEnabled,
          ab_variant_b_subject: abTestEnabled ? abVariantBSubject : null,
          ab_variant_b_body: abTestEnabled ? abVariantBMessage : null,
          ab_test_size_percent: abTestEnabled ? abTestSize : null,
        })
        .select()
        .single();

      if (campaignError) {
        console.error("Error creating campaign:", campaignError);
      }

      let successful = 0;
      let failed = 0;
      let cancelled = false;
      const batchSize = 2;
      const delayMs = 1100;

      const toSend = registrations.filter((reg) => selectedIds.has(reg.id));
      const totalToSend = toSend.length;
      
      // Initialize progress
      setSendingProgress({ total: totalToSend, sent: 0, failed: 0, cancelled: false });

      // For A/B testing, split recipients
      let variantARecipients = toSend;
      let variantBRecipients: typeof toSend = [];
      
      if (abTestEnabled && abVariantBSubject) {
        const testCount = Math.floor(totalToSend * (abTestSize / 100));
        const halfTest = Math.floor(testCount / 2);
        
        // Shuffle and split
        const shuffled = [...toSend].sort(() => Math.random() - 0.5);
        variantBRecipients = shuffled.slice(0, halfTest);
        variantARecipients = shuffled.slice(halfTest);
      }

      // Send Variant A
      for (let i = 0; i < variantARecipients.length && !cancelled; i += batchSize) {
        const batch = variantARecipients.slice(i, i + batchSize);
        
        const results = await Promise.allSettled(
          batch.map((reg) =>
            supabase.functions.invoke("send-bulk-announcement", {
              body: {
                to: reg.email,
                name: reg.name,
                subject,
                message,
                registrationId: reg.id,
                isHtml: true,
                campaignId: campaign?.id,
                variant: abTestEnabled ? "A" : undefined,
              },
            })
          )
        );

        results.forEach((result) => {
          if (result.status === "fulfilled" && !result.value.error) {
            successful++;
          } else {
            failed++;
          }
        });

        setSendingProgress(prev => {
          if (prev?.cancelled) {
            cancelled = true;
          }
          return prev ? { ...prev, sent: successful, failed } : null;
        });

        toast.info(`Sending: ${successful + failed} of ${totalToSend}...`, { id: "bulk-send-progress" });

        if (i + batchSize < variantARecipients.length && !cancelled) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }

      // Send Variant B (if A/B testing)
      if (abTestEnabled && variantBRecipients.length > 0 && !cancelled) {
        for (let i = 0; i < variantBRecipients.length && !cancelled; i += batchSize) {
          const batch = variantBRecipients.slice(i, i + batchSize);
          
          const results = await Promise.allSettled(
            batch.map((reg) =>
              supabase.functions.invoke("send-bulk-announcement", {
                body: {
                  to: reg.email,
                  name: reg.name,
                  subject: abVariantBSubject,
                  message: abVariantBMessage || message,
                  registrationId: reg.id,
                  isHtml: true,
                  campaignId: campaign?.id,
                  variant: "B",
                },
              })
            )
          );

          results.forEach((result) => {
            if (result.status === "fulfilled" && !result.value.error) {
              successful++;
            } else {
              failed++;
            }
          });

          setSendingProgress(prev => {
            if (prev?.cancelled) cancelled = true;
            return prev ? { ...prev, sent: successful, failed } : null;
          });

          if (i + batchSize < variantBRecipients.length && !cancelled) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        }
      }

      toast.dismiss("bulk-send-progress");

      // Update campaign with results
      if (campaign) {
        await supabase
          .from("bulk_email_campaigns")
          .update({
            sent_count: successful,
            failed_count: failed,
            status: cancelled ? "cancelled" : "sent",
          })
          .eq("id", campaign.id);
      }
      
      if (cancelled) {
        toast.warning(`Cancelled after sending ${successful} of ${totalToSend}`);
      } else if (failed === 0) {
        toast.success(`Successfully sent to ${successful} recipient${successful !== 1 ? "s" : ""}`);
      } else {
        toast.warning(`Sent to ${successful}, ${failed} failed`);
      }

      onClose();
      onSendComplete?.();
    } catch (error) {
      console.error("Error sending announcements:", error);
      toast.error("Failed to send announcements");
    } finally {
      setIsSending(false);
      setSendingProgress(null);
      setCanCancel(false);
    }
  };

  const audienceConfig = AUDIENCE_CONFIG[selectedTemplateAudience];

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent
          className="bg-[hsl(var(--admin-surface))] w-[95vw] max-w-[1200px] h-[90vh] flex flex-col overflow-hidden"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[hsl(var(--admin-text))]">
              <Mail className="h-5 w-5" />
              Compose Announcement
              {audienceConfig && (
                <AdminBadge intent="neutral" className="text-xs ml-2">
                  {audienceConfig.icon} {audienceConfig.label}
                </AdminBadge>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 flex-1 overflow-hidden">
            {/* Left: Recipients (2 cols) */}
            <div className="lg:col-span-2 space-y-3 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-[hsl(var(--admin-text))]">Recipients</Label>
                <AdminBadge intent="neutral" className="font-mono">
                  {selectedIds.size} selected
                </AdminBadge>
              </div>
              
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                <AdminInput
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Select All */}
              <div 
                className="flex items-center gap-3 p-2 rounded-md border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-hover))] cursor-pointer hover:bg-[hsl(var(--admin-hover))] transition-colors"
                onClick={handleSelectAll}
              >
                <Checkbox 
                  checked={allFilteredSelected}
                  {...(someFilteredSelected ? { "data-state": "indeterminate" } : {})}
                />
                <span className="text-sm font-medium text-[hsl(var(--admin-text))]">
                  {searchQuery ? `Select all ${filteredRegistrations.length} matching` : `Select all (${registrations.length})`}
                </span>
              </div>

              {/* Recipient List */}
              <ScrollArea className="flex-1 min-h-0 border border-[hsl(var(--admin-border))] rounded-md">
                <div className="p-1">
                  {filteredRegistrations.length === 0 ? (
                    <div className="p-4 text-center text-sm text-[hsl(var(--admin-text-muted))]">
                      No attendees found
                    </div>
                  ) : (
                    <TooltipProvider delayDuration={300}>
                      {filteredRegistrations.map((reg) => {
                        const lastEmailed = recentlyEmailed.get(reg.id);
                        return (
                          <div
                            key={reg.id}
                            className={cn(
                              "flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors",
                              selectedIds.has(reg.id) ? "bg-[hsl(var(--admin-primary)/0.05)]" : "hover:bg-[hsl(var(--admin-hover))]"
                            )}
                            onClick={() => handleToggleRecipient(reg.id)}
                          >
                            <Checkbox checked={selectedIds.has(reg.id)} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium truncate text-[hsl(var(--admin-text))]">{reg.name}</p>
                                {lastEmailed && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span>
                                        <AdminBadge intent="warning" className="text-[10px] px-1.5 py-0 h-4">
                                          <Clock className="w-2.5 h-2.5 mr-0.5" />
                                          Recent
                                        </AdminBadge>
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">
                                      <p className="text-xs">Emailed {formatDistanceToNow(lastEmailed, { addSuffix: true })}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                              <p className="text-xs text-[hsl(var(--admin-text-muted))] truncate">{reg.email}</p>
                            </div>
                            {selectedIds.has(reg.id) && (
                              <Check className="h-4 w-4 text-[hsl(var(--admin-primary))] flex-shrink-0" />
                            )}
                          </div>
                        );
                      })}
                    </TooltipProvider>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Right: Compose (3 cols) */}
            <div className="lg:col-span-3 space-y-4 overflow-y-auto">
              {/* Template Picker - Single unified button */}
              <div className="flex items-center gap-2">
                <TemplatePicker
                  onSelect={handleTemplateSelect}
                  filterCategories={["announcement", "general"]}
                  buttonLabel="Choose Template"
                  className="flex-1"
                />
                <AdminInput
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="Campaign name (optional)"
                  className="flex-1"
                />
              </div>

              {/* Subject */}
              <div className="space-y-1">
                <Label className="text-sm text-[hsl(var(--admin-text))]">Subject</Label>
                <AdminInput
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Event Update: Important Information"
                />
              </div>

              {/* Message */}
              <div className="space-y-1">
                <Label className="text-sm text-[hsl(var(--admin-text))]">Message</Label>
                <RichTextEditor
                  content={message}
                  onChange={setMessage}
                  placeholder="Write your announcement here..."
                />
              </div>

              {/* A/B Testing & Scheduling Options */}
              <div className="space-y-3 border border-[hsl(var(--admin-border))] rounded-lg p-3 bg-[hsl(var(--admin-hover))]">
                {/* A/B Testing Toggle */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FlaskConical className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                    <Label className="text-sm font-medium text-[hsl(var(--admin-text))]">A/B Test</Label>
                  </div>
                  <Switch checked={abTestEnabled} onCheckedChange={setAbTestEnabled} />
                </div>
                
                {abTestEnabled && (
                  <div className="space-y-3 pl-6 border-l-2 border-[hsl(var(--admin-primary)/0.2)]">
                    <AdminTabs value={activeVariant} onValueChange={(v) => setActiveVariant(v as "a" | "b")}>
                      <AdminTabsList className="h-8">
                        <AdminTabsTrigger value="a" className="text-xs px-3">Variant A (Original)</AdminTabsTrigger>
                        <AdminTabsTrigger value="b" className="text-xs px-3">Variant B</AdminTabsTrigger>
                      </AdminTabsList>
                    </AdminTabs>
                    
                    {activeVariant === "b" && (
                      <div className="space-y-2">
                        <AdminInput
                          value={abVariantBSubject}
                          onChange={(e) => setAbVariantBSubject(e.target.value)}
                          placeholder="Variant B subject line..."
                          className="text-sm"
                        />
                        <p className="text-xs text-[hsl(var(--admin-text-muted))]">
                          Leave message blank to use same content with different subject
                        </p>
                      </div>
                    )}
                    
                    <div className="flex items-center gap-3">
                      <Label className="text-xs text-[hsl(var(--admin-text-muted))] shrink-0">Test size:</Label>
                      <Slider
                        value={[abTestSize]}
                        onValueChange={([v]) => setAbTestSize(v)}
                        min={10}
                        max={50}
                        step={5}
                        className="flex-1"
                      />
                      <span className="text-xs font-mono w-10">{abTestSize}%</span>
                    </div>
                  </div>
                )}

                {/* Scheduling Toggle */}
                <div className="flex items-center justify-between pt-2 border-t border-[hsl(var(--admin-border))]">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                    <Label className="text-sm font-medium text-[hsl(var(--admin-text))]">Schedule</Label>
                  </div>
                  <Switch checked={isScheduled} onCheckedChange={setIsScheduled} />
                </div>
                
                {isScheduled && (
                  <div className="flex gap-2 pl-6">
                    <AdminInput
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      min={format(new Date(), "yyyy-MM-dd")}
                      className="flex-1"
                    />
                    <AdminInput
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className="w-32"
                    />
                  </div>
                )}
              </div>

              {/* Live Preview Panel */}
              <Collapsible open={showPreviewPanel} onOpenChange={setShowPreviewPanel}>
                <CollapsibleTrigger asChild>
                  <AdminButton variant="ghost" size="sm" className="gap-2 px-2 w-full justify-between">
                    <span className="flex items-center gap-2">
                      <Eye className="h-4 w-4" />
                      <span className="text-sm font-medium">Preview</span>
                    </span>
                    <AdminBadge intent="neutral" className="text-xs">
                      {showPreviewPanel ? "Hide" : "Show"}
                    </AdminBadge>
                  </AdminButton>
                </CollapsibleTrigger>
                
                <CollapsibleContent className="mt-2 space-y-3">
                  <div className="border border-[hsl(var(--admin-border))] rounded-lg overflow-hidden bg-[hsl(var(--admin-hover))]">
                    <iframe
                      srcDoc={generateEmailPreviewHtml(
                        activeVariant === "b" && abVariantBSubject ? abVariantBSubject : subject, 
                        activeVariant === "b" && abVariantBMessage ? abVariantBMessage : message, 
                        "Attendee", 
                        eventTitle, 
                        signatureLine, 
                        signatureName
                      )}
                      className="w-full h-[180px] bg-white"
                      title="Email Preview"
                      sandbox="allow-same-origin"
                    />
                  </div>
                  
                  <div className="flex gap-2 items-center">
                    <AdminInput
                      type="email"
                      value={previewEmail}
                      onChange={(e) => setPreviewEmail(e.target.value)}
                      placeholder="Send test to email..."
                      className="flex-1 text-sm h-9"
                    />
                    <AdminButton 
                      onClick={handleSendPreview} 
                      disabled={isSendingPreview || !previewEmail || !subject || !message} 
                      variant="secondary"
                      size="sm"
                      className="h-9"
                    >
                      {isSendingPreview ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Send className="w-3 h-3 mr-1" />
                          Test
                        </>
                      )}
                    </AdminButton>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>

          {/* Sending Progress Bar */}
          {sendingProgress && (
            <div className="border border-[hsl(var(--admin-border))] rounded-lg p-4 bg-[hsl(var(--admin-hover))] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[hsl(var(--admin-text))]">
                  Sending... {sendingProgress.sent} of {sendingProgress.total}
                </span>
                {canCancel && (
                  <AdminButton
                    variant="secondary"
                    size="sm"
                    onClick={handleCancelSend}
                    className="gap-1 text-[hsl(var(--admin-error))] hover:text-[hsl(var(--admin-error))]"
                  >
                    <X className="h-3 w-3" />
                    Cancel
                  </AdminButton>
                )}
              </div>
              <div className="w-full bg-[hsl(var(--admin-border))] rounded-full h-2">
                <div 
                  className="bg-[hsl(var(--admin-primary))] h-2 rounded-full transition-all"
                  style={{ width: `${(sendingProgress.sent / sendingProgress.total) * 100}%` }}
                />
              </div>
              {sendingProgress.failed > 0 && (
                <p className="text-xs text-[hsl(var(--admin-error))]">{sendingProgress.failed} failed</p>
              )}
            </div>
          )}

          {/* Action Bar */}
          <div className="flex items-center justify-between gap-3 pt-4 border-t border-[hsl(var(--admin-border))] mt-4">
            <div className="text-xs text-[hsl(var(--admin-text-muted))]">
              {isScheduled && scheduledDate && scheduledTime && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Scheduled for {format(new Date(`${scheduledDate}T${scheduledTime}`), "MMM d, h:mm a")}
                </span>
              )}
              {abTestEnabled && abVariantBSubject && (
                <span className="flex items-center gap-1">
                  <FlaskConical className="h-3 w-3" />
                  A/B test: {abTestSize}% split
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <AdminButton variant="ghost" onClick={onClose} disabled={isSending}>
                Cancel
              </AdminButton>
              {isScheduled ? (
                <AdminButton
                  onClick={handleSendClick}
                  disabled={isSending || selectedIds.size === 0 || !subject || !message || !scheduledDate || !scheduledTime}
                  className="gap-2"
                >
                  <Calendar className="w-4 h-4" />
                  Schedule
                </AdminButton>
              ) : (
                <AdminButton
                  onClick={handleSendClick}
                  disabled={isSending || selectedIds.size === 0 || !subject || !message}
                  className="gap-2 min-w-[140px]"
                >
                  {isSending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Send to {selectedIds.size}
                </AdminButton>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent className="max-w-md bg-[hsl(var(--admin-surface))]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-[hsl(var(--admin-warning))]">
              <AlertTriangle className="h-6 w-6" />
              {isScheduled ? "Confirm Schedule" : "Confirm Bulk Email"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4 pt-2">
              <div className="bg-[hsl(var(--admin-warning)/0.1)] border border-[hsl(var(--admin-warning)/0.3)] rounded-lg p-4 text-[hsl(var(--admin-warning))]">
                <p className="font-semibold text-base flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  {isScheduled ? "Scheduling for" : "Sending to"} {selectedIds.size} recipients
                </p>
                {abTestEnabled && abVariantBSubject && (
                  <p className="text-sm mt-2 flex items-center gap-1">
                    <FlaskConical className="h-4 w-4" />
                    A/B test enabled: {abTestSize}% split between variants
                  </p>
                )}
              </div>
              <p className="text-sm text-[hsl(var(--admin-text-muted))]">
                <strong>Subject:</strong> {subject}
              </p>
              <p className="text-sm text-[hsl(var(--admin-text-muted))]">
                This action cannot be undone. Are you sure you want to proceed?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <AdminButton variant="ghost">Cancel</AdminButton>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <AdminButton onClick={isScheduled ? handleSchedule : handleSend}>
                {isScheduled ? (
                  <>
                    <Calendar className="w-4 h-4 mr-2" />
                    Schedule Campaign
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Send Now
                  </>
                )}
              </AdminButton>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
