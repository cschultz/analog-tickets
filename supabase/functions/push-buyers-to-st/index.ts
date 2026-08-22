import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TARGET_LIST = 'Cosmico 2026 - Ticket Holders';
const FULL_LIST = 'Cosmico Full List';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get('SIMPLYTEXT_API_KEY')!;
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    let batchStart = 0;
    let batchSize = 30;
    let dryRun = false;
    try {
      const b = await req.json();
      if (typeof b.batchStart === 'number') batchStart = b.batchStart;
      if (typeof b.batchSize === 'number') batchSize = b.batchSize;
      if (b.dryRun) dryRun = true;
    } catch {
      // ignore
    }

    // Fetch all paid buyers with phones from registrations
    const { data: regs } = await supabase
      .from('registrations')
      .select('email, name, phone, created_at')
      .in('payment_status', ['paid', 'payment_plan'])
      .not('phone', 'is', null);

    // Dedupe by email, keep most recent
    const byEmail = new Map<string, any>();
    for (const r of regs || []) {
      const e = (r.email || '').toLowerCase().trim();
      const phone = (r.phone || '').replace(/\D/g, '');
      if (!e || phone.length < 10) continue;
      const existing = byEmail.get(e);
      if (!existing || (r.created_at || '') > (existing.created_at || '')) {
        byEmail.set(e, { ...r, phone });
      }
    }
    const all = Array.from(byEmail.values());

    if (dryRun) {
      return new Response(JSON.stringify({
        total_buyers_with_phones: all.length,
        sample: all.slice(0, 3).map(r => ({ email: r.email, phone: r.phone.slice(-4) })),
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const slice = all.slice(batchStart, batchStart + batchSize);
    let added = 0, alreadyIn = 0, failed = 0, addedToFull = 0;
    const failures: any[] = [];

    for (const r of slice) {
      const phone = r.phone.length === 10 ? '1' + r.phone : r.phone;
      const firstName = (r.name || '').split(' ')[0] || '';

      // Add to BOTH lists in parallel-ish
      for (const listName of [FULL_LIST, TARGET_LIST]) {
        try {
          const p = new URLSearchParams({ token: apiKey, group: listName, phone });
          if (r.email) p.append('email', r.email);
          if (firstName) p.append('firstName', firstName);
          const resp = await fetch(`https://app2.simpletexting.com/v1/group/contact/add?${p}`, {
            method: 'POST', headers: { 'Accept': 'application/json' },
          });
          const d = await resp.json();
          if (d.code === 1) {
            if (listName === TARGET_LIST) added++;
            else addedToFull++;
          } else if (d.code === 12 || (d.message || '').toLowerCase().includes('already')) {
            if (listName === TARGET_LIST) alreadyIn++;
          } else {
            if (listName === TARGET_LIST) { failed++; failures.push({ email: r.email, err: d.message || d }); }
          }
          await new Promise(rs => setTimeout(rs, 110));
        } catch (e) {
          if (listName === TARGET_LIST) { failed++; failures.push({ email: r.email, err: e instanceof Error ? e.message : 'err' }); }
        }
      }
    }

    return new Response(JSON.stringify({
      total: all.length,
      processed_range: [batchStart, batchStart + slice.length],
      added_to_ar2026: added,
      added_to_full_list: addedToFull,
      already_in_ar2026: alreadyIn,
      failed,
      failures: failures.slice(0, 5),
      next_batch_start: batchStart + batchSize < all.length ? batchStart + batchSize : null,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'err' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
