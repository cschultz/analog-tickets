import { useAuthQuery } from "@/hooks/useAuthQuery";
import { supabase } from "@/integrations/supabase/client";

export interface AdminSender {
  userId: string;
  fullName: string;
  senderEmail: string; // Domain email from admin_email_aliases
}

/**
 * Fetches admin users who have domain email aliases configured,
 * making them available as "From" senders for pipeline emails.
 */
export function useAdminSenders() {
  return useAuthQuery({
    queryKey: ["admin-senders"],
    queryFn: async () => {
      // Get all admin email aliases with profile info
      const { data: aliases, error } = await supabase
        .from("admin_email_aliases")
        .select("admin_user_id, email, is_primary")
        .eq("is_primary", true);

      if (error) throw error;
      if (!aliases || aliases.length === 0) return [];

      // Get profiles for these admins
      const userIds = aliases.map(a => a.admin_user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      return aliases.map(alias => ({
        userId: alias.admin_user_id,
        fullName: profileMap.get(alias.admin_user_id)?.full_name || "Unknown",
        senderEmail: alias.email,
      })) as AdminSender[];
    },
  });
}

/**
 * Gets the default sender ID for a given pipeline type from email_settings.
 */
export function useDefaultSenderId(pipelineType: string) {
  return useAuthQuery({
    queryKey: ["default-sender", pipelineType],
    queryFn: async () => {
      const column = `${pipelineType}_default_sender_id`;
      const { data, error } = await supabase
        .from("email_settings")
        .select(column)
        .single();

      if (error && error.code !== "PGRST116") throw error;
      return (data as any)?.[column] as string | null;
    },
  });
}
