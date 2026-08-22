import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminTabs, AdminTabsContent, AdminTabsList, AdminTabsTrigger } from "@/components/admin";
import { AdminSelect, AdminSelectItem } from "@/components/admin";
import { BulkAnnouncements } from "@/components/BulkAnnouncements";
import { AbandonedRegistrationEmailManager } from "@/components/AbandonedRegistrationEmailManager";
import { EmailSignatureSettings } from "@/components/EmailSignatureSettings";
import { BulkEmailAuditLog } from "@/components/BulkEmailAuditLog";
import { EmailSequenceManager } from "@/components/EmailSequenceManager";
import { UnifiedTemplateEditor } from "@/components/email/UnifiedTemplateEditor";
import { EmailTemplateConfigManager } from "@/components/admin";
import { useIsMobile } from "@/hooks/use-mobile";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { 
  GitBranch, 
  FileText, 
  Megaphone, 
  ShoppingCart, 
  ClipboardList, 
  Settings,
  LayoutTemplate,
  Mail
} from "lucide-react";

interface Registration {
  id: string;
  email: string;
  name: string;
}

const EMAIL_TABS = [
  { value: "templates", label: "Templates", icon: LayoutTemplate, description: "Shared template library" },
  { value: "announcements", label: "Send", icon: Megaphone, description: "One-off emails" },
  { value: "sequences", label: "Drip", icon: GitBranch, description: "Automated sequences" },
  { value: "abandoned", label: "Recovery", icon: ShoppingCart, description: "Abandoned carts" },
  { value: "audit", label: "History", icon: ClipboardList, description: "Email log" },
  { value: "settings", label: "Settings", icon: Settings, description: "Preferences" },
];

export default function EmailsPage() {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [activeEventTitle, setActiveEventTitle] = useState<string>("");
  const [activeTab, setActiveTab] = useState("templates");
  const isMobile = useIsMobile();

  useEffect(() => {
    fetchRegistrations();
  }, []);

  const fetchRegistrations = async () => {
    const { data: activeEvent } = await supabase
      .from("event_details")
      .select("id, title")
      .eq("is_active", true)
      .maybeSingle();

    if (activeEvent) {
      setActiveEventTitle(activeEvent.title);
      
      const { data, error } = await supabase
        .from("registrations")
        .select("id, email, name")
        .eq("payment_status", "paid")
        .eq("event_id", activeEvent.id)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setRegistrations(data);
      }
    }
  };

  const currentTab = EMAIL_TABS.find(t => t.value === activeTab);

  return (
    <div className="space-y-4 md:space-y-6">
      <AdminPageHeader
        icon={Mail}
        title="Email Management"
        subtitle={`Unified email system — templates are shared across all channels${activeEventTitle ? ` • ${activeEventTitle}` : ""}`}
      />

      <AdminTabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        {/* Mobile: Dropdown selector */}
        {isMobile ? (
          <AdminSelect value={activeTab} onValueChange={setActiveTab}>
            {EMAIL_TABS.map((tab) => (
              <AdminSelectItem key={tab.value} value={tab.value}>
                <div className="flex items-center gap-2">
                  <tab.icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                  <span className="text-xs text-[hsl(var(--admin-text-muted))] ml-1">— {tab.description}</span>
                </div>
              </AdminSelectItem>
            ))}
          </AdminSelect>
        ) : (
          <AdminTabsList className="grid w-full grid-cols-6">
            {EMAIL_TABS.map((tab) => (
              <AdminTabsTrigger key={tab.value} value={tab.value} className="gap-1.5">
                <tab.icon className="h-4 w-4" />
                <span className="hidden lg:inline">{tab.label}</span>
              </AdminTabsTrigger>
            ))}
          </AdminTabsList>
        )}

        <AdminTabsContent value="templates" className="mt-4 md:mt-6">
          <UnifiedTemplateEditor />
        </AdminTabsContent>

        <AdminTabsContent value="announcements" className="mt-4 md:mt-6">
          <BulkAnnouncements registrations={registrations} />
        </AdminTabsContent>

        <AdminTabsContent value="sequences" className="mt-4 md:mt-6">
          <EmailSequenceManager />
        </AdminTabsContent>

        <AdminTabsContent value="abandoned" className="mt-4 md:mt-6">
          <AbandonedRegistrationEmailManager />
        </AdminTabsContent>

        <AdminTabsContent value="audit" className="mt-4 md:mt-6">
          <BulkEmailAuditLog />
        </AdminTabsContent>

        <AdminTabsContent value="settings" className="mt-4 md:mt-6">
          <div className="space-y-6">
            <EmailTemplateConfigManager />
            <div className="max-w-md">
              <EmailSignatureSettings />
            </div>
          </div>
        </AdminTabsContent>
      </AdminTabs>
    </div>
  );
}