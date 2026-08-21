import { useState } from "react";
import { AdminButton, AdminTabs, AdminTabsContent, AdminTabsList, AdminTabsTrigger } from "@/components/admin";
import { supabase } from "@/integrations/supabase/client";
import { Send, Plus, History, Mail } from "lucide-react";
import { AdminCard, AdminCardContent, AdminCardDescription, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import { BulkSendsLog, AnnouncementComposer } from "@/components/email";

interface Registration {
  id: string;
  email: string;
  name: string;
}

interface BulkAnnouncementsProps {
  registrations: Registration[];
}

export const BulkAnnouncements = ({ registrations }: BulkAnnouncementsProps) => {
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("compose");
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSendComplete = () => {
    setRefreshKey(k => k + 1);
    setActiveTab("history");
  };

  return (
    <>
      <AdminCard>
        <AdminCardHeader 
          icon={Mail}
          action={
            <AdminButton 
              onClick={() => setIsComposerOpen(true)} 
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              New Announcement
            </AdminButton>
          }
        >
          <AdminCardTitle>Announcements</AdminCardTitle>
          <AdminCardDescription>
            Send bulk emails to registered attendees and view campaign history
          </AdminCardDescription>
        </AdminCardHeader>
        
        <AdminCardContent>
          <AdminTabs value={activeTab} onValueChange={setActiveTab}>
            <AdminTabsList className="mb-4">
              <AdminTabsTrigger value="compose" className="gap-2">
                <Send className="h-4 w-4" />
                Quick Start
              </AdminTabsTrigger>
              <AdminTabsTrigger value="history" className="gap-2">
                <History className="h-4 w-4" />
                Campaign History
              </AdminTabsTrigger>
            </AdminTabsList>

            <AdminTabsContent value="compose">
              <div className="text-center py-8 border rounded-lg bg-[hsl(var(--admin-hover))]">
                <Mail className="h-12 w-12 mx-auto mb-4 text-[hsl(var(--admin-text-muted))]" />
                <h3 className="font-medium text-lg mb-2">Ready to reach your attendees?</h3>
                <p className="text-sm text-[hsl(var(--admin-text-muted))] mb-4 max-w-md mx-auto">
                  Create a new announcement to send updates, reminders, or important information to {registrations.length} registered attendees.
                </p>
                <AdminButton onClick={() => setIsComposerOpen(true)} className="gap-2">
                  <Send className="h-4 w-4" />
                  Compose Announcement
                </AdminButton>
              </div>
            </AdminTabsContent>

            <AdminTabsContent value="history">
              <BulkSendsLog 
                key={refreshKey}
                onComposeNew={() => setIsComposerOpen(true)}
                maxHeight="500px"
                showHeader={false}
              />
            </AdminTabsContent>
          </AdminTabs>
        </AdminCardContent>
      </AdminCard>

      <AnnouncementComposer
        registrations={registrations}
        isOpen={isComposerOpen}
        onClose={() => setIsComposerOpen(false)}
        onSendComplete={handleSendComplete}
      />
    </>
  );
};