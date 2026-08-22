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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    // Find leads marked "converted" more than 48 hours ago
    const { data: staleConverted, error: fetchErr } = await supabase
      .from('lead_tracking')
      .select('id, email')
      .eq('status', 'converted')
      .lt('updated_at', cutoff);

    if (fetchErr) {
      console.error('Error fetching converted leads:', fetchErr);
      return new Response(
        JSON.stringify({ error: fetchErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!staleConverted || staleConverted.length === 0) {
      return new Response(
        JSON.stringify({ closed: 0, message: 'No leads to close' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ids = staleConverted.map(l => l.id);

    const { error: updateErr } = await supabase
      .from('lead_tracking')
      .update({ status: 'closed' })
      .in('id', ids);

    if (updateErr) {
      console.error('Error closing leads:', updateErr);
      return new Response(
        JSON.stringify({ error: updateErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Auto-closed ${ids.length} converted leads older than 48hrs`);

    return new Response(
      JSON.stringify({ closed: ids.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in auto-close-converted-leads:', msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
