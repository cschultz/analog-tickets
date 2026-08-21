import { useState, useEffect } from "react";
import { 
  AdminCard, 
  AdminCardContent, 
  AdminCardDescription, 
  AdminCardHeader, 
  AdminCardTitle,
  AdminTable, 
  AdminTableBody, 
  AdminTableCell, 
  AdminTableHead, 
  AdminTableHeader, 
  AdminTableRow, 
  AdminButton, 
  AdminBadge,
  AdminDialog, 
  AdminDialogContent, 
  AdminDialogDescription, 
  AdminDialogHeader, 
  AdminDialogTitle,
} from "@/components/admin";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Mail, ChevronDown, ChevronRight, Eye, Paperclip, MousePointer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

interface EmailRecipient {
  id: string;
  contact_id: string;
  artist_id: string;
  status: string;
  open_count: number;
  click_count: number;
  sent_at: string | null;
  contact?: {
    name: string;
    email: string;
    role: string;
  };
  artist?: {
    name: string;
  };
}

interface SentEmail {
  id: string;
  subject: string;
  body_html: string;
  target_roles: string[] | null;
  sent_at: string;
  recipients?: EmailRecipient[];
  attachments?: { name: string; path: string }[];
}

interface ArtistEmailHistoryProps {
  eventId?: string;
}

const ROLE_LABELS: Record<string, string> = {
  manager: "Manager",
  agent: "Agent",
  marketing: "Marketing",
  publicist: "Publicist",
  tour_manager: "Tour Manager",
  artist_direct: "Artist Direct",
  label_rep: "Label Rep",
  other: "Other",
};

const ArtistEmailHistory = ({ eventId }: ArtistEmailHistoryProps) => {
  const [emails, setEmails] = useState<SentEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const [previewEmail, setPreviewEmail] = useState<SentEmail | null>(null);

  useEffect(() => {
    if (eventId) {
      fetchEmails();
    }
  }, [eventId]);

  const fetchEmails = async () => {
    if (!eventId) return;
    
    setLoading(true);
    try {
      // Fetch emails
      const { data: emailsData, error: emailsError } = await supabase
        .from("artist_emails")
        .select("*")
        .eq("event_id", eventId)
        .order("sent_at", { ascending: false });

      if (emailsError) throw emailsError;

      // Fetch recipients and attachments (only if we have emails)
      const emailIds = emailsData?.map(e => e.id) || [];
      
      let recipientsData: any[] = [];
      let attachmentsData: any[] = [];
      
      if (emailIds.length > 0) {
        const { data: recipients, error: recipientsError } = await supabase
          .from("artist_email_recipients")
          .select(`
            *,
            contact:artist_contacts(name, email, role),
            artist:artists(name)
          `)
          .in("email_id", emailIds);

        if (recipientsError) throw recipientsError;
        recipientsData = recipients || [];

        const { data: attachments, error: attachmentsError } = await supabase
          .from("artist_email_attachments")
          .select("*")
          .in("email_id", emailIds);

        if (attachmentsError) throw attachmentsError;
        attachmentsData = attachments || [];
      }

      // Merge data
      const emailsWithDetails = emailsData?.map(email => ({
        ...email,
        recipients: recipientsData?.filter(r => r.email_id === email.id) || [],
        attachments: attachmentsData?.filter(a => a.email_id === email.id).map(a => ({
          name: a.file_name,
          path: a.file_path,
        })) || [],
      })) || [];

      setEmails(emailsWithDetails);
    } catch (error: any) {
      toast.error("Failed to fetch email history: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const getEmailStats = (email: SentEmail) => {
    const recipients = email.recipients || [];
    const sent = recipients.filter(r => r.status === "sent").length;
    const opened = recipients.filter(r => r.open_count > 0).length;
    const clicked = recipients.filter(r => r.click_count > 0).length;
    return { total: recipients.length, sent, opened, clicked };
  };

  if (!eventId) {
    return (
      <AdminCard>
        <AdminCardContent className="pt-6">
          <p className="text-[hsl(var(--admin-text-muted))] text-center">Please select an event to view email history.</p>
        </AdminCardContent>
      </AdminCard>
    );
  }

  return (
    <>
      <AdminCard>
        <AdminCardHeader icon={Mail}>
          <div>
            <AdminCardTitle>Email History</AdminCardTitle>
            <AdminCardDescription>
              View sent emails and their engagement metrics
            </AdminCardDescription>
          </div>
        </AdminCardHeader>
        <AdminCardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin h-8 w-8 border-4 border-[hsl(var(--admin-primary))] border-t-transparent rounded-full" />
            </div>
          ) : emails.length === 0 ? (
            <div className="text-center py-8 text-[hsl(var(--admin-text-muted))]">
              <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No emails sent yet.</p>
              <p className="text-sm">Sent emails will appear here with engagement stats.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {emails.map((email) => {
                const stats = getEmailStats(email);
                const isExpanded = expandedEmail === email.id;

                return (
                  <Collapsible 
                    key={email.id} 
                    open={isExpanded}
                    onOpenChange={() => setExpandedEmail(isExpanded ? null : email.id)}
                  >
                    <div className="border border-[hsl(var(--admin-border))] rounded-lg">
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-[hsl(var(--admin-muted))]">
                          <div className="flex items-center gap-3">
                            <AdminButton variant="adminGhost" size="sm" className="p-0 h-auto">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </AdminButton>
                            <div>
                              <h4 className="font-medium text-[hsl(var(--admin-text))]">{email.subject}</h4>
                              <p className="text-sm text-[hsl(var(--admin-text-muted))]">
                                {format(new Date(email.sent_at), "MMM d, yyyy 'at' h:mm a")}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            {email.attachments && email.attachments.length > 0 && (
                              <AdminBadge intent="neutral" className="gap-1">
                                <Paperclip className="h-3 w-3" />
                                {email.attachments.length}
                              </AdminBadge>
                            )}
                            <div className="flex items-center gap-2 text-sm">
                              <AdminBadge intent="info">{stats.total} sent</AdminBadge>
                              <AdminBadge intent="neutral" className="gap-1">
                                <Eye className="h-3 w-3" />
                                {stats.opened}
                              </AdminBadge>
                              <AdminBadge intent="neutral" className="gap-1">
                                <MousePointer className="h-3 w-3" />
                                {stats.clicked}
                              </AdminBadge>
                            </div>
                            <AdminButton 
                              variant="adminGhost" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewEmail(email);
                              }}
                            >
                              Preview
                            </AdminButton>
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="border-t border-[hsl(var(--admin-border))] p-4 bg-[hsl(var(--admin-muted))]">
                          <AdminTable>
                            <AdminTableHeader>
                              <AdminTableRow>
                                <AdminTableHead>Artist</AdminTableHead>
                                <AdminTableHead>Contact</AdminTableHead>
                                <AdminTableHead>Role</AdminTableHead>
                                <AdminTableHead>Status</AdminTableHead>
                                <AdminTableHead>Opens</AdminTableHead>
                                <AdminTableHead>Clicks</AdminTableHead>
                              </AdminTableRow>
                            </AdminTableHeader>
                            <AdminTableBody>
                              {email.recipients?.map((recipient) => (
                                <AdminTableRow key={recipient.id}>
                                  <AdminTableCell>{recipient.artist?.name || "-"}</AdminTableCell>
                                  <AdminTableCell>
                                    <div>
                                      <div className="text-[hsl(var(--admin-text))]">{recipient.contact?.name}</div>
                                      <div className="text-sm text-[hsl(var(--admin-text-muted))]">
                                        {recipient.contact?.email}
                                      </div>
                                    </div>
                                  </AdminTableCell>
                                  <AdminTableCell>
                                    <AdminBadge intent="neutral">
                                      {ROLE_LABELS[recipient.contact?.role || ""] || recipient.contact?.role}
                                    </AdminBadge>
                                  </AdminTableCell>
                                  <AdminTableCell>
                                    <AdminBadge intent={recipient.status === "sent" ? "success" : "danger"}>
                                      {recipient.status}
                                    </AdminBadge>
                                  </AdminTableCell>
                                  <AdminTableCell>{recipient.open_count || 0}</AdminTableCell>
                                  <AdminTableCell>{recipient.click_count || 0}</AdminTableCell>
                                </AdminTableRow>
                              ))}
                            </AdminTableBody>
                          </AdminTable>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </AdminCardContent>
      </AdminCard>

      <AdminDialog open={!!previewEmail} onOpenChange={() => setPreviewEmail(null)}>
        <AdminDialogContent size="lg" className="max-h-[80vh] overflow-y-auto">
          <AdminDialogHeader>
            <AdminDialogTitle>{previewEmail?.subject}</AdminDialogTitle>
            <AdminDialogDescription>
              Sent on {previewEmail && format(new Date(previewEmail.sent_at), "MMMM d, yyyy 'at' h:mm a")}
            </AdminDialogDescription>
          </AdminDialogHeader>
          <div 
            className="prose prose-sm max-w-none mt-4"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewEmail?.body_html || "") }}
          />
          {previewEmail?.attachments && previewEmail.attachments.length > 0 && (
            <div className="mt-4 pt-4 border-t border-[hsl(var(--admin-border))]">
              <h4 className="text-sm font-medium mb-2 text-[hsl(var(--admin-text))]">Attachments</h4>
              <div className="flex flex-wrap gap-2">
                {previewEmail.attachments.map((att, i) => (
                  <AdminBadge key={i} intent="info" className="gap-1">
                    <Paperclip className="h-3 w-3" />
                    {att.name}
                  </AdminBadge>
                ))}
              </div>
            </div>
          )}
        </AdminDialogContent>
      </AdminDialog>
    </>
  );
};

export default ArtistEmailHistory;
