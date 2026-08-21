import { useState, useMemo } from "react";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { supabase } from "@/integrations/supabase/client";
import { 
  AdminCard, 
  AdminCardContent, 
  AdminCardHeader, 
  AdminCardTitle, 
  AdminBadge, 
  AdminButton, 
  AdminScrollArea,
} from "@/components/admin";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Mail, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Clock, 
  ChevronDown,
  ChevronUp,
  Reply,
  MoreHorizontal,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { EmailAvatar } from "@/components/email/EmailAvatar";
import { EmailEmptyState } from "@/components/email/EmailEmptyState";
import { cn } from "@/lib/utils";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

interface EmailThread {
  id: string;
  subject: string;
  created_at: string;
  last_message_at: string;
  message_count: number;
  from_email?: string;
  from_name?: string;
}

interface EmailMessage {
  id: string;
  thread_id: string;
  direction: "inbound" | "outbound";
  from_email: string;
  from_name: string | null;
  to_emails: string[];
  cc_emails: string[];
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  sent_at: string;
}

interface EntityEmailHistoryProps {
  entityType: "artist" | "vendor" | "artisan" | "partner" | "volunteer";
  entityId: string;
  onComposeReply?: (threadId: string, subject: string) => void;
}

// Collapsed message card (shows sender, date, preview)
function CollapsedMessageCard({ 
  message, 
  onExpand 
}: { 
  message: EmailMessage; 
  onExpand: () => void;
}) {
  const senderName = message.direction === "outbound" 
    ? "You" 
    : (message.from_name || message.from_email?.split("@")[0] || "Unknown");
  
  return (
    <button
      onClick={onExpand}
      className={cn(
        "w-full text-left p-3 rounded-lg border transition-all",
        "hover:bg-[hsl(var(--admin-hover))] hover:shadow-sm",
        message.direction === "outbound"
          ? "bg-[hsl(var(--admin-card))] border-[hsl(var(--admin-border))]"
          : "bg-[hsl(var(--admin-success)/0.03)] border-[hsl(var(--admin-success)/0.15)]"
      )}
    >
      <div className="flex items-center gap-3">
        <EmailAvatar name={senderName} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={cn(
              "text-xs font-medium",
              message.direction === "outbound" 
                ? "text-[hsl(var(--admin-primary))]" 
                : "text-[hsl(var(--admin-success))]"
            )}>
              {senderName}
            </span>
            <span className="text-[10px] text-[hsl(var(--admin-muted-foreground))]">
              {format(new Date(message.sent_at), "MMM d")}
            </span>
          </div>
          <p className="text-xs text-[hsl(var(--admin-muted-foreground))] line-clamp-1">
            {message.body_text?.substring(0, 100) || "No preview available"}
          </p>
        </div>
        <ChevronDown className="h-4 w-4 text-[hsl(var(--admin-muted-foreground))] shrink-0" />
      </div>
    </button>
  );
}

// Expanded message view (full content, inline)
function ExpandedMessageCard({ 
  message, 
  onCollapse,
  isLatest,
}: { 
  message: EmailMessage; 
  onCollapse?: () => void;
  isLatest?: boolean;
}) {
  const senderName = message.direction === "outbound" 
    ? "You" 
    : (message.from_name || message.from_email?.split("@")[0] || "Unknown");
  
  return (
    <div className={cn(
      "rounded-lg border overflow-hidden",
      message.direction === "outbound"
        ? "bg-[hsl(var(--admin-card))] border-[hsl(var(--admin-border))]"
        : "bg-[hsl(var(--admin-success)/0.03)] border-[hsl(var(--admin-success)/0.15)]"
    )}>
      {/* Header */}
      <div className="flex items-start justify-between p-3 border-b border-[hsl(var(--admin-border)/0.5)]">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
            message.direction === "outbound" 
              ? "bg-[hsl(var(--admin-primary)/0.1)]" 
              : "bg-[hsl(var(--admin-success)/0.1)]"
          )}>
            {message.direction === "outbound" ? (
              <ArrowUpRight className="h-4 w-4 text-[hsl(var(--admin-primary))]" />
            ) : (
              <ArrowDownLeft className="h-4 w-4 text-[hsl(var(--admin-success))]" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={cn(
                "text-sm font-medium",
                message.direction === "outbound" 
                  ? "text-[hsl(var(--admin-primary))]" 
                  : "text-[hsl(var(--admin-success))]"
              )}>
                {senderName}
              </span>
              <span className="text-xs text-[hsl(var(--admin-muted-foreground))]">
                {format(new Date(message.sent_at), "MMM d 'at' h:mm a")}
              </span>
            </div>
            <div className="text-xs text-[hsl(var(--admin-muted-foreground))] mt-0.5">
              to {message.to_emails?.join(", ") || "—"}
            </div>
          </div>
        </div>
        
        {!isLatest && onCollapse && (
          <AdminButton
            variant="adminGhost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onCollapse}
          >
            <ChevronUp className="h-4 w-4" />
          </AdminButton>
        )}
      </div>
      
      {/* Body */}
      <div className="p-4">
        {message.body_html ? (
          <div 
            className="prose prose-sm max-w-none text-[hsl(var(--admin-foreground))]
              prose-p:my-2 prose-p:leading-relaxed
              prose-a:text-[hsl(var(--admin-primary))] prose-a:no-underline hover:prose-a:underline
              prose-strong:font-semibold prose-strong:text-[hsl(var(--admin-foreground))]
              prose-ul:my-2 prose-li:my-0.5
              prose-blockquote:border-l-[hsl(var(--admin-border))] prose-blockquote:text-[hsl(var(--admin-muted-foreground))]"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(message.body_html) }}
          />
        ) : (
          <div className="whitespace-pre-wrap text-sm text-[hsl(var(--admin-foreground))]">
            {message.body_text}
          </div>
        )}
      </div>
    </div>
  );
}

// Single Thread View (Gmail-style stacked messages)
function ThreadView({ 
  thread, 
  messages,
  onComposeReply,
  onBack,
}: { 
  thread: EmailThread;
  messages: EmailMessage[];
  onComposeReply?: (threadId: string, subject: string) => void;
  onBack: () => void;
}) {
  // Default: show only the latest message expanded
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const latest = messages[messages.length - 1];
    return latest ? new Set([latest.id]) : new Set();
  });
  
  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };
  
  const expandAll = () => {
    setExpandedIds(new Set(messages.map(m => m.id)));
  };
  
  const hasInbound = messages.some(m => m.direction === "inbound");
  const lastMessage = messages[messages.length - 1];
  const needsReply = hasInbound && lastMessage?.direction === "inbound";
  
  return (
    <div className="space-y-3">
      {/* Thread Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <button 
            onClick={onBack}
            className="text-xs text-[hsl(var(--admin-muted-foreground))] hover:text-[hsl(var(--admin-foreground))] mb-1 flex items-center gap-1"
          >
            ← All conversations
          </button>
          <h3 className="font-medium text-sm text-[hsl(var(--admin-foreground))] line-clamp-2">
            {thread.subject}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-[hsl(var(--admin-muted-foreground))]">
              {messages.length} message{messages.length !== 1 ? "s" : ""}
            </span>
            {needsReply && (
              <AdminBadge 
                intent="warning" 
                className="text-[10px] px-1.5 py-0"
              >
                Needs Reply
              </AdminBadge>
            )}
          </div>
        </div>
        {messages.length > 1 && (
          <AdminButton 
            variant="adminGhost" 
            size="sm" 
            className="text-xs h-7"
            onClick={expandAll}
          >
            Expand all
          </AdminButton>
        )}
      </div>
      
      {/* Messages Stack */}
      <div className="space-y-2">
        {messages.map((message, idx) => {
          const isLatest = idx === messages.length - 1;
          const isExpanded = expandedIds.has(message.id);
          
          // Always show latest expanded, others can be collapsed
          if (isLatest || isExpanded) {
            return (
              <ExpandedMessageCard 
                key={message.id}
                message={message}
                onCollapse={!isLatest ? () => toggleExpand(message.id) : undefined}
                isLatest={isLatest}
              />
            );
          }
          
          return (
            <CollapsedMessageCard
              key={message.id}
              message={message}
              onExpand={() => toggleExpand(message.id)}
            />
          );
        })}
      </div>
      
      {/* Reply Button */}
      {onComposeReply && (
        <AdminButton 
          variant="adminOutline" 
          size="sm" 
          className="w-full gap-2"
          onClick={() => onComposeReply(thread.id, `Re: ${thread.subject}`)}
        >
          <Reply className="h-3.5 w-3.5" />
          Reply to this thread
        </AdminButton>
      )}
    </div>
  );
}

// Thread List Item
function ThreadListItem({ 
  thread, 
  latestMessage,
  status,
  onClick,
}: { 
  thread: EmailThread;
  latestMessage?: EmailMessage;
  status: { label: string; color: string };
  onClick: () => void;
}) {
  const senderName = thread.from_name || thread.from_email?.split("@")[0] || "Unknown";
  
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left flex items-start gap-3 p-3 transition-all",
        "hover:bg-[hsl(var(--admin-hover))]",
        "border-b border-[hsl(var(--admin-border)/0.5)] last:border-b-0"
      )}
    >
      <EmailAvatar name={senderName} size="md" />
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-medium text-sm text-[hsl(var(--admin-foreground))] truncate">
            {thread.subject}
          </span>
        </div>
        
        <p className="text-xs text-[hsl(var(--admin-muted-foreground))] line-clamp-1 mb-1.5">
          {latestMessage?.body_text?.substring(0, 80) || "No content"}
        </p>
        
        <div className="flex items-center gap-2">
          <AdminBadge 
            intent="neutral"
            className={cn("text-[10px] px-1.5 py-0", status.color)}
          >
            {status.label}
          </AdminBadge>
          <span className="text-[10px] text-[hsl(var(--admin-muted-foreground))] flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDistanceToNow(new Date(thread.last_message_at), { addSuffix: true })}
          </span>
          {thread.message_count > 1 && (
            <span className="text-[10px] text-[hsl(var(--admin-muted-foreground))]">
              · {thread.message_count} msgs
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export const EntityEmailHistory = ({ entityType, entityId, onComposeReply }: EntityEmailHistoryProps) => {
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  // Fetch threads for this entity
  const { data: threads, isLoading } = useAuthQuery({
    queryKey: ["entity-email-threads", entityType, entityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_email_threads")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("last_message_at", { ascending: false });
      
      if (error) throw error;
      return data as EmailThread[];
    },
  });

  // Fetch all messages for the threads
  const { data: messages } = useAuthQuery({
    queryKey: ["entity-email-messages", threads?.map(t => t.id)],
    queryFn: async () => {
      if (!threads || threads.length === 0) return [];
      
      const { data, error } = await supabase
        .from("production_email_messages")
        .select("*")
        .in("thread_id", threads.map(t => t.id))
        .order("sent_at", { ascending: true });
      
      if (error) throw error;
      return data as EmailMessage[];
    },
    enabled: !!threads && threads.length > 0,
  });

  // Group messages by thread
  const messagesByThread = useMemo(() => {
    const grouped: Record<string, EmailMessage[]> = {};
    messages?.forEach(msg => {
      if (!grouped[msg.thread_id]) {
        grouped[msg.thread_id] = [];
      }
      grouped[msg.thread_id].push(msg);
    });
    return grouped;
  }, [messages]);

  const getThreadStatus = (threadMessages: EmailMessage[]) => {
    const hasInbound = threadMessages.some(m => m.direction === "inbound");
    const lastMessage = threadMessages[threadMessages.length - 1];
    
    if (hasInbound && lastMessage?.direction === "inbound") {
      return { label: "Needs Reply", color: "bg-[hsl(var(--admin-warning)/0.15)] text-[hsl(var(--admin-warning))] border-[hsl(var(--admin-warning)/0.3)]" };
    }
    if (hasInbound) {
      return { label: "Replied", color: "bg-[hsl(var(--admin-success)/0.15)] text-[hsl(var(--admin-success))] border-[hsl(var(--admin-success)/0.3)]" };
    }
    return { label: "Sent", color: "bg-[hsl(var(--admin-info)/0.15)] text-[hsl(var(--admin-info))] border-[hsl(var(--admin-info)/0.3)]" };
  };

  const selectedThread = threads?.find(t => t.id === selectedThreadId);
  const selectedMessages = selectedThreadId ? messagesByThread[selectedThreadId] || [] : [];

  if (isLoading) {
    return (
      <AdminCard className="overflow-hidden">
        <AdminCardContent className="py-12">
          <div className="flex flex-col items-center justify-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-[hsl(var(--admin-accent)/0.2)] rounded-full blur-lg animate-pulse" />
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-[hsl(var(--admin-accent))] border-t-transparent relative" />
            </div>
            <p className="text-sm text-[hsl(var(--admin-text-muted))]">Loading conversations...</p>
          </div>
        </AdminCardContent>
      </AdminCard>
    );
  }

  if (!threads || threads.length === 0) {
    return (
      <AdminCard className="overflow-hidden">
        <AdminCardHeader className="pb-2">
          <AdminCardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4" />
            Email History
          </AdminCardTitle>
        </AdminCardHeader>
        <AdminCardContent>
          <EmailEmptyState 
            type="no-emails" 
            title="No conversations yet"
            description="Emails you send and receive will appear here."
          />
        </AdminCardContent>
      </AdminCard>
    );
  }

  return (
    <AdminCard className="overflow-hidden">
      <AdminCardHeader className="pb-3 border-b bg-[hsl(var(--admin-hover))]">
        <div className="flex items-center justify-between">
          <AdminCardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4" />
            Email History
          </AdminCardTitle>
          <AdminBadge intent="neutral" className="font-normal">
            {threads.length} conversation{threads.length !== 1 ? "s" : ""}
          </AdminBadge>
        </div>
      </AdminCardHeader>
      <AdminCardContent className="p-0">
        <AdminScrollArea className="h-[450px]">
          {selectedThread ? (
            <div className="p-4">
              <ThreadView
                thread={selectedThread}
                messages={selectedMessages}
                onComposeReply={onComposeReply}
                onBack={() => setSelectedThreadId(null)}
              />
            </div>
          ) : (
            <div>
              {threads.map((thread) => {
                const threadMessages = messagesByThread[thread.id] || [];
                const status = getThreadStatus(threadMessages);
                const latestMessage = threadMessages[threadMessages.length - 1];
                
                return (
                  <ThreadListItem
                    key={thread.id}
                    thread={thread}
                    latestMessage={latestMessage}
                    status={status}
                    onClick={() => setSelectedThreadId(thread.id)}
                  />
                );
              })}
            </div>
          )}
        </AdminScrollArea>
      </AdminCardContent>
    </AdminCard>
  );
};
