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
    const apiKey = Deno.env.get('SIMPLYTEXT_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'SIMPLYTEXT_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse optional list name from request body
    let listName = 'Cosmico Full List';
    try {
      const body = await req.json();
      if (body.listName) listName = body.listName;
    } catch {}

    // Fetch contacts from SimpleTexting
    const params = new URLSearchParams({
      token: apiKey,
      group: listName,
    });

    const res = await fetch(`https://app2.simpletexting.com/v1/group/contact/list?${params}`, {
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('SimpleTexting API error:', errText);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch SimpleTexting contacts', details: errText }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await res.json();
    const contacts = data.contacts || [];
    console.log(`Fetched ${contacts.length} SimpleTexting contacts from "${listName}"`);

    // Get all paid registration emails and phones
    const { data: paidRegs } = await supabase
      .from('registrations')
      .select('email, phone')
      .eq('payment_status', 'paid');

    const paidEmails = new Set((paidRegs || []).map(r => r.email?.toLowerCase()).filter(Boolean));
    const paidPhones = new Set((paidRegs || []).map(r => r.phone?.replace(/\D/g, '')).filter(Boolean));

    const nonBuyers: any[] = [];
    const upsertRows: any[] = [];

    // Count engagement statuses
    const statusCounts: Record<string, number> = {};

    for (const contact of contacts) {
      const phone = (contact.number || '').replace(/\D/g, '');
      const email = (contact.email || '').toLowerCase().trim();
      if (!phone && !email) continue;

      const hasPurchased = (email && paidEmails.has(email)) || (phone && paidPhones.has(phone));

      // Use email or phone as the unique key
      const leadEmail = email || `sms-${phone}@simpletexting.lead`;

      // Map SimpleTexting status to engagement_status
      const rawStatus = (contact.status || '').toLowerCase();
      let engagementStatus = 'unknown';
      if (rawStatus === 'active' || rawStatus === 'subscribed') engagementStatus = 'active';
      else if (rawStatus === 'unsubscribed' || rawStatus === 'opted_out') engagementStatus = 'unsubscribed';
      else if (rawStatus === 'blocked') engagementStatus = 'blocked';
      else if (rawStatus === 'inactive') engagementStatus = 'inactive';

      statusCounts[engagementStatus] = (statusCounts[engagementStatus] || 0) + 1;

      // Extract group/segment info - the contact is from this list, but may be in others
      const segments: string[] = [listName];

      upsertRows.push({
        email: leadEmail,
        first_name: contact.firstName || null,
        last_name: contact.lastName || null,
        source: 'simpletexting',
        flodesk_subscriber_id: contact.contactId || null,
        has_purchased: hasPurchased,
        lead_status: hasPurchased ? 'converted' : 'new',
        synced_at: new Date().toISOString(),
        engagement_status: engagementStatus,
        segments,
      });

      if (!hasPurchased) {
        nonBuyers.push({
          email: leadEmail,
          phone,
          first_name: contact.firstName,
          last_name: contact.lastName,
          status: rawStatus,
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

    console.log(`Synced ${upsertRows.length} SMS contacts, ${nonBuyers.length} non-buyers found`);
    console.log('SMS engagement breakdown:', statusCounts);

    return new Response(
      JSON.stringify({
        success: true,
        total_contacts: contacts.length,
        non_buyers: nonBuyers.length,
        already_purchased: contacts.length - nonBuyers.length,
        engagement_breakdown: statusCounts,
        list_name: listName,
        synced_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in cross-reference-simpletexting:', msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
