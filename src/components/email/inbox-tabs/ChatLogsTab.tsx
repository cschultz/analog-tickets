import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { supabase } from "@/integrations/supabase/client";
import { AdminCard, AdminCardContent } from "@/components/admin/AdminCard";
import {
  AdminBadge,
  AdminButton,
  AdminDialog,
  AdminDialogContent,
  AdminDialogHeader,
  AdminDialogTitle,
} from "@/components/admin";
import { AdminScrollArea } from "@/components/admin/AdminScrollArea";
import { MessageCircle, User, Clock } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface ChatLog {
  id: string;
  session_id: string;
  conversation: Array<{ role: string; content: string }>;
  user_name: string | null;
  user_email: string | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
  escalation_email: string | null;
  escalation_status: string | null;
  admin_replied_at: string | null;
}

interface ChatLogsTabProps {
  searchQuery: string;
}

export function ChatLogsTab({ searchQuery }: ChatLogsTabProps) {
  const queryClient = useQueryClient();
  const [selectedLog, setSelectedLog] = useState<ChatLog | null>(null);

  const { data: logs = [], isLoading } = useAuthQuery({
    queryKey: ["chat-logs-inbox"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_logs")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as ChatLog[];
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
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
          <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="font-medium">No bot conversations yet</p>
          <p className="text-sm mt-1">Conversations from the support chatbot will appear here</p>
        </AdminCardContent>
      </AdminCard>
    );
  }

  return (
    <>
      <AdminCard>
        <AdminCardContent className="p-0">
          <AdminScrollArea className="h-[600px]">
            <div className="divide-y divide-[hsl(var(--admin-border))]">
              {filteredLogs.map((log) => (
                <button
                  key={log.id}
                  className="w-full text-left p-4 hover:bg-[hsl(var(--admin-hover))] transition-colors flex items-start gap-3"
                  onClick={() => setSelectedLog(log)}
                >
                  <div className="p-2 rounded-full shrink-0 bg-[hsl(var(--admin-hover))]">
                    <User className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium truncate">
                        {log.user_name || "Anonymous"}
                      </span>
                      <AdminBadge intent="neutral" size="sm">
                        {log.conversation?.length || 0} msgs
                      </AdminBadge>
                    </div>
                    <div className="text-sm text-[hsl(var(--admin-text-muted))] truncate">
                      {log.summary || log.user_email || "No summary"}
                    </div>
                  </div>
                  <div className="text-xs text-[hsl(var(--admin-text-muted))] shrink-0 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                  </div>
                </button>
              ))}
            </div>
          </AdminScrollArea>
        </AdminCardContent>
      </AdminCard>

      <AdminDialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <AdminDialogContent className="max-w-2xl">
          <AdminDialogHeader>
            <AdminDialogTitle>Chat Conversation</AdminDialogTitle>
          </AdminDialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{selectedLog.user_name || "Anonymous"}</span>
                <span className="text-[hsl(var(--admin-text-muted))]">
                  {format(new Date(selectedLog.created_at), "MMM d, yyyy h:mm a")}
                </span>
              </div>
              <AdminScrollArea className="h-[400px] rounded-lg border border-[hsl(var(--admin-border))] p-4">
                <div className="space-y-4">
                  {selectedLog.conversation?.map((msg, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "p-3 rounded-lg",
                        msg.role === "user"
                          ? "bg-[hsl(var(--admin-primary))/10] ml-8"
                          : "bg-[hsl(var(--admin-surface))] mr-8"
                      )}
                    >
                      <div className="text-xs font-medium mb-1 text-[hsl(var(--admin-text-muted))]">
                        {msg.role === "user" ? "User" : "Assistant"}
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  ))}
                </div>
              </AdminScrollArea>
            </div>
          )}
        </AdminDialogContent>
      </AdminDialog>
    </>
  );
}
