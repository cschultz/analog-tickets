import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password: string, redirectPath?: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Track if this is the initial load - we only set loading=false on initial load
    let isInitialLoad = true;
    
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Defer Supabase RPC calls to prevent deadlock
        if (session?.user) {
          setTimeout(async () => {
            // Don't reset loading for subsequent auth changes after initial load
            await checkAdminStatus(session.user.id, !isInitialLoad);
            
            // On SIGNED_IN event (e.g. email confirmation), redirect admins to dashboard only from /auth
            if (event === 'SIGNED_IN') {
              const currentPath = window.location.pathname;
              if (currentPath === '/auth') {
                const { data: isAdminData } = await supabase
                  .rpc('has_role', { _user_id: session.user.id, _role: 'admin' });
                if (isAdminData === true) {
                  navigate('/admin');
                }
              }
            }
          }, 0);
        } else {
          setIsAdmin(false);
          // Only set loading false if this is initial load
          if (isInitialLoad) {
            setLoading(false);
            isInitialLoad = false;
          }
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        checkAdminStatus(session.user.id, false).finally(() => {
          setLoading(false);
          isInitialLoad = false;
        });
      } else {
        setLoading(false);
        isInitialLoad = false;
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkAdminStatus = async (userId: string, skipLoadingUpdate = false) => {
    try {
      const { data, error } = await supabase
        .rpc('has_role', { _user_id: userId, _role: 'admin' });
      
      if (!error) {
        setIsAdmin(data === true);
      } else {
        console.error('Error checking admin role:', error);
        setIsAdmin(false);
      }
    } catch (error) {
      console.error('Error checking admin status:', error);
      setIsAdmin(false);
    } finally {
      // Only set loading to false if not skipping (initial load only)
      if (!skipLoadingUpdate) {
        setLoading(false);
      }
    }
  };

  const refreshAdminStatus = async () => {
    if (user) {
      await checkAdminStatus(user.id);
    }
  };

  const signIn = async (email: string, password: string, redirectPath?: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (!error && data.user) {
      toast.success('Signed in successfully!');
      
      // Check if user is admin and redirect accordingly
      const { data: isAdminData } = await supabase
        .rpc('has_role', { _user_id: data.user.id, _role: 'admin' });
      
      if (isAdminData === true) {
        // Admin users go to admin dashboard
        navigate('/admin');
      } else {
        // Non-admin users go to requested path or homepage
        navigate(redirectPath || '/');
      }
    }
    
    return { error };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    // Redirect to admin after email confirmation since admins are the primary users signing up
    const redirectUrl = `${window.location.origin}/admin`;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        }
      }
    });
    
    if (!error && data.user) {
      toast.success('Account created successfully!');
      // If session exists (auto-confirm enabled), redirect to admin
      if (data.session) {
        navigate('/admin');
      }
    }
    
    return { error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      setIsAdmin(false);
      toast.success('Signed out successfully');
      navigate('/');
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, isAdmin, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
