import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify auth - require Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.57.2");
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const flodeskApiKey = Deno.env.get('FLODESK_API_KEY');
    if (!flodeskApiKey) {
      return new Response(
        JSON.stringify({ error: 'FLODESK_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const webhookUrl = `${supabaseUrl}/functions/v1/handle-flodesk-webhook`;
    const authHeaderFlodesk = 'Basic ' + btoa(flodeskApiKey + ':');

    // Events we want to listen to
    const events = [
      'subscriber.created',
      'subscriber.added_to_segment',
      'subscriber.unsubscribed',
    ];

    // First, list existing webhooks to avoid duplicates
    const listRes = await fetch('https://api.flodesk.com/v1/webhooks', {
      headers: {
        'Authorization': authHeaderFlodesk,
        'Content-Type': 'application/json',
      },
    });

    let existingWebhooks: any[] = [];
    if (listRes.ok) {
      const listData = await listRes.json();
      existingWebhooks = listData.data || listData || [];
    }

    // Check if a webhook already exists for our URL
    const existing = existingWebhooks.find(
      (w: any) => w.post_url === webhookUrl || w.url === webhookUrl
    );

    if (existing) {
      console.log('Webhook already exists:', existing);
      return new Response(
        JSON.stringify({ success: true, webhookUrl, status: 'already_exists', id: existing.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Register a single webhook with all events
    const res = await fetch('https://api.flodesk.com/v1/webhooks', {
      method: 'POST',
      headers: {
        'Authorization': authHeaderFlodesk,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Cosmico Lead Recovery',
        events,
        post_url: webhookUrl,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      console.log('Flodesk webhook registered:', data);
      return new Response(
        JSON.stringify({ success: true, webhookUrl, status: 'created', id: data.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      const errText = await res.text();
      console.error('Failed to register webhook:', errText);
      return new Response(
        JSON.stringify({ success: false, error: errText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error registering Flodesk webhooks:', msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
