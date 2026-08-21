import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminCard, AdminCardContent } from "@/components/admin/AdminCard";
import { AdminButton, AdminBadge } from "@/components/admin";
import { AdminScrollArea } from "@/components/admin/AdminScrollArea";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Send, 
  Users, 
  CheckCircle2, 
  XCircle, 
  Clock,
  ChevronRight,
  Mail,
  RefreshCw,
  Calendar,
  FlaskConical,
  Ban
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { AUDIENCE_CONFIG, TemplateAudience } from "./TemplateGallery";

interface BulkCampaign {
  id: string;
  name: string | null;
  subject: string;
  audience: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  sent_at: string;
  sent_by: string | null;
  sender_name?: string;
  status?: string;
  scheduled_for?: string | null;
  ab_test_enabled?: boolean;
}

interface BulkSendsLogProps {
  onComposeNew?: () => void;
  maxHeight?: string;
  showHeader?: boolean;
}

export function BulkSendsLog({ 
  onComposeNew, 
  maxHeight = "400px",
  showHeader = true 
}: BulkSendsLogProps) {
  const [campaigns, setCampaigns] = useState<BulkCampaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCampaigns = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("bulk_email_campaigns")
        .select("*")
        .order("sent_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error("Error fetching campaigns:", error);
        return;
      }

      // Get sender names
      const senderIds = [...new Set((data || []).map(c => c.sent_by).filter(Boolean))];
      let senderMap: Record<string, string> = {};
      
      if (senderIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", senderIds);
        
        profiles?.forEach(p => {
          senderMap[p.id] = p.full_name || p.email || "Unknown";
        });
      }

      setCampaigns(
        (data || []).map(c => ({
          ...c,
          sender_name: c.sent_by ? senderMap[c.sent_by] : "System",
        }))
      );
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const getStatusBadge = (campaign: BulkCampaign) => {
    const { sent_count: sent, failed_count: failed, recipient_count: total, status } = campaign;
    
    if (status === "scheduled") {
      return (
        <AdminBadge intent="info" size="sm">
          <Calendar className="w-3 h-3 mr-1" />
          Scheduled
        </AdminBadge>
      );
    }
    if (status === "cancelled") {
      return (
        <AdminBadge intent="neutral" size="sm">
          <Ban className="w-3 h-3 mr-1" />
          Cancelled
        </AdminBadge>
      );
    }
    if (status === "sending") {
      return (
        <AdminBadge intent="info" size="sm">
          <Clock className="w-3 h-3 mr-1 animate-spin" />
          Sending
        </AdminBadge>
      );
    }
    if (failed === 0 && sent === total) {
      return (
        <AdminBadge intent="success" size="sm">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          All Sent
        </AdminBadge>
      );
    }
    if (failed > 0) {
      return (
        <AdminBadge intent="warning" size="sm">
          <XCircle className="w-3 h-3 mr-1" />
          {failed} Failed
        </AdminBadge>
      );
    }
    return (
      <AdminBadge intent="info" size="sm">
        <Clock className="w-3 h-3 mr-1" />
        {sent}/{total}
      </AdminBadge>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="text-center py-12 border border-[hsl(var(--admin-border))] rounded-lg bg-[hsl(var(--admin-hover))]">
        <Mail className="h-12 w-12 mx-auto mb-4 text-[hsl(var(--admin-text-muted))]/50" />
        <h3 className="font-medium text-lg mb-2">No campaigns yet</h3>
        <p className="text-sm text-[hsl(var(--admin-text-muted))] mb-4">
          Send your first bulk announcement to attendees
        </p>
        {onComposeNew && (
          <AdminButton onClick={onComposeNew} className="gap-2">
            <Send className="h-4 w-4" />
            Compose Announcement
          </AdminButton>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {showHeader && (
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm text-[hsl(var(--admin-text-muted))]">Recent Campaigns</h3>
          <AdminButton 
            variant="ghost" 
            size="sm" 
            onClick={fetchCampaigns}
            className="h-8 px-2"
          >
            <RefreshCw className="h-4 w-4" />
          </AdminButton>
        </div>
      )}
      
      <AdminScrollArea style={{ maxHeight }}>
        <div className="space-y-2 pr-4">
          {campaigns.map((campaign) => {
            const audienceConfig = AUDIENCE_CONFIG[campaign.audience as TemplateAudience];
            
            return (
              <AdminCard 
                key={campaign.id}
                className="hover:shadow-sm transition-shadow cursor-pointer"
              >
                <AdminCardContent className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm truncate">
                          {campaign.name || campaign.subject}
                        </span>
                        {audienceConfig && (
                          <AdminBadge 
                            intent="neutral" 
                            size="sm"
                            className={cn("text-[10px] px-1.5 py-0 h-5 shrink-0", audienceConfig.color)}
                          >
                            {audienceConfig.icon} {audienceConfig.label}
                          </AdminBadge>
                        )}
                      </div>
                      
                      {campaign.name && (
                        <p className="text-xs text-[hsl(var(--admin-text-muted))] truncate mb-1">
                          {campaign.subject}
                        </p>
                      )}
                      
                      <div className="flex items-center gap-3 text-xs text-[hsl(var(--admin-text-muted))] flex-wrap">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {campaign.recipient_count} recipients
                        </span>
                        {campaign.ab_test_enabled && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1 text-violet-600">
                              <FlaskConical className="h-3 w-3" />
                              A/B Test
                            </span>
                          </>
                        )}
                        <span>•</span>
                        {campaign.status === "scheduled" && campaign.scheduled_for ? (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(campaign.scheduled_for), "MMM d, h:mm a")}
                          </span>
                        ) : (
                          <span>{formatDistanceToNow(new Date(campaign.sent_at), { addSuffix: true })}</span>
                        )}
                        <span>•</span>
                        <span>{campaign.sender_name}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {getStatusBadge(campaign)}
                      <ChevronRight className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                    </div>
                  </div>
                </AdminCardContent>
              </AdminCard>
            );
          })}
        </div>
      </AdminScrollArea>
    </div>
  );
}