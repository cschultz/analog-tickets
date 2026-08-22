import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const trackingId = url.searchParams.get('t');
    const targetUrl = url.searchParams.get('u');

    if (!targetUrl) {
      console.log('No target URL provided');
      return new Response('Missing redirect URL', { status: 400 });
    }

    // Decode the target URL
    const decodedUrl = decodeURIComponent(targetUrl);

    if (trackingId) {
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      // Get user agent and IP for analytics
      const userAgent = req.headers.get('user-agent') || null;
      const forwardedFor = req.headers.get('x-forwarded-for');
      const ipAddress = forwardedFor ? forwardedFor.split(',')[0].trim() : null;

      // Update click tracking on the log
      const { data: logData } = await supabaseAdmin
        .from('email_sequence_logs')
        .update({
          clicked_at: new Date().toISOString(),
          click_count: supabaseAdmin.rpc('increment_click_count', { log_tracking_id: trackingId }),
        })
        .eq('tracking_id', trackingId)
        .is('clicked_at', null) // Only set clicked_at on first click
        .select('id');

      // If already clicked, just increment count
      if (!logData || logData.length === 0) {
        await supabaseAdmin.rpc('increment_email_click_count', { log_tracking_id: trackingId });
      }

      // Get the log ID for detailed click tracking
      const { data: logRecord } = await supabaseAdmin
        .from('email_sequence_logs')
        .select('id')
        .eq('tracking_id', trackingId)
        .single();

      if (logRecord) {
        // Record the click event with details
        await supabaseAdmin.from('email_click_events').insert({
          log_id: logRecord.id,
          link_url: decodedUrl,
          user_agent: userAgent,
          ip_address: ipAddress,
        });
      }

      console.log(`Email click tracked for: ${trackingId}, URL: ${decodedUrl}`);
    }

    // Redirect to the target URL
    return new Response(null, {
      status: 302,
      headers: {
        'Location': decodedUrl,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Error tracking email click:', error);
    // Try to redirect anyway
    const url = new URL(req.url);
    const targetUrl = url.searchParams.get('u');
    if (targetUrl) {
      return new Response(null, {
        status: 302,
        headers: { 'Location': decodeURIComponent(targetUrl) },
      });
    }
    return new Response('Error', { status: 500 });
  }
});
