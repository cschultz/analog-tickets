import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getEventId } from "../_shared/operator-config.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TARGET_LIST = 'Cosmico 2026 - Ticket Holders';
const SOURCE_LIST = 'Cosmico Full List';
const AR2026_EVENT_ID = getEventId("PRIMARY_EVENT_ID");

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get('SIMPLYTEXT_API_KEY')!;
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    let mode = 'sync'; // 'sync' | 'dryrun' | 'purge_only'
    try { const b = await req.json(); if (b.mode) mode = b.mode; } catch {}

    // ---------- 1. Get AR2026 paid buyer emails + phones from DB ----------
    const { data: regs } = await supabase
      .from('registrations')
      .select('email, name, phone, created_at')
      .eq('event_id', AR2026_EVENT_ID)
      .in('payment_status', ['paid', 'payment_plan', 'partially_refunded']);

    const ar2026Emails = new Set<string>();
    const ar2026PhonesLast10 = new Set<string>();
    const buyerByEmail = new Map<string, { email: string; name: string; phone: string }>();

    for (const r of regs || []) {
      const e = (r.email || '').toLowerCase().trim();
      const phone = (r.phone || '').replace(/\D/g, '');
      if (e) ar2026Emails.add(e);
      if (phone.length >= 10) {
        ar2026PhonesLast10.add(phone.slice(-10));
        if (e && !buyerByEmail.has(e)) {
          buyerByEmail.set(e, { email: e, name: r.name || '', phone });
        }
      }
    }

    // ---------- 2. Pull entire Full List from SimpleTexting, find phones for AR2026 emails ----------
    let stOffset = 0;
    let stScanned = 0;
    while (true) {
      const p = new URLSearchParams({ token: apiKey, group: SOURCE_LIST, limit: '999', offset: String(stOffset) });
      const r = await fetch(`https://app2.simpletexting.com/v1/group/contact/list?${p}`, { headers: { 'Accept': 'application/json' } });
      if (!r.ok) break;
      const txt = await r.text();
      let d: any = {};
      try { d = JSON.parse(txt); } catch { break; }
      const contacts = d.contacts || [];
      stScanned += contacts.length;
      for (const c of contacts) {
        const email = (c.email || '').toLowerCase().trim();
        const phone = (c.number || '').replace(/\D/g, '');
        const status = (c.status || '').toLowerCase();
        if (status === 'unsubscribed' || status === 'opted_out' || status === 'blocked') continue;
        if (!phone || phone.length < 10) continue;
        if (email && ar2026Emails.has(email) && !buyerByEmail.has(email)) {
          buyerByEmail.set(email, { email, name: c.firstName || '', phone });
        }
      }
      if (contacts.length < 999) break;
      stOffset += 999;
      await new Promise(rs => setTimeout(rs, 150));
    }

    // ---------- 3. Get current segment members; mark which to remove ----------
    const currentMembers: Array<{ phone: string; email: string }> = [];
    let segOffset = 0;
    while (true) {
      const p = new URLSearchParams({ token: apiKey, group: TARGET_LIST, limit: '999', offset: String(segOffset) });
      const r = await fetch(`https://app2.simpletexting.com/v1/group/contact/list?${p}`, { headers: { 'Accept': 'application/json' } });
      if (!r.ok) break;
      const txt = await r.text();
      let d: any = {};
      try { d = JSON.parse(txt); } catch { break; }
      const cs = d.contacts || [];
      for (const c of cs) {
        currentMembers.push({ phone: (c.number || '').replace(/\D/g, ''), email: (c.email || '').toLowerCase().trim() });
      }
      if (cs.length < 999) break;
      segOffset += 999;
      await new Promise(rs => setTimeout(rs, 150));
    }

    const validPhones = new Set<string>();
    for (const b of buyerByEmail.values()) validPhones.add(b.phone.slice(-10));

    const toRemove = currentMembers.filter(m => {
      const last10 = m.phone.slice(-10);
      const emailMatch = m.email && ar2026Emails.has(m.email);
      const phoneMatch = (last10 && (validPhones.has(last10) || ar2026PhonesLast10.has(last10)));
      return !emailMatch && !phoneMatch;
    });

    if (mode === 'dryrun') {
      return new Response(JSON.stringify({
        ar2026_unique_emails: ar2026Emails.size,
        ar2026_buyers_with_phone_in_db: ar2026PhonesLast10.size,
        full_list_scanned: stScanned,
        total_resolvable_buyers: buyerByEmail.size,
        current_segment_size: currentMembers.length,
        would_remove_from_segment: toRemove.length,
        would_add_to_segment: buyerByEmail.size,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ---------- 4. Remove non-AR2026 contacts (batched) ----------
    let removed = 0, removeFailed = 0;
    let purgeStart = 0, purgeMax = 1000;
    try { const b2 = await req.clone().json(); if (typeof b2.purgeStart === 'number') purgeStart = b2.purgeStart; if (typeof b2.purgeMax === 'number') purgeMax = b2.purgeMax; } catch {}
    const purgeSlice = toRemove.slice(purgeStart, purgeStart + purgeMax);
    for (const m of purgeSlice) {
      if (!m.phone) continue;
      try {
        const p = new URLSearchParams({ token: apiKey, group: TARGET_LIST, phone: m.phone });
        const r = await fetch(`https://app2.simpletexting.com/v1/group/contact/remove?${p}`, {
          method: 'POST', headers: { 'Accept': 'application/json' },
        });
        const d = await r.json();
        if (d.code === 1 || (d.message || '').toLowerCase().includes('not')) removed++;
        else removeFailed++;
      } catch { removeFailed++; }
      await new Promise(rs => setTimeout(rs, 110));
    }
    const purgeNext = purgeStart + purgeMax < toRemove.length ? purgeStart + purgeMax : null;

    if (mode === 'purge_only') {
      return new Response(JSON.stringify({ removed, removeFailed, purgeNext, totalToRemove: toRemove.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ---------- 5. Add AR2026 buyers ----------
    let added = 0, alreadyIn = 0, failed = 0;
    const failures: any[] = [];
    for (const b of buyerByEmail.values()) {
      const phone = b.phone.length === 10 ? '1' + b.phone : b.phone;
      const firstName = (b.name || '').split(' ')[0] || '';
      try {
        const p = new URLSearchParams({ token: apiKey, group: TARGET_LIST, phone });
        if (b.email) p.append('email', b.email);
        if (firstName) p.append('firstName', firstName);
        const resp = await fetch(`https://app2.simpletexting.com/v1/group/contact/add?${p}`, {
          method: 'POST', headers: { 'Accept': 'application/json' },
        });
        const d = await resp.json();
        if (d.code === 1) added++;
        else if (d.code === 12 || (d.message || '').toLowerCase().includes('already')) alreadyIn++;
        else { failed++; failures.push({ email: b.email, err: d.message || d }); }
      } catch (e) {
        failed++; failures.push({ email: b.email, err: e instanceof Error ? e.message : 'err' });
      }
      await new Promise(rs => setTimeout(rs, 110));
    }

    return new Response(JSON.stringify({
      target_list: TARGET_LIST,
      ar2026_unique_emails: ar2026Emails.size,
      total_resolvable_buyers: buyerByEmail.size,
      removed_non_ar2026: removed,
      remove_failed: removeFailed,
      added, already_in: alreadyIn, failed,
      failures: failures.slice(0, 5),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'err' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
