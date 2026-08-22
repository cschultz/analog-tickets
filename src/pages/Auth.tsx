import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate, useSearchParams, useLocation, Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { COLORS, typography, heavyGrain, halftonePattern, duotoneImageStyle } from "@/styles/may-theme";
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";
import analogLogoWordmark from "@/assets/analog-logo-wordmark.webp";
import crowdGolden from "@/assets/may/crowd-golden.webp";
import { Eye, EyeOff } from "lucide-react";
import { sanitizeInternalPath } from "@/lib/safeRedirect";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  rememberMe: z.boolean().optional(),
});

const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  fullName: z.string().min(2, "Full name is required"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

const Auth = () => {
  const [searchParams] = useSearchParams();
  const initialInvitationToken = searchParams.get('invitation');

  const [isLogin, setIsLogin] = useState(!initialInvitationToken);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [invitationToken, setInvitationToken] = useState<string | null>(initialInvitationToken);
  const [invitationEmail, setInvitationEmail] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { signIn, signUp, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Get the redirect path from location state (set by ProtectedRoute)
  const from = sanitizeInternalPath((location.state as { from?: string })?.from, "/");

  // Note: Redirect is now handled by signIn function in useAuth
  // which checks admin status and redirects appropriately

  useEffect(() => {
    // Check for invitation token in URL
    const token = searchParams.get('invitation');
    if (token) {
      setInvitationToken(token);
      setIsLogin(false); // Switch to signup mode
      setShowForgotPassword(false);
      setShowPassword(false);
      setShowConfirmPassword(false);
      
      // Verify and get invitation details using secure RPC function
      supabase
        .rpc('verify_admin_invitation', { invitation_token: token })
        .then(({ data, error }) => {
          if (error || !data || data.length === 0) {
            toast.error('Invalid or expired invitation link');
            setInvitationToken(null);
            return;
          }
          
          const invitation = data[0];
          
          // Check if already used
          if (invitation.used_at) {
            toast.error('This invitation has already been used');
            setInvitationToken(null);
            return;
          }
          
          // Check if expired
          if (new Date(invitation.expires_at) < new Date()) {
            toast.error('This invitation has expired');
            setInvitationToken(null);
            return;
          }
          
          setInvitationEmail(invitation.email);
          signupForm.setValue('email', invitation.email ?? '');
          signupForm.setValue('fullName', invitation.name ?? '');
          signupForm.setValue('password', '');
          signupForm.setValue('confirmPassword', '');
          toast.success('Welcome! Please create your admin account');
        });
    }
  }, [searchParams]);

  const loginForm = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", rememberMe: true },
  });

  const signupForm = useForm({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: "", password: "", confirmPassword: "", fullName: "" },
    mode: "onChange",
  });

  const forgotPasswordForm = useForm({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  useEffect(() => {
    if (!invitationToken) return;

    const clearPrefilledPasswords = () => {
      signupForm.setValue('password', '', { shouldDirty: false, shouldTouch: false, shouldValidate: false });
      signupForm.setValue('confirmPassword', '', { shouldDirty: false, shouldTouch: false, shouldValidate: false });
    };

    const rafId = window.requestAnimationFrame(clearPrefilledPasswords);
    const timeoutId = window.setTimeout(clearPrefilledPasswords, 250);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
    };
  }, [invitationToken, signupForm]);

  const handleForgotPassword = async (data: z.infer<typeof forgotPasswordSchema>) => {
    setIsSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${window.location.origin}/auth?reset=true`,
    });
    
    if (error) {
      toast.error(error.message || "Failed to send reset email");
    } else {
      toast.success("Password reset email sent! Check your inbox.");
      setShowForgotPassword(false);
    }
    setIsSubmitting(false);
  };

  const handleLogin = async (data: z.infer<typeof loginSchema>) => {
    setIsSubmitting(true);
    const { error } = await signIn(data.email, data.password, from);
    if (error) {
      toast.error(error.message || "Failed to sign in");
    }
    setIsSubmitting(false);
  };

  const handleSignup = async (data: z.infer<typeof signupSchema>) => {
    console.log('[auth] Signup started', { hasInvitationToken: !!invitationToken });
    setIsSubmitting(true);
    const { error } = await signUp(data.email, data.password, data.fullName);
    if (error) {
      toast.error(error.message || "Failed to create account");
      setIsSubmitting(false);
      return;
    }

    console.log('[auth] Signup successful', { hasInvitationToken: !!invitationToken });
    
    // If this is an invitation signup, grant admin privileges
    if (invitationToken) {
      try {
        // Wait a moment for session to propagate, then poll for user
        let newUser = null;
        let attempts = 0;
        const maxAttempts = 10;
        
        while (!newUser && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 500));
          const { data: userData } = await supabase.auth.getUser();
          newUser = userData?.user;
          attempts++;
          console.log(`[auth] Waiting for session (attempt ${attempts}/${maxAttempts})`, { resolved: !!newUser });
        }
        
        if (!newUser) {
          console.error('[auth] Could not resolve user session after signup');
          toast.error('Account created but session not ready. Please sign in and contact support.');
          navigate('/auth');
          setIsSubmitting(false);
          return;
        }
        
        // Call edge function to grant admin role using service role
        console.log('[auth] Calling grant-invitation-admin edge function');
        const { data: grantData, error: grantError } = await supabase.functions.invoke('grant-invitation-admin', {
          body: { 
            invitationToken,
            userId: newUser.id 
          }
        });

        console.log('[auth] grant-invitation-admin result', { success: !!grantData?.success, failed: !!grantError });

        if (grantError || !grantData?.success) {
          console.error('[auth] Error granting admin role:', grantError?.message ?? 'request unsuccessful');
          toast.error('Account created but failed to grant admin access. Please contact support.');
          setIsSubmitting(false);
          return;
        }

        toast.success('Admin account created successfully!');
        navigate('/admin');
      } catch (error) {
        console.error('Error granting admin privileges:', error);
        toast.error('Account created but failed to grant admin privileges. Please contact support.');
      }
    } else {
      // Regular signup - redirect to admin setup
      console.log('[auth] No invitation token, redirecting to admin setup');
      navigate('/admin-setup');
    }
    
    setIsSubmitting(false);
  };

  const inputStyles: React.CSSProperties = {
    backgroundColor: '#FFFFFF',
    borderColor: COLORS.boulder,
    color: COLORS.charcoal,
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      {/* Left Panel - Decorative with Background Image */}
      <div 
        className="hidden lg:flex relative items-center justify-center p-12 overflow-hidden"
        style={{ backgroundColor: COLORS.denim }}
      >
        {/* Background image with duotone effect */}
        <div className="absolute inset-0">
          <img 
            src={crowdGolden} 
            alt="" 
            className="w-full h-full object-cover"
            style={{ 
              ...duotoneImageStyle,
              opacity: 0.6,
            }}
          />
          {/* Color overlay */}
          <div 
            className="absolute inset-0"
            style={{ 
              backgroundColor: COLORS.denim,
              mixBlendMode: 'multiply',
            }}
          />
        </div>
        
        <FilmGrainOverlay opacity={0.5} />
        
        {/* Halftone overlay */}
        <div 
          className="absolute inset-0 opacity-25 pointer-events-none"
          style={{ backgroundImage: halftonePattern, backgroundSize: '8px 8px' }}
        />
        
        {/* Heavy grain texture */}
        <div 
          className="absolute inset-0 opacity-[0.08] pointer-events-none mix-blend-overlay"
          style={heavyGrain}
        />
        
        <div className="relative z-10 text-center max-w-md">
          <Link to="/">
            <img 
              src={analogLogoWordmark} 
              alt="Analog" 
              className="h-16 w-auto mx-auto mb-12 opacity-90 hover:opacity-100 transition-opacity"
              style={{ filter: 'brightness(0) invert(1)' }}
            />
          </Link>
          
          <h2 
            className="text-4xl md:text-5xl mb-6"
            style={{ 
              ...typography.headline, 
              color: COLORS.dustySky,
            }}
          >
            The annual reunion for presence, creativity, and connection.
          </h2>
          
          <p 
            className="text-sm opacity-70"
            style={{ 
              ...typography.caption, 
              color: COLORS.dustySky,
            }}
          >
            MAY 14–16, 2027 · EXAMPLE VALLEY, CA
          </p>
        </div>
      </div>
      
      {/* Right Panel - Form */}
      <div 
        className="relative flex items-center justify-center p-8 md:p-12"
        style={{ backgroundColor: COLORS.dustySky }}
      >
        <FilmGrainOverlay opacity={0.3} />
        
        {/* Mobile logo */}
        <div className="absolute top-8 left-8 lg:hidden">
          <Link to="/">
            <img 
              src={analogLogoWordmark} 
              alt="Analog" 
              className="h-8 w-auto"
              style={{ filter: 'brightness(0) saturate(0)' }}
            />
          </Link>
        </div>
        
        <div className="relative z-10 w-full max-w-md">
          <div className="text-center mb-10">
            <p 
              className="mb-3"
              style={{ 
                ...typography.caption, 
                color: COLORS.boulder,
              }}
            >
              {invitationToken ? 'ADMIN INVITATION' : showForgotPassword ? 'RESET PASSWORD' : isLogin ? 'WELCOME BACK' : 'JOIN US'}
            </p>
            
            <h1 
              className="text-4xl md:text-5xl mb-4"
              style={{ 
                ...typography.headline, 
                color: COLORS.charcoal,
              }}
            >
              {invitationToken ? 'Create Account' : showForgotPassword ? 'Forgot Password' : isLogin ? 'Sign In' : 'Sign Up'}
            </h1>
            
            <p 
              className="text-base opacity-80"
              style={{ 
                ...typography.body, 
                color: COLORS.charcoal,
                fontSize: '15px',
              }}
            >
              {invitationToken 
                ? 'Create your admin account to get started' 
                : showForgotPassword 
                  ? 'We\'ll email you a reset link'
                  : isLogin ? 'Enter your credentials to continue' : 'Create your account to join'}
            </p>
          </div>

          <div 
            className="p-8 md:p-10 relative"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.5)',
              border: `1px solid ${COLORS.boulder}40`,
              position: 'relative' as const,
              zIndex: 20,
            }}
          >
            {isLogin ? (
              <Form key="login-form" {...loginForm}>
                <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-6">
                  <FormField
                    control={loginForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel 
                          style={{ 
                            ...typography.caption, 
                            color: COLORS.charcoal,
                            fontSize: '11px',
                          }}
                        >
                          EMAIL
                        </FormLabel>
                        <FormControl>
                          <Input 
                            type="email" 
                            placeholder="your@email.com"
                            autoComplete="email"
                            className="h-12 border focus:ring-2 focus:ring-offset-0"
                            style={{
                              ...inputStyles,
                              ...typography.body,
                              fontSize: '15px',
                            }}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={loginForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel 
                          style={{ 
                            ...typography.caption, 
                            color: COLORS.charcoal,
                            fontSize: '11px',
                          }}
                        >
                          PASSWORD
                        </FormLabel>
                        <FormControl>
                          <Input 
                            type="password" 
                            placeholder="••••••••"
                            autoComplete="current-password"
                            className="h-12 border focus:ring-2 focus:ring-offset-0"
                            style={{
                              ...inputStyles,
                              ...typography.body,
                              fontSize: '15px',
                            }}
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={loginForm.control}
                    name="rememberMe"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-3">
                        <FormControl>
                          <Checkbox 
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            className="border-[hsl(var(--admin-border))] data-[state=checked]:bg-[#4A6B8A] data-[state=checked]:border-[#4A6B8A]"
                          />
                        </FormControl>
                        <FormLabel 
                          className="!mt-0 cursor-pointer"
                          style={{ 
                            ...typography.body, 
                            color: COLORS.charcoal,
                            fontSize: '14px',
                          }}
                        >
                          Remember me
                        </FormLabel>
                      </FormItem>
                    )}
                  />

                  <div className="flex items-center justify-between">
                    <div /> {/* Spacer */}
                    <button
                      type="button"
                      onClick={() => setShowForgotPassword(true)}
                      className="text-sm transition-opacity hover:opacity-70"
                      style={{ 
                        ...typography.body, 
                        color: COLORS.denim,
                        fontSize: '13px',
                      }}
                    >
                      Forgot password?
                    </button>
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-12 text-base transition-all duration-300 hover:opacity-90"
                    disabled={isSubmitting}
                    style={{ 
                      ...typography.button,
                      backgroundColor: COLORS.denim, 
                      color: COLORS.dustySky,
                    }}
                  >
                    {isSubmitting ? 'Signing in...' : 'Sign In'}
                  </Button>
                </form>
              </Form>
            ) : showForgotPassword ? (
              <Form key="forgot-password-form" {...forgotPasswordForm}>
                <form onSubmit={forgotPasswordForm.handleSubmit(handleForgotPassword)} className="space-y-6">
                  <p 
                    className="text-sm mb-4"
                    style={{ 
                      ...typography.body, 
                      color: COLORS.charcoal,
                      fontSize: '14px',
                    }}
                  >
                    Enter your email address and we'll send you a link to reset your password.
                  </p>

                  <FormField
                    control={forgotPasswordForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel 
                          style={{ 
                            ...typography.caption, 
                            color: COLORS.charcoal,
                            fontSize: '11px',
                          }}
                        >
                          EMAIL
                        </FormLabel>
                        <FormControl>
                          <Input 
                            type="email" 
                            placeholder="your@email.com"
                            className="h-12 border focus:ring-2 focus:ring-offset-0"
                            style={{
                              backgroundColor: 'rgba(255, 255, 255, 0.7)',
                              borderColor: COLORS.boulder,
                              color: COLORS.charcoal,
                              ...typography.body,
                              fontSize: '15px',
                            }}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    className="w-full h-12 text-base transition-all duration-300 hover:opacity-90"
                    disabled={isSubmitting}
                    style={{ 
                      ...typography.button,
                      backgroundColor: COLORS.denim, 
                      color: COLORS.dustySky,
                    }}
                  >
                    {isSubmitting ? 'Sending...' : 'Send Reset Link'}
                  </Button>

                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(false)}
                    className="w-full text-sm transition-opacity hover:opacity-70"
                    style={{ 
                      ...typography.body, 
                      color: COLORS.charcoal,
                      fontSize: '14px',
                    }}
                  >
                    ← Back to sign in
                  </button>
                </form>
              </Form>
            ) : (
              <Form key={invitationToken ? "invite-signup-form" : "signup-form"} {...signupForm}>
                <form onSubmit={signupForm.handleSubmit(handleSignup)} className="space-y-5" autoComplete="off">
                  
                  {/* Full Name field */}
                  <FormField
                    control={signupForm.control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel 
                          style={{ 
                            ...typography.caption, 
                            color: COLORS.charcoal,
                            fontSize: '11px',
                          }}
                        >
                          FULL NAME
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            placeholder="Your name"
                            autoComplete="name"
                            className="h-12 border focus:ring-2 focus:ring-offset-0"
                            style={{
                              ...inputStyles,
                              ...typography.body,
                              fontSize: '15px',
                            }}
                            value={field.value ?? ''}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={signupForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel 
                          style={{ 
                            ...typography.caption, 
                            color: COLORS.charcoal,
                            fontSize: '11px',
                          }}
                        >
                          EMAIL
                        </FormLabel>
                        <FormControl>
                          <Input 
                            type="email" 
                            placeholder="your@email.com" 
                            disabled={false}
                            autoComplete="email"
                            className="h-12 border focus:ring-2 focus:ring-offset-0"
                            style={{
                              ...inputStyles,
                              ...typography.body,
                              fontSize: '15px',
                            }}
                            value={field.value ?? ''}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={signupForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel 
                          style={{ 
                            ...typography.caption, 
                            color: COLORS.charcoal,
                            fontSize: '11px',
                          }}
                        >
                          PASSWORD
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input 
                              id="invite-password"
                              type={showPassword ? "text" : "password"}
                              placeholder="••••••••" 
                              autoComplete={invitationToken ? "off" : "new-password"}
                              className="h-12 border bg-background focus:ring-2 focus:ring-offset-0 pr-12"
                              style={{
                                ...inputStyles,
                                ...typography.body,
                                fontSize: '15px',
                              }}
                              value={field.value ?? ''}
                              onChange={field.onChange}
                              onBlur={field.onBlur}
                              name={field.name}
                              ref={field.ref}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                              tabIndex={-1}
                            >
                              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                          </div>
                        </FormControl>
                        <p 
                          className="text-xs mt-1"
                          style={{ color: COLORS.boulder, opacity: 0.8 }}
                        >
                          Minimum 6 characters
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={signupForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel 
                          style={{ 
                            ...typography.caption, 
                            color: COLORS.charcoal,
                            fontSize: '11px',
                          }}
                        >
                          CONFIRM PASSWORD
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input 
                              id="invite-confirm-password"
                              type={showConfirmPassword ? "text" : "password"}
                              placeholder="••••••••" 
                              autoComplete={invitationToken ? "off" : "new-password"}
                              className="h-12 border bg-background focus:ring-2 focus:ring-offset-0 pr-12"
                              style={{
                                ...inputStyles,
                                ...typography.body,
                                fontSize: '15px',
                              }}
                              value={field.value ?? ''}
                              onChange={field.onChange}
                              onBlur={field.onBlur}
                              name={field.name}
                              ref={field.ref}
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                              tabIndex={-1}
                            >
                              {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    className="w-full h-12 text-base transition-all duration-300 hover:opacity-90"
                    disabled={isSubmitting}
                    style={{ 
                      ...typography.button,
                      backgroundColor: COLORS.denim, 
                      color: COLORS.dustySky,
                    }}
                  >
                    {isSubmitting ? 'Creating account...' : 'Create Account'}
                  </Button>
                </form>
              </Form>
            )}

            {!invitationToken && !showForgotPassword && (
              <div className="mt-8 text-center">
                <button
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-sm transition-opacity hover:opacity-70"
                  style={{ 
                    ...typography.body, 
                    color: COLORS.charcoal,
                    fontSize: '14px',
                  }}
                >
                  {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
                </button>
              </div>
            )}
          </div>
          
          {/* Back to May link */}
          <div className="mt-8 text-center">
            <Link 
              to="/"
              className="text-sm transition-opacity hover:opacity-70"
              style={{ 
                ...typography.caption, 
                color: COLORS.boulder,
                fontSize: '11px',
              }}
            >
              ← BACK TO HOME
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;