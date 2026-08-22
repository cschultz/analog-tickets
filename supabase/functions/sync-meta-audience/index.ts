import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hashData } from "../_shared/meta-capi-utils.ts";
import { getEventId } from "../_shared/operator-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const META_GRAPH_URL = "https://graph.facebook.com/v18.0";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // --- Auth: allow cron (anon key) or admin JWT ---
    const authHeader = req.headers.get("Authorization");
    const bearerToken = authHeader?.replace("Bearer ", "");
    const isCronCall = bearerToken === supabaseAnonKey;

    if (!isCronCall) {
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: roleData } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (!roleData) {
        return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      console.log("[Meta Audience] Cron-triggered sync");
    }

    // --- Get Meta credentials ---
    const metaAccessToken = Deno.env.get("META_ACCESS_TOKEN");
    const adAccountId = Deno.env.get("META_AD_ACCOUNT_ID");

    if (!metaAccessToken || !adAccountId) {
      return new Response(
        JSON.stringify({ error: "META_ACCESS_TOKEN or META_AD_ACCOUNT_ID not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fullAdAccountId = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;

    // --- Fetch all paid registrations ---
    // Only sync purchasers for Cosmico 2026
    const ANALOG_REUNION_2026_EVENT_ID = getEventId("PRIMARY_EVENT_ID");

    const { data: registrations, error: regError } = await adminClient
      .from("registrations")
      .select("email, name")
      .eq("payment_status", "paid")
      .eq("event_id", ANALOG_REUNION_2026_EVENT_ID);

    if (regError) {
      console.error("Error fetching registrations:", regError);
      throw new Error("Failed to fetch registrations");
    }

    if (!registrations || registrations.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No paid registrations to sync", count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Deduplicate by email
    const uniqueByEmail = new Map<string, typeof registrations[0]>();
    for (const reg of registrations) {
      if (reg.email) {
        const key = reg.email.toLowerCase().trim();
        if (!uniqueByEmail.has(key)) {
          uniqueByEmail.set(key, reg);
        }
      }
    }

    console.log(`[Meta Audience] ${uniqueByEmail.size} unique purchasers from ${registrations.length} registrations`);

    // --- Hash user data ---
    const hashedUsers: Record<string, string>[] = [];
    for (const [email, reg] of uniqueByEmail) {
      const userData: Record<string, string> = {};
      userData.EMAIL = await hashData(email);

      if (reg.name) {
        const parts = reg.name.trim().split(/\s+/);
        if (parts.length >= 1) {
          userData.FN = await hashData(parts[0]);
        }
        if (parts.length >= 2) {
          userData.LN = await hashData(parts.slice(1).join(" "));
        }
      }

      hashedUsers.push(userData);
    }

    // --- Find or create Custom Audience ---
    const audienceName = "Cosmico 2026 Ticket Purchasers";
    const audienceDescription = `Auto-synced list of ticket purchasers from example.invalid. Last synced: ${new Date().toISOString()}`;

    // Search for existing audience
    let audienceId: string | null = null;

    const searchRes = await fetch(
      `${META_GRAPH_URL}/${fullAdAccountId}/customaudiences?fields=id,name&filtering=[{"field":"name","operator":"EQUAL","value":"${encodeURIComponent(audienceName)}"}]&access_token=${metaAccessToken}`
    );
    const searchData = await searchRes.json();

    if (searchData.data?.length > 0) {
      audienceId = searchData.data[0].id;
      console.log(`[Meta Audience] Found existing audience: ${audienceId}`);
    } else {
      // Create new audience
      const createRes = await fetch(
        `${META_GRAPH_URL}/${fullAdAccountId}/customaudiences`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: metaAccessToken,
            name: audienceName,
            description: audienceDescription,
            subtype: "CUSTOM",
            customer_file_source: "USER_PROVIDED_ONLY",
          }),
        }
      );
      const createData = await createRes.json();

      if (!createRes.ok || !createData.id) {
        console.error("[Meta Audience] Failed to create audience:", JSON.stringify(createData));
        throw new Error(`Failed to create Custom Audience: ${JSON.stringify(createData.error || createData)}`);
      }

      audienceId = createData.id;
      console.log(`[Meta Audience] Created new audience: ${audienceId}`);
    }

    // --- Upload users in batches (max 10,000 per request) ---
    const BATCH_SIZE = 10000;
    let totalUploaded = 0;

    // Determine which schema keys we have
    const schemaKeys = ["EMAIL", "FN", "LN"];

    for (let i = 0; i < hashedUsers.length; i += BATCH_SIZE) {
      const batch = hashedUsers.slice(i, i + BATCH_SIZE);

      // Build data rows in order of schema
      const dataRows = batch.map((u) =>
        schemaKeys.map((key) => u[key] || "")
      );

      const payload = {
        access_token: metaAccessToken,
        payload: {
          schema: schemaKeys,
          is_raw: false, // data is already hashed
          data: dataRows,
        },
      };

      // Replace users on first batch, add on subsequent
      const replaceOnFirst = i === 0;

      const uploadRes = await fetch(
        `${META_GRAPH_URL}/${audienceId}/users`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            ...(replaceOnFirst ? {} : {}),
          }),
        }
      );
      const uploadData = await uploadRes.json();

      if (!uploadRes.ok) {
        console.error(`[Meta Audience] Upload batch error:`, JSON.stringify(uploadData));
        throw new Error(`Failed to upload batch: ${JSON.stringify(uploadData.error || uploadData)}`);
      }

      totalUploaded += batch.length;
      console.log(`[Meta Audience] Uploaded batch: ${batch.length} users (total: ${totalUploaded})`);
    }

    // Update description with sync timestamp
    await fetch(`${META_GRAPH_URL}/${audienceId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: metaAccessToken,
        description: audienceDescription,
      }),
    });

    const result = {
      success: true,
      audience_id: audienceId,
      audience_name: audienceName,
      users_synced: totalUploaded,
      synced_at: new Date().toISOString(),
    };

    console.log(`[Meta Audience] Sync complete:`, JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Meta Audience] Error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
