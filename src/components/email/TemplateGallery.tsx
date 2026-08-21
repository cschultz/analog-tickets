import { useState, useEffect } from "react";
import { Check, FileText, Eye, Plus, Search, Loader2, Edit2, Trash2 } from "lucide-react";
import { 
  AdminButton, 
  AdminBadge, 
  AdminInput,
  AdminDialog,
  AdminDialogContent,
  AdminDialogHeader,
  AdminDialogTitle,
  AdminDialogDescription
} from "@/components/admin";
import { AdminCard, AdminCardContent } from "@/components/admin/AdminCard";
import { AdminScrollArea } from "@/components/admin/AdminScrollArea";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

export type TemplateAudience = 'customer' | 'artist' | 'vendor' | 'partner' | 'artisan' | 'production' | 'internal';

export interface UnifiedTemplate {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  category: string;
  audience: TemplateAudience;
  source: 'email_templates' | 'artist_email_templates';
  updated_at?: string;
}

export const AUDIENCE_CONFIG: Record<TemplateAudience, { label: string; color: string; icon: string }> = {
  customer: { label: "Customer", color: "bg-[hsl(142,72%,95%)] text-[hsl(142,60%,30%)] border-[hsl(142,72%,85%)]", icon: "👤" },
  artist: { label: "Artist", color: "bg-[hsl(340,80%,96%)] text-[hsl(340,70%,45%)] border-[hsl(340,80%,88%)]", icon: "🎵" },
  vendor: { label: "Vendor", color: "bg-[hsl(38,95%,95%)] text-[hsl(38,80%,35%)] border-[hsl(38,95%,85%)]", icon: "🍽️" },
  partner: { label: "Partner", color: "bg-[hsl(215,100%,96%)] text-[hsl(215,100%,40%)] border-[hsl(215,100%,88%)]", icon: "🤝" },
  artisan: { label: "Artisan", color: "bg-[hsl(280,80%,96%)] text-[hsl(280,70%,40%)] border-[hsl(280,80%,88%)]", icon: "🎨" },
  production: { label: "Production", color: "bg-[hsl(38,95%,95%)] text-[hsl(38,80%,35%)] border-[hsl(38,95%,85%)]", icon: "🔧" },
  internal: { label: "Internal", color: "bg-[hsl(0,0%,95%)] text-[hsl(0,0%,40%)] border-[hsl(0,0%,88%)]", icon: "🏠" },
};

interface TemplateGalleryProps {
  selectedId?: string;
  onSelect: (template: UnifiedTemplate) => void;
  onCreateNew?: () => void;
  onEdit?: (template: UnifiedTemplate) => void;
  onDelete?: (template: UnifiedTemplate) => void;
  filterCategories?: string[];
  filterAudiences?: TemplateAudience[];
  showAudienceFilter?: boolean;
  showActions?: boolean;
  className?: string;
  compact?: boolean;
}

const categoryConfig: Record<string, { label: string; intent: "info" | "success" | "warning" | "neutral" | "danger"; description: string }> = {
  announcement: { 
    label: "Announcement", 
    intent: "info",
    description: "One-off bulk emails to attendees"
  },
  transactional: { 
    label: "Transactional", 
    intent: "success",
    description: "System emails: lodging invites, confirmations"
  },
  system: { 
    label: "System", 
    intent: "neutral",
    description: "Automated transactional emails"
  },
  sequence: { 
    label: "Sequence", 
    intent: "info",
    description: "Drip campaign email templates"
  },
  artist: { 
    label: "Artist", 
    intent: "warning",
    description: "Artist communication templates"
  },
  production: { 
    label: "Production", 
    intent: "warning",
    description: "Vendor, artisan, partner emails"
  },
  general: { 
    label: "General", 
    intent: "neutral",
    description: "Miscellaneous templates"
  },
};

export const TemplateGallery = ({
  selectedId,
  onSelect,
  onCreateNew,
  onEdit,
  onDelete,
  filterCategories,
  filterAudiences,
  showAudienceFilter = false,
  showActions = true,
  className,
  compact = false,
}: TemplateGalleryProps) => {
  const [templates, setTemplates] = useState<UnifiedTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAudience, setSelectedAudience] = useState<TemplateAudience | "all">("all");
  const [previewTemplate, setPreviewTemplate] = useState<UnifiedTemplate | null>(null);

  useEffect(() => {
    fetchAllTemplates();
  }, []);

  const fetchAllTemplates = async () => {
    setIsLoading(true);
    try {
      // Fetch from email_templates
      const { data: emailTemplates, error: emailError } = await supabase
        .from("email_templates")
        .select("id, template_type, subject, intro_text, heading, updated_at")
        .order("updated_at", { ascending: false });

      if (emailError) throw emailError;

      // Fetch from artist_email_templates
      const { data: artistTemplates, error: artistError } = await supabase
        .from("artist_email_templates")
        .select("id, name, subject, body_html, category, audience, updated_at")
        .order("updated_at", { ascending: false });

      if (artistError) throw artistError;

      // Fetch lodging invite from lodging_settings
      const { data: lodgingSettings, error: lodgingError } = await supabase
        .from("lodging_settings")
        .select("id, invite_email_subject, invite_email_body, updated_at")
        .limit(1)
        .maybeSingle();

      if (lodgingError) console.warn("Could not load lodging template:", lodgingError);
      const unified: UnifiedTemplate[] = [];

      // Process email_templates
      (emailTemplates || []).forEach((t) => {
        let category = "system";
        let name = t.template_type;
        
        // Parse announcement templates
        if (t.template_type.startsWith("announcement:")) {
          category = "announcement";
          name = t.template_type.replace("announcement:", "");
        } else {
          // Format system template names nicely
          name = t.template_type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
        }

        unified.push({
          id: t.id,
          name,
          subject: t.subject,
          body_html: t.intro_text || t.heading || "",
          category,
          audience: 'customer' as TemplateAudience, // System templates default to customer
          source: 'email_templates',
          updated_at: t.updated_at,
        });
      });

      // Process artist_email_templates
      (artistTemplates || []).forEach((t) => {
        unified.push({
          id: t.id,
          name: t.name,
          subject: t.subject,
          body_html: t.body_html,
          category: t.category || "artist",
          audience: (t.audience || 'customer') as TemplateAudience,
          source: 'artist_email_templates',
          updated_at: t.updated_at,
        });
      });

      // Skip lodging invite - it has its own dedicated editor in the Transactional tab
      // It's managed via LodgingTemplateEditor with versioning support

      setTemplates(unified);
    } catch (error) {
      console.error("Error fetching templates:", error);
      toast.error("Failed to load templates");
    } finally {
      setIsLoading(false);
    }
  };

  // Filter templates
  const filteredTemplates = templates.filter((t) => {
    const matchesSearch = !searchQuery || 
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.subject.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = !filterCategories || filterCategories.length === 0 || 
      filterCategories.includes(t.category);
    
    const matchesAudience = selectedAudience === "all" || t.audience === selectedAudience;
    
    const matchesAudienceFilter = !filterAudiences || filterAudiences.length === 0 ||
      filterAudiences.includes(t.audience);
    
    return matchesSearch && matchesCategory && matchesAudience && matchesAudienceFilter;
  });

  // Group by category
  const groupedTemplates = filteredTemplates.reduce((acc, template) => {
    const category = template.category || "general";
    if (!acc[category]) acc[category] = [];
    acc[category].push(template);
    return acc;
  }, {} as Record<string, UnifiedTemplate[]>);

  // Sort categories
  const categoryOrder = ["transactional", "announcement", "sequence", "artist", "production", "system", "general"];
  const sortedCategories = Object.keys(groupedTemplates).sort(
    (a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b)
  );

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center py-8", className)}>
        <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--admin-text-muted))]" />
      </div>
    );
  }

  return (
    <>
      <div className={cn("space-y-3", className)}>
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
            <AdminInput
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          {onCreateNew && showActions && (
            <AdminButton variant="outline" size="sm" onClick={onCreateNew} className="gap-1.5 shrink-0">
              <Plus className="h-3.5 w-3.5" />
              New
            </AdminButton>
          )}
        </div>

        {/* Audience Filter Pills */}
        {showAudienceFilter && (
          <div className="flex flex-wrap gap-1.5">
            <AdminButton
              variant={selectedAudience === "all" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setSelectedAudience("all")}
            >
              All
            </AdminButton>
            {Object.entries(AUDIENCE_CONFIG).map(([key, config]) => (
              <AdminButton
                key={key}
                variant={selectedAudience === key ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "h-7 text-xs gap-1",
                  selectedAudience === key && config.color
                )}
                onClick={() => setSelectedAudience(key as TemplateAudience)}
              >
                <span>{config.icon}</span>
                {config.label}
              </AdminButton>
            ))}
          </div>
        )}

        {/* Templates List */}
        <AdminScrollArea className={compact ? "h-[250px]" : "h-[400px]"}>
          <div className="space-y-4 pr-4">
            {sortedCategories.map((category) => (
              <div key={category}>
                <div className="flex items-center gap-2 mb-2">
                  <AdminBadge 
                    intent={categoryConfig[category]?.intent || "neutral"}
                    size="sm"
                  >
                    {categoryConfig[category]?.label || category}
                  </AdminBadge>
                  <span className="text-xs text-[hsl(var(--admin-text-muted))]">
                    {groupedTemplates[category].length}
                  </span>
                </div>

                <div className="grid gap-2">
                  {groupedTemplates[category].map((template) => {
                    const isSelected = selectedId === template.id;
                    return (
                      <AdminCard
                        key={`${template.source}-${template.id}`}
                        className={cn(
                          "cursor-pointer transition-all hover:shadow-md group",
                          isSelected && "ring-2 ring-[hsl(var(--admin-info))] bg-[hsl(var(--admin-info))/0.05]"
                        )}
                        onClick={() => onSelect(template)}
                      >
                        <AdminCardContent className={compact ? "p-2.5" : "p-3"}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-[hsl(var(--admin-text-muted))] shrink-0" />
                                <span className={cn("font-medium truncate", compact ? "text-sm" : "text-sm")}>
                                  {template.name}
                                </span>
                                {template.audience && AUDIENCE_CONFIG[template.audience] && (
                                  <AdminBadge 
                                    intent="neutral"
                                    size="sm"
                                    className={cn("text-[10px] px-1.5 py-0 h-5 shrink-0", AUDIENCE_CONFIG[template.audience].color)}
                                  >
                                    {AUDIENCE_CONFIG[template.audience].icon} {AUDIENCE_CONFIG[template.audience].label}
                                  </AdminBadge>
                                )}
                                {isSelected && (
                                  <Check className="h-4 w-4 text-[hsl(var(--admin-info))] shrink-0" />
                                )}
                              </div>
                              <p className="text-xs text-[hsl(var(--admin-text-muted))] mt-1 line-clamp-1 pl-6">
                                {template.subject}
                              </p>
                            </div>

                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <AdminButton
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreviewTemplate(template);
                                }}
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </AdminButton>
                              {showActions && onEdit && (
                                <AdminButton
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onEdit(template);
                                  }}
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </AdminButton>
                              )}
                              {showActions && onDelete && template.category !== "system" && (
                                <AdminButton
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-[hsl(var(--admin-danger))] hover:text-[hsl(var(--admin-danger))]"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete(template);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </AdminButton>
                              )}
                            </div>
                          </div>
                        </AdminCardContent>
                      </AdminCard>
                    );
                  })}
                </div>
              </div>
            ))}

            {filteredTemplates.length === 0 && (
              <div className="text-center py-8 text-[hsl(var(--admin-text-muted))]">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">
                  {searchQuery ? "No templates match your search" : "No templates yet"}
                </p>
              </div>
            )}
          </div>
        </AdminScrollArea>
      </div>

      {/* Preview Modal */}
      <AdminDialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
        <AdminDialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <AdminDialogHeader>
            <AdminDialogTitle className="flex items-center gap-2">
              <AdminBadge 
                intent={categoryConfig[previewTemplate?.category || "general"]?.intent || "neutral"}
                size="sm"
              >
                {categoryConfig[previewTemplate?.category || "general"]?.label}
              </AdminBadge>
              {previewTemplate?.name}
            </AdminDialogTitle>
            <AdminDialogDescription>
              Subject: {previewTemplate?.subject}
            </AdminDialogDescription>
          </AdminDialogHeader>

          <AdminScrollArea className="flex-1 mt-4">
            <div
              className="prose prose-sm max-w-none p-4 bg-[hsl(var(--admin-hover))] rounded-lg whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewTemplate?.body_html || "") }}
            />
          </AdminScrollArea>

          <div className="flex justify-end gap-2 pt-4 border-t border-[hsl(var(--admin-border))] mt-4">
            <AdminButton variant="outline" onClick={() => setPreviewTemplate(null)}>
              Close
            </AdminButton>
            <AdminButton
              onClick={() => {
                if (previewTemplate) {
                  onSelect(previewTemplate);
                  setPreviewTemplate(null);
                }
              }}
            >
              Use Template
            </AdminButton>
          </div>
        </AdminDialogContent>
      </AdminDialog>
    </>
  );
};

// Export a simple picker variant for embedding in forms
export const TemplatePicker = ({
  onSelect,
  filterCategories,
  filterAudiences,
  showAudienceFilter = true,
  buttonLabel = "Load Template",
  className,
}: {
  onSelect: (template: UnifiedTemplate) => void;
  filterCategories?: string[];
  filterAudiences?: TemplateAudience[];
  showAudienceFilter?: boolean;
  buttonLabel?: string;
  className?: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <AdminButton
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className={cn("gap-1.5", className)}
      >
        <FileText className="h-3.5 w-3.5" />
        {buttonLabel}
      </AdminButton>

      <AdminDialog open={isOpen} onOpenChange={setIsOpen}>
        <AdminDialogContent className="max-w-xl max-h-[80vh]">
          <AdminDialogHeader>
            <AdminDialogTitle>Choose a Template</AdminDialogTitle>
            <AdminDialogDescription>
              Select a template to load its content
            </AdminDialogDescription>
          </AdminDialogHeader>

          <TemplateGallery
            onSelect={(template) => {
              onSelect(template);
              setIsOpen(false);
            }}
            filterCategories={filterCategories}
            filterAudiences={filterAudiences}
            showAudienceFilter={showAudienceFilter}
            showActions={false}
            compact
          />
        </AdminDialogContent>
      </AdminDialog>
    </>
  );
};
