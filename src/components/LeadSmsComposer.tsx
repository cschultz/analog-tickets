import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AdminButton,
  AdminTextarea,
  AdminLabel,
  AdminDialog,
  AdminDialogContent,
  AdminDialogHeader,
  AdminDialogTitle,
} from "@/components/admin";
import { toast } from "sonner";
import { Loader2, MessageSquare, Send } from "lucide-react";

interface LeadSmsComposerProps {
  recipientPhone: string;
  recipientName: string;
  leadEmail: string;
  isOpen: boolean;
  onClose: () => void;
  onSent?: () => void;
}

const SMS_TEMPLATES = [
  {
    label: "Friendly nudge",
    text: "Hey {{name}}! It's the team at Cosmico. Noticed you started checking out — need any help finishing up? Happy to hop on a quick call if anything's unclear. ✌️",
  },
  {
    label: "Payment issue",
    text: "Hey {{name}}, this is the team at Cosmico. Looks like your payment didn't go through — just wanted to check if everything's okay. Happy to help sort it out! Reply here or call anytime.",
  },
  {
    label: "Last chance",
    text: "Hey {{name}}! Quick heads up — we're about to release held spots for Cosmico. Wanted to give you a chance to grab yours before they're gone. Let me know if you need anything! — the organizers",
  },
];

export const LeadSmsComposer = ({
  recipientPhone,
  recipientName,
  leadEmail,
  isOpen,
  onClose,
  onSent,
}: LeadSmsComposerProps) => {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  const firstName = recipientName?.split(" ")[0] || "there";

  const applyTemplate = (template: string) => {
    setMessage(template.replace(/\{\{name\}\}/g, firstName));
  };

  const handleSend = async () => {
    if (!message.trim()) {
      toast.error("Please enter a message");
      return;
    }

    setIsSending(true);

    try {
      const { error } = await supabase.functions.invoke("send-sms", {
        body: {
          to: recipientPhone,
          message: message.trim(),
          leadEmail,
        },
      });

      if (error) throw error;

      toast.success(`Text sent to ${recipientName}`);
      onSent?.();
      handleClose();
    } catch (error) {
      console.error("SMS error:", error);
      toast.error("Failed to send text. Check SMS configuration.");
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    onClose();
    setMessage("");
  };

  return (
    <AdminDialog open={isOpen} onOpenChange={handleClose}>
      <AdminDialogContent className="sm:max-w-[500px]">
        <AdminDialogHeader>
          <AdminDialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Text {recipientName}
          </AdminDialogTitle>
        </AdminDialogHeader>

        <div className="space-y-4">
          <div className="bg-[hsl(var(--admin-hover))] rounded-lg p-3">
            <p className="text-sm">
              <span className="text-[hsl(var(--admin-text-muted))]">To:</span>{" "}
              <span className="font-medium">{recipientName}</span>{" "}
              <span className="text-[hsl(var(--admin-text-muted))]">({recipientPhone})</span>
            </p>
          </div>

          {/* Quick templates */}
          <div>
            <AdminLabel className="text-xs">Quick Templates</AdminLabel>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {SMS_TEMPLATES.map((t) => (
                <AdminButton
                  key={t.label}
                  variant="adminOutline"
                  size="sm"
                  className="text-xs"
                  onClick={() => applyTemplate(t.text)}
                >
                  {t.label}
                </AdminButton>
              ))}
            </div>
          </div>

          <div>
            <AdminLabel>Message</AdminLabel>
            <AdminTextarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
              rows={4}
            />
            <p className="text-[10px] text-[hsl(var(--admin-text-muted))] mt-1">
              {message.length}/160 characters {message.length > 160 ? `(${Math.ceil(message.length / 160)} segments)` : ""}
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <AdminButton variant="adminOutline" onClick={handleClose}>
              Cancel
            </AdminButton>
            <AdminButton variant="admin" onClick={handleSend} disabled={isSending}>
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send Text
            </AdminButton>
          </div>
        </div>
      </AdminDialogContent>
    </AdminDialog>
  );
};
