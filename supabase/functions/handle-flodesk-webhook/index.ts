import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const eventType = payload?.event || payload?.type;

    console.log('Flodesk webhook received:', JSON.stringify({ eventType, payload }).slice(0, 500));

    if (!eventType) {
      return new Response(
        JSON.stringify({ success: false, error: 'No event type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Extract subscriber data from payload
    const subscriber = payload?.data || payload?.subscriber || payload;
    const email = (subscriber?.email || '').toLowerCase().trim();

    if (!email) {
      console.log('No email in webhook payload');
      return new Response(
        JSON.stringify({ success: true, message: 'No email, skipped' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract segment info
    const segmentNames: string[] = [];
    if (Array.isArray(subscriber?.segments)) {
      for (const seg of subscriber.segments) {
        if (typeof seg === 'string') segmentNames.push(seg);
        else if (seg?.name) segmentNames.push(seg.name);
      }
    }
    // Also check for segment in the event data (subscriber.added_to_segment)
    if (payload?.segment?.name) {
      segmentNames.push(payload.segment.name);
    }

    // Check purchase history
    const { data: paidReg } = await supabase
      .from('registrations')
      .select('id')
      .ilike('email', email)
      .eq('payment_status', 'paid')
      .limit(1)
      .maybeSingle();

    const hasPurchased = !!paidReg;

    // Map event type to engagement status
    // Known segment IDs
    const SEGMENT_IDS = {
      WARM: '69cd3fedf4d2595db002527e',       // Cosmico - Warm 2026
      HOT: '69cd3ff31fd7fbf5532a6bcf',         // Cosmico - Hot 2026
      LINK_CLICKERS: '69cd3ff376ae8060d766df63', // Cosmico - Link Clickers
      MAIN: '6930a0da231c07add766b8a0',         // Cosmico (main)
    };

    let engagementStatus = 'active';
    let leadStatus = hasPurchased ? 'converted' : 'new';

    // Check segment IDs from payload
    const segmentIds: string[] = [];
    if (Array.isArray(subscriber?.segments)) {
      for (const seg of subscriber.segments) {
        if (typeof seg === 'string') segmentIds.push(seg);
        else if (seg?.id) segmentIds.push(seg.id);
      }
    }
    if (payload?.segment?.id) segmentIds.push(payload.segment.id);

    if (eventType === 'subscriber.unsubscribed') {
      engagementStatus = 'unsubscribed';
    } else if (eventType === 'subscriber.added_to_segment') {
      const isHot = segmentIds.includes(SEGMENT_IDS.HOT) || 
        segmentNames.some(s => s.toLowerCase().includes('hot'));
      const isWarm = segmentIds.includes(SEGMENT_IDS.WARM) || 
        segmentIds.includes(SEGMENT_IDS.LINK_CLICKERS) ||
        segmentNames.some(s => s.toLowerCase().includes('warm') || s.toLowerCase().includes('clicker'));
      
      if (!hasPurchased) {
        if (isHot) leadStatus = 'hot';
        else if (isWarm) leadStatus = 'warm';
      }
    }

    // Upsert into newsletter_leads
    const { error: upsertError } = await supabase
      .from('newsletter_leads')
      .upsert({
        email,
        first_name: subscriber?.first_name || null,
        last_name: subscriber?.last_name || null,
        source: 'flodesk',
        flodesk_subscriber_id: subscriber?.id || null,
        has_purchased: hasPurchased,
        lead_status: leadStatus,
        engagement_status: engagementStatus,
        segments: segmentNames.length > 0 ? segmentNames : undefined,
        synced_at: new Date().toISOString(),
      }, { onConflict: 'email,source' });

    if (upsertError) {
      console.error('Upsert error:', upsertError);
    }

    // For new subscribers without purchases, also log as intent signal
    if (eventType === 'subscriber.created' && !hasPurchased) {
      await supabase.from('cart_intent_signals').insert({
        session_id: `flodesk-${email}-${Date.now()}`,
        signal_type: 'newsletter_signup',
        email,
        name: [subscriber?.first_name, subscriber?.last_name].filter(Boolean).join(' ') || null,
      });
    }

    console.log(`Processed Flodesk webhook: ${eventType} for ${email}, status=${leadStatus}`);

    return new Response(
      JSON.stringify({ success: true, event: eventType, email }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Flodesk webhook error:', msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
