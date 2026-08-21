import { useState, useEffect, useRef } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Paperclip, X, Send, Users, FileIcon, Eye, Edit, ChevronDown, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RichTextEditor } from "@/components/RichTextEditor";
import MergeFieldToolbar from "./MergeFieldToolbar";
import EmailPreviewPanel from "./EmailPreviewPanel";
import SendTestEmailButton from "./SendTestEmailButton";
import ScheduleSendButton from "./ScheduleSendButton";
import { EmailSuccessAnimation } from "@/components/email/EmailSuccessAnimation";
import { MobileBottomActionBar } from "./MobileBottomActionBar";
import { MobileBulkArtistSelector } from "./MobileBulkArtistSelector";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  AdminButton,
  AdminInput,
  AdminLabel,
  AdminSelect,
  AdminSelectItem,
  AdminBadge,
  AdminScrollArea,
  AdminCheckbox,
  AdminTabs,
  AdminTabsContent,
  AdminTabsList,
  AdminTabsTrigger,
} from "@/components/admin";
import {
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminCardTitle,
  AdminCardDescription,
} from "@/components/admin/AdminCard";

interface ArtistOffer {
  performance_date: string | null;
  set_time: string | null;
  stage: string | null;
  set_length_minutes: number | null;
  offer_amount: number | null;
  guest_list_count: number | null;
  venue_name: string | null;
}

interface Artist {
  id: string;
  name: string;
  contacts: ArtistContact[];
  offer?: ArtistOffer | null;
}

interface ArtistContact {
  id: string;
  name: string;
  email: string;
  role: string;
  artist_id: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  category: string;
}

interface UploadedFile {
  name: string;
  path: string;
  size: number;
  type: string;
}

interface EventDetails {
  title: string;
  event_date: string;
  venue_name: string;
}

interface ArtistEmailComposerProps {
  eventId?: string;
}

const ROLES = [
  { value: "all", label: "All Contacts" },
  { value: "manager", label: "Managers" },
  { value: "agent", label: "Agents" },
  { value: "marketing", label: "Marketing" },
  { value: "publicist", label: "Publicists" },
  { value: "tour_manager", label: "Tour Managers" },
  { value: "artist_direct", label: "Artists Direct" },
  { value: "label_rep", label: "Label Reps" },
  { value: "other", label: "Other" },
];

const ArtistEmailComposer = ({ eventId }: ArtistEmailComposerProps) => {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [eventDetails, setEventDetails] = useState<EventDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastSentCount, setLastSentCount] = useState(0);
  const isMobile = useIsMobile();
  
  const [selectedRoles, setSelectedRoles] = useState<string[]>(["all"]);
  const [selectedArtists, setSelectedArtists] = useState<string[]>([]);
  const [selectAllArtists, setSelectAllArtists] = useState(true);
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"compose" | "preview">("compose");
  const [templateOpen, setTemplateOpen] = useState(!isMobile);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (eventId) {
      fetchData();
    }
  }, [eventId]);

  const fetchData = async () => {
    if (!eventId) return;
    
    setLoading(true);
    try {
      const { data: eventData } = await supabase
        .from("event_details")
        .select("title, event_date, venue_name")
        .eq("id", eventId)
        .single();

      if (eventData) setEventDetails(eventData);

      const { data: artistsData, error: artistsError } = await supabase
        .from("artists")
        .select("id, name")
        .eq("event_id", eventId)
        .order("name");

      if (artistsError) throw artistsError;

      // Fetch contacts and offers (only if we have artists)
      const artistIds = artistsData?.map(a => a.id) || [];
      
      let contactsData: any[] = [];
      let offersData: any[] = [];
      
      if (artistIds.length > 0) {
        const { data: contacts } = await supabase
          .from("artist_contacts")
          .select("*")
          .in("artist_id", artistIds);
        contactsData = contacts || [];

        const { data: offers } = await supabase
          .from("artist_offers")
          .select("artist_id, performance_date, set_time, stage, set_length_minutes, offer_amount, guest_list_count, venue_name")
          .eq("event_id", eventId)
          .in("artist_id", artistIds);
        offersData = offers || [];
      }

      const artistsWithData = artistsData?.map(artist => ({
        ...artist,
        contacts: contactsData?.filter(c => c.artist_id === artist.id) || [],
        offer: offersData?.find(o => o.artist_id === artist.id) || null,
      })) || [];

      setArtists(artistsWithData);
      setSelectedArtists(artistsWithData.map(a => a.id));

      const { data: templatesData } = await supabase
        .from("artist_email_templates")
        .select("*")
        .or(`event_id.eq.${eventId},event_id.is.null`)
        .order("name");

      setTemplates(templatesData || []);
    } catch (error: any) {
      toast.error("Failed to fetch data: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setSubject(template.subject);
      setBodyHtml(template.body_html);
    }
  };

  const handleRoleToggle = (role: string) => {
    if (role === "all") {
      setSelectedRoles(["all"]);
    } else {
      const newRoles = selectedRoles.includes(role)
        ? selectedRoles.filter(r => r !== role)
        : [...selectedRoles.filter(r => r !== "all"), role];
      setSelectedRoles(newRoles.length === 0 ? ["all"] : newRoles);
    }
  };

  const handleArtistToggle = (artistId: string) => {
    const newSelected = selectedArtists.includes(artistId)
      ? selectedArtists.filter(id => id !== artistId)
      : [...selectedArtists, artistId];
    setSelectedArtists(newSelected);
    setSelectAllArtists(newSelected.length === artists.length);
  };

  const handleSelectAllArtists = (checked: boolean) => {
    setSelectAllArtists(checked);
    setSelectedArtists(checked ? artists.map(a => a.id) : []);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const newAttachments: UploadedFile[] = [];

    try {
      for (const file of Array.from(files)) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `attachments/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("artist-attachments")
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        newAttachments.push({
          name: file.name,
          path: filePath,
          size: file.size,
          type: file.type,
        });
      }

      setAttachments([...attachments, ...newAttachments]);
      toast.success(`${newAttachments.length} file(s) uploaded`);
    } catch (error: any) {
      toast.error("Failed to upload file: " + error.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeAttachment = async (index: number) => {
    const attachment = attachments[index];
    try {
      await supabase.storage.from("artist-attachments").remove([attachment.path]);
      setAttachments(attachments.filter((_, i) => i !== index));
    } catch (error: any) {
      toast.error("Failed to remove attachment: " + error.message);
    }
  };

  const getRecipientCount = () => {
    let count = 0;
    const targetArtists = artists.filter(a => selectedArtists.includes(a.id));
    for (const artist of targetArtists) {
      for (const contact of artist.contacts) {
        if (selectedRoles.includes("all") || selectedRoles.includes(contact.role)) {
          count++;
        }
      }
    }
    return count;
  };

  const handleInsertField = (tag: string) => {
    setBodyHtml(prev => prev + tag);
  };

  const handleSend = async (scheduledFor?: Date) => {
    if (!eventId || !subject.trim() || !bodyHtml.trim() || selectedArtists.length === 0) {
      toast.error("Please fill in all required fields");
      return;
    }

    const recipientCount = getRecipientCount();
    if (recipientCount === 0) {
      toast.error("No recipients match your selection criteria");
      return;
    }

    const confirmMessage = scheduledFor 
      ? `Schedule this email to ${recipientCount} recipient(s)?`
      : `Send this email to ${recipientCount} recipient(s)?`;
    
    if (!confirm(confirmMessage)) return;

    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke("send-artist-email", {
        body: {
          eventId,
          subject,
          bodyHtml,
          targetRoles: selectedRoles.includes("all") ? null : selectedRoles,
          artistIds: selectedArtists,
          attachments: attachments.map(a => ({ name: a.name, path: a.path })),
          scheduledFor: scheduledFor?.toISOString(),
        },
      });

      if (response.error) throw response.error;

      if (scheduledFor) {
        toast.success(`Email scheduled for ${recipientCount} recipient(s)`);
      } else {
        setLastSentCount(recipientCount);
        setShowSuccess(true);
      }
      
      setSubject("");
      setBodyHtml("");
      setAttachments([]);
      setSelectedTemplate("");
    } catch (error: any) {
      toast.error("Failed to send email: " + error.message);
    } finally {
      setSending(false);
    }
  };

  if (!eventId) {
    return (
      <AdminCard>
        <AdminCardContent className="pt-6">
          <p className="text-[hsl(var(--admin-text-muted))] text-center">Please select an event to send artist emails.</p>
        </AdminCardContent>
      </AdminCard>
    );
  }

  if (loading) {
    return (
      <AdminCard>
        <AdminCardContent className="pt-6">
          <div className="flex justify-center py-8">
            <div className="animate-spin h-8 w-8 border-4 border-[hsl(var(--admin-accent))] border-t-transparent rounded-full" />
          </div>
        </AdminCardContent>
      </AdminCard>
    );
  }

  const recipientCount = getRecipientCount();

  return (
    <>
      <EmailSuccessAnimation 
        show={showSuccess}
        recipientCount={lastSentCount}
        onComplete={() => setShowSuccess(false)}
      />

      <div className={cn("space-y-4", isMobile && "pb-32")}>
        {/* Mobile: Artist/Role Selector Sheet */}
        {isMobile && (
          <MobileBulkArtistSelector
            artists={artists}
            roles={ROLES}
            selectedArtists={selectedArtists}
            selectedRoles={selectedRoles}
            onArtistToggle={handleArtistToggle}
            onRoleToggle={handleRoleToggle}
            onSelectAllArtists={handleSelectAllArtists}
            selectAllArtists={selectAllArtists}
            recipientCount={recipientCount}
          />
        )}

        {/* Mobile: Collapsible Template Selection */}
        {isMobile && (
          <Collapsible open={templateOpen} onOpenChange={setTemplateOpen}>
            <AdminCard>
              <CollapsibleTrigger asChild>
                <AdminCardHeader className="cursor-pointer hover:bg-[hsl(var(--admin-hover))] py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      <AdminCardTitle className="text-base">Template</AdminCardTitle>
                    </div>
                    <ChevronDown className={cn("h-4 w-4 transition-transform", templateOpen && "rotate-180")} />
                  </div>
                </AdminCardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <AdminCardContent className="pt-0">
                  <AdminSelect value={selectedTemplate} onValueChange={handleTemplateChange} placeholder="Select a template">
                    {templates.map((t) => (
                      <AdminSelectItem key={t.id} value={t.id}>{t.name}</AdminSelectItem>
                    ))}
                  </AdminSelect>
                </AdminCardContent>
              </CollapsibleContent>
            </AdminCard>
          </Collapsible>
        )}

        <div className={cn(!isMobile && "grid gap-6 lg:grid-cols-3")}>
          <div className={cn(!isMobile && "lg:col-span-2", "space-y-4")}>
            <AdminCard>
              <AdminCardHeader className={cn(isMobile && "pb-3")}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <AdminCardTitle className={cn(isMobile && "text-base")}>Compose Email</AdminCardTitle>
                    {!isMobile && (
                      <AdminCardDescription>Send to artist teams with dynamic merge fields</AdminCardDescription>
                    )}
                  </div>
                  <AdminTabs value={activeTab} onValueChange={(v) => setActiveTab(v as "compose" | "preview")}>
                    <AdminTabsList className={cn(isMobile && "h-8")}>
                      <AdminTabsTrigger value="compose" className={cn("gap-1", isMobile && "text-xs px-2")}>
                        <Edit className="h-3 w-3" />
                        {!isMobile && "Compose"}
                      </AdminTabsTrigger>
                      <AdminTabsTrigger value="preview" className={cn("gap-1", isMobile && "text-xs px-2")}>
                        <Eye className="h-3 w-3" />
                        {!isMobile && "Preview"}
                      </AdminTabsTrigger>
                    </AdminTabsList>
                  </AdminTabs>
                </div>
              </AdminCardHeader>
              <AdminCardContent className="space-y-4">
                {activeTab === "compose" ? (
                  <>
                    {!isMobile && (
                      <div className="space-y-2">
                        <AdminLabel>Load Template</AdminLabel>
                        <AdminSelect value={selectedTemplate} onValueChange={handleTemplateChange} placeholder="Select a template (optional)">
                          {templates.map((t) => (
                            <AdminSelectItem key={t.id} value={t.id}>{t.name}</AdminSelectItem>
                          ))}
                        </AdminSelect>
                      </div>
                    )}

                    <div className="space-y-2">
                      <AdminLabel htmlFor="subject" className="text-sm">Subject *</AdminLabel>
                      <AdminInput
                        id="subject"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="Email subject..."
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <AdminLabel className="text-sm">Message *</AdminLabel>
                        <MergeFieldToolbar onInsertField={handleInsertField} />
                      </div>
                      <RichTextEditor content={bodyHtml} onChange={setBodyHtml} />
                    </div>

                    <div className="space-y-2">
                      <AdminLabel className="text-sm">Attachments</AdminLabel>
                      <div className="flex items-center gap-2">
                        <AdminButton variant="adminOutline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                          <Paperclip className="h-4 w-4 mr-2" />
                          {uploading ? "Uploading..." : "Add Files"}
                        </AdminButton>
                        <input ref={fileInputRef} type="file" multiple onChange={handleFileUpload} className="hidden" />
                      </div>
                      {attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {attachments.map((file, index) => (
                            <AdminBadge key={index} intent="neutral" className="flex items-center gap-1 py-1">
                              <FileIcon className="h-3 w-3" />
                              <span className="max-w-[100px] truncate">{file.name}</span>
                              <AdminButton variant="ghost" size="sm" className="h-4 w-4 p-0 ml-1" onClick={() => removeAttachment(index)}>
                                <X className="h-3 w-3" />
                              </AdminButton>
                            </AdminBadge>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <EmailPreviewPanel
                    subject={subject}
                    bodyHtml={bodyHtml}
                    artists={artists}
                    selectedArtistIds={selectedArtists}
                    eventDetails={eventDetails}
                  />
                )}

                {/* Desktop action bar */}
                {!isMobile && (
                  <div className="flex items-center justify-between pt-4 border-t border-[hsl(var(--admin-border))]">
                    <div className="flex items-center gap-2 text-sm text-[hsl(var(--admin-text-muted))]">
                      <Users className="h-4 w-4" />
                      <span>{recipientCount} recipient(s)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <SendTestEmailButton
                        eventId={eventId}
                        subject={subject}
                        bodyHtml={bodyHtml}
                        sampleArtistId={selectedArtists[0]}
                        disabled={!subject.trim() || !bodyHtml.trim()}
                      />
                      <ScheduleSendButton
                        onSchedule={(date) => handleSend(date)}
                        disabled={!subject.trim() || !bodyHtml.trim() || selectedArtists.length === 0}
                        sending={sending}
                      />
                      <AdminButton onClick={() => handleSend()} disabled={sending}>
                        <Send className="h-4 w-4 mr-2" />
                        {sending ? "Sending..." : "Send Now"}
                      </AdminButton>
                    </div>
                  </div>
                )}
              </AdminCardContent>
            </AdminCard>
          </div>

          {/* Desktop sidebar */}
          {!isMobile && (
            <div className="space-y-6">
              <AdminCard>
                <AdminCardHeader>
                  <AdminCardTitle className="text-base">Filter by Role</AdminCardTitle>
                </AdminCardHeader>
                <AdminCardContent>
                  <div className="space-y-2">
                    {ROLES.map((role) => (
                      <div key={role.value} className="flex items-center gap-2">
                        <AdminCheckbox
                          id={`role-${role.value}`}
                          checked={selectedRoles.includes(role.value)}
                          onCheckedChange={() => handleRoleToggle(role.value)}
                        />
                        <AdminLabel htmlFor={`role-${role.value}`} className="cursor-pointer">{role.label}</AdminLabel>
                      </div>
                    ))}
                  </div>
                </AdminCardContent>
              </AdminCard>

              <AdminCard>
                <AdminCardHeader>
                  <AdminCardTitle className="text-base">Select Artists</AdminCardTitle>
                </AdminCardHeader>
                <AdminCardContent>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    <div className="flex items-center gap-2 pb-2 border-b border-[hsl(var(--admin-border))]">
                      <AdminCheckbox
                        id="select-all"
                        checked={selectAllArtists}
                        onCheckedChange={(checked) => handleSelectAllArtists(!!checked)}
                      />
                      <AdminLabel htmlFor="select-all" className="cursor-pointer font-medium">Select All ({artists.length})</AdminLabel>
                    </div>
                    {artists.map((artist) => (
                      <div key={artist.id} className="flex items-center gap-2">
                        <AdminCheckbox
                          id={`artist-${artist.id}`}
                          checked={selectedArtists.includes(artist.id)}
                          onCheckedChange={() => handleArtistToggle(artist.id)}
                        />
                        <AdminLabel htmlFor={`artist-${artist.id}`} className="cursor-pointer">
                          {artist.name}
                          <span className="text-[hsl(var(--admin-text-muted))] text-xs ml-1">({artist.contacts.length})</span>
                        </AdminLabel>
                      </div>
                    ))}
                  </div>
                </AdminCardContent>
              </AdminCard>
            </div>
          )}
        </div>

        {/* Mobile bottom action bar */}
        {isMobile && (
          <MobileBottomActionBar
            variant="bulk"
            recipientCount={recipientCount}
            onBulkSend={() => handleSend()}
            sending={sending}
            disabled={!subject.trim() || !bodyHtml.trim() || selectedArtists.length === 0}
          />
        )}
      </div>
    </>
  );
};

export default ArtistEmailComposer;
