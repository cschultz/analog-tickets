import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import {
  AdminCard,
  AdminCardContent,
  AdminCardDescription,
  AdminCardHeader,
  AdminCardTitle,
  AdminButton,
  AdminInput,
  AdminTextarea,
} from "@/components/admin";
import { AdminLabel } from "@/components/admin/AdminFormPrimitives";
import { Mail, Eye, Send, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

interface LodgingSettings {
  id: string;
  invite_email_subject: string;
  invite_email_body: string;
}

export function LodgingInviteEmailCard() {
  const queryClient = useQueryClient();
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [localSubject, setLocalSubject] = useState("");
  const [localBody, setLocalBody] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  const { data: settings, isLoading } = useAuthQuery({
    queryKey: ["lodging-settings-email"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lodging_settings")
        .select("id, invite_email_subject, invite_email_body")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      
      if (data) {
        setLocalSubject((data as any).invite_email_subject || "");
        setLocalBody((data as any).invite_email_body || "");
      }
      return data as LodgingSettings | null;
    },
    staleTime: 5 * 60 * 1000,
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<LodgingSettings>) => {
      if (!settings?.id) throw new Error("Settings not found");
      const { error } = await supabase
        .from("lodging_settings")
        .update(updates)
        .eq("id", settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lodging-settings-email"] });
      setHasChanges(false);
      toast.success("Email template saved");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to save template");
    },
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("send-lodging-invites", {
        body: { isPreview: true },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setPreviewHtml(data.html);
      setShowPreview(true);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to load preview");
    },
  });

  const testMutation = useMutation({
    mutationFn: async (email: string) => {
      const { data, error } = await supabase.functions.invoke("send-lodging-invites", {
        body: { testEmail: email },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message || "Test email sent!");
      setTestEmail("");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to send test email");
    },
  });

  const handleSubjectChange = (value: string) => {
    setLocalSubject(value);
    setHasChanges(value !== settings?.invite_email_subject || localBody !== settings?.invite_email_body);
  };

  const handleBodyChange = (value: string) => {
    setLocalBody(value);
    setHasChanges(localSubject !== settings?.invite_email_subject || value !== settings?.invite_email_body);
  };

  const handleSave = () => {
    updateMutation.mutate({
      invite_email_subject: localSubject,
      invite_email_body: localBody,
    });
  };

  const handleSendTest = () => {
    if (!testEmail) {
      toast.error("Enter an email address");
      return;
    }
    testMutation.mutate(testEmail);
  };

  if (isLoading) {
    return (
      <AdminCard>
        <AdminCardContent className="py-8 text-center text-[hsl(var(--admin-text-muted))]">
          Loading...
        </AdminCardContent>
      </AdminCard>
    );
  }

  return (
    <AdminCard>
      <AdminCardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
            <AdminCardTitle className="text-base font-semibold">Lodging Invite Email</AdminCardTitle>
          </div>
          <div className="flex items-center gap-2">
            <AdminButton
              variant="adminOutline"
              size="sm"
              onClick={() => previewMutation.mutate()}
              disabled={previewMutation.isPending}
            >
              {previewMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              Preview
            </AdminButton>
            <AdminButton
              size="sm"
              onClick={handleSave}
              disabled={!hasChanges || updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Save Changes"
              )}
            </AdminButton>
          </div>
        </div>
        <AdminCardDescription className="text-xs">
          Customize the email sent to waitlist guests with their unique lodging invite link
        </AdminCardDescription>
      </AdminCardHeader>
      
      <AdminCardContent className="space-y-4">
        <div>
          <AdminLabel className="text-xs mb-1 block">Subject Line</AdminLabel>
          <AdminInput
            value={localSubject}
            onChange={(e) => handleSubjectChange(e.target.value)}
            placeholder="Your Exclusive Lodging Invitation"
          />
        </div>

        <div>
          <AdminLabel className="text-xs mb-1 block">
            Email Body (HTML)
          </AdminLabel>
          <p className="text-xs text-[hsl(var(--admin-text-muted))] mb-2">
            Available merge fields: <code className="bg-[hsl(var(--admin-surface))] px-1 rounded">{"{{first_name}}"}</code>,{" "}
            <code className="bg-[hsl(var(--admin-surface))] px-1 rounded">{"{{name}}"}</code>,{" "}
            <code className="bg-[hsl(var(--admin-surface))] px-1 rounded">{"{{invite_link}}"}</code>,{" "}
            <code className="bg-[hsl(var(--admin-surface))] px-1 rounded">{"{{signature_line}}"}</code>,{" "}
            <code className="bg-[hsl(var(--admin-surface))] px-1 rounded">{"{{signature_name}}"}</code>
          </p>
          <AdminTextarea
            value={localBody}
            onChange={(e) => handleBodyChange(e.target.value)}
            rows={12}
            className="font-mono text-xs"
            placeholder="Enter HTML email body..."
          />
        </div>

        {/* Test Email */}
        <div className="flex items-end gap-2 pt-2 border-t border-[hsl(var(--admin-border))]">
          <div className="flex-1">
            <AdminLabel className="text-xs mb-1 block">Send Test Email</AdminLabel>
            <AdminInput
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="test@example.com"
            />
          </div>
          <AdminButton
            variant="adminOutline"
            onClick={handleSendTest}
            disabled={testMutation.isPending || !testEmail}
          >
            {testMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Send Test
          </AdminButton>
        </div>

        {/* Preview Modal */}
        {showPreview && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-auto">
              <div className="sticky top-0 bg-white p-4 border-b flex justify-between items-center">
                <h3 className="font-semibold">Email Preview</h3>
                <AdminButton variant="adminOutline" size="sm" onClick={() => setShowPreview(false)}>
                  Close
                </AdminButton>
              </div>
              <div className="p-4">
                <p className="text-sm text-gray-600 mb-2">
                  <strong>Subject:</strong> {settings?.invite_email_subject}
                </p>
                <div
                  className="border rounded-lg p-4"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewHtml) }}
                />
              </div>
            </div>
          </div>
        )}
      </AdminCardContent>
    </AdminCard>
  );
}
