import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, name, invitedBy } = await req.json();

    if (!email) {
      throw new Error('Email is required');
    }

    // Create Supabase client with service role to check admin status
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Verify the requester is an admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { data: isAdmin, error: roleError } = await supabase
      .rpc('has_role', { _user_id: user.id, _role: 'admin' });

    if (roleError || !isAdmin) {
      throw new Error('Only admins can send invitations');
    }

    // Generate a secure invitation token
    const invitationToken = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Token expires in 7 days

    // Create invitation record
    const { error: inviteError } = await supabase
      .from('admin_invitations')
      .insert({
        email: email.toLowerCase(),
        name: name || null,
        token: invitationToken,
        invited_by: user.id,
        expires_at: expiresAt.toISOString(),
      });

    if (inviteError) {
      console.error('Error creating invitation:', inviteError);
      throw new Error('Failed to create invitation');
    }

    // Send invitation email using Resend
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #322821; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #C7A97A 0%, #A98255 100%); color: #F3EEE6; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #F3EEE6; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background: #C7A97A; color: #F3EEE6; padding: 12px 30px; text-decoration: none; border-radius: 4px; margin: 20px 0; font-weight: 600; }
            .footer { text-align: center; margin-top: 30px; color: #7B6E61; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">Cosmico Admin Invitation</h1>
            </div>
            <div class="content">
              <p>Hello${name ? ' ' + name : ''},</p>
              
              <p><strong>${invitedBy || 'An administrator'}</strong> has invited you to become an admin for Cosmico.</p>
              
              <p>To accept this invitation and set up your admin account:</p>
              
              <ol>
                <li>Click the button below to create your account</li>
                <li>Use this email address: <strong>${email}</strong></li>
                <li>Set a secure password</li>
                <li>You'll automatically receive admin access upon signup</li>
              </ol>
              
              <div style="text-align: center;">
                <a href="https://example.invalid/auth?invitation=${invitationToken}" class="button">
                  Accept Invitation & Sign Up
                </a>
              </div>
              
              <p style="margin-top: 30px; font-size: 14px; color: #7B6E61;">
                <strong>Note:</strong> This invitation link expires in 7 days.
              </p>
            </div>
            <div class="footer">
              <p>Cosmico</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'The Cosmico Team <hello@example.invalid>',
        to: [email],
        subject: "You've been invited to join Cosmico Admin",
        html: emailHtml,
      }),
    });

    if (!emailResponse.ok) {
      const error = await emailResponse.text();
      console.error('Resend error:', error);
      throw new Error(`Failed to send email: ${error}`);
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Invitation sent successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
