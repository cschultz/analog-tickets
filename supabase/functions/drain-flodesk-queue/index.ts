import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const COSMICO_SEGMENT_ID = '6930a0da231c07add766b8a0';
const BATCH_SIZE = 100;
const FLODESK_DELAY_MS = 700; // ~85/min, safely under Flodesk rate limit

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const apiKey = Deno.env.get('FLODESK_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ success: false, error: 'FLODESK_API_KEY missing' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const auth = 'Basic ' + btoa(apiKey + ':');

  // Pull a batch of pending rows
  const { data: rows, error } = await supabase
    .from('flodesk_sync_queue')
    .select('id, email, first_name, last_name, segment_tag, source_table, attempts')
    .eq('status', 'pending')
    .lt('attempts', 5)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  if (!rows || rows.length === 0) {
    return new Response(JSON.stringify({ success: true, processed: 0 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // Mark as processing
  const ids = rows.map(r => r.id);
  await supabase.from('flodesk_sync_queue').update({ status: 'processing' }).in('id', ids);

  // Suppression check
  const emails = rows.map(r => r.email.toLowerCase());
  const { data: suppressed } = await supabase
    .from('email_unsubscribes')
    .select('email')
    .in('email', emails);
  const suppressedSet = new Set((suppressed ?? []).map((s: any) => s.email.toLowerCase()));

  let success = 0, skipped = 0, failed = 0;

  for (const row of rows) {
    if (suppressedSet.has(row.email.toLowerCase())) {
      await supabase.from('flodesk_sync_queue').update({
        status: 'skipped', processed_at: new Date().toISOString(), last_error: 'suppressed',
      }).eq('id', row.id);
      skipped++;
      continue;
    }

    const body: Record<string, unknown> = {
      email: row.email,
      segment_ids: [COSMICO_SEGMENT_ID],
    };
    if (row.first_name) body.first_name = row.first_name;
    if (row.last_name) body.last_name = row.last_name;
    if (row.segment_tag) {
      body.custom_fields = { source: row.segment_tag, source_table: row.source_table };
    }

    try {
      const res = await fetch('https://api.flodesk.com/v1/subscribers', {
        method: 'POST',
        headers: { 'Authorization': auth, 'Content-Type': 'application/json', 'User-Agent': 'Cosmico Sync' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        await supabase.from('flodesk_sync_queue').update({
          status: 'completed', processed_at: new Date().toISOString(),
        }).eq('id', row.id);
        success++;
      } else {
        const txt = await res.text();
        const newAttempts = (row.attempts ?? 0) + 1;
        await supabase.from('flodesk_sync_queue').update({
          status: newAttempts >= 5 ? 'failed' : 'pending',
          attempts: newAttempts,
          last_error: txt.slice(0, 500),
        }).eq('id', row.id);
        failed++;
      }
    } catch (e) {
      const newAttempts = (row.attempts ?? 0) + 1;
      await supabase.from('flodesk_sync_queue').update({
        status: newAttempts >= 5 ? 'failed' : 'pending',
        attempts: newAttempts,
        last_error: (e instanceof Error ? e.message : String(e)).slice(0, 500),
      }).eq('id', row.id);
      failed++;
    }

    await sleep(FLODESK_DELAY_MS);
  }

  // Check if queue is fully drained → notify admin once
  const { count: remaining } = await supabase
    .from('flodesk_sync_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  if ((remaining ?? 0) === 0) {
    const { data: existing } = await supabase
      .from('admin_notifications')
      .select('id')
      .eq('type', 'flodesk_backfill_complete')
      .gte('created_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
      .limit(1)
      .maybeSingle();

    if (!existing) {
      const { count: completedCount } = await supabase
        .from('flodesk_sync_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed');
      const { count: failedCount } = await supabase
        .from('flodesk_sync_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed');

      await supabase.from('admin_notifications').insert({
        type: 'flodesk_backfill_complete',
        title: 'Flodesk Sync Complete ✅',
        message: `All emails synced to Flodesk. ${completedCount ?? 0} succeeded, ${failedCount ?? 0} failed.`,
        metadata: { completed: completedCount, failed: failedCount },
      });
    }
  }

  return new Response(JSON.stringify({
    success: true, processed: rows.length, success_count: success, skipped, failed, remaining_pending: remaining,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
