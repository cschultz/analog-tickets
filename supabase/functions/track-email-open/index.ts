import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

// 1x1 transparent PNG pixel
const TRACKING_PIXEL = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
]);

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const trackingId = url.searchParams.get('t');

    if (!trackingId) {
      console.log('No tracking ID provided');
      return new Response(TRACKING_PIXEL, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Update the email log with open tracking
    const { data, error } = await supabaseAdmin
      .from('email_sequence_logs')
      .update({
        opened_at: new Date().toISOString(),
        open_count: supabaseAdmin.rpc('increment_open_count', { log_tracking_id: trackingId }),
      })
      .eq('tracking_id', trackingId)
      .is('opened_at', null) // Only set opened_at on first open
      .select('id');

    // If first open didn't match (already opened), just increment count
    if (!data || data.length === 0) {
      await supabaseAdmin.rpc('increment_email_open_count', { log_tracking_id: trackingId });
    }

    console.log(`Email open tracked for: ${trackingId}`);

    return new Response(TRACKING_PIXEL, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Error tracking email open:', error);
    // Always return the pixel even on error
    return new Response(TRACKING_PIXEL, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }
});
