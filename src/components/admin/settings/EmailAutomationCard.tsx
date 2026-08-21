import { AdminCard, AdminCardContent, AdminCardDescription, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import { AdminSwitch, AdminLabel } from "@/components/admin/AdminFormPrimitives";
import { AdminInput } from "@/components/admin";
import { Bell } from "lucide-react";

interface EmailAutomationCardProps {
  autoSendEventInfo: boolean;
  sendReminderEmails: boolean;
  notifyAdminsNewRegistrations: boolean;
  notifyVolunteerSubmissions: boolean;
  volunteerCoordinatorEmail: string;
  onAutoSendEventInfoChange: (value: boolean) => void;
  onSendReminderEmailsChange: (value: boolean) => void;
  onNotifyAdminsNewRegistrationsChange: (value: boolean) => void;
  onNotifyVolunteerSubmissionsChange: (value: boolean) => void;
  onVolunteerCoordinatorEmailChange: (value: string) => void;
}

export function EmailAutomationCard({
  autoSendEventInfo,
  sendReminderEmails,
  notifyAdminsNewRegistrations,
  notifyVolunteerSubmissions,
  volunteerCoordinatorEmail,
  onAutoSendEventInfoChange,
  onSendReminderEmailsChange,
  onNotifyAdminsNewRegistrationsChange,
  onNotifyVolunteerSubmissionsChange,
  onVolunteerCoordinatorEmailChange,
}: EmailAutomationCardProps) {
  return (
    <AdminCard>
      <AdminCardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
          <AdminCardTitle className="text-base font-semibold">Email Automation</AdminCardTitle>
        </div>
        <AdminCardDescription className="text-xs">
          Configure automatic email sending behavior
        </AdminCardDescription>
      </AdminCardHeader>
      <AdminCardContent className="space-y-3">
        <div className="flex items-center justify-between p-3 rounded-lg border border-[hsl(var(--admin-border))]">
          <div className="space-y-0.5">
            <AdminLabel>Auto-send Event Info</AdminLabel>
            <p className="text-xs text-[hsl(var(--admin-text-muted))]">
              Automatically send event details to guests after purchase
            </p>
          </div>
          <AdminSwitch
            checked={autoSendEventInfo}
            onCheckedChange={onAutoSendEventInfoChange}
          />
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg border border-[hsl(var(--admin-border))]">
          <div className="space-y-0.5">
            <AdminLabel>Send Reminder Emails</AdminLabel>
            <p className="text-xs text-[hsl(var(--admin-text-muted))]">
              Send scheduled reminder emails before events
            </p>
          </div>
          <AdminSwitch
            checked={sendReminderEmails}
            onCheckedChange={onSendReminderEmailsChange}
          />
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg border border-[hsl(var(--admin-border))]">
          <div className="space-y-0.5">
            <AdminLabel>Notify Admins of New Registrations</AdminLabel>
            <p className="text-xs text-[hsl(var(--admin-text-muted))]">
              Email admins when a new ticket registration is completed
            </p>
          </div>
          <AdminSwitch
            checked={notifyAdminsNewRegistrations}
            onCheckedChange={onNotifyAdminsNewRegistrationsChange}
          />
        </div>
        <div className="p-3 rounded-lg border border-[hsl(var(--admin-border))] space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <AdminLabel>Email Coordinator on New Volunteer Submissions</AdminLabel>
              <p className="text-xs text-[hsl(var(--admin-text-muted))]">
                Email the volunteer coordinator when someone submits the Get Involved form
              </p>
            </div>
            <AdminSwitch
              checked={notifyVolunteerSubmissions}
              onCheckedChange={onNotifyVolunteerSubmissionsChange}
            />
          </div>
          {notifyVolunteerSubmissions && (
            <div className="pt-1">
              <AdminLabel className="text-xs">Coordinator Email</AdminLabel>
              <AdminInput
                type="email"
                placeholder="coordinator@example.com"
                value={volunteerCoordinatorEmail}
                onChange={(e) => onVolunteerCoordinatorEmailChange(e.target.value)}
                className="mt-1"
              />
            </div>
          )}
        </div>
      </AdminCardContent>
    </AdminCard>
  );
}
