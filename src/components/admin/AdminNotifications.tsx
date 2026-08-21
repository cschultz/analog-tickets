import { useState, useEffect, useRef } from "react";
import { Bell, ExternalLink } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { AdminOverlay } from "./AdminOverlay";
import { AdminButton, AdminScrollArea } from "@/components/admin";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  metadata: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

// Get the navigation path for a notification based on its type and metadata
function getNotificationPath(notification: Notification): string | null {
  const { type, metadata } = notification;
  
  switch (type) {
    case "new_registration":
      if (metadata?.registration_id) {
        return `/admin/registrations?highlight=${metadata.registration_id}`;
      }
      return "/admin/registrations";
      
    case "volunteer_signup":
      if (metadata?.volunteer_id) {
        return `/admin/volunteers?highlight=${metadata.volunteer_id}`;
      }
      return "/admin/volunteers";
      
    case "support_message":
      if (metadata?.support_id) {
        return `/admin/support?highlight=${metadata.support_id}`;
      }
      return "/admin/support";
      
    case "contact_submission":
      if (metadata?.contact_id) {
        return `/admin/contact?highlight=${metadata.contact_id}`;
      }
      return "/admin/contact";
    
    case "email_import":
      // Navigate to inbox with pending review tab
      if (metadata?.import_id) {
        return `/admin/inbox?tab=pending&highlight=${metadata.import_id}`;
      }
      return "/admin/inbox?tab=pending";
      
    default:
      return null;
  }
}

export function AdminNotifications() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const triggerRef = useRef<HTMLButtonElement>(null);

  const { data: notifications = [], refetch } = useAuthQuery({
    queryKey: ["admin-notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return data as Notification[];
    },
    // Use shorter staleTime for notifications so they stay fresh
    staleTime: 10 * 1000, // 10 seconds
    refetchInterval: 30 * 1000, // Poll every 30 seconds as backup for realtime
  });

  // Real-time subscription for new notifications
  useEffect(() => {
    const channel = supabase
      .channel("admin-notifications-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "admin_notifications",
        },
        (payload) => {
          console.log("[admin-notifications] New notification received", { id: (payload.new as { id?: string })?.id });
          const newNotification = payload.new as Notification;
          
          // Update the query cache with the new notification
          queryClient.setQueryData<Notification[]>(
            ["admin-notifications"],
            (old = []) => [newNotification, ...old].slice(0, 20)
          );

          // Show a toast for the new notification
          toast(newNotification.title, {
            description: newNotification.message || undefined,
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "admin_notifications",
        },
        (payload) => {
          console.log("[admin-notifications] Notification updated", { id: (payload.new as { id?: string })?.id });
          const updatedNotification = payload.new as Notification;
          
          // Update the query cache with the updated notification
          queryClient.setQueryData<Notification[]>(
            ["admin-notifications"],
            (old = []) =>
              old.map((n) =>
                n.id === updatedNotification.id ? updatedNotification : n
              )
          );
        }
      )
      .subscribe((status) => {
        console.log("Notification subscription status:", status);
        if (status === "SUBSCRIBED") {
          console.log("Successfully subscribed to admin notifications");
        } else if (status === "CHANNEL_ERROR") {
          console.error("Failed to subscribe to notifications, falling back to polling");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markAsRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("admin_notifications")
        .update({ is_read: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
    },
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("admin_notifications")
        .update({ is_read: true })
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
    },
  });

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "volunteer_signup":
        return "🙋";
      case "new_registration":
        return "🎟️";
      case "support_message":
        return "💬";
      case "contact_submission":
        return "📧";
      case "email_import":
        return "📨";
      default:
        return "📢";
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    // Mark as read if not already
    if (!notification.is_read) {
      markAsRead.mutate(notification.id);
    }
    
    // Navigate to the relevant page
    const path = getNotificationPath(notification);
    if (path) {
      setOpen(false);
      navigate(path);
    }
  };

  return (
    <div className="relative">
      <AdminButton 
        ref={triggerRef}
        variant="ghost" 
        size="icon" 
        className="relative"
        onClick={() => setOpen(!open)}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-[hsl(var(--admin-danger))] text-white text-xs flex items-center justify-center font-medium animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </AdminButton>
      
      <AdminOverlay 
        open={open} 
        onClose={() => setOpen(false)} 
        align="end"
      >
        <div className="w-80">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--admin-border))]">
            <h4 className="font-medium text-sm text-[hsl(var(--admin-text))]">Notifications</h4>
            {unreadCount > 0 && (
              <AdminButton
                variant="ghost"
                size="sm"
                className="text-xs h-7 px-2"
                onClick={() => markAllAsRead.mutate()}
              >
                Mark all read
              </AdminButton>
            )}
          </div>
          <AdminScrollArea className="h-[300px]">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-[hsl(var(--admin-text-muted))] text-sm">
                No notifications yet
              </div>
            ) : (
              <div className="divide-y divide-[hsl(var(--admin-divider))]">
                {notifications.map((notification) => {
                  const hasLink = !!getNotificationPath(notification);
                  return (
                    <button
                      key={notification.id}
                      className={cn(
                        "w-full text-left px-4 py-3 hover:bg-[hsl(var(--admin-hover))] transition-colors group",
                        !notification.is_read && "bg-[hsl(var(--admin-hover))]",
                        hasLink && "cursor-pointer"
                      )}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex gap-3">
                        <span className="text-lg">
                          {getNotificationIcon(notification.type)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <p
                              className={cn(
                                "text-sm truncate flex-1 text-[hsl(var(--admin-text))]",
                                !notification.is_read && "font-medium"
                              )}
                            >
                              {notification.title}
                            </p>
                            {hasLink && (
                              <ExternalLink className="h-3 w-3 text-[hsl(var(--admin-text-muted))] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                            )}
                          </div>
                          {notification.message && (
                            <p className="text-xs text-[hsl(var(--admin-text-muted))] truncate">
                              {notification.message}
                            </p>
                          )}
                          <p className="text-xs text-[hsl(var(--admin-text-tertiary))] mt-1">
                            {formatDistanceToNow(new Date(notification.created_at), {
                              addSuffix: true,
                            })}
                          </p>
                        </div>
                        {!notification.is_read && (
                          <span className="h-2 w-2 rounded-full bg-[hsl(var(--admin-accent))] flex-shrink-0 mt-1.5" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </AdminScrollArea>
        </div>
      </AdminOverlay>
    </div>
  );
}
