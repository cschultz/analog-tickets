import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const log = (step: string, details?: any) => {
  console.log(`[UNDO-TRANSFER] ${step}${details ? ' - ' + JSON.stringify(details) : ''}`);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { token } = await req.json();
    if (!token || typeof token !== 'string' || token.length < 16) {
      throw new Error('Invalid undo token');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Look up the transfer by undo token (must be unexpired and not already undone)
    const { data: transfer, error: lookupErr } = await supabase
      .from('ticket_transfers')
      .select('*')
      .eq('undo_token', token)
      .is('undone_at', null)
      .gt('undo_expires_at', new Date().toISOString())
      .maybeSingle();

    if (lookupErr || !transfer) {
      log('Transfer not found / expired', { lookupErr });
      throw new Error('This undo link has expired or already been used. Contact hello@example.invalid for help.');
    }

    // Verify the ticket hasn't been checked in or transferred again since
    const { data: ticket, error: ticketErr } = await supabase
      .from('tickets')
      .select('id, holder_email, checked_in_at, status')
      .eq('id', transfer.ticket_id)
      .single();

    if (ticketErr || !ticket) throw new Error('Ticket not found');
    if (ticket.checked_in_at) throw new Error('Cannot undo: ticket has already been checked in.');
    if (ticket.status !== 'active') throw new Error('Cannot undo: ticket is no longer active.');

    // Confirm the current holder is still the recipient of THIS transfer
    if ((ticket.holder_email || '').toLowerCase() !== (transfer.new_holder_email || '').toLowerCase()) {
      throw new Error('Cannot undo: ticket has changed hands again. Contact hello@example.invalid.');
    }

    if (!transfer.old_holder_email) {
      throw new Error('Cannot undo: original holder email is missing. Contact support.');
    }

    // Reverse the transfer
    const { error: revertErr } = await supabase
      .from('tickets')
      .update({
        holder_name: transfer.old_holder_name,
        holder_email: transfer.old_holder_email,
        owner_email: transfer.old_holder_email,
        transfer_count: Math.max(0, (await supabase.from('tickets').select('transfer_count').eq('id', transfer.ticket_id).single()).data?.transfer_count - 1),
        updated_at: new Date().toISOString(),
      })
      .eq('id', transfer.ticket_id);

    if (revertErr) throw new Error(`Failed to revert: ${revertErr.message}`);

    await supabase
      .from('ticket_transfers')
      .update({ undone_at: new Date().toISOString(), undo_token: null })
      .eq('id', transfer.id);

    log('Transfer undone', { transferId: transfer.id });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Transfer reversed. Ticket returned to ${transfer.old_holder_name || transfer.old_holder_email}.`,
        oldHolderName: transfer.old_holder_name,
        oldHolderEmail: transfer.old_holder_email,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
