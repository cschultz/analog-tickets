import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Mail, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AdminButton, AdminInput } from "@/components/admin";
import { AdminDialog, AdminDialogContent, AdminDialogDescription, AdminDialogHeader, AdminDialogTitle, AdminDialogTrigger } from "@/components/admin/AdminDialog";

interface SendTestEmailButtonProps {
  eventId: string;
  subject: string;
  bodyHtml: string;
  sampleArtistId?: string;
  disabled?: boolean;
}

const SendTestEmailButton = ({ 
  eventId, 
  subject, 
  bodyHtml, 
  sampleArtistId,
  disabled 
}: SendTestEmailButtonProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [sending, setSending] = useState(false);

  const handleSendTest = async () => {
    if (!testEmail.trim()) {
      toast.error("Please enter an email address");
      return;
    }

    if (!subject.trim() || !bodyHtml.trim()) {
      toast.error("Please add a subject and message first");
      return;
    }

    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke("send-artist-email", {
        body: {
          eventId,
          subject,
          bodyHtml,
          testEmail,
          sampleArtistId,
          isTest: true,
        },
      });

      if (response.error) throw response.error;

      toast.success(`Test email sent to ${testEmail}`);
      setIsOpen(false);
      setTestEmail("");
    } catch (error: any) {
      toast.error("Failed to send test email: " + error.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <AdminDialog open={isOpen} onOpenChange={setIsOpen}>
      <AdminDialogTrigger asChild>
        <AdminButton variant="adminOutline" size="sm" disabled={disabled}>
          <Mail className="h-4 w-4 mr-2" />
          Send Test
        </AdminButton>
      </AdminDialogTrigger>
      <AdminDialogContent className="sm:max-w-md">
        <AdminDialogHeader>
          <AdminDialogTitle>Send Test Email</AdminDialogTitle>
          <AdminDialogDescription>
            Send a preview of this email to yourself before sending to artists.
            Merge fields will be replaced with sample data.
          </AdminDialogDescription>
        </AdminDialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="test-email">Your Email Address</Label>
            <AdminInput
              id="test-email"
              type="email"
              placeholder="you@example.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <AdminButton variant="adminOutline" onClick={() => setIsOpen(false)}>
              Cancel
            </AdminButton>
            <AdminButton variant="admin" onClick={handleSendTest} disabled={sending}>
              <Send className="h-4 w-4 mr-2" />
              {sending ? "Sending..." : "Send Test"}
            </AdminButton>
          </div>
        </div>
      </AdminDialogContent>
    </AdminDialog>
  );
};

export default SendTestEmailButton;
