/**
 * Settings Test Tools
 * 
 * Collapsible accordion for all test/debug actions in Settings
 */

import { useState } from "react";
import { 
  AdminCard, 
  AdminCardContent, 
  AdminCardHeader, 
  AdminCardTitle,
  AdminButton,
  AdminInput,
} from "@/components/admin";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Bug, ChevronDown, ChevronRight, Send, Loader2 } from "lucide-react";

export function SettingsTestTools() {
  const [isOpen, setIsOpen] = useState(false);
  const [isSendingTestNotification, setIsSendingTestNotification] = useState(false);
  const [isSendingTestReminder, setIsSendingTestReminder] = useState(false);
  const [testReminderEmail, setTestReminderEmail] = useState("");
  const [isSendingTestSalesReport, setIsSendingTestSalesReport] = useState(false);
  const [isSendingWeeklyDigest, setIsSendingWeeklyDigest] = useState(false);

  const sendTestAdminNotification = async () => {
    setIsSendingTestNotification(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-admin-notification", {
        body: { testMode: true },
      });

      if (error) throw error;
      
      if (data?.skipped) {
        toast.info("Admin notifications are disabled in settings");
      } else {
        toast.success("Test notification sent to all admins");
      }
    } catch (error: any) {
      console.error("Error sending test notification:", error);
      toast.error(error.message || "Failed to send test notification");
    } finally {
      setIsSendingTestNotification(false);
    }
  };

  const sendTestReminderEmail = async () => {
    if (!testReminderEmail) {
      toast.error("Please enter an email address for the test");
      return;
    }
    setIsSendingTestReminder(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-event-reminders", {
        body: { reminderType: "week_before", testEmail: testReminderEmail },
      });

      if (error) throw error;
      
      if (data?.message?.includes("disabled")) {
        toast.info("Reminder emails are disabled in settings");
      } else {
        toast.success(`Test reminder sent to ${testReminderEmail}`);
      }
    } catch (error: any) {
      console.error("Error sending test reminder:", error);
      toast.error(error.message || "Failed to send test reminder");
    } finally {
      setIsSendingTestReminder(false);
    }
  };

  const sendTestSalesReport = async () => {
    setIsSendingTestSalesReport(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-daily-sales-report", {
        body: {},
      });

      if (error) throw error;
      
      if (data?.message?.includes("disabled")) {
        toast.info("Daily sales report is disabled in settings");
      } else {
        toast.success("Sales report sent to all admins");
      }
    } catch (error: any) {
      console.error("Error sending sales report:", error);
      toast.error(error.message || "Failed to send sales report");
    } finally {
      setIsSendingTestSalesReport(false);
    }
  };

  const sendWeeklyDigest = async () => {
    setIsSendingWeeklyDigest(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-weekly-community-digest", {
        body: {},
      });

      if (error) throw error;
      
      if (data?.message?.includes("No community activity")) {
        toast.info("No community activity to report this week");
      } else {
        toast.success("Weekly community digest sent to all admins");
      }
    } catch (error: any) {
      console.error("Error sending weekly digest:", error);
      toast.error(error.message || "Failed to send weekly digest");
    } finally {
      setIsSendingWeeklyDigest(false);
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <AdminCard>
        <CollapsibleTrigger asChild>
          <AdminCardHeader className="pb-3 cursor-pointer hover:bg-[hsl(var(--admin-surface-hover))] transition-colors rounded-t-lg">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <Bug className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                <AdminCardTitle className="text-base font-semibold">Test Tools</AdminCardTitle>
              </div>
              {isOpen ? (
                <ChevronDown className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
              ) : (
                <ChevronRight className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
              )}
            </div>
          </AdminCardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <AdminCardContent className="space-y-3 pt-0">
            <p className="text-xs text-[hsl(var(--admin-text-muted))] pb-2">
              Trigger test emails and notifications for debugging
            </p>

            {/* Test Admin Notification */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-[hsl(var(--admin-border))]">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Admin Registration Notification</p>
                <p className="text-xs text-[hsl(var(--admin-text-muted))]">
                  Send test notification to all admins
                </p>
              </div>
              <AdminButton
                variant="outline"
                size="sm"
                onClick={sendTestAdminNotification}
                disabled={isSendingTestNotification}
              >
                {isSendingTestNotification ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Send className="h-3 w-3 mr-1" />
                )}
                {isSendingTestNotification ? "Sending..." : "Send Test"}
              </AdminButton>
            </div>

            {/* Test Reminder Email */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-[hsl(var(--admin-border))]">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Event Reminder Email</p>
                <p className="text-xs text-[hsl(var(--admin-text-muted))]">
                  Send test week-before reminder
                </p>
              </div>
              <div className="flex items-center gap-1">
                <AdminInput
                  type="email"
                  placeholder="test@email.com"
                  value={testReminderEmail}
                  onChange={(e) => setTestReminderEmail(e.target.value)}
                  className="h-8 w-36 text-xs"
                />
                <AdminButton
                  variant="outline"
                  size="sm"
                  onClick={sendTestReminderEmail}
                  disabled={isSendingTestReminder}
                >
                  {isSendingTestReminder ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Send className="h-3 w-3 mr-1" />
                  )}
                  {isSendingTestReminder ? "..." : "Send"}
                </AdminButton>
              </div>
            </div>

            {/* Test Sales Report */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-[hsl(var(--admin-border))]">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Daily Sales Report</p>
                <p className="text-xs text-[hsl(var(--admin-text-muted))]">
                  Trigger sales report now
                </p>
              </div>
              <AdminButton
                variant="outline"
                size="sm"
                onClick={sendTestSalesReport}
                disabled={isSendingTestSalesReport}
              >
                {isSendingTestSalesReport ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Send className="h-3 w-3 mr-1" />
                )}
                {isSendingTestSalesReport ? "..." : "Send Now"}
              </AdminButton>
            </div>

            {/* Weekly Digest */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-[hsl(var(--admin-border))]">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Weekly Community Digest</p>
                <p className="text-xs text-[hsl(var(--admin-text-muted))]">
                  Send digest to all admins
                </p>
              </div>
              <AdminButton
                variant="outline"
                size="sm"
                onClick={sendWeeklyDigest}
                disabled={isSendingWeeklyDigest}
              >
                {isSendingWeeklyDigest ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Send className="h-3 w-3 mr-1" />
                )}
                {isSendingWeeklyDigest ? "Sending..." : "Send Now"}
              </AdminButton>
            </div>
          </AdminCardContent>
        </CollapsibleContent>
      </AdminCard>
    </Collapsible>
  );
}
