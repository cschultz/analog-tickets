import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AdminButton } from "@/components/admin/AdminUI";
import {
  AdminInput,
  AdminLabel,
  AdminTable,
  AdminTableBody,
  AdminTableCell,
  AdminTableHead,
  AdminTableHeader,
  AdminTableRow,
  AdminConfirmDialog,
  AdminBadge,
  PersonAvatar,
} from "@/components/admin";
import { AdminCard, AdminCardContent, AdminCardDescription, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import { AdminSheet, AdminSheetContent, AdminSheetHeader, AdminSheetTitle, AdminSheetDescription } from "@/components/admin/AdminSheet";
import { EmailAliasManager } from "@/components/admin/EmailAliasManager";
import { toast } from "sonner";
import { Shield, Trash2, Mail, Users, RefreshCw, Clock, CheckCircle, XCircle, ChevronRight } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { formatDistanceToNow } from "date-fns";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { useQueryClient } from "@tanstack/react-query";

interface AdminUser {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  profiles?: {
    email: string;
    full_name: string | null;
  };
}

interface PendingInvitation {
  id: string;
  email: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

type InvitationStatus = 'pending' | 'expired' | 'accepted';

const getInvitationStatus = (invitation: PendingInvitation): InvitationStatus => {
  if (invitation.used_at) return 'accepted';
  if (new Date(invitation.expires_at) < new Date()) return 'expired';
  return 'pending';
};

export default function AdminUsers() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [sending, setSending] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [adminToRevoke, setAdminToRevoke] = useState<{ userId: string; email: string } | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [selectedAdmin, setSelectedAdmin] = useState<AdminUser | null>(null);

  const { data: admins = [], isLoading: adminsLoading } = useAuthQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('id, user_id, role, created_at')
        .eq('role', 'admin')
        .order('created_at', { ascending: false });

      if (rolesError) throw rolesError;
      
      const userIds = (userRoles || []).map(r => r.user_id);
      
      let profiles: { id: string; email: string; full_name: string | null }[] = [];
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, email, full_name')
          .in('id', userIds);
        profiles = profilesData || [];
      }
      
      return (userRoles || []).map(role => {
        const profile = profiles.find(p => p.id === role.user_id);
        return {
          ...role,
          profiles: profile ? { email: profile.email, full_name: profile.full_name } : undefined
        };
      }) as AdminUser[];
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const { data: invitations = [], isLoading: invitationsLoading } = useAuthQuery({
    queryKey: ["admin-invitations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_invitations')
        .select('id, email, expires_at, used_at, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const emailMap = new Map<string, PendingInvitation>();
      (data || []).forEach(inv => {
        if (!emailMap.has(inv.email)) {
          emailMap.set(inv.email, inv);
        }
      });
      
      return Array.from(emailMap.values()) as PendingInvitation[];
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const loading = adminsLoading || invitationsLoading;

  const handleSendInvite = async () => {
    if (!inviteEmail.trim()) {
      toast.error('Please enter an email address');
      return;
    }

    setSending(true);
    try {
      const { error } = await supabase.functions.invoke('send-admin-invitation', {
        body: {
          email: inviteEmail,
          name: inviteName || undefined,
          invitedBy: user?.email,
        },
      });

      if (error) throw error;

      toast.success('Admin invitation sent successfully');
      setInviteEmail("");
      setInviteName("");
      queryClient.invalidateQueries({ queryKey: ["admin-invitations"] });
    } catch (error: any) {
      console.error('Error sending invitation:', error);
      toast.error(error.message || 'Failed to send invitation');
    } finally {
      setSending(false);
    }
  };

  const handleResendInvite = async (invitation: PendingInvitation) => {
    setResendingId(invitation.id);
    try {
      const { error } = await supabase.functions.invoke('send-admin-invitation', {
        body: {
          email: invitation.email,
          invitedBy: user?.email,
        },
      });

      if (error) throw error;

      toast.success(`Invitation resent to ${invitation.email}`);
      queryClient.invalidateQueries({ queryKey: ["admin-invitations"] });
    } catch (error: any) {
      console.error('Error resending invitation:', error);
      toast.error(error.message || 'Failed to resend invitation');
    } finally {
      setResendingId(null);
    }
  };

  const handleRevokeAdmin = async (userId: string, email: string) => {
    if (userId === user?.id) {
      toast.error("You cannot revoke your own admin access");
      return;
    }

    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role', 'admin');

      if (error) throw error;

      toast.success(`Admin access revoked for ${email}`);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (error) {
      console.error('Error revoking admin:', error);
      toast.error('Failed to revoke admin access');
    }
  };

  const pendingInvitations = invitations.filter(inv => !inv.used_at);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[hsl(var(--admin-text-muted))]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Admin Management"
        subtitle="Manage admin users and invitations"
        icon={Users}
      />

      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Invite New Admin
          </AdminCardTitle>
          <AdminCardDescription>
            Send an invitation to grant admin access
          </AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <AdminLabel htmlFor="invite-email">Email Address *</AdminLabel>
              <AdminInput
                id="invite-email"
                type="email"
                placeholder="admin@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <AdminLabel htmlFor="invite-name">Full Name (Optional)</AdminLabel>
              <AdminInput
                id="invite-name"
                type="text"
                placeholder="John Doe"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
              />
            </div>
          </div>
          <AdminButton 
            variant="admin"
            onClick={handleSendInvite} 
            disabled={sending}
          >
            {sending ? 'Sending...' : 'Send Invitation'}
          </AdminButton>
        </AdminCardContent>
      </AdminCard>

      {pendingInvitations.length > 0 && (
        <AdminCard>
          <AdminCardHeader>
            <AdminCardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Pending Invitations ({pendingInvitations.length})
            </AdminCardTitle>
            <AdminCardDescription>
              Invitations awaiting acceptance
            </AdminCardDescription>
          </AdminCardHeader>
          <AdminCardContent>
            <div className="rounded-md border border-[hsl(var(--admin-border))]">
              <AdminTable>
                <AdminTableHeader>
                  <AdminTableRow>
                    <AdminTableHead>Email</AdminTableHead>
                    <AdminTableHead>Status</AdminTableHead>
                    <AdminTableHead>Sent</AdminTableHead>
                    <AdminTableHead className="text-right">Actions</AdminTableHead>
                  </AdminTableRow>
                </AdminTableHeader>
                <AdminTableBody>
                  {pendingInvitations.map((invitation) => {
                    const status = getInvitationStatus(invitation);
                    const isExpired = status === 'expired';
                    
                    return (
                      <AdminTableRow key={invitation.id}>
                        <AdminTableCell className="font-medium">
                          {invitation.email}
                        </AdminTableCell>
                        <AdminTableCell>
                          {isExpired ? (
                            <AdminBadge intent="warning" showDot>
                              Expired
                            </AdminBadge>
                          ) : (
                            <AdminBadge intent="info" showDot>
                              Pending
                            </AdminBadge>
                          )}
                        </AdminTableCell>
                        <AdminTableCell className="text-[hsl(var(--admin-text-muted))]">
                          {formatDistanceToNow(new Date(invitation.created_at), { addSuffix: true })}
                        </AdminTableCell>
                        <AdminTableCell className="text-right">
                          <AdminButton
                            variant="adminGhost"
                            size="sm"
                            disabled={resendingId === invitation.id}
                            onClick={() => handleResendInvite(invitation)}
                          >
                            <RefreshCw className={`h-4 w-4 ${resendingId === invitation.id ? 'animate-spin' : ''}`} />
                            <span className="ml-1.5 hidden sm:inline">
                              {isExpired ? 'Resend' : 'Send Again'}
                            </span>
                          </AdminButton>
                        </AdminTableCell>
                      </AdminTableRow>
                    );
                  })}
                </AdminTableBody>
              </AdminTable>
            </div>
          </AdminCardContent>
        </AdminCard>
      )}

      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            Current Admins ({admins.length})
          </AdminCardTitle>
          <AdminCardDescription>
            Users with administrative access
          </AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent>
          <div className="rounded-md border border-[hsl(var(--admin-border))]">
            <AdminTable>
              <AdminTableHeader>
                <AdminTableRow>
                  <AdminTableHead>Admin</AdminTableHead>
                  <AdminTableHead>Name</AdminTableHead>
                  <AdminTableHead>Email Aliases</AdminTableHead>
                  <AdminTableHead className="text-right">Actions</AdminTableHead>
                </AdminTableRow>
              </AdminTableHeader>
              <AdminTableBody>
                {admins.length === 0 ? (
                  <AdminTableRow>
                    <AdminTableCell colSpan={3} className="text-center text-[hsl(var(--admin-text-muted))]">
                      No admins found
                    </AdminTableCell>
                  </AdminTableRow>
                ) : (
                  admins.map((admin) => (
                    <AdminTableRow 
                      key={admin.id}
                      className="cursor-pointer hover:bg-[hsl(var(--admin-hover))]"
                      onClick={() => setSelectedAdmin(admin)}
                    >
                      <AdminTableCell>
                        <div className="flex items-center gap-3">
                          <PersonAvatar 
                            name={admin.profiles?.full_name || admin.profiles?.email || "Admin"} 
                            size="sm"
                          />
                          <span className="font-medium">{admin.profiles?.email || 'N/A'}</span>
                        </div>
                      </AdminTableCell>
                      <AdminTableCell>
                        {admin.profiles?.full_name || '-'}
                      </AdminTableCell>
                      <AdminTableCell>
                        <div className="flex items-center gap-2">
                          <ChevronRight className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                        </div>
                      </AdminTableCell>
                      <AdminTableCell className="text-right">
                        <AdminButton
                          variant="adminGhost"
                          size="sm"
                          disabled={admin.user_id === user?.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setAdminToRevoke({ userId: admin.user_id, email: admin.profiles?.email || '' });
                            setRevokeDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-[hsl(var(--admin-error))]" />
                        </AdminButton>
                      </AdminTableCell>
                    </AdminTableRow>
                  ))
                )}
              </AdminTableBody>
            </AdminTable>
          </div>
        </AdminCardContent>
      </AdminCard>

      <AdminSheet open={!!selectedAdmin} onOpenChange={(open) => !open && setSelectedAdmin(null)}>
        <AdminSheetContent>
          {selectedAdmin && (
            <>
              <AdminSheetHeader>
                <div className="flex items-center gap-3">
                  <PersonAvatar 
                    name={selectedAdmin.profiles?.full_name || selectedAdmin.profiles?.email || "Admin"} 
                    size="lg"
                  />
                  <div>
                    <AdminSheetTitle>
                      {selectedAdmin.profiles?.full_name || selectedAdmin.profiles?.email}
                    </AdminSheetTitle>
                    <AdminSheetDescription>
                      {selectedAdmin.profiles?.email}
                    </AdminSheetDescription>
                  </div>
                </div>
              </AdminSheetHeader>
              
              <div className="mt-6">
                <EmailAliasManager adminUserId={selectedAdmin.user_id} />
              </div>
            </>
          )}
        </AdminSheetContent>
      </AdminSheet>

      <AdminConfirmDialog
        open={revokeDialogOpen}
        onOpenChange={setRevokeDialogOpen}
        title="Revoke Admin Access"
        description={`Are you sure you want to revoke admin access for ${adminToRevoke?.email}? This action cannot be undone.`}
        actionType="destructive"
        actionLabel="Revoke Access"
        icon="delete"
        onConfirm={async () => {
          if (adminToRevoke) {
            await handleRevokeAdmin(adminToRevoke.userId, adminToRevoke.email);
            setRevokeDialogOpen(false);
            setAdminToRevoke(null);
          }
        }}
      />
    </div>
  );
}