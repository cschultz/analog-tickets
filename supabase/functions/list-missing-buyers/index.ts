import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get('SIMPLYTEXT_API_KEY')!;
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // All SimpleTexting contacts from Cosmico Full List
    const params = new URLSearchParams({ token: apiKey, group: 'Cosmico Full List', limit: '999', offset: '0' });
    const res = await fetch(`https://app2.simpletexting.com/v1/group/contact/list?${params}`, {
      headers: { 'Accept': 'application/json' },
    });
    const data = await res.json();
    const stEmails = new Set<string>();
    for (const c of data.contacts || []) {
      if (c.email) stEmails.add(c.email.toLowerCase().trim());
    }

    const { data: regs } = await supabase
      .from('registrations')
      .select('email, name, phone, ticket_type, payment_status, created_at')
      .in('payment_status', ['paid', 'payment_plan']);

    const seen = new Set<string>();
    const missing: any[] = [];
    for (const r of regs || []) {
      const e = (r.email || '').toLowerCase().trim();
      if (!e || seen.has(e)) continue;
      seen.add(e);
      if (!stEmails.has(e)) missing.push(r);
    }

    return new Response(JSON.stringify({
      total_paid_unique: seen.size,
      st_total_in_full_list: stEmails.size,
      missing_count: missing.length,
      missing: missing.sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||'')),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'err' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
