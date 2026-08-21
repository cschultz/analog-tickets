/**
 * FollowUpDrawer
 * 
 * Drawer for previewing and sending follow-up emails to waitlist guests
 * who have been invited but haven't booked yet.
 */
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AdminSheet,
  AdminSheetContent,
  AdminSheetHeader,
  AdminSheetTitle,
  AdminSheetDescription,
  AdminSheetFooter,
} from "@/components/admin/AdminSheet";
import { AdminButton, AdminBadge } from "@/components/admin/AdminUI";
import { AdminLabel } from "@/components/admin/AdminFormPrimitives";
import { Loader2, Send, Eye, Link2, CheckCircle, XCircle, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

interface WaitlistEntry {
  id: string;
  name: string;
  email: string;
  created_at: string;
  notified_at: string | null;
  registration_id: string | null;
  ticket_type?: string;
  has_booked?: boolean;
}

interface TokenInfo {
  token: string;
  created_at: string;
  used_at: string | null;
}

interface FollowUpDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: WaitlistEntry | null;
  onSuccess: () => void;
}

export function FollowUpDrawer({ open, onOpenChange, entry, onSuccess }: FollowUpDrawerProps) {
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isLoadingToken, setIsLoadingToken] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewSubject, setPreviewSubject] = useState("");
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [siteUrl, setSiteUrl] = useState("");

  useEffect(() => {
    if (open && entry) {
      loadPreviewAndToken();
    } else {
      // Reset state when closing
      setPreviewHtml("");
      setPreviewSubject("");
      setTokenInfo(null);
    }
  }, [open, entry]);

  const loadPreviewAndToken = async () => {
    if (!entry) return;
    
    setIsLoadingPreview(true);
    setIsLoadingToken(true);
    
    try {
      // Load preview and token in parallel
      const [previewResult, tokenResult] = await Promise.all([
        supabase.functions.invoke("send-lodging-followup", {
          body: { 
            isPreview: true,
            previewName: entry.name,
            previewEmail: entry.email,
          },
        }),
        supabase
          .from("lodging_invite_tokens")
          .select("token, created_at, used_at")
          .eq("email", entry.email.toLowerCase())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      
      if (previewResult.error) throw previewResult.error;
      
      setPreviewSubject(previewResult.data.subject || "Don't forget to book your lodging! 🏕️");
      setPreviewHtml(previewResult.data.html);
      
      if (tokenResult.data) {
        setTokenInfo(tokenResult.data as TokenInfo);
      }
      
      // Get site URL for the invite link
      setSiteUrl(window.location.origin);
      
    } catch (error: any) {
      console.error("Error loading follow-up preview:", error);
      toast.error(error.message || "Failed to load preview");
    } finally {
      setIsLoadingPreview(false);
      setIsLoadingToken(false);
    }
  };

  const handleSend = async () => {
    if (!entry) return;
    
    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-lodging-followup", {
        body: { waitlistIds: [entry.id] },
      });

      if (error) throw error;

      if (data.sent > 0) {
        toast.success(`Follow-up email sent to ${entry.name}!`);
        onSuccess();
        onOpenChange(false);
      } else if (data.skipped > 0) {
        toast.info("Guest has already booked");
        onSuccess();
        onOpenChange(false);
      } else {
        toast.error("Failed to send follow-up");
      }
    } catch (error: any) {
      console.error("Error sending follow-up:", error);
      toast.error(error.message || "Failed to send follow-up");
    } finally {
      setIsSending(false);
    }
  };

  const inviteLink = tokenInfo?.token 
    ? `${siteUrl}/accommodations/invite?token=${tokenInfo.token}`
    : null;

  return (
    <AdminSheet open={open} onOpenChange={onOpenChange}>
      <AdminSheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <AdminSheetHeader className="pb-4 border-b border-[hsl(var(--admin-border))]">
          <AdminSheetTitle>Send Follow-up Email</AdminSheetTitle>
          <AdminSheetDescription>
            {entry ? `To: ${entry.name} <${entry.email}>` : "Loading..."}
          </AdminSheetDescription>
        </AdminSheetHeader>

        <div className="py-6 space-y-6">
          {/* Token Verification Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
              <AdminLabel className="text-sm font-medium">Invite Token Status</AdminLabel>
            </div>
            
            {isLoadingToken ? (
              <div className="flex items-center gap-2 text-sm text-[hsl(var(--admin-text-muted))]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking token...
              </div>
            ) : tokenInfo ? (
              <div className="p-4 rounded-lg bg-[hsl(var(--admin-surface))] border border-[hsl(var(--admin-border))] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[hsl(var(--admin-text-muted))]">Token Created</span>
                  <span className="text-sm font-medium">
                    {format(new Date(tokenInfo.created_at), "MMM d, yyyy h:mm a")}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[hsl(var(--admin-text-muted))]">Token Status</span>
                  {tokenInfo.used_at ? (
                    <AdminBadge intent="success">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Used {format(new Date(tokenInfo.used_at), "MMM d")}
                    </AdminBadge>
                  ) : (
                    <AdminBadge intent="warning">
                      <XCircle className="h-3 w-3 mr-1" />
                      Not Used Yet
                    </AdminBadge>
                  )}
                </div>
                {inviteLink && !tokenInfo.used_at && (
                  <div className="pt-2 border-t border-[hsl(var(--admin-border))]">
                    <p className="text-xs text-[hsl(var(--admin-text-muted))] mb-2">Invite Link:</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs bg-[hsl(var(--admin-surface-hover))] p-2 rounded overflow-x-auto">
                        {inviteLink}
                      </code>
                      <AdminButton
                        variant="adminGhost"
                        size="sm"
                        onClick={() => window.open(inviteLink, "_blank")}
                        title="Open link in new tab"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </AdminButton>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                <strong>No token found.</strong> A new token will be created when the follow-up email is sent.
              </div>
            )}
          </div>

          {/* Email Preview Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                <AdminLabel className="text-sm font-medium">Email Preview</AdminLabel>
              </div>
              <AdminButton
                variant="adminGhost"
                size="sm"
                onClick={loadPreviewAndToken}
                disabled={isLoadingPreview}
              >
                <RefreshCw className={`h-4 w-4 ${isLoadingPreview ? "animate-spin" : ""}`} />
              </AdminButton>
            </div>

            {isLoadingPreview ? (
              <div className="flex items-center justify-center py-12 text-[hsl(var(--admin-text-muted))]">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                Loading preview...
              </div>
            ) : (
              <div className="border border-[hsl(var(--admin-border))] rounded-lg overflow-hidden">
                <div className="bg-[hsl(var(--admin-surface))] p-3 border-b border-[hsl(var(--admin-border))]">
                  <p className="text-sm">
                    <span className="text-[hsl(var(--admin-text-muted))]">Subject:</span>{" "}
                    <span className="font-medium">{previewSubject}</span>
                  </p>
                </div>
                <div 
                  className="p-4 bg-white max-h-[400px] overflow-y-auto"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewHtml) }}
                />
              </div>
            )}
          </div>

          {/* Warning for used tokens */}
          {tokenInfo?.used_at && (
            <div className="p-4 rounded-lg bg-[hsl(var(--admin-success))]/10 border border-[hsl(var(--admin-success))]/20 text-sm">
              <strong>Note:</strong> This guest's invite token has already been used. Sending a follow-up 
              will reuse the existing token link in case they need to access it again.
            </div>
          )}
        </div>

        <AdminSheetFooter className="pt-4 border-t border-[hsl(var(--admin-border))]">
          <AdminButton variant="adminOutline" onClick={() => onOpenChange(false)}>
            Cancel
          </AdminButton>
          <AdminButton 
            onClick={handleSend} 
            disabled={isSending || isLoadingPreview}
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send Follow-up
              </>
            )}
          </AdminButton>
        </AdminSheetFooter>
      </AdminSheetContent>
    </AdminSheet>
  );
}
