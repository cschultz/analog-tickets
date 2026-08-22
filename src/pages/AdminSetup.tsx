import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Shield, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AdminCard,
  AdminCardHeader,
  AdminCardTitle,
  AdminCardDescription,
  AdminCardContent,
} from "@/components/admin/AdminCard";
import { AdminButton } from "@/components/admin/AdminUI";
import { getFunctionUrl } from "@/platform/config/env";

const AdminSetup = () => {
  const { user, isAdmin, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const [alreadyExists, setAlreadyExists] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
      toast.error('Please sign in first');
    }
    if (isAdmin) {
      setSetupComplete(true);
    }
  }, [user, isAdmin, loading, navigate]);

  // Check if admin already exists on mount
  useEffect(() => {
    const checkAdminExists = async () => {
      if (!user || loading) return;
      
      try {
        const response = await fetch(
          getFunctionUrl('grant-first-admin'),
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        const data = await response.json();

        if (response.ok && data?.adminExists) {
          navigate('/');
          toast.info('Admin setup has already been completed');
        }
      } catch (error) {
        console.error('Error checking admin status:', error);
      }
    };

    checkAdminExists();
  }, [user, loading, navigate]);

  const handleBecomeAdmin = async () => {
    setIsProcessing(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('grant-first-admin');

      if (error) {
        console.error('Error:', error);
        const errorMessage = (error as any)?.message || (data as any)?.error || '';

        if (errorMessage.includes('Admin user already exists')) {
          setAlreadyExists(true);
          toast.error('An admin already exists');
        } else {
          toast.error('Failed to grant admin privileges');
        }
      } else {
        setSetupComplete(true);
        toast.success('You are now an administrator!');
        setTimeout(() => {
          navigate('/admin');
        }, 2000);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      toast.error('An unexpected error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--admin-bg))]">
        <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--admin-text-muted))]" />
      </div>
    );
  }

  return (
    <section className="min-h-screen py-20 bg-[hsl(var(--admin-bg))]">
      <div className="container mx-auto px-4 max-w-lg">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-[hsl(var(--admin-hover))] flex items-center justify-center">
            <Shield className="h-7 w-7 text-[hsl(var(--admin-text-secondary))]" />
          </div>
          <h1 className="text-2xl font-semibold text-[hsl(var(--admin-text))] mb-2">
            Admin Setup
          </h1>
          <p className="text-sm text-[hsl(var(--admin-text-secondary))]">
            Become the first administrator of this application
          </p>
        </div>

        <AdminCard>
          <AdminCardContent className="p-6">
            {setupComplete ? (
              <div className="text-center space-y-4">
                <div className="mx-auto h-12 w-12 rounded-full bg-[hsl(var(--admin-success-muted))] flex items-center justify-center">
                  <CheckCircle className="h-6 w-6 text-[hsl(var(--admin-success))]" />
                </div>
                <div>
                  <h2 className="text-lg font-medium text-[hsl(var(--admin-text))] mb-1">
                    Setup Complete!
                  </h2>
                  <p className="text-sm text-[hsl(var(--admin-text-secondary))]">
                    You are now an administrator. Redirecting to admin dashboard...
                  </p>
                </div>
                <AdminButton onClick={() => navigate('/admin')} className="w-full">
                  Go to Dashboard
                </AdminButton>
              </div>
            ) : alreadyExists ? (
              <div className="text-center space-y-4">
                <div className="mx-auto h-12 w-12 rounded-full bg-[hsl(var(--admin-error-muted))] flex items-center justify-center">
                  <XCircle className="h-6 w-6 text-[hsl(var(--admin-error))]" />
                </div>
                <div>
                  <h2 className="text-lg font-medium text-[hsl(var(--admin-text))] mb-1">
                    Admin Already Exists
                  </h2>
                  <p className="text-sm text-[hsl(var(--admin-text-secondary))]">
                    An administrator has already been set up for this application.
                    Please contact the existing admin for access.
                  </p>
                </div>
                <AdminButton variant="adminOutline" onClick={() => navigate('/')} className="w-full">
                  Return Home
                </AdminButton>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="space-y-3">
                  <p className="text-sm text-[hsl(var(--admin-text))]">
                    Welcome, <span className="font-medium">{user?.email}</span>
                  </p>
                  <p className="text-sm text-[hsl(var(--admin-text-secondary))]">
                    You're about to become the first administrator. As an admin, you'll have access to:
                  </p>
                  <ul className="text-sm text-[hsl(var(--admin-text-secondary))] space-y-1.5 ml-4">
                    <li className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--admin-text-muted))]" />
                      View all event registrations
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--admin-text-muted))]" />
                      Filter and search registrations
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--admin-text-muted))]" />
                      Export data to CSV
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--admin-text-muted))]" />
                      Manage event details
                    </li>
                  </ul>
                  <p className="text-xs text-[hsl(var(--admin-text-muted))] pt-2 border-t border-[hsl(var(--admin-border))]">
                    Note: Only the first person to click this button will become admin.
                    This is a one-time setup process.
                  </p>
                </div>

                <div className="space-y-2">
                  <AdminButton
                    onClick={handleBecomeAdmin}
                    disabled={isProcessing}
                    isLoading={isProcessing}
                    className="w-full"
                  >
                    Become Administrator
                  </AdminButton>

                  <AdminButton
                    variant="adminOutline"
                    onClick={() => navigate('/')}
                    className="w-full"
                  >
                    Cancel
                  </AdminButton>

                  <AdminButton
                    variant="adminGhost"
                    onClick={signOut}
                    className="w-full text-[hsl(var(--admin-text-muted))]"
                  >
                    Sign out
                  </AdminButton>
                </div>
              </div>
            )}
          </AdminCardContent>
        </AdminCard>
      </div>
    </section>
  );
};

export default AdminSetup;