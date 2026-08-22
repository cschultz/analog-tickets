import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TARGET_LIST = 'Cosmico 2026 - Ticket Holders';
const SOURCE_LIST = 'Cosmico Full List';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get('SIMPLYTEXT_API_KEY');
    if (!apiKey) throw new Error('SIMPLYTEXT_API_KEY missing');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let dryRun = false;
    let offset = 0;
    let limit = 999;
    let batchStart = 0;
    let batchSize = 100;
    try {
      const b = await req.json();
      if (b.dryRun) dryRun = true;
      if (typeof b.offset === 'number') offset = b.offset;
      if (typeof b.limit === 'number') limit = b.limit;
      if (typeof b.batchStart === 'number') batchStart = b.batchStart;
      if (typeof b.batchSize === 'number') batchSize = b.batchSize;
    } catch {}

    // Step 1: Fetch source list contacts (live, with phones)
    console.log(`Fetching ${SOURCE_LIST} contacts (offset=${offset}, limit=${limit})...`);
    const params = new URLSearchParams({ token: apiKey, group: SOURCE_LIST, limit: String(limit), offset: String(offset) });
    const res = await fetch(`https://app2.simpletexting.com/v1/group/contact/list?${params}`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) throw new Error(`SimpleTexting fetch failed: ${await res.text()}`);
    const data = await res.json();
    const contacts = data.contacts || [];
    console.log(`Fetched ${contacts.length} contacts`);

    // Step 2: Build set of paid buyer emails + phones
    const { data: regs } = await supabase
      .from('registrations')
      .select('email, phone')
      .in('payment_status', ['paid', 'payment_plan', 'partially_refunded']);

    const paidEmails = new Set<string>();
    const paidPhones = new Set<string>();
    for (const r of regs || []) {
      if (r.email) paidEmails.add(r.email.toLowerCase().trim());
      if (r.phone) {
        const p = r.phone.replace(/\D/g, '');
        if (p.length >= 10) paidPhones.add(p.slice(-10));
      }
    }
    console.log(`Paid buyers: ${paidEmails.size} emails, ${paidPhones.size} phones`);

    // Step 3: Match contacts by email OR phone
    const matches: Array<{ phone: string; email: string; firstName: string }> = [];
    for (const c of contacts) {
      const phone = (c.number || '').replace(/\D/g, '');
      const email = (c.email || '').toLowerCase().trim();
      const status = (c.status || '').toLowerCase();
      if (status === 'unsubscribed' || status === 'opted_out' || status === 'blocked') continue;
      if (!phone || phone.length < 10) continue;

      const phoneLast10 = phone.slice(-10);
      const matched = (email && paidEmails.has(email)) || paidPhones.has(phoneLast10);
      if (matched) {
        matches.push({ phone, email, firstName: c.firstName || '' });
      }
    }
    console.log(`Matched ${matches.length} contacts to paid buyers`);

    if (dryRun) {
      return new Response(JSON.stringify({
        success: true, dry_run: true,
        scanned: contacts.length,
        matched: matches.length,
        sample: matches.slice(0, 5).map(m => ({ email: m.email, phone_last4: m.phone.slice(-4) })),
        next_offset: contacts.length === limit ? offset + limit : null,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Step 4: Add to AR2026 list (batched slice)
    const slice = matches.slice(batchStart, batchStart + batchSize);
    let added = 0, alreadyIn = 0, failed = 0;
    const failures: any[] = [];
    for (const m of slice) {
      try {
        const p = new URLSearchParams({ token: apiKey, group: TARGET_LIST, phone: m.phone });
        if (m.email) p.append('email', m.email);
        if (m.firstName) p.append('firstName', m.firstName);
        const r = await fetch(`https://app2.simpletexting.com/v1/group/contact/add?${p}`, { method: 'POST', headers: { 'Accept': 'application/json' } });
        const d = await r.json();
        if (d.code === 1) added++;
        else if (d.code === 12 || (d.message || '').toLowerCase().includes('already')) alreadyIn++;
        else { failed++; failures.push({ email: m.email, err: d.message || d }); }
      } catch (e) {
        failed++; failures.push({ email: m.email, err: e instanceof Error ? e.message : 'err' });
      }
      await new Promise(r => setTimeout(r, 110));
    }

    const nextBatchStart = batchStart + batchSize < matches.length ? batchStart + batchSize : null;
    return new Response(JSON.stringify({
      success: true,
      target_list: TARGET_LIST,
      scanned: contacts.length,
      total_matches: matches.length,
      processed_range: [batchStart, batchStart + slice.length],
      added, already_in_list: alreadyIn, failed,
      failures: failures.slice(0, 5),
      next_batch_start: nextBatchStart,
      next_offset: contacts.length === limit ? offset + limit : null,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown';
    console.error(msg);
    return new Response(JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
