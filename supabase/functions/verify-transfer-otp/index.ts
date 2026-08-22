import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_ATTEMPTS = 5;

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[VERIFY-TRANSFER-OTP] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { ticketId, code, verifiedEmail } = await req.json();

    if (!ticketId || !code || !verifiedEmail) {
      throw new Error('Missing required fields');
    }

    // Validate code format
    if (!/^\d{6}$/.test(code)) {
      throw new Error('Invalid code format. Please enter a 6-digit code.');
    }

    logStep('Verifying OTP', { ticketId, email: verifiedEmail.substring(0, 3) + '***' });

    // Get the most recent unexpired OTP for this ticket+email
    const { data: otpRecord, error: otpError } = await supabaseClient
      .from('transfer_otp_codes')
      .select('*')
      .eq('ticket_id', ticketId)
      .eq('initiated_by_email', verifiedEmail.toLowerCase())
      .is('verified_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otpError || !otpRecord) {
      logStep('No valid OTP found');
      throw new Error('No active verification code found. Please request a new code.');
    }

    // Check attempt limit
    if (otpRecord.attempts >= MAX_ATTEMPTS) {
      logStep('Max attempts exceeded');
      throw new Error('Too many failed attempts. Please request a new code.');
    }

    // Increment attempts
    await supabaseClient
      .from('transfer_otp_codes')
      .update({ attempts: otpRecord.attempts + 1 })
      .eq('id', otpRecord.id);

    // Verify code
    if (otpRecord.code !== code) {
      const remaining = MAX_ATTEMPTS - otpRecord.attempts - 1;
      logStep('Invalid code', { remaining });
      throw new Error(`Incorrect code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`);
    }

    // Mark as verified
    await supabaseClient
      .from('transfer_otp_codes')
      .update({ verified_at: new Date().toISOString() })
      .eq('id', otpRecord.id);

    logStep('OTP verified successfully');

    return new Response(
      JSON.stringify({
        success: true,
        verified: true,
        otpId: otpRecord.id,
        message: 'Identity verified. You can now proceed with the transfer.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Verify transfer OTP error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
