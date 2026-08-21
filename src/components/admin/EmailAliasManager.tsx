import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  AdminCard,
  AdminCardContent,
  AdminCardDescription,
  AdminCardHeader,
  AdminCardTitle,
  AdminButton,
  AdminInput,
  AdminBadge,
  AdminLabel,
} from "@/components/admin";
import { toast } from "sonner";
import { Mail, Plus, Trash2, Star, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmailAlias {
  id: string;
  admin_user_id: string;
  email: string;
  is_primary: boolean;
  created_at: string;
}

interface EmailAliasManagerProps {
  /** If provided, shows aliases for this admin user (admin override mode) */
  adminUserId?: string;
  /** If true, shows in compact mode suitable for inline display */
  compact?: boolean;
  className?: string;
}

export function EmailAliasManager({ adminUserId, compact = false, className }: EmailAliasManagerProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [newEmail, setNewEmail] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  
  // Use provided adminUserId or fall back to current user
  const targetUserId = adminUserId || user?.id;
  const isSelfManaging = !adminUserId || adminUserId === user?.id;

  const { data: aliases = [], isLoading } = useAuthQuery({
    queryKey: ["email-aliases", targetUserId],
    queryFn: async () => {
      if (!targetUserId) return [];
      
      const { data, error } = await supabase
        .from("admin_email_aliases")
        .select("*")
        .eq("admin_user_id", targetUserId)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true });
      
      if (error) throw error;
      return data as EmailAlias[];
    },
    enabled: !!targetUserId,
  });

  const addAlias = useMutation({
    mutationFn: async (email: string) => {
      if (!targetUserId) throw new Error("No user");
      
      const { error } = await supabase
        .from("admin_email_aliases")
        .insert({
          admin_user_id: targetUserId,
          email: email.toLowerCase().trim(),
          is_primary: aliases.length === 0, // First one is primary
        });
      
      if (error) {
        if (error.code === "23505") {
          throw new Error("This email is already registered to an admin");
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-aliases", targetUserId] });
      setNewEmail("");
      setIsAdding(false);
      toast.success("Email alias added");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to add email alias");
    },
  });

  const removeAlias = useMutation({
    mutationFn: async (aliasId: string) => {
      const { error } = await supabase
        .from("admin_email_aliases")
        .delete()
        .eq("id", aliasId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-aliases", targetUserId] });
      toast.success("Email alias removed");
    },
    onError: () => {
      toast.error("Failed to remove email alias");
    },
  });

  const setPrimary = useMutation({
    mutationFn: async (aliasId: string) => {
      if (!targetUserId) throw new Error("No user");
      
      // First, unset all as primary
      await supabase
        .from("admin_email_aliases")
        .update({ is_primary: false })
        .eq("admin_user_id", targetUserId);
      
      // Then set the selected one as primary
      const { error } = await supabase
        .from("admin_email_aliases")
        .update({ is_primary: true })
        .eq("id", aliasId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-aliases", targetUserId] });
      toast.success("Primary email updated");
    },
    onError: () => {
      toast.error("Failed to update primary email");
    },
  });

  const handleAddEmail = () => {
    if (!newEmail.trim()) return;
    
    // Basic email validation
    const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
    if (!emailRegex.test(newEmail.trim())) {
      toast.error("Please enter a valid email address");
      return;
    }
    
    addAlias.mutate(newEmail.trim());
  };

  if (isLoading) {
    return (
      <div className={cn("animate-pulse space-y-2", className)}>
        <div className="h-4 bg-[hsl(var(--admin-hover))] rounded w-1/3" />
        <div className="h-8 bg-[hsl(var(--admin-hover))] rounded" />
      </div>
    );
  }

  if (compact) {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-[hsl(var(--admin-text-muted))]">
            Email Aliases ({aliases.length})
          </span>
          {!isAdding && (
            <AdminButton
              variant="ghost"
              size="sm"
              onClick={() => setIsAdding(true)}
              className="h-6 text-xs"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add
            </AdminButton>
          )}
        </div>
        
        {isAdding && (
          <div className="flex items-center gap-2">
            <AdminInput
              type="email"
              placeholder="email@example.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddEmail()}
              className="h-7 text-xs"
              autoFocus
            />
            <AdminButton
              variant="admin"
              size="sm"
              onClick={handleAddEmail}
              disabled={addAlias.isPending}
              className="h-7"
            >
              <Check className="h-3 w-3" />
            </AdminButton>
            <AdminButton
              variant="ghost"
              size="sm"
              onClick={() => { setIsAdding(false); setNewEmail(""); }}
              className="h-7"
            >
              Cancel
            </AdminButton>
          </div>
        )}
        
        {aliases.length > 0 && (
          <div className="space-y-1">
            {aliases.map((alias) => (
              <div
                key={alias.id}
                className="flex items-center justify-between py-1 px-2 rounded bg-[hsl(var(--admin-surface))] text-xs"
              >
                <div className="flex items-center gap-2">
                  {alias.is_primary && (
                    <Star className="h-3 w-3 text-[hsl(var(--admin-warning))] fill-[hsl(var(--admin-warning))]" />
                  )}
                  <span>{alias.email}</span>
                </div>
                <div className="flex items-center gap-1">
                  {!alias.is_primary && (
                    <button
                      onClick={() => setPrimary.mutate(alias.id)}
                      className="p-1 hover:bg-[hsl(var(--admin-hover))] rounded text-[hsl(var(--admin-text-muted))] hover:text-[hsl(var(--admin-warning))]"
                      title="Set as primary"
                    >
                      <Star className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    onClick={() => removeAlias.mutate(alias.id)}
                    className="p-1 hover:bg-[hsl(var(--admin-error-muted))] rounded text-[hsl(var(--admin-text-muted))] hover:text-[hsl(var(--admin-error))]"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {aliases.length === 0 && !isAdding && (
          <p className="text-xs text-[hsl(var(--admin-text-muted))]">
            No email aliases configured
          </p>
        )}
      </div>
    );
  }

  // Full card mode
  return (
    <AdminCard className={className}>
      <AdminCardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
          <AdminCardTitle className="text-base font-semibold">
            {isSelfManaging ? "My Email Aliases" : "Email Aliases"}
          </AdminCardTitle>
        </div>
        <AdminCardDescription className="text-xs">
          Emails used to auto-assign you as account owner when sending or receiving messages
        </AdminCardDescription>
      </AdminCardHeader>
      <AdminCardContent className="space-y-4">
        {/* Add new email */}
        <div className="space-y-2">
          <AdminLabel>Add Email Address</AdminLabel>
          <div className="flex gap-2">
            <AdminInput
              type="email"
              placeholder="another-email@example.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddEmail()}
              className="flex-1"
            />
            <AdminButton
              variant="admin"
              onClick={handleAddEmail}
              disabled={addAlias.isPending || !newEmail.trim()}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add
            </AdminButton>
          </div>
        </div>

        {/* Existing aliases */}
        {aliases.length > 0 ? (
          <div className="space-y-2">
            <AdminLabel>Your Aliases</AdminLabel>
            <div className="space-y-2">
              {aliases.map((alias) => (
                <div
                  key={alias.id}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg border",
                    alias.is_primary
                      ? "border-[hsl(var(--admin-warning)/0.3)] bg-[hsl(var(--admin-warning)/0.1)]"
                      : "border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))]"
                  )}
                >
                  <div className="flex items-center gap-3">
                    {alias.is_primary ? (
                      <Star className="h-4 w-4 text-[hsl(var(--admin-warning))] fill-[hsl(var(--admin-warning))]" />
                    ) : (
                      <Mail className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                    )}
                    <div>
                      <span className="text-sm font-medium">{alias.email}</span>
                      {alias.is_primary && (
                        <AdminBadge intent="warning" className="ml-2 text-[10px]">
                          Primary
                        </AdminBadge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!alias.is_primary && (
                      <AdminButton
                        variant="ghost"
                        size="sm"
                        onClick={() => setPrimary.mutate(alias.id)}
                        disabled={setPrimary.isPending}
                        className="text-xs"
                      >
                        <Star className="h-3 w-3 mr-1" />
                        Set Primary
                      </AdminButton>
                    )}
                    <AdminButton
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAlias.mutate(alias.id)}
                      disabled={removeAlias.isPending}
                      className="text-[hsl(var(--admin-error))] hover:text-[hsl(var(--admin-error))] hover:bg-[hsl(var(--admin-error-muted))]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </AdminButton>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-6 text-[hsl(var(--admin-text-muted))]">
            <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No email aliases configured</p>
            <p className="text-xs mt-1">
              Add your work emails to auto-assign accounts when you send or receive messages
            </p>
          </div>
        )}
      </AdminCardContent>
    </AdminCard>
  );
}
