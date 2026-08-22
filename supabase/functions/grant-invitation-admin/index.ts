import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { invitationToken, userId } = await req.json();

    if (!invitationToken || !userId) {
      return new Response(
        JSON.stringify({ error: 'Missing invitationToken or userId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // Verify the invitation is valid and get the email
    const { data: invitation, error: inviteError } = await supabaseAdmin
      .from('admin_invitations')
      .select('email, expires_at, used_at')
      .eq('token', invitationToken)
      .single();

    if (inviteError || !invitation) {
      console.error('Invalid invitation:', inviteError);
      return new Response(
        JSON.stringify({ error: 'Invalid invitation token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if already used
    if (invitation.used_at) {
      return new Response(
        JSON.stringify({ error: 'Invitation already used' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if expired
    if (new Date(invitation.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: 'Invitation expired' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's email to verify it matches the invitation
    const { data: user, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
    
    if (userError || !user || user.user.email !== invitation.email) {
      console.error('User email mismatch or not found:', userError);
      return new Response(
        JSON.stringify({ error: 'User email does not match invitation' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Grant admin role using service role (bypasses RLS)
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: userId,
        role: 'admin'
      });

    if (roleError) {
      console.error('Error granting admin role:', roleError);
      return new Response(
        JSON.stringify({ error: 'Failed to grant admin role', details: roleError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mark invitation as used
    const { error: updateError } = await supabaseAdmin
      .from('admin_invitations')
      .update({ 
        used_at: new Date().toISOString(),
        used_by: userId 
      })
      .eq('token', invitationToken);

    if (updateError) {
      console.error('Error marking invitation as used:', updateError);
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Admin role granted successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in grant-invitation-admin:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
