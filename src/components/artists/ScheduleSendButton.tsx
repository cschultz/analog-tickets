import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Calendar, Clock, Send } from "lucide-react";
import { format, addDays, setHours, setMinutes } from "date-fns";
import { AdminButton, AdminInput } from "@/components/admin";
import { AdminDialog, AdminDialogContent, AdminDialogDescription, AdminDialogHeader, AdminDialogTitle, AdminDialogTrigger } from "@/components/admin/AdminDialog";

interface ScheduleSendButtonProps {
  onSchedule: (scheduledFor: Date) => void;
  disabled?: boolean;
  sending?: boolean;
}

const ScheduleSendButton = ({ onSchedule, disabled, sending }: ScheduleSendButtonProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(format(addDays(new Date(), 1), "yyyy-MM-dd"));
  const [scheduledTime, setScheduledTime] = useState("10:00");

  const handleSchedule = () => {
    const [hours, minutes] = scheduledTime.split(":").map(Number);
    const date = new Date(scheduledDate);
    const scheduledFor = setMinutes(setHours(date, hours), minutes);
    
    if (scheduledFor <= new Date()) {
      return;
    }
    
    onSchedule(scheduledFor);
    setIsOpen(false);
  };

  const quickOptions = [
    { label: "Tomorrow 10am", getValue: () => setHours(setMinutes(addDays(new Date(), 1), 0), 10) },
    { label: "Tomorrow 2pm", getValue: () => setHours(setMinutes(addDays(new Date(), 1), 0), 14) },
    { label: "In 2 days", getValue: () => setHours(setMinutes(addDays(new Date(), 2), 0), 10) },
    { label: "Next week", getValue: () => setHours(setMinutes(addDays(new Date(), 7), 0), 10) },
  ];

  return (
    <AdminDialog open={isOpen} onOpenChange={setIsOpen}>
      <AdminDialogTrigger asChild>
        <AdminButton variant="adminOutline" disabled={disabled || sending}>
          <Clock className="h-4 w-4 mr-2" />
          Schedule
        </AdminButton>
      </AdminDialogTrigger>
      <AdminDialogContent className="sm:max-w-md">
        <AdminDialogHeader>
          <AdminDialogTitle>Schedule Email</AdminDialogTitle>
          <AdminDialogDescription>
            Choose when to send this email. It will be sent at the specified time.
          </AdminDialogDescription>
        </AdminDialogHeader>
        <div className="space-y-4 py-4">
          {/* Quick options */}
          <div className="space-y-2">
            <Label>Quick Options</Label>
            <div className="grid grid-cols-2 gap-2">
              {quickOptions.map((option) => (
                <AdminButton
                  key={option.label}
                  variant="adminOutline"
                  size="sm"
                  onClick={() => {
                    const date = option.getValue();
                    setScheduledDate(format(date, "yyyy-MM-dd"));
                    setScheduledTime(format(date, "HH:mm"));
                  }}
                >
                  {option.label}
                </AdminButton>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-[hsl(var(--admin-border))]" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-[hsl(var(--admin-surface))] px-2 text-[hsl(var(--admin-text-muted))]">or choose custom</span>
            </div>
          </div>

          {/* Custom date/time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="schedule-date">Date</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                <AdminInput
                  id="schedule-date"
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  min={format(new Date(), "yyyy-MM-dd")}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedule-time">Time</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                <AdminInput
                  id="schedule-time"
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          <div className="bg-[hsl(var(--admin-hover))] p-3 rounded-md text-sm text-[hsl(var(--admin-text))]">
            <span className="font-medium">Scheduled for: </span>
            {format(new Date(`${scheduledDate}T${scheduledTime}`), "EEEE, MMMM d, yyyy 'at' h:mm a")}
          </div>

          <div className="flex justify-end gap-2">
            <AdminButton variant="adminOutline" onClick={() => setIsOpen(false)}>
              Cancel
            </AdminButton>
            <AdminButton variant="admin" onClick={handleSchedule}>
              <Send className="h-4 w-4 mr-2" />
              Schedule Send
            </AdminButton>
          </div>
        </div>
      </AdminDialogContent>
    </AdminDialog>
  );
};

export default ScheduleSendButton;
