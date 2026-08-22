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
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'LOVABLE_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get lead data from request
    const { leads } = await req.json();
    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No leads provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch aggregate buyer profile stats for context
    const { data: buyerStats } = await supabase.rpc('get_webhook_health_summary'); // just to test connectivity
    
    // Get aggregate conversion data
    const { data: conversionData } = await supabase
      .from('registrations')
      .select('ticket_type, total_amount, payment_status')
      .in('payment_status', ['paid', 'payment_plan'])
      .limit(500);

    const totalBuyers = conversionData?.length || 0;
    const avgSpend = totalBuyers > 0 
      ? (conversionData?.reduce((s, r) => s + (r.total_amount || 0), 0) || 0) / totalBuyers / 100 
      : 0;
    const vipRate = totalBuyers > 0 
      ? (conversionData?.filter(r => r.ticket_type?.includes('vip')).length || 0) / totalBuyers * 100 
      : 0;

    // Format top leads for AI analysis (max 15 to keep prompt manageable)
    const topLeads = leads.slice(0, 15).map((l: any, i: number) => ({
      index: i,
      email_prefix: l.email?.split('@')[0]?.slice(0, 3) + '***',
      name: l.name || 'Unknown',
      source: l.source,
      ticket_interest: l.ticket_type || 'unknown',
      furthest_step: l.furthest_step,
      attempt_count: l.attempt_count,
      intent_signals: l.intent_signals,
      ad_source: l.ad_source,
      is_returning: l.past_purchases?.is_returning || false,
      past_events: l.past_purchases?.total_events || 0,
      past_spend: l.past_purchases?.total_spent ? `$${(l.past_purchases.total_spent / 100).toFixed(0)}` : '$0',
      had_vip: l.past_purchases?.had_vip || false,
      had_lodging: l.past_purchases?.had_lodging || false,
      has_checkout_error: l.has_checkout_error,
      chat_sessions: l.chat_sessions,
      days_since_last: Math.round((Date.now() - new Date(l.last_activity).getTime()) / 86400000),
      // Email engagement from Flodesk
      email_engagement: l.engagement_status || 'unknown',
      newsletter_segments: l.segments || [],
      // Outreach activities
      received_promo_code: l.has_promo_code || false,
      promo_code_source: l.promo_code_source || null,
      promo_code_redeemed: l.promo_code_used || false,
      received_abandonment_sms: l.sms_sent || false,
      recovery_emails_sent: l.recovery_emails_sent || 0,
    }));

    const prompt = `You are a lead scoring AI for a music festival (Cosmico / Cosmico). Analyze these leads and predict conversion likelihood.

CONTEXT:
- Average ticket buyer spends $${avgSpend.toFixed(0)}
- ${vipRate.toFixed(0)}% of buyers choose VIP
- Total past buyers: ${totalBuyers}

LEADS TO SCORE:
${JSON.stringify(topLeads, null, 1)}

For each lead, provide:
1. "score": 0-100 conversion probability
2. "reasoning": 1-sentence explanation of why (reference specific data points)
3. "recommended_action": specific outreach suggestion (e.g., "Offer VIP upgrade discount", "Send personal text about new lineup addition")

SCORING GUIDANCE:
- Returning customers who haven't bought yet = 70-90%
- Past VIP buyers browsing again = 80-95%
- Payment failed with multiple attempts = 60-80%
- Received promo code but hasn't redeemed = boost +10-15% (they have a live offer)
- Received abandonment SMS = boost +5-10% (actively being recovered)
- Has both promo code + SMS outreach = boost +15-20%
- Recovery emails sent (2+) = boost +5-10%
- Email captured from ads with high intent signals = 40-60%
- Active email subscriber (opens emails) with browsing = 35-55%
- Active email subscriber, no browsing signals = 15-30%
- Newsletter-only subscriber, inactive/unknown engagement, no browsing = 5-15%
- Bounced/unsubscribed email = 0-5%
- Anonymous browsing = 5-15%

Respond with ONLY valid JSON: { "predictions": [{ "index": 0, "score": 85, "reasoning": "...", "recommended_action": "..." }, ...] }`;

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: 'You are a conversion prediction AI. Respond ONLY with valid JSON, no markdown.' },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error('AI API error:', aiRes.status, errText);
      if (aiRes.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: 'Rate limit exceeded. Please try again in a minute.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiRes.status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: 'AI credits exhausted. Add funds in Settings > Workspace > Usage.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ success: false, error: 'AI scoring failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiRes.json();
    let content = aiData.choices?.[0]?.message?.content || '{}';
    
    // Strip markdown code fences if present
    content = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    
    let predictions;
    try {
      const parsed = JSON.parse(content);
      predictions = parsed.predictions || [];
    } catch {
      console.error('Failed to parse AI response:', content);
      predictions = [];
    }

    return new Response(
      JSON.stringify({ success: true, predictions }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in score-leads-ai:', msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
