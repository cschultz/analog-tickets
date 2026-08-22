// Sends a focused recovery email to customers whose add-on was paid for but
// missed in the original confirmation email. Apology copy + per-unit QR codes
// + Apple Wallet links for eligible add-ons.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_PUBLIC_URL = Deno.env.get("SUPABASE_URL") ?? "";
const LOGO_URL = "https://hglwwpcwlndozzahyuyx.supabase.co/storage/v1/object/public/marketing-assets/email/analog-wordmark.png";
const WALLET_ELIGIBLE = new Set(["friday_dinner", "wine_camp", "kids_camp"]);

const walletAddonUrl = (id: string, i: number) =>
  `${SUPABASE_PUBLIC_URL}/functions/v1/generate-apple-wallet-pass?addon_purchase_id=${encodeURIComponent(id)}&index=${i}`;

const qrFor = (data: string) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=10&data=${encodeURIComponent(data)}`;

function instructionFor(addonType: string | null) {
  switch (addonType) {
    case "friday_dinner": return { gets: "Admits one to the Friday picnic dinner", when: "Friday, May 15 · evening seating" };
    case "wine_camp":     return { gets: "Admits one to the Wine Camp tasting",    when: "Saturday, May 16 · afternoon" };
    case "kids_camp":     return { gets: "Admits one child to Kids Camp programming", when: "Saturday, May 16 · daytime" };
    default:              return { gets: "Show this QR at the add-on station", when: "Valid during the festival weekend" };
  }
}

function buildHtml(firstName: string, addons: any[]) {
  const rows = addons.flatMap((a) => {
    const eligible = a.addon_type ? WALLET_ELIGIBLE.has(a.addon_type) : false;
    const instr = instructionFor(a.addon_type);
    return Array.from({ length: a.quantity }, (_, i) => ({
      label: a.display_name + (a.quantity > 1 ? ` · ${i + 1} of ${a.quantity}` : ""),
      qrPayload: `addon:${a.id}:${i + 1}`,
      walletUrl: eligible ? walletAddonUrl(a.id, i + 1) : null,
      gets: instr.gets,
      when: instr.when,
      desc: a.description || "",
    }));
  });

  const itemBlocks = rows.map((row) => `
    <div style="padding: 22px 0; border-top: 1px solid #d9d2c2;">
      <p style="margin: 0; color: #1a1a1a; font-size: 16px; font-family: Georgia, serif;">${row.label}</p>
      ${row.desc ? `<p style="margin: 4px 0 6px 0; color: #6b6256; font-size: 12px;">${row.desc}</p>` : ""}
      <p style="margin: 6px 0 12px 0; color: #4a4338; font-size: 12px; font-family: Georgia, serif; font-style: italic;">Valid ${row.when}</p>
      <div style="background:#1a1a1a;color:#f5f0e4;padding:10px 14px;margin:0 0 12px 0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
        Scan at the add-on station
      </div>
      <p style="margin: 0 0 12px 0; color: #4a4338; font-size: 13px; line-height: 1.55;">
        ${row.gets} on <strong>${row.when}</strong>.
      </p>
      <img src="${qrFor(row.qrPayload)}" alt="QR for ${row.label}" width="160" height="160" style="display:block;width:160px;height:160px;background:#ffffff;padding:8px;border:1px solid #d9d2c2;" />
      ${row.walletUrl ? `<p style="margin: 14px 0 0 0;"><a href="${row.walletUrl}" style="display:inline-block;background:#1a1a1a;color:#f5f0e4;text-decoration:none;padding:11px 18px;font-size:13px;letter-spacing:0.04em;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">Add to Apple Wallet</a></p>` : ""}
    </div>
  `).join("");

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Your add-on QR codes</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background-color:#f5f0e4;color:#1a1a1a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f5f0e4;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#fbf7ec;padding:36px 32px;">
        <tr><td align="center" style="padding-bottom:24px;">
          <img src="${LOGO_URL}" alt="Cosmico" width="160" style="display:block;width:160px;height:auto;" />
        </td></tr>
        <tr><td>
          <p style="margin:0 0 14px 0;color:#1a1a1a;font-size:20px;font-family:Georgia,'Times New Roman',serif;">Hi ${firstName},</p>
          <p style="margin:0 0 14px 0;color:#4a4338;font-size:15px;line-height:1.65;">
            A quick note — your add-on purchase didn't make it into your original confirmation email by mistake. The charge went through and your spot is reserved; we're getting your QR code to you now so everything's in order before the weekend.
          </p>
          <p style="margin:0 0 24px 0;color:#4a4338;font-size:15px;line-height:1.65;">
            Apologies for the late delivery — please save this email and bring it to the festival.
          </p>
        </td></tr>
        <tr><td>
          <p style="margin:0 0 4px 0;color:#6b6256;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;">Your Add-on${rows.length > 1 ? "s" : ""}</p>
          <p style="margin:0 0 4px 0;color:#6b6256;font-size:13px;font-family:Georgia,serif;font-style:italic;">Show each QR at the station — one scan per item.</p>
          ${itemBlocks}
        </td></tr>
        <tr><td style="padding-top:32px;border-top:1px solid #d9d2c2;">
          <p style="margin:0;color:#6b6256;font-size:12px;line-height:1.6;">
            Questions? Reply to this email and we'll sort it out.<br/>
            — The Cosmico team
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

  const { registrationIds } = await req.json().catch(() => ({ registrationIds: [] as string[] }));
  if (!Array.isArray(registrationIds) || registrationIds.length === 0) {
    return new Response(JSON.stringify({ error: "registrationIds required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: any[] = [];

  for (const regId of registrationIds) {
    try {
      const { data: reg } = await supabase
        .from("registrations")
        .select("id, name, email, order_number")
        .eq("id", regId)
        .single();
      if (!reg) {
        results.push({ regId, ok: false, error: "registration not found" });
        continue;
      }

      const { data: addonRows } = await supabase
        .from("addon_purchases")
        .select("id, quantity, addon_inventory:inventory_id(display_name, description, addon_type)")
        .eq("registration_id", regId)
        .eq("payment_status", "paid")
        .eq("purchase_type", "addon");

      const addons = (addonRows || [])
        .filter((a: any) => a.addon_inventory)
        .map((a: any) => ({
          id: a.id,
          quantity: a.quantity,
          display_name: a.addon_inventory.display_name,
          description: a.addon_inventory.description,
          addon_type: a.addon_inventory.addon_type,
        }));

      if (addons.length === 0) {
        results.push({ regId, ok: false, error: "no addons found" });
        continue;
      }

      const firstName = (reg.name || "there").split(" ")[0];
      const html = buildHtml(firstName, addons);

      const { error } = await resend.emails.send({
        from: "Cosmico <hello@example.invalid>",
        to: [reg.email],
        subject: `Your add-on QR code for Cosmico (${reg.order_number})`,
        html,
      });

      if (error) {
        results.push({ regId, ok: false, error: error.message });
      } else {
        results.push({ regId, ok: true, email: reg.email, addons: addons.length });
      }

      // Resend rate limit hygiene: 2 emails / 1.1s
      await new Promise((r) => setTimeout(r, 600));
    } catch (err: any) {
      results.push({ regId, ok: false, error: err.message });
    }
  }

  return new Response(JSON.stringify({ count: results.length, results }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
