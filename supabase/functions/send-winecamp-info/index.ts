import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, winerySlug } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Sending Wine Camp info email to:", email, "from winery:", winerySlug);

    // 1. Send the info email via Resend
    const emailHtml = `
<div style="font-family: Georgia, 'Times New Roman', serif; max-width: 600px; margin: 0 auto; padding: 30px 20px; color: #2c2c2c; line-height: 1.7; font-size: 15px;">

<p style="margin-bottom: 20px;">Hey—</p>

<p style="margin-bottom: 20px;">If you're here, chances are you already care about who's pouring the wine.</p>

<p style="margin-bottom: 6px;">At Cosmico, it's not a tasting room lineup.</p>
<p style="margin-bottom: 20px;">It's the people behind the bottles—out there with you all weekend.</p>

<p style="margin-bottom: 14px;">Here are some of the wineries pouring at Wine Camp:</p>

<ul style="list-style: none; padding: 0; margin: 0 0 20px 0;">
  <li style="margin-bottom: 4px;">Ryme Cellars</li>
  <li style="margin-bottom: 4px;">BloodRoot Wines</li>
  <li style="margin-bottom: 4px;">Extradimensional Wine Co.</li>
  <li style="margin-bottom: 4px;">Lioco Wine</li>
  <li style="margin-bottom: 4px;">Rootdown Wine Cellars</li>
  <li style="margin-bottom: 4px;">Keep Wines</li>
  <li style="margin-bottom: 4px;">Trail Marker Wine Co.</li>
  <li style="margin-bottom: 4px;">Arnot-Roberts</li>
  <li style="margin-bottom: 4px;">Marietta Cellars</li>
  <li style="margin-bottom: 4px;">Acta Wine</li>
  <li style="margin-bottom: 4px;">Belong Wine Co.</li>
</ul>

<p style="margin-bottom: 20px;">These aren't corporate labels or mass-produced wines.</p>

<p style="margin-bottom: 20px;">They're independent Sonoma County producers—people who show up, pour their own bottles, and then stick around.</p>

<p style="margin-bottom: 6px;">You'll taste with them…</p>
<p style="margin-bottom: 20px;">then run into them later—somewhere between the sauna and the river.</p>

<p style="margin-bottom: 14px;">And the music holds its own too—</p>

<p style="margin-bottom: 20px;">The Heavy Heavy are headlining—right as their sound is taking hold across Northern California.</p>

<p style="margin-bottom: 20px;">Gilligan Moss is back too—their dance party stole the weekend last year.</p>

<p style="margin-bottom: 20px;">👉 <a href="https://example.invalid/lineup" style="color: #2c2c2c; font-weight: bold;">See the full lineup</a></p>

<p style="margin-bottom: 20px;">👉 <a href="https://example.invalid/winecamp" style="color: #2c2c2c; font-weight: bold;">Explore Wine Camp</a></p>

<p style="margin-bottom: 6px;">This isn't a typical wine weekend.</p>
<p style="margin-bottom: 20px;">And it's not a crowded festival.</p>

<p style="margin-bottom: 6px;">It's something smaller. More intentional.</p>
<p style="margin-bottom: 20px;">The kind of thing you hear about from someone you trust.</p>

<p style="margin-bottom: 14px;">If that sounds like your kind of thing—</p>

<p style="margin-bottom: 20px;">👉 <a href="https://example.invalid" style="color: #2c2c2c; font-weight: bold;">Get tickets here</a></p>

<p style="margin-bottom: 6px;">And if you come, you won't be the only one who didn't know anyone at first.</p>
<p style="margin-bottom: 20px;">You will by the end.</p>

<p style="margin-top: 30px; color: #666;">— The Cosmico Team</p>

</div>
    `;

    const emailResponse = await resend.emails.send({
      from: "The Cosmico Team <hello@example.invalid>",
      to: [email],
      subject: "The wineries pouring at Wine Camp",
      html: emailHtml,
    });

    console.log("Wine Camp info email sent:", emailResponse);

    // 2. Sync to Flodesk (fire and forget)
    const flodeskApiKey = Deno.env.get("FLODESK_API_KEY");
    if (flodeskApiKey) {
      const COSMICO_SEGMENT_ID = "6930a0da231c07add766b8a0";
      const authHeader = "Basic " + btoa(flodeskApiKey + ":");

      fetch("https://api.flodesk.com/v1/subscribers", {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
          "User-Agent": "Cosmico App (cosmico.events)",
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          segment_ids: [COSMICO_SEGMENT_ID],
        }),
      })
        .then((r) => console.log("Flodesk sync status:", r.status))
        .catch((e) => console.error("Flodesk sync error:", e));
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-winecamp-info:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
