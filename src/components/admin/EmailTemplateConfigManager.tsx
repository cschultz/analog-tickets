import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  AdminCard, 
  AdminCardContent, 
  AdminCardDescription, 
  AdminCardHeader, 
  AdminCardTitle,
  AdminButton, 
  AdminInput,
  AdminLabel,
  AdminTabs, 
  AdminTabsContent, 
  AdminTabsList, 
  AdminTabsTrigger 
} from "@/components/admin";
import { toast } from "sonner";
import { Loader2, Save, Palette, Eye, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

interface EmailTemplateConfig {
  id: string;
  // Light theme
  background_color: string;
  surface_color: string;
  surface_alt_color: string;
  primary_color: string;
  primary_gold_color: string;
  text_color: string;
  text_muted_color: string;
  border_color: string;
  // Dark theme
  dark_bg_color: string;
  dark_surface_color: string;
  dark_text_color: string;
  dark_muted_color: string;
  // Accents
  accent_color: string;
  accent_gold_color: string;
  // Status
  success_color: string;
  error_color: string;
  warning_color: string;
  info_color: string;
  // Typography
  font_family: string;
  heading_font_family: string;
  // Branding
  logo_url: string | null;
  brand_name: string;
  // Footer
  footer_text: string;
  unsubscribe_text: string;
}

const DEFAULT_CONFIG: Partial<EmailTemplateConfig> = {
  background_color: "#F3EEE6",
  surface_color: "#FFFFFF",
  surface_alt_color: "#F9F7F4",
  primary_color: "#A37552",
  primary_gold_color: "#C7A97A",
  text_color: "#322821",
  text_muted_color: "#7B6E61",
  border_color: "#D1C2AE",
  dark_bg_color: "#0A2339",
  dark_surface_color: "#2d2d44",
  dark_text_color: "#e0e0e0",
  dark_muted_color: "#a0a0b0",
  accent_color: "#d4a574",
  accent_gold_color: "#F5C15A",
  success_color: "#366129",
  error_color: "#f5576c",
  warning_color: "#f093fb",
  info_color: "#4a90d9",
  font_family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  heading_font_family: "Georgia, serif",
  brand_name: "Cosmico",
  footer_text: "© {{year}} Cosmico. All rights reserved.",
  unsubscribe_text: "You're receiving this because you registered for Cosmico.",
};

interface ColorInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

const ColorInput = ({ label, value, onChange }: ColorInputProps) => (
  <div className="flex items-center gap-3">
    <div 
      className="w-10 h-10 rounded-md border border-[hsl(var(--admin-border))] cursor-pointer overflow-hidden"
      style={{ backgroundColor: value }}
    >
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-full opacity-0 cursor-pointer"
      />
    </div>
    <div className="flex-1">
      <AdminLabel className="text-xs">{label}</AdminLabel>
      <AdminInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-xs font-mono"
      />
    </div>
  </div>
);

export const EmailTemplateConfigManager = () => {
  const [config, setConfig] = useState<EmailTemplateConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewTheme, setPreviewTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("email_template_config")
      .select("*")
      .limit(1)
      .single();

    if (error) {
      console.error("Error fetching email template config:", error);
      toast.error("Failed to load email template configuration");
    } else {
      setConfig(data as unknown as EmailTemplateConfig);
    }
    setIsLoading(false);
  };

  const handleSave = async () => {
    if (!config) return;
    setIsSaving(true);
    
    const { error } = await supabase
      .from("email_template_config")
      .update(config as any)
      .eq("id", config.id);

    if (error) {
      console.error("Error saving config:", error);
      toast.error("Failed to save configuration");
    } else {
      toast.success("Email template configuration saved");
    }
    setIsSaving(false);
  };

  const handleReset = () => {
    if (!config) return;
    setConfig({ ...config, ...DEFAULT_CONFIG });
    toast.info("Reset to defaults - click Save to apply");
  };

  const updateConfig = (key: keyof EmailTemplateConfig, value: string) => {
    if (!config) return;
    setConfig({ ...config, [key]: value });
  };

  if (isLoading) {
    return (
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Email Template Design
          </AdminCardTitle>
        </AdminCardHeader>
        <AdminCardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--admin-text-muted))]" />
          </div>
        </AdminCardContent>
      </AdminCard>
    );
  }

  if (!config) {
    return (
      <AdminCard>
        <AdminCardContent>
          <p className="text-[hsl(var(--admin-text-muted))] text-center py-4">
            No email template configuration found
          </p>
        </AdminCardContent>
      </AdminCard>
    );
  }

  const generatePreviewHtml = () => {
    if (previewTheme === "dark") {
      return `
        <div style="background-color: ${config.dark_bg_color}; padding: 40px 20px; font-family: ${config.font_family};">
          <div style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, ${config.dark_surface_color} 0%, ${config.dark_bg_color} 100%); border-radius: 16px; overflow: hidden;">
            <div style="padding: 40px 40px 20px; text-align: center;">
              <h1 style="color: ${config.accent_color}; font-size: 32px; margin: 0; font-family: ${config.heading_font_family};">${config.brand_name}</h1>
              <p style="color: ${config.dark_muted_color}; font-size: 14px; margin: 8px 0 0;">Your Ticket Confirmation</p>
            </div>
            <div style="padding: 20px 40px;">
              <p style="color: ${config.dark_text_color}; font-size: 16px; line-height: 1.6;">Hi Sarah,</p>
              <p style="color: ${config.dark_text_color}; font-size: 16px; line-height: 1.6;">Thank you for your purchase! We're excited to have you join us at ${config.brand_name}.</p>
              <div style="background: rgba(255,255,255,0.1); border-radius: 8px; padding: 20px; margin: 20px 0;">
                <p style="color: ${config.accent_gold_color}; margin: 0 0 10px; font-weight: bold;">Event Details</p>
                <p style="color: ${config.dark_text_color}; margin: 5px 0;">📅 May 14–16, 2027</p>
                <p style="color: ${config.dark_text_color}; margin: 5px 0;">📍 Example Meadow</p>
              </div>
            </div>
            <div style="padding: 30px 40px; border-top: 1px solid rgba(255,255,255,0.1); text-align: center;">
              <p style="color: ${config.accent_color}; font-size: 14px; margin: 0 0 10px;">✌️&❤️,<br>Demo Organizers</p>
              <p style="color: #606070; font-size: 12px; margin: 16px 0 0;">${config.footer_text.replace("{{year}}", new Date().getFullYear().toString())}</p>
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div style="background-color: ${config.background_color}; padding: 40px 20px; font-family: ${config.font_family};">
        <div style="max-width: 600px; margin: 0 auto; background: ${config.surface_color}; border-radius: 8px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, ${config.primary_color} 0%, ${config.primary_gold_color} 100%); color: ${config.background_color}; padding: 40px 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 28px; font-family: ${config.heading_font_family};">${config.brand_name}</h1>
            <p style="margin: 10px 0 0; font-size: 16px; opacity: 0.9;">Event Announcement</p>
          </div>
          <div style="padding: 40px 30px;">
            <p style="font-size: 16px; color: ${config.text_color}; margin-bottom: 20px;">Hi Sarah,</p>
            <p style="font-size: 16px; color: ${config.text_color}; line-height: 1.6;">We're thrilled to announce some exciting updates about ${config.brand_name}! Mark your calendars and get ready for an unforgettable experience.</p>
            <div style="background: ${config.surface_alt_color}; border-left: 4px solid ${config.primary_gold_color}; padding: 20px; margin: 25px 0;">
              <p style="margin: 8px 0; color: ${config.text_color};"><strong>Event Date:</strong> May 14–16, 2027</p>
              <p style="margin: 8px 0; color: ${config.text_color};"><strong>Location:</strong> Example Meadow</p>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a href="#" style="display: inline-block; background: ${config.primary_gold_color}; color: ${config.background_color}; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">View Your Tickets</a>
            </div>
          </div>
          <div style="text-align: center; padding: 30px 20px; color: ${config.text_muted_color}; font-size: 14px; border-top: 1px solid ${config.border_color}; background: ${config.surface_alt_color};">
            <p style="margin: 10px 0;"><strong>✌️&❤️,<br>Demo Organizers</strong></p>
            <p style="margin: 16px 0 0; font-size: 12px;">${config.footer_text.replace("{{year}}", new Date().getFullYear().toString())}</p>
          </div>
        </div>
      </div>
    `;
  };

  return (
    <AdminCard>
      <AdminCardHeader>
        <div className="flex items-center justify-between">
          <div>
            <AdminCardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              HTML Email Template Design
            </AdminCardTitle>
            <AdminCardDescription>
              Customize the look and feel of your branded HTML emails
            </AdminCardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={showPreview} onOpenChange={setShowPreview}>
              <DialogTrigger asChild>
                <AdminButton variant="adminOutline" size="sm">
                  <Eye className="h-4 w-4 mr-2" />
                  Preview
                </AdminButton>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-4">
                    Email Template Preview
                    <div className="flex gap-2">
                      <AdminButton
                        variant={previewTheme === "light" ? "admin" : "adminGhost"}
                        size="sm"
                        onClick={() => setPreviewTheme("light")}
                      >
                        Light
                      </AdminButton>
                      <AdminButton
                        variant={previewTheme === "dark" ? "admin" : "adminGhost"}
                        size="sm"
                        onClick={() => setPreviewTheme("dark")}
                      >
                        Dark
                      </AdminButton>
                    </div>
                  </DialogTitle>
                </DialogHeader>
                <div 
                  className="mt-4 rounded-lg overflow-hidden border border-[hsl(var(--admin-border))]"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(generatePreviewHtml()) }}
                />
              </DialogContent>
            </Dialog>
            <AdminButton variant="adminGhost" size="sm" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </AdminButton>
            <AdminButton variant="admin" size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save
            </AdminButton>
          </div>
        </div>
      </AdminCardHeader>
      <AdminCardContent>
        <AdminTabs defaultValue="light">
          <AdminTabsList>
            <AdminTabsTrigger value="light">Light Theme</AdminTabsTrigger>
            <AdminTabsTrigger value="dark">Dark Theme</AdminTabsTrigger>
            <AdminTabsTrigger value="accents">Accents & Status</AdminTabsTrigger>
            <AdminTabsTrigger value="typography">Typography</AdminTabsTrigger>
            <AdminTabsTrigger value="content">Content</AdminTabsTrigger>
          </AdminTabsList>

          <AdminTabsContent value="light" className="mt-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <ColorInput label="Background" value={config.background_color} onChange={(v) => updateConfig("background_color", v)} />
              <ColorInput label="Surface" value={config.surface_color} onChange={(v) => updateConfig("surface_color", v)} />
              <ColorInput label="Surface Alt" value={config.surface_alt_color} onChange={(v) => updateConfig("surface_alt_color", v)} />
              <ColorInput label="Primary" value={config.primary_color} onChange={(v) => updateConfig("primary_color", v)} />
              <ColorInput label="Primary Gold" value={config.primary_gold_color} onChange={(v) => updateConfig("primary_gold_color", v)} />
              <ColorInput label="Text" value={config.text_color} onChange={(v) => updateConfig("text_color", v)} />
              <ColorInput label="Text Muted" value={config.text_muted_color} onChange={(v) => updateConfig("text_muted_color", v)} />
              <ColorInput label="Border" value={config.border_color} onChange={(v) => updateConfig("border_color", v)} />
            </div>
          </AdminTabsContent>

          <AdminTabsContent value="dark" className="mt-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <ColorInput label="Dark Background" value={config.dark_bg_color} onChange={(v) => updateConfig("dark_bg_color", v)} />
              <ColorInput label="Dark Surface" value={config.dark_surface_color} onChange={(v) => updateConfig("dark_surface_color", v)} />
              <ColorInput label="Dark Text" value={config.dark_text_color} onChange={(v) => updateConfig("dark_text_color", v)} />
              <ColorInput label="Dark Muted" value={config.dark_muted_color} onChange={(v) => updateConfig("dark_muted_color", v)} />
            </div>
          </AdminTabsContent>

          <AdminTabsContent value="accents" className="mt-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <ColorInput label="Accent" value={config.accent_color} onChange={(v) => updateConfig("accent_color", v)} />
              <ColorInput label="Accent Gold" value={config.accent_gold_color} onChange={(v) => updateConfig("accent_gold_color", v)} />
              <ColorInput label="Success" value={config.success_color} onChange={(v) => updateConfig("success_color", v)} />
              <ColorInput label="Error" value={config.error_color} onChange={(v) => updateConfig("error_color", v)} />
              <ColorInput label="Warning" value={config.warning_color} onChange={(v) => updateConfig("warning_color", v)} />
              <ColorInput label="Info" value={config.info_color} onChange={(v) => updateConfig("info_color", v)} />
            </div>
          </AdminTabsContent>

          <AdminTabsContent value="typography" className="mt-4">
            <div className="space-y-4">
              <div>
                <AdminLabel>Body Font Family</AdminLabel>
                <AdminInput
                  value={config.font_family}
                  onChange={(e) => updateConfig("font_family", e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <AdminLabel>Heading Font Family</AdminLabel>
                <AdminInput
                  value={config.heading_font_family}
                  onChange={(e) => updateConfig("heading_font_family", e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
            </div>
          </AdminTabsContent>

          <AdminTabsContent value="content" className="mt-4">
            <div className="space-y-4">
              <div>
                <AdminLabel>Brand Name</AdminLabel>
                <AdminInput
                  value={config.brand_name}
                  onChange={(e) => updateConfig("brand_name", e.target.value)}
                />
              </div>
              <div>
                <AdminLabel>Logo URL (optional)</AdminLabel>
                <AdminInput
                  value={config.logo_url || ""}
                  onChange={(e) => updateConfig("logo_url", e.target.value)}
                  placeholder="https://example.com/logo.png"
                />
              </div>
              <div>
                <AdminLabel>Footer Text</AdminLabel>
                <AdminInput
                  value={config.footer_text}
                  onChange={(e) => updateConfig("footer_text", e.target.value)}
                />
                <p className="text-xs text-[hsl(var(--admin-text-muted))] mt-1">Use {"{{year}}"} for current year</p>
              </div>
              <div>
                <AdminLabel>Unsubscribe Text</AdminLabel>
                <AdminInput
                  value={config.unsubscribe_text}
                  onChange={(e) => updateConfig("unsubscribe_text", e.target.value)}
                />
              </div>
            </div>
          </AdminTabsContent>
        </AdminTabs>
      </AdminCardContent>
    </AdminCard>
  );
};
