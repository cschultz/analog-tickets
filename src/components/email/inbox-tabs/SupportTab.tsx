import { AdminCard, AdminCardContent } from "@/components/admin/AdminCard";
import { AdminBadge } from "@/components/admin";
import { AdminScrollArea } from "@/components/admin/AdminScrollArea";
import { Headphones, MessageCircle, Clock } from "lucide-react";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

interface ChatLog {
  id: string;
  session_id: string;
  conversation: Array<{ role: string; content: string }>;
  user_name: string | null;
  user_email: string | null;
  summary: string | null;
  created_at: string;
}

interface SupportTabProps {
  searchQuery: string;
}

export function SupportTab({ searchQuery }: SupportTabProps) {
  // Re-use chat logs data but filter for those with user info (support requests with contact details)
  const { data: logs = [], isLoading } = useAuthQuery({
    queryKey: ["support-chats-inbox"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_logs")
        .select("*")
        .not("user_email", "is", null) // Only those with email (actual support requests)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []).map((d) => ({
        ...d,
        conversation: (d.conversation as unknown as Array<{ role: string; content: string }>) || [],
      })) as ChatLog[];
    },
    staleTime: 30 * 1000,
  });

  const filteredLogs = logs.filter(
    (log) =>
      log.user_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.user_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.summary?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <AdminCard>
        <AdminCardContent className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-[hsl(var(--admin-info))] border-t-transparent rounded-full" />
        </AdminCardContent>
      </AdminCard>
    );
  }

  if (filteredLogs.length === 0) {
    return (
      <AdminCard>
        <AdminCardContent className="text-center py-12 text-[hsl(var(--admin-text-muted))]">
          <Headphones className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="font-medium">No support requests with contact info</p>
          <p className="text-sm mt-1">
            When users provide their email in the chatbot, they'll appear here for follow-up
          </p>
        </AdminCardContent>
      </AdminCard>
    );
  }

  return (
    <AdminCard>
      <AdminCardContent className="p-0">
        <AdminScrollArea className="h-[600px]">
          <div className="divide-y divide-[hsl(var(--admin-border))]">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className="p-4 hover:bg-[hsl(var(--admin-hover))] transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-full shrink-0 bg-[hsl(var(--admin-hover))]">
                    <Headphones className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{log.user_name || "Unknown"}</span>
                      <AdminBadge intent="info" size="sm">
                        Needs Follow-up
                      </AdminBadge>
                    </div>
                    <div className="text-sm text-[hsl(var(--admin-info))] mb-1">
                      <a href={`mailto:${log.user_email}`} className="hover:underline">
                        {log.user_email}
                      </a>
                    </div>
                    {log.summary && (
                      <div className="text-sm text-[hsl(var(--admin-text-muted))] line-clamp-2">
                        {log.summary}
                      </div>
                    )}
                    <div className="text-xs text-[hsl(var(--admin-text-muted))] mt-2 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                      <span className="mx-1">•</span>
                      <MessageCircle className="h-3 w-3" />
                      {log.conversation?.length || 0} messages
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </AdminScrollArea>
      </AdminCardContent>
    </AdminCard>
  );
}
