import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// (table, email_col, name_col, segment_tag)
const SOURCES: Array<[string, string, string | null, string]> = [
  ['registrations', 'email', 'name', 'Registration'],
  ['raffle_entries', 'email', 'first_name', 'Raffle Entry'],
  ['checkout_abandonment', 'email', null, 'Abandoned Cart'],
  ['preview_signups', 'email', null, 'Preview Signup'],
  ['ticket_waitlist', 'email', null, 'Ticket Waitlist'],
  ['accommodation_waitlist', 'email', 'name', 'Accommodation Waitlist'],
  ['crew_bids', 'email', 'captain_name', 'Crew Bid'],
  ['volunteer_interests', 'email', 'name', 'Volunteer Interest'],
  ['street_team', 'email', 'name', 'Street Team'],
  ['contact_submissions', 'email', 'name', 'Contact Form'],
  ['session_rsvps', 'email', 'name', 'Session RSVP'],
  ['survey_responses', 'email', null, 'Survey Response'],
  ['community_requests', 'email', 'organizer_name', 'Community Request'],
  ['lodging_bookings', 'email', null, 'Lodging Booking'],
  ['addon_purchases', 'purchaser_email', null, 'Addon Purchase'],
  ['tickets', 'holder_email', 'holder_name', 'Ticket Holder'],
  ['custom_offers', 'recipient_email', null, 'Custom Offer'],
  ['chat_logs', 'user_email', null, 'Support Chat'],
  ['winecamp_attendees', 'email', null, 'Wine Camp Attendee'],
  ['support_messages', 'email', 'name', 'Support Message'],
  ['newsletter_leads', 'email', 'first_name', 'Newsletter Lead'],
  ['ticket_transfers', 'new_holder_email', 'new_holder_name', 'Ticket Transfer Recipient'],
  ['ticket_transfers', 'old_holder_email', 'old_holder_name', 'Ticket Transfer Sender'],
  ['pending_ticket_transfers', 'new_holder_email', 'new_holder_name', 'Pending Transfer Recipient'],
  ['pending_ticket_transfers', 'initiated_by_email', null, 'Pending Transfer Initiator'],
];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // Require admin auth
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const { data: isAdmin } = await userClient.rpc('has_role', { _user_id: user.id, _role: 'admin' });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'Admin only' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const summary: Record<string, number> = {};
  let totalEnqueued = 0;

  for (const [table, emailCol, nameCol, segment] of SOURCES) {
    try {
      const cols = ['id', emailCol, nameCol].filter(Boolean).join(',');
      let from = 0;
      const PAGE = 1000;
      let tableCount = 0;

      while (true) {
        const { data: rows, error } = await supabase
          .from(table)
          .select(cols)
          .not(emailCol, 'is', null)
          .range(from, from + PAGE - 1);

        if (error) {
          console.error(`Backfill ${table} error:`, error.message);
          break;
        }
        if (!rows || rows.length === 0) break;

        const insertRows = rows
          .map((r: any) => {
            const email = (r[emailCol] || '').toString().trim().toLowerCase();
            if (!email || !email.includes('@')) return null;
            const fullName: string = (nameCol ? (r[nameCol] || '') : '').toString();
            const [first, ...rest] = fullName.split(' ');
            return {
              email,
              first_name: first || null,
              last_name: rest.length ? rest.join(' ') : null,
              source_table: table,
              source_id: r.id ? String(r.id) : null,
              segment_tag: segment,
              status: 'pending',
            };
          })
          .filter(Boolean);

        if (insertRows.length > 0) {
          const { error: insErr } = await supabase.from('flodesk_sync_queue').insert(insertRows as any[]);
          if (insErr) console.error(`Insert ${table} error:`, insErr.message);
          else tableCount += insertRows.length;
        }

        if (rows.length < PAGE) break;
        from += PAGE;
      }

      summary[table] = tableCount;
      totalEnqueued += tableCount;
    } catch (e) {
      console.error(`Backfill ${table} threw:`, e);
      summary[table] = -1;
    }
  }

  return new Response(JSON.stringify({ success: true, total_enqueued: totalEnqueued, by_table: summary }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
