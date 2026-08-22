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
    const flodeskApiKey = Deno.env.get('FLODESK_API_KEY');
    if (!flodeskApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'FLODESK_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = 'Basic ' + btoa(flodeskApiKey + ':');

    // Fetch all Flodesk subscribers (paginated)
    let allSubscribers: any[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const res = await fetch(`https://api.flodesk.com/v1/subscribers?page=${page}&per_page=100`, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('Flodesk API error:', errText);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch Flodesk subscribers', details: errText }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await res.json();
      const subscribers = data.data || data;
      
      if (Array.isArray(subscribers) && subscribers.length > 0) {
        allSubscribers = allSubscribers.concat(subscribers);
        page++;
        if (subscribers.length < 100) hasMore = false;
      } else {
        hasMore = false;
      }

      // Safety: max 50 pages (5000 subscribers)
      if (page > 50) hasMore = false;
    }

    console.log(`Fetched ${allSubscribers.length} Flodesk subscribers`);

    // Get all paid registration emails
    const { data: paidRegs } = await supabase
      .from('registrations')
      .select('email')
      .eq('payment_status', 'paid');

    const paidEmails = new Set((paidRegs || []).map(r => r.email?.toLowerCase()));

    // Cross-reference: find subscribers who haven't purchased
    const nonBuyers: any[] = [];
    const upsertRows: any[] = [];

    for (const sub of allSubscribers) {
      const email = (sub.email || '').toLowerCase().trim();
      if (!email) continue;

      const hasPurchased = paidEmails.has(email);

      // Extract segment names for display
      const segmentNames: string[] = [];
      if (Array.isArray(sub.segments)) {
        for (const seg of sub.segments) {
          if (seg.name) segmentNames.push(seg.name);
        }
      }

      // Map Flodesk status to engagement_status
      let engagementStatus = 'unknown';
      if (sub.status === 'active') engagementStatus = 'active';
      else if (sub.status === 'unsubscribed') engagementStatus = 'unsubscribed';
      else if (sub.status === 'bounced') engagementStatus = 'bounced';
      else if (sub.status === 'complained') engagementStatus = 'complained';
      else if (sub.status === 'unconfirmed') engagementStatus = 'unconfirmed';
      else if (sub.status === 'cleaned') engagementStatus = 'cleaned';

      upsertRows.push({
        email,
        first_name: sub.first_name || null,
        last_name: sub.last_name || null,
        source: 'flodesk',
        flodesk_subscriber_id: sub.id || null,
        has_purchased: hasPurchased,
        lead_status: hasPurchased ? 'converted' : 'new',
        synced_at: new Date().toISOString(),
        engagement_status: engagementStatus,
        segments: segmentNames,
      });

      if (!hasPurchased) {
        nonBuyers.push({
          email,
          first_name: sub.first_name,
          last_name: sub.last_name,
          flodesk_id: sub.id,
          status: sub.status,
          segments: segmentNames,
        });
      }
    }

    // Upsert into newsletter_leads
    if (upsertRows.length > 0) {
      for (let i = 0; i < upsertRows.length; i += 200) {
        const chunk = upsertRows.slice(i, i + 200);
        const { error } = await supabase
          .from('newsletter_leads')
          .upsert(chunk, { onConflict: 'email,source' });
        if (error) console.error('Upsert error:', error);
      }
    }

    // Count engagement statuses
    const statusCounts: Record<string, number> = {};
    for (const row of upsertRows) {
      statusCounts[row.engagement_status] = (statusCounts[row.engagement_status] || 0) + 1;
    }

    console.log(`Synced ${upsertRows.length} subscribers, ${nonBuyers.length} non-buyers found`);
    console.log('Engagement breakdown:', statusCounts);

    return new Response(
      JSON.stringify({
        success: true,
        total_subscribers: allSubscribers.length,
        non_buyers: nonBuyers.length,
        already_purchased: allSubscribers.length - nonBuyers.length,
        engagement_breakdown: statusCounts,
        synced_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in cross-reference-flodesk:', msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
