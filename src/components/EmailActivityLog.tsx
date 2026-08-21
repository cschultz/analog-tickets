import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminCard, AdminCardContent, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import { AdminBadge, AdminButton } from "@/components/admin";
import {
  AdminDialog,
  AdminDialogContent,
  AdminDialogHeader,
  AdminDialogTitle,
} from "@/components/admin/AdminDialog";
import { Mail, CheckCircle, AlertCircle, Clock, Eye, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface EmailLog {
  id: string;
  email_type: string;
  sent_at: string;
  status: string;
  error_message: string | null;
  email_content: string | null;
}

interface RateLimit {
  email_type: string;
  last_sent_at: string;
  cooldown_minutes: number;
}

interface EmailActivityLogProps {
  registrationId: string;
}

// Helper component to avoid DialogTrigger pattern
function EmailPreviewDialog({ emailContent, emailType }: { emailContent: string; emailType: string }) {
  const [open, setOpen] = useState(false);
  
  return (
    <>
      <AdminButton
        variant="adminGhost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => setOpen(true)}
      >
        <Eye className="h-4 w-4" />
      </AdminButton>
      <AdminDialog open={open} onOpenChange={setOpen}>
        <AdminDialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <AdminDialogHeader>
            <AdminDialogTitle>Email Preview - {emailType}</AdminDialogTitle>
          </AdminDialogHeader>
          <div className="border rounded-lg overflow-hidden">
            <iframe
              srcDoc={emailContent}
              className="w-full h-[600px] border-0"
              title="Email Preview"
              sandbox="allow-same-origin"
            />
          </div>
        </AdminDialogContent>
      </AdminDialog>
    </>
  );
}

export const EmailActivityLog = ({ registrationId }: EmailActivityLogProps) => {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [rateLimits, setRateLimits] = useState<RateLimit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [resending, setResending] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchLogs();
    fetchRateLimits();
  }, [registrationId]);

  const fetchLogs = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('email_logs')
      .select('*')
      .eq('registration_id', registrationId)
      .order('sent_at', { ascending: false });

    if (!error && data) {
      setLogs(data);
    }
    setIsLoading(false);
  };

  const fetchRateLimits = async () => {
    const { data, error } = await supabase
      .from('email_rate_limits')
      .select('*')
      .eq('registration_id', registrationId);

    if (!error && data) {
      setRateLimits(data);
    }
  };

  const getEmailTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      ticket_confirmation: 'Ticket Confirmation',
      payment_reminder: 'Payment Reminder',
      bulk_announcement: 'Announcement',
    };
    return labels[type] || type;
  };

  const getStatusIcon = (status: string) => {
    if (status === 'sent') {
      return <CheckCircle className="w-4 h-4 text-green-600" />;
    } else if (status === 'failed') {
      return <AlertCircle className="w-4 h-4 text-red-600" />;
    }
    return <Clock className="w-4 h-4 text-yellow-600" />;
  };

  const getRateLimitInfo = (emailType: string) => {
    const limit = rateLimits.find(rl => rl.email_type === emailType);
    if (!limit) return null;

    const lastSent = new Date(limit.last_sent_at);
    const cooldownEnds = new Date(lastSent.getTime() + limit.cooldown_minutes * 60000);
    const now = new Date();

    if (now < cooldownEnds) {
      const minutesRemaining = Math.ceil((cooldownEnds.getTime() - now.getTime()) / 60000);
      return {
        isOnCooldown: true,
        minutesRemaining,
        cooldownEnds
      };
    }

    return { isOnCooldown: false };
  };

  const handleResend = async (log: EmailLog) => {
    // Check rate limit before attempting
    const rateLimitInfo = getRateLimitInfo(log.email_type);
    if (rateLimitInfo?.isOnCooldown) {
      toast({
        title: "Rate limit active",
        description: `Please wait ${rateLimitInfo.minutesRemaining} more minutes`,
        variant: "destructive"
      });
      return;
    }

    setResending(log.id);
    try {
      let functionName = '';
      
      // Map email type to edge function name
      switch (log.email_type) {
        case 'ticket_confirmation':
          functionName = 'send-ticket-email';
          break;
        case 'payment_reminder':
          functionName = 'send-payment-reminder';
          break;
        case 'bulk_announcement':
          toast({
            title: "Cannot resend",
            description: "Bulk announcements cannot be automatically resent",
            variant: "destructive"
          });
          setResending(null);
          return;
        default:
          throw new Error(`Unknown email type: ${log.email_type}`);
      }

      const { error } = await supabase.functions.invoke(functionName, {
        body: { registrationId }
      });

      if (error) throw error;

      toast({
        title: "Email resent successfully",
        description: "The email has been queued for delivery"
      });

      // Refresh logs and rate limits
      await fetchLogs();
      await fetchRateLimits();
    } catch (error: any) {
      console.error('Error resending email:', error);
      
      // Check if it's a rate limit error
      if (error.message?.includes('Rate limit')) {
        const match = error.message.match(/wait (\d+) minutes/);
        const minutes = match ? match[1] : 'some';
        toast({
          title: "Rate limit exceeded",
          description: `Please wait ${minutes} minutes before resending`,
          variant: "destructive"
        });
      } else {
        toast({
          title: "Failed to resend email",
          description: error.message || "An error occurred while resending",
          variant: "destructive"
        });
      }
    } finally {
      setResending(null);
    }
  };

  if (isLoading) {
    return (
      <AdminCard>
        <AdminCardHeader icon={Mail}>
          <AdminCardTitle>Email Activity</AdminCardTitle>
        </AdminCardHeader>
        <AdminCardContent>
          <div className="text-sm text-center py-4 text-[hsl(var(--admin-text-muted))]">
            Loading...
          </div>
        </AdminCardContent>
      </AdminCard>
    );
  }

  if (logs.length === 0) {
    return (
      <AdminCard>
        <AdminCardHeader icon={Mail}>
          <AdminCardTitle>Email Activity</AdminCardTitle>
        </AdminCardHeader>
        <AdminCardContent>
          <div className="text-sm text-center py-4 text-[hsl(var(--admin-text-muted))]">
            No emails sent yet
          </div>
        </AdminCardContent>
      </AdminCard>
    );
  }

  return (
    <AdminCard>
      <AdminCardHeader icon={Mail}>
        <AdminCardTitle>Email Activity ({logs.length})</AdminCardTitle>
      </AdminCardHeader>
      <AdminCardContent>
        <div className="space-y-3">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex items-start gap-3 p-3 rounded-lg bg-[hsl(var(--admin-surface-hover))]"
            >
              <div className="mt-0.5">
                {getStatusIcon(log.status)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm text-[hsl(var(--admin-text))]">
                    {getEmailTypeLabel(log.email_type)}
                  </span>
                  <AdminBadge
                    intent={log.status === 'sent' ? 'success' : 'danger'}
                    size="sm"
                  >
                    {log.status}
                  </AdminBadge>
                </div>
                <div className="text-xs text-[hsl(var(--admin-text-muted))]">
                  {formatDistanceToNow(new Date(log.sent_at), { addSuffix: true })}
                </div>
                {log.error_message && (
                  <div className="text-xs text-[hsl(var(--admin-error))] mt-1">
                    Error: {log.error_message}
                  </div>
                )}
                {(() => {
                  const rateLimitInfo = getRateLimitInfo(log.email_type);
                  return rateLimitInfo?.isOnCooldown ? (
                    <div className="text-xs mt-1 text-[hsl(var(--admin-warning))]">
                      Cooldown: {rateLimitInfo.minutesRemaining} min remaining
                    </div>
                  ) : null;
                })()}
              </div>
              <div className="flex gap-1">
                {log.status === 'failed' && (
                  <div className="flex items-center gap-1">
                    <AdminButton
                      variant="adminGhost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => handleResend(log)}
                      disabled={resending === log.id || getRateLimitInfo(log.email_type)?.isOnCooldown}
                      title={
                        getRateLimitInfo(log.email_type)?.isOnCooldown
                          ? `Wait ${getRateLimitInfo(log.email_type)?.minutesRemaining} more minutes`
                          : 'Resend email'
                      }
                    >
                      <RefreshCw className={`h-4 w-4 ${resending === log.id ? 'animate-spin' : ''}`} />
                    </AdminButton>
                    {getRateLimitInfo(log.email_type)?.isOnCooldown && (
                      <span className="text-xs text-[hsl(var(--admin-text-muted))]">
                        ({getRateLimitInfo(log.email_type)?.minutesRemaining}m)
                      </span>
                    )}
                  </div>
                )}
                {log.email_content && (
                  <EmailPreviewDialog 
                    emailContent={log.email_content} 
                    emailType={getEmailTypeLabel(log.email_type)} 
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </AdminCardContent>
    </AdminCard>
  );
};
