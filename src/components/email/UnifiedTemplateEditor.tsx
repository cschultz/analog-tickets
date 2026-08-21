import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  AdminButton,
  AdminInput,
  AdminLabel,
  AdminSelect,
  AdminSelectItem,
  AdminConfirmDialog,
  AdminTabs,
  AdminTabsContent,
  AdminTabsList,
  AdminTabsTrigger,
  AdminBadge,
} from "@/components/admin";
import {
  AdminSheet,
  AdminSheetContent,
  AdminSheetHeader,
  AdminSheetTitle,
  AdminSheetDescription,
  AdminSheetFooter,
} from "@/components/admin/AdminSheet";
import {
  AdminCard,
  AdminCardContent,
  AdminCardDescription,
  AdminCardHeader,
  AdminCardTitle,
} from "@/components/admin/AdminCard";
import { AdminScrollArea } from "@/components/admin/AdminScrollArea";
import { RichTextEditor, RichTextEditorRef } from "@/components/RichTextEditor";
import { MergeFieldPicker } from "@/components/email/MergeFieldPicker";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  FileText,
  Plus,
  Save,
  Trash2,
  Search,
  Loader2,
  Eye,
  Edit2,
  History,
  Clock,
  RotateCcw,
  Send,
  Megaphone,
  GitBranch,
  Receipt,
  Sparkles,
  X,
} from "lucide-react";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

// =============================================================================
// TYPES
// =============================================================================

export type TemplateCategory = "transactional" | "announcement" | "sequence";
export type TemplateAudience = "customer" | "artist" | "vendor" | "partner" | "artisan" | "production" | "internal";

export interface UnifiedTemplate {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  category: TemplateCategory;
  audience: TemplateAudience;
  source: string;
  template_key?: string;
  updated_at?: string;
  isSystemTemplate?: boolean;
}

interface TemplateVersion {
  id: string;
  version_number: number;
  subject: string;
  body_html: string;
  change_summary: string | null;
  created_at: string;
  changed_by: string | null;
}

// =============================================================================
// CONFIG
// =============================================================================

const CATEGORY_TABS = [
  { value: "transactional", label: "Transactional", icon: Receipt, description: "Confirmations, invites, reminders" },
  { value: "announcement", label: "Announcements", icon: Megaphone, description: "One-off bulk emails" },
  { value: "sequence", label: "Sequences", icon: GitBranch, description: "Drip campaign templates" },
] as const;

const AUDIENCE_CONFIG: Record<TemplateAudience, { label: string; icon: string; color: string }> = {
  customer: { label: "Customer", icon: "👤", color: "bg-[hsl(var(--admin-success)/0.15)] text-[hsl(var(--admin-success))]" },
  artist: { label: "Artist", icon: "🎵", color: "bg-[hsl(var(--admin-accent-magenta)/0.15)] text-[hsl(var(--admin-accent-magenta))]" },
  vendor: { label: "Vendor", icon: "🍽️", color: "bg-[hsl(var(--admin-warning)/0.15)] text-[hsl(var(--admin-warning))]" },
  partner: { label: "Partner", icon: "🤝", color: "bg-[hsl(var(--admin-info)/0.15)] text-[hsl(var(--admin-info))]" },
  artisan: { label: "Artisan", icon: "🎨", color: "bg-[hsl(var(--admin-accent-purple)/0.15)] text-[hsl(var(--admin-accent-purple))]" },
  production: { label: "Production", icon: "🔧", color: "bg-[hsl(var(--admin-warning)/0.15)] text-[hsl(var(--admin-warning))]" },
  internal: { label: "Internal", icon: "🏠", color: "bg-[hsl(var(--admin-text-muted)/0.15)] text-[hsl(var(--admin-text-muted))]" },
};

const TRANSACTIONAL_TEMPLATES = [
  { key: "ticket_confirmation", name: "Ticket Confirmation", description: "Sent after successful ticket purchase" },
  { key: "payment_failed", name: "Payment Failed", description: "Sent when payment is declined" },
  { key: "payment_reminder", name: "Payment Reminder", description: "Reminder to complete pending purchase" },
  { key: "event_reminder", name: "Event Reminder", description: "Reminder before the event" },
  { key: "abandoned_registration", name: "Abandoned Registration", description: "Recovery email for abandoned carts" },
  { key: "abandoned_registration_followup", name: "Abandoned Follow-up", description: "Second recovery attempt" },
  { key: "post_event_thank_you", name: "Post-Event Thank You", description: "Thank you after event concludes" },
  { key: "lodging_invite", name: "Lodging Invite", description: "Waitlist invitation to book lodging" },
];

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function UnifiedTemplateEditor() {
  const queryClient = useQueryClient();
  const editorRef = useRef<RichTextEditorRef>(null);

  // State
  const [activeCategory, setActiveCategory] = useState<TemplateCategory>("transactional");
  const [selectedTemplate, setSelectedTemplate] = useState<UnifiedTemplate | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [audienceFilter, setAudienceFilter] = useState<TemplateAudience | "all">("all");
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [isSendingTest, setIsSendingTest] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    subject: "",
    body_html: "",
    audience: "customer" as TemplateAudience,
  });

  // =============================================================================
  // DATA FETCHING
  // =============================================================================

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["unified-templates"],
    queryFn: async () => {
      const allTemplates: UnifiedTemplate[] = [];

      // 1. Fetch transactional templates from email_templates
      const { data: emailTemplates } = await supabase
        .from("email_templates")
        .select("id, template_type, subject, heading, intro_text, footer_text, updated_at")
        .order("template_type");

      (emailTemplates || []).forEach((t) => {
        if (t.template_type.startsWith("announcement:")) return;

        const config = TRANSACTIONAL_TEMPLATES.find((c) => c.key === t.template_type);
        allTemplates.push({
          id: t.id,
          name: config?.name || t.template_type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
          subject: t.subject,
          body_html: t.intro_text || "",
          category: "transactional",
          audience: "customer",
          source: "email_templates",
          template_key: t.template_type,
          updated_at: t.updated_at,
          isSystemTemplate: true,
        });
      });

      // 2. Fetch lodging invite from lodging_settings
      const { data: lodgingSettings } = await supabase
        .from("lodging_settings")
        .select("id, invite_email_subject, invite_email_body, updated_at")
        .limit(1)
        .maybeSingle();

      if (lodgingSettings) {
        allTemplates.push({
          id: lodgingSettings.id,
          name: "Lodging Invite",
          subject: lodgingSettings.invite_email_subject || "",
          body_html: lodgingSettings.invite_email_body || "",
          category: "transactional",
          audience: "customer",
          source: "lodging_settings",
          template_key: "lodging_invite",
          updated_at: lodgingSettings.updated_at,
          isSystemTemplate: true,
        });
      }

      // 3. Fetch announcement templates from artist_email_templates
      const { data: artistTemplates } = await supabase
        .from("artist_email_templates")
        .select("id, name, subject, body_html, category, audience, updated_at")
        .order("updated_at", { ascending: false });

      (artistTemplates || []).forEach((t) => {
        let category: TemplateCategory = "announcement";
        if (t.name?.toLowerCase().includes("sequence") || t.name?.toLowerCase().includes("drip")) {
          category = "sequence";
        }

        allTemplates.push({
          id: t.id,
          name: t.name,
          subject: t.subject,
          body_html: t.body_html,
          category,
          audience: (t.audience as TemplateAudience) || "customer",
          source: "artist_email_templates",
          updated_at: t.updated_at,
          isSystemTemplate: false,
        });
      });

      // 4. Also fetch announcement templates from email_templates table
      const { data: announcementTemplates } = await supabase
        .from("email_templates")
        .select("id, template_type, subject, intro_text, updated_at")
        .like("template_type", "announcement:%");

      (announcementTemplates || []).forEach((t) => {
        allTemplates.push({
          id: t.id,
          name: t.template_type.replace("announcement:", ""),
          subject: t.subject,
          body_html: t.intro_text || "",
          category: "announcement",
          audience: "customer",
          source: "email_templates",
          updated_at: t.updated_at,
          isSystemTemplate: false,
        });
      });

      return allTemplates;
    },
  });

  // Fetch version history for selected template
  const { data: versions = [] } = useQuery({
    queryKey: ["template-versions", selectedTemplate?.id, selectedTemplate?.source],
    enabled: !!selectedTemplate && isEditorOpen,
    queryFn: async () => {
      if (!selectedTemplate) return [];
      
      const { data, error } = await supabase
        .from("email_template_versions")
        .select("*")
        .eq("template_source", selectedTemplate.source)
        .eq("template_id", selectedTemplate.template_key || selectedTemplate.id)
        .order("version_number", { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data || []) as TemplateVersion[];
    },
  });

  // =============================================================================
  // FILTERING
  // =============================================================================

  const filteredTemplates = useMemo(() => {
    return templates
      .filter((t) => {
        const matchesCategory = t.category === activeCategory;
        const matchesAudience = audienceFilter === "all" || t.audience === audienceFilter;
        const matchesSearch =
          !searchQuery ||
          t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.subject.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesAudience && matchesSearch;
      })
      .sort((a, b) => {
        // Sort by audience first, then by name
        if (a.audience !== b.audience) {
          return a.audience.localeCompare(b.audience);
        }
        return a.name.localeCompare(b.name);
      });
  }, [templates, activeCategory, audienceFilter, searchQuery]);

  // Get unique audiences in current category for the filter
  const audiencesInCategory = useMemo(() => {
    const audiences = new Set<TemplateAudience>();
    templates
      .filter((t) => t.category === activeCategory)
      .forEach((t) => audiences.add(t.audience));
    return Array.from(audiences).sort();
  }, [templates, activeCategory]);

  // =============================================================================
  // HANDLERS
  // =============================================================================

  const handleCreateNew = () => {
    setSelectedTemplate(null);
    setFormData({
      name: "",
      subject: "",
      body_html: "",
      audience: "customer",
    });
    setHasChanges(false);
    setShowPreview(false);
    setShowHistory(false);
    setIsEditorOpen(true);
  };

  const handleEdit = (template: UnifiedTemplate) => {
    setSelectedTemplate(template);
    setFormData({
      name: template.name,
      subject: template.subject,
      body_html: template.body_html,
      audience: template.audience,
    });
    setHasChanges(false);
    setShowPreview(false);
    setShowHistory(false);
    setIsEditorOpen(true);
  };

  const handleDelete = (template: UnifiedTemplate) => {
    setSelectedTemplate(template);
    setIsDeleteOpen(true);
  };

  // Track form changes
  useEffect(() => {
    if (selectedTemplate) {
      const changed =
        formData.name !== selectedTemplate.name ||
        formData.subject !== selectedTemplate.subject ||
        formData.body_html !== selectedTemplate.body_html ||
        formData.audience !== selectedTemplate.audience;
      setHasChanges(changed);
    } else {
      setHasChanges(formData.name.trim() !== "" || formData.subject.trim() !== "" || formData.body_html.trim() !== "");
    }
  }, [formData, selectedTemplate]);

  // Save template
  const handleSave = async () => {
    if (!formData.name.trim() || !formData.subject.trim()) {
      toast.error("Name and subject are required");
      return;
    }

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const templateId = selectedTemplate?.template_key || selectedTemplate?.id || formData.name.toLowerCase().replace(/\s+/g, "_");
      const templateSource = selectedTemplate?.source || "artist_email_templates";

      const { data: latestVersion } = await supabase
        .from("email_template_versions")
        .select("version_number")
        .eq("template_source", templateSource)
        .eq("template_id", templateId)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextVersion = (latestVersion?.version_number || 0) + 1;

      await supabase.from("email_template_versions").insert({
        template_source: templateSource,
        template_id: templateId,
        version_number: nextVersion,
        subject: formData.subject,
        body_html: formData.body_html,
        changed_by: user?.id,
        change_summary: `Version ${nextVersion}`,
      });

      if (selectedTemplate) {
        if (selectedTemplate.source === "lodging_settings") {
          await supabase
            .from("lodging_settings")
            .update({
              invite_email_subject: formData.subject,
              invite_email_body: formData.body_html,
            })
            .eq("id", selectedTemplate.id);
        } else if (selectedTemplate.source === "email_templates") {
          await supabase
            .from("email_templates")
            .update({
              subject: formData.subject,
              intro_text: formData.body_html,
            })
            .eq("id", selectedTemplate.id);
        } else {
          await supabase
            .from("artist_email_templates")
            .update({
              name: formData.name,
              subject: formData.subject,
              body_html: formData.body_html,
              audience: formData.audience,
            })
            .eq("id", selectedTemplate.id);
        }
        toast.success(`Saved as version ${nextVersion}`);
      } else {
        await supabase.from("artist_email_templates").insert([{
          name: formData.name,
          subject: formData.subject,
          body_html: formData.body_html,
          category: "announcement" as const,
          audience: formData.audience,
          created_by: user?.id,
        }]);
        toast.success(`Created: ${formData.name}`);
      }

      queryClient.invalidateQueries({ queryKey: ["unified-templates"] });
      queryClient.invalidateQueries({ queryKey: ["template-versions"] });
      setHasChanges(false);
      setIsEditorOpen(false);
    } catch (error: any) {
      console.error("Error saving template:", error);
      toast.error(error.message || "Failed to save template");
    } finally {
      setIsSaving(false);
    }
  };

  // Delete template
  const confirmDelete = async () => {
    if (!selectedTemplate || selectedTemplate.isSystemTemplate) return;

    try {
      if (selectedTemplate.source === "artist_email_templates") {
        await supabase.from("artist_email_templates").delete().eq("id", selectedTemplate.id);
      } else if (selectedTemplate.source === "email_templates" && !selectedTemplate.isSystemTemplate) {
        await supabase.from("email_templates").delete().eq("id", selectedTemplate.id);
      }

      toast.success(`Deleted: ${selectedTemplate.name}`);
      queryClient.invalidateQueries({ queryKey: ["unified-templates"] });
      setIsDeleteOpen(false);
      setSelectedTemplate(null);
    } catch (error) {
      console.error("Error deleting template:", error);
      toast.error("Failed to delete template");
    }
  };

  // Restore version
  const handleRestoreVersion = (version: TemplateVersion) => {
    setFormData((prev) => ({
      ...prev,
      subject: version.subject,
      body_html: version.body_html,
    }));
    setShowHistory(false);
    toast.info(`Restored version ${version.version_number} — save to apply`);
  };

  // Insert merge field
  const handleInsertField = (field: string) => {
    if (editorRef.current) {
      editorRef.current.insertContent(field);
    }
  };

  // Send test email
  const handleSendTest = async () => {
    if (!testEmail) {
      toast.error("Enter a test email address");
      return;
    }

    setIsSendingTest(true);
    try {
      if (selectedTemplate?.template_key === "lodging_invite") {
        await supabase.functions.invoke("send-lodging-invites", {
          body: {
            isPreview: true,
            previewName: "Test User",
            previewEmail: testEmail,
            sendActualEmail: true,
          },
        });
      } else {
        await supabase.functions.invoke("send-test-email", {
          body: {
            to: testEmail,
            subject: formData.subject,
            body_html: formData.body_html,
          },
        });
      }
      toast.success(`Test email sent to ${testEmail}`);
    } catch (error: any) {
      toast.error(error.message || "Failed to send test email");
    } finally {
      setIsSendingTest(false);
    }
  };

  // Generate preview HTML with sample data
  const generatePreviewHtml = () => {
    return formData.body_html
      .replace(/{{name}}/g, "Jane Doe")
      .replace(/{{first_name}}/g, "Jane")
      .replace(/{{email}}/g, "jane@example.com")
      .replace(/{{invite_link}}/g, "#preview-link")
      .replace(/{{event_title}}/g, "Cosmico 2026")
      .replace(/{{ticket_type}}/g, "VIP 3-Day")
      .replace(/{{signature_line}}/g, "✌️&❤️,")
      .replace(/{{signature_name}}/g, "The Analog Team");
  };

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <>
      <AdminCard>
        <AdminCardHeader>
          <div>
            <AdminCardTitle>Email Templates</AdminCardTitle>
            <AdminCardDescription>
              Unified template editor with versioning for all email types
            </AdminCardDescription>
          </div>
        </AdminCardHeader>
        <AdminCardContent>
          <AdminTabs value={activeCategory} onValueChange={(v) => { setActiveCategory(v as TemplateCategory); setAudienceFilter("all"); }}>
            <div className="flex items-center justify-between gap-4 mb-4">
              <AdminTabsList className="grid grid-cols-3 w-auto">
                {CATEGORY_TABS.map((tab) => (
                  <AdminTabsTrigger key={tab.value} value={tab.value} className="gap-1.5 px-4">
                    <tab.icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </AdminTabsTrigger>
                ))}
              </AdminTabsList>

              <AdminButton size="sm" onClick={handleCreateNew} className="gap-1.5">
                <Plus className="h-4 w-4" />
                New Template
              </AdminButton>
            </div>

            {/* Search & Filter Row */}
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                <AdminInput
                  placeholder="Search templates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              {audiencesInCategory.length > 1 && (
                <AdminSelect
                  value={audienceFilter}
                  onValueChange={(v) => setAudienceFilter(v as TemplateAudience | "all")}
                >
                  <AdminSelectItem value="all">All Audiences</AdminSelectItem>
                  {audiencesInCategory.map((aud) => (
                    <AdminSelectItem key={aud} value={aud}>
                      {AUDIENCE_CONFIG[aud].icon} {AUDIENCE_CONFIG[aud].label}
                    </AdminSelectItem>
                  ))}
                </AdminSelect>
              )}
            </div>

            {/* Template List */}
            {CATEGORY_TABS.map((tab) => (
              <AdminTabsContent key={tab.value} value={tab.value}>
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--admin-text-muted))]" />
                  </div>
                ) : filteredTemplates.length === 0 ? (
                  <div className="text-center py-12 text-[hsl(var(--admin-text-muted))]">
                    <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">
                      {searchQuery ? "No templates match your search" : "No templates yet"}
                    </p>
                    {activeCategory !== "transactional" && !searchQuery && (
                      <AdminButton variant="adminOutline" size="sm" onClick={handleCreateNew} className="mt-3">
                        Create your first template
                      </AdminButton>
                    )}
                  </div>
                ) : (
                  <AdminScrollArea className="h-[400px]">
                    <div className="space-y-2 pr-4">
                      {filteredTemplates.map((template) => (
                        <TemplateListItem
                          key={`${template.source}-${template.id}`}
                          template={template}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                        />
                      ))}
                    </div>
                  </AdminScrollArea>
                )}
              </AdminTabsContent>
            ))}
          </AdminTabs>
        </AdminCardContent>
      </AdminCard>

      {/* Template Editor Drawer */}
      <AdminSheet open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <AdminSheetContent 
          side="right" 
          className="w-full sm:max-w-2xl lg:max-w-3xl flex flex-col p-0"
        >
          {/* Header */}
          <div className="shrink-0 border-b border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface-alt))]">
            <div className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-[hsl(var(--admin-accent)/0.1)] flex items-center justify-center">
                    <FileText className="h-5 w-5 text-[hsl(var(--admin-accent))]" />
                  </div>
                  <div>
                    <AdminSheetTitle className="flex items-center gap-2">
                      {selectedTemplate ? selectedTemplate.name : "New Template"}
                      {selectedTemplate?.isSystemTemplate && (
                        <AdminBadge intent="neutral" size="sm">System</AdminBadge>
                      )}
                    </AdminSheetTitle>
                    <AdminSheetDescription>
                      {selectedTemplate?.isSystemTemplate
                        ? "Edit this system template — changes apply to all automated emails"
                        : "Create or edit a reusable email template"}
                    </AdminSheetDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {hasChanges && (
                    <AdminBadge intent="warning" size="sm" className="animate-pulse">
                      Unsaved
                    </AdminBadge>
                  )}
                  {versions.length > 0 && (
                    <AdminBadge intent="info" size="sm">v{versions[0]?.version_number}</AdminBadge>
                  )}
                </div>
              </div>
            </div>

            {/* Toolbar */}
            <div className="px-6 py-2 flex items-center justify-between border-t border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))]">
              <div className="flex items-center gap-1">
                <AdminButton
                  variant="adminGhost"
                  size="sm"
                  onClick={() => setShowHistory(true)}
                  className="gap-1.5 h-8"
                  disabled={versions.length === 0}
                >
                  <History className="h-3.5 w-3.5" />
                  History
                </AdminButton>
                <AdminButton
                  variant="adminGhost"
                  size="sm"
                  onClick={() => setShowPreview(!showPreview)}
                  className={cn("gap-1.5 h-8", showPreview && "bg-[hsl(var(--admin-hover))]")}
                >
                  <Eye className="h-3.5 w-3.5" />
                  Preview
                </AdminButton>
              </div>
              <MergeFieldPicker 
                onInsert={handleInsertField} 
                audience={formData.audience as any}
              />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden flex">
            {/* Editor Panel */}
            <div className={cn(
              "flex-1 overflow-y-auto transition-all duration-200",
              showPreview ? "w-1/2" : "w-full"
            )}>
              <div className="p-6 space-y-5">
                {/* Name & Audience (for non-system templates) */}
                {!selectedTemplate?.isSystemTemplate && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <AdminLabel>Template Name</AdminLabel>
                      <AdminInput
                        value={formData.name}
                        onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="e.g., Event Update"
                      />
                    </div>
                    <div className="space-y-2">
                      <AdminLabel>Intended For</AdminLabel>
                      <AdminSelect
                        value={formData.audience}
                        onValueChange={(v: TemplateAudience) => setFormData((prev) => ({ ...prev, audience: v }))}
                      >
                        {Object.entries(AUDIENCE_CONFIG).map(([key, config]) => (
                          <AdminSelectItem key={key} value={key}>
                            <span className="flex items-center gap-2">
                              <span>{config.icon}</span>
                              <span>{config.label}</span>
                            </span>
                          </AdminSelectItem>
                        ))}
                      </AdminSelect>
                    </div>
                  </div>
                )}

                {/* Subject */}
                <div className="space-y-2">
                  <AdminLabel>Subject Line</AdminLabel>
                  <AdminInput
                    value={formData.subject}
                    onChange={(e) => setFormData((prev) => ({ ...prev, subject: e.target.value }))}
                    placeholder="Email subject..."
                    className="text-base"
                  />
                </div>

                {/* Body */}
                <div className="space-y-2">
                  <AdminLabel>Email Body</AdminLabel>
                  <div className="rounded-lg border border-[hsl(var(--admin-border))] overflow-hidden bg-white">
                    <RichTextEditor
                      ref={editorRef}
                      content={formData.body_html}
                      onChange={(html) => setFormData((prev) => ({ ...prev, body_html: html }))}
                      placeholder="Write your email content..."
                    />
                  </div>
                </div>

                {/* Test Email */}
                <div className="pt-4 border-t border-[hsl(var(--admin-border))]">
                  <AdminLabel className="mb-2 block">Send Test Email</AdminLabel>
                  <div className="flex items-center gap-3">
                    <AdminInput
                      type="email"
                      placeholder="test@example.com"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      className="flex-1"
                    />
                    <AdminButton
                      variant="adminOutline"
                      size="sm"
                      onClick={handleSendTest}
                      disabled={isSendingTest}
                      className="gap-1.5 shrink-0"
                    >
                      {isSendingTest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Send
                    </AdminButton>
                  </div>
                </div>
              </div>
            </div>

            {/* Preview Panel */}
            {showPreview && (
              <div className="w-1/2 border-l border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface-alt))] overflow-y-auto">
                <div className="p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-medium text-[hsl(var(--admin-text-muted))] uppercase tracking-wider">
                      Preview
                    </span>
                    <AdminButton
                      variant="adminGhost"
                      size="sm"
                      onClick={() => setShowPreview(false)}
                      className="h-6 w-6 p-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </AdminButton>
                  </div>
                  <div className="rounded-lg border border-[hsl(var(--admin-border))] overflow-hidden shadow-sm">
                    <div className="bg-[hsl(var(--admin-surface))] px-4 py-3 border-b border-[hsl(var(--admin-border))]">
                      <p className="text-sm">
                        <span className="text-[hsl(var(--admin-text-muted))]">Subject:</span>{" "}
                        <span className="font-medium text-[hsl(var(--admin-text))]">{formData.subject || "No subject"}</span>
                      </p>
                    </div>
                    <div 
                      className="p-4 bg-white prose prose-sm max-w-none text-[hsl(var(--admin-text))]"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(generatePreviewHtml() || "<p class='text-gray-400 italic'>Start typing to see preview...</p>") }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <AdminSheetFooter className="shrink-0 px-6 py-4 border-t border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface-alt))]">
            <div className="flex items-center justify-between w-full">
              <AdminButton variant="adminGhost" onClick={() => setIsEditorOpen(false)}>
                Cancel
              </AdminButton>
              <AdminButton onClick={handleSave} disabled={isSaving || !hasChanges} className="gap-1.5">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {selectedTemplate ? "Save Changes" : "Create Template"}
              </AdminButton>
            </div>
          </AdminSheetFooter>
        </AdminSheetContent>
      </AdminSheet>

      {/* History Drawer */}
      <AdminSheet open={showHistory} onOpenChange={setShowHistory}>
        <AdminSheetContent side="right" className="sm:max-w-md">
          <AdminSheetHeader>
            <AdminSheetTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Version History
            </AdminSheetTitle>
            <AdminSheetDescription>View and restore previous versions</AdminSheetDescription>
          </AdminSheetHeader>

          <div className="mt-6">
            {versions.length === 0 ? (
              <div className="text-center py-12 text-[hsl(var(--admin-text-muted))]">
                <History className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No version history yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {versions.map((version, idx) => (
                  <div
                    key={version.id}
                    className={cn(
                      "p-4 rounded-lg border transition-colors",
                      idx === 0 
                        ? "border-[hsl(var(--admin-success)/0.5)] bg-[hsl(var(--admin-success)/0.05)]"
                        : "border-[hsl(var(--admin-border))] hover:bg-[hsl(var(--admin-hover))]"
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <AdminBadge intent={idx === 0 ? "success" : "neutral"} size="sm">
                          v{version.version_number}
                        </AdminBadge>
                        {idx === 0 && (
                          <span className="text-xs font-medium text-[hsl(var(--admin-success))]">Current</span>
                        )}
                      </div>
                      <span className="text-xs text-[hsl(var(--admin-text-muted))] flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(new Date(version.created_at), "MMM d, h:mm a")}
                      </span>
                    </div>
                    <p className="text-sm text-[hsl(var(--admin-text-muted))] line-clamp-1 mb-2">{version.subject}</p>
                    {idx !== 0 && (
                      <AdminButton
                        variant="adminOutline"
                        size="sm"
                        onClick={() => handleRestoreVersion(version)}
                        className="gap-1.5 w-full"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Restore This Version
                      </AdminButton>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </AdminSheetContent>
      </AdminSheet>

      {/* Delete Confirmation */}
      <AdminConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title="Delete Template?"
        description={`Are you sure you want to delete "${selectedTemplate?.name}"? This cannot be undone.`}
        actionLabel="Delete"
        actionType="destructive"
        icon="delete"
        onConfirm={confirmDelete}
      />
    </>
  );
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

interface TemplateListItemProps {
  template: UnifiedTemplate;
  onEdit: (template: UnifiedTemplate) => void;
  onDelete: (template: UnifiedTemplate) => void;
}

function TemplateListItem({ template, onEdit, onDelete }: TemplateListItemProps) {
  const audienceConfig = AUDIENCE_CONFIG[template.audience];

  return (
    <div
      className="p-4 rounded-lg border border-[hsl(var(--admin-border))] hover:bg-[hsl(var(--admin-hover))] hover:border-[hsl(var(--admin-border-strong))] transition-all cursor-pointer group"
      onClick={() => onEdit(template)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="h-9 w-9 rounded-lg bg-[hsl(var(--admin-surface-alt))] flex items-center justify-center shrink-0">
            <FileText className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm text-[hsl(var(--admin-text))]">{template.name}</span>
              {template.isSystemTemplate && (
                <AdminBadge intent="neutral" size="sm">System</AdminBadge>
              )}
              {audienceConfig && (
                <AdminBadge intent="neutral" size="sm" className={audienceConfig.color}>
                  {audienceConfig.icon} {audienceConfig.label}
                </AdminBadge>
              )}
            </div>
            <p className="text-xs text-[hsl(var(--admin-text-muted))] mt-1 line-clamp-1">{template.subject}</p>
          </div>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <AdminButton
            variant="adminGhost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(template);
            }}
          >
            <Edit2 className="h-4 w-4" />
          </AdminButton>
          {!template.isSystemTemplate && (
            <AdminButton
              variant="adminGhost"
              size="sm"
              className="h-8 w-8 p-0 text-[hsl(var(--admin-danger))] hover:text-[hsl(var(--admin-danger))] hover:bg-[hsl(var(--admin-danger)/0.1)]"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(template);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </AdminButton>
          )}
        </div>
      </div>
    </div>
  );
}
