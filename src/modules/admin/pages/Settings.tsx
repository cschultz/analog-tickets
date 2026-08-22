import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminButton } from "@/components/admin";
import { toast } from "sonner";
import { Save, Settings } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { SettingsTestTools } from "@/components/admin/SettingsTestTools";
import { DataToolsCard } from "@/components/admin/DataToolsCard";
import { EmailSignatureCard, EmailAutomationCard, ScheduledReportsCard, EmailSendersCard } from "@/components/admin/settings";

interface EmailSettings {
  id: string;
  signature_line: string;
  signature_name: string;
  auto_send_event_info: boolean;
  send_reminder_emails: boolean;
  notify_admins_new_registrations: boolean;
  notify_volunteer_submissions: boolean;
  volunteer_coordinator_email: string;
  daily_sales_report_enabled: boolean;
  daily_sales_report_time: string;
  // Email sender settings
  artist_from_email: string;
  artist_from_name: string;
  production_from_email: string;
  production_from_name: string;
  guest_from_email: string;
  guest_from_name: string;
  winery_from_email: string;
  winery_from_name: string;
  contract_from_email: string;
  contract_from_name: string;
  system_from_email: string;
  system_from_name: string;
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [signatureLine, setSignatureLine] = useState("✌️&❤️,");
  const [signatureName, setSignatureName] = useState("Demo Organizers");
  const [autoSendEventInfo, setAutoSendEventInfo] = useState(true);
  const [sendReminderEmails, setSendReminderEmails] = useState(true);
  const [notifyAdminsNewRegistrations, setNotifyAdminsNewRegistrations] = useState(true);
  const [notifyVolunteerSubmissions, setNotifyVolunteerSubmissions] = useState(true);
  const [volunteerCoordinatorEmail, setVolunteerCoordinatorEmail] = useState("");
  const [dailySalesReportEnabled, setDailySalesReportEnabled] = useState(true);
  const [dailySalesReportTime, setDailySalesReportTime] = useState("08:00");
  
  // Email sender settings
  // DEMO-ONLY DEFAULTS: placeholder example.org identities, not real senders.
  const [artistFromEmail, setArtistFromEmail] = useState("organizer@example.org");
  const [artistFromName, setArtistFromName] = useState("Demo Organizer");
  const [productionFromEmail, setProductionFromEmail] = useState("team@example.org");
  const [productionFromName, setProductionFromName] = useState("Demo Organizers at Cosmico");
  const [guestFromEmail, setGuestFromEmail] = useState("hello@example.org");
  const [guestFromName, setGuestFromName] = useState("Demo Organizers at Cosmico");
  const [wineryFromEmail, setWineryFromEmail] = useState("organizer@example.org");
  const [wineryFromName, setWineryFromName] = useState("Demo Organizer");
  const [contractFromEmail, setContractFromEmail] = useState("contracts@example.org");
  const [contractFromName, setContractFromName] = useState("Analog Team");
  const [systemFromEmail, setSystemFromEmail] = useState("noreply@example.org");
  const [systemFromName, setSystemFromName] = useState("Cosmico");

  const { data: emailSettings, isLoading } = useAuthQuery({
    queryKey: ["email-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error("Error fetching email settings:", error);
        throw error;
      }
      return data as EmailSettings | null;
    },
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (emailSettings) {
      setSignatureLine(emailSettings.signature_line);
      setSignatureName(emailSettings.signature_name);
      setAutoSendEventInfo(emailSettings.auto_send_event_info ?? true);
      setSendReminderEmails(emailSettings.send_reminder_emails ?? true);
      setNotifyAdminsNewRegistrations(emailSettings.notify_admins_new_registrations ?? true);
      setNotifyVolunteerSubmissions(emailSettings.notify_volunteer_submissions ?? true);
      setVolunteerCoordinatorEmail(emailSettings.volunteer_coordinator_email || "");
      setDailySalesReportEnabled(emailSettings.daily_sales_report_enabled ?? true);
      const time = emailSettings.daily_sales_report_time || "08:00:00";
      setDailySalesReportTime(time.substring(0, 5));
      
      // Email sender settings
      setArtistFromEmail(emailSettings.artist_from_email || "organizer@example.org");
      setArtistFromName(emailSettings.artist_from_name || "Demo Organizer");
      setProductionFromEmail(emailSettings.production_from_email || "team@example.org");
      setProductionFromName(emailSettings.production_from_name || "Demo Organizers at Cosmico");
      setGuestFromEmail(emailSettings.guest_from_email || "hello@example.org");
      setGuestFromName(emailSettings.guest_from_name || "Demo Organizers at Cosmico");
      setWineryFromEmail(emailSettings.winery_from_email || "organizer@example.org");
      setWineryFromName(emailSettings.winery_from_name || "Demo Organizer");
      setContractFromEmail(emailSettings.contract_from_email || "contracts@example.org");
      setContractFromName(emailSettings.contract_from_name || "Analog Team");
      setSystemFromEmail(emailSettings.system_from_email || "noreply@example.org");
      setSystemFromName(emailSettings.system_from_name || "Cosmico");
    }
  }, [emailSettings]);

  const saveEmailSettings = useMutation({
    mutationFn: async () => {
      const settingsData = {
        signature_line: signatureLine,
        signature_name: signatureName,
        auto_send_event_info: autoSendEventInfo,
        send_reminder_emails: sendReminderEmails,
        notify_admins_new_registrations: notifyAdminsNewRegistrations,
        notify_volunteer_submissions: notifyVolunteerSubmissions,
        volunteer_coordinator_email: volunteerCoordinatorEmail || null,
        daily_sales_report_enabled: dailySalesReportEnabled,
        daily_sales_report_time: dailySalesReportTime + ":00",
        // Email sender settings
        artist_from_email: artistFromEmail,
        artist_from_name: artistFromName,
        production_from_email: productionFromEmail,
        production_from_name: productionFromName,
        guest_from_email: guestFromEmail,
        guest_from_name: guestFromName,
        winery_from_email: wineryFromEmail,
        winery_from_name: wineryFromName,
        contract_from_email: contractFromEmail,
        contract_from_name: contractFromName,
        system_from_email: systemFromEmail,
        system_from_name: systemFromName,
      };
      
      if (emailSettings?.id) {
        const { error } = await supabase
          .from("email_settings")
          .update(settingsData)
          .eq("id", emailSettings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("email_settings")
          .insert(settingsData);
        if (error) throw error;
      }

      // Update the cron job schedule if time changed
      const oldTime = emailSettings?.daily_sales_report_time?.substring(0, 5) || "08:00";
      if (dailySalesReportTime !== oldTime) {
        const [hour, minute] = dailySalesReportTime.split(":").map(Number);
        const { error: cronError } = await supabase.functions.invoke("update-cron-schedule", {
          body: { jobName: "daily-sales-report", hour, minute }
        });
        if (cronError) {
          console.error("Failed to update cron schedule:", cronError);
          toast.error("Settings saved but cron schedule update failed");
          return;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-settings"] });
      toast.success("Settings saved");
    },
    onError: () => {
      toast.error("Failed to save settings");
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={Settings}
        title="Settings"
        subtitle="Email configuration and system preferences"
      />

      <EmailSignatureCard
        signatureLine={signatureLine}
        signatureName={signatureName}
        onSignatureLineChange={setSignatureLine}
        onSignatureNameChange={setSignatureName}
      />

      <EmailAutomationCard
        autoSendEventInfo={autoSendEventInfo}
        sendReminderEmails={sendReminderEmails}
        notifyAdminsNewRegistrations={notifyAdminsNewRegistrations}
        notifyVolunteerSubmissions={notifyVolunteerSubmissions}
        volunteerCoordinatorEmail={volunteerCoordinatorEmail}
        onAutoSendEventInfoChange={setAutoSendEventInfo}
        onSendReminderEmailsChange={setSendReminderEmails}
        onNotifyAdminsNewRegistrationsChange={setNotifyAdminsNewRegistrations}
        onNotifyVolunteerSubmissionsChange={setNotifyVolunteerSubmissions}
        onVolunteerCoordinatorEmailChange={setVolunteerCoordinatorEmail}
      />

      <EmailSendersCard
        artistFromEmail={artistFromEmail}
        artistFromName={artistFromName}
        onArtistFromEmailChange={setArtistFromEmail}
        onArtistFromNameChange={setArtistFromName}
        productionFromEmail={productionFromEmail}
        productionFromName={productionFromName}
        onProductionFromEmailChange={setProductionFromEmail}
        onProductionFromNameChange={setProductionFromName}
        guestFromEmail={guestFromEmail}
        guestFromName={guestFromName}
        onGuestFromEmailChange={setGuestFromEmail}
        onGuestFromNameChange={setGuestFromName}
        wineryFromEmail={wineryFromEmail}
        wineryFromName={wineryFromName}
        onWineryFromEmailChange={setWineryFromEmail}
        onWineryFromNameChange={setWineryFromName}
        contractFromEmail={contractFromEmail}
        contractFromName={contractFromName}
        onContractFromEmailChange={setContractFromEmail}
        onContractFromNameChange={setContractFromName}
        systemFromEmail={systemFromEmail}
        systemFromName={systemFromName}
        onSystemFromEmailChange={setSystemFromEmail}
        onSystemFromNameChange={setSystemFromName}
      />

      <ScheduledReportsCard
        dailySalesReportEnabled={dailySalesReportEnabled}
        dailySalesReportTime={dailySalesReportTime}
        onDailySalesReportEnabledChange={setDailySalesReportEnabled}
        onDailySalesReportTimeChange={setDailySalesReportTime}
      />

      {/* Test Tools - Collapsible */}
      <SettingsTestTools />

      {/* Data Tools - Legacy Imports */}
      <DataToolsCard />

      {/* Save Button */}
      <div className="flex justify-end">
        <AdminButton 
          variant="admin"
          onClick={() => saveEmailSettings.mutate()}
          disabled={saveEmailSettings.isPending}
          className="gap-2"
        >
          <Save className="h-4 w-4" />
          {saveEmailSettings.isPending ? "Saving..." : "Save Settings"}
        </AdminButton>
      </div>
    </div>
  );
}
