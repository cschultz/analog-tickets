import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { format } from "https://esm.sh/date-fns@3.6.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TICKET_NAMES: Record<string, string> = {
  tier_1_krewe_3day: "Krewe — 3 Day Pass",
  tier_1_vip_3day: "VIP — 3 Day Pass",
  tier_1_ga_2day: "GA — 2 Day Pass",
  tier_1_ga_friday: "GA — Friday",
  tier_1_ga_saturday: "GA — Saturday",
  early_bird_krewe_3day: "Krewe — 3 Day Pass",
  early_bird_vip_3day: "VIP — 3 Day Pass",
  early_bird_ga_2day: "GA — 2 Day Pass",
  youth_2day: "Youth — 2 Day Pass",
  youth_saturday: "Youth — Saturday",
  child_free: "Child (0–12)",
  patrons_premier: "Premier Patron",
  patrons_ultimate: "Ultimate Patron",
  artist_guest: "Artist Guest",
  dinner_party: "Friday Dinner + Party",
  party_only: "Friday Party",
  dinner_and_party: "Friday Dinner + Party",
};

// Returns valid days for a given ticket type. MUST stay in sync with
// src/config/ticketTypes.ts -> getTicketDateRange and the wallet pass themes.
function getTicketDateRange(ticketType: string): { dateRange: string; dayDescription: string } {
  if (ticketType === 'tier_1_ga_saturday' || ticketType === 'youth_saturday') {
    return { dateRange: 'Saturday, May 16, 2026', dayDescription: 'Saturday only' };
  }
  if (ticketType === 'tier_1_ga_friday') {
    return { dateRange: 'Friday, May 15, 2026', dayDescription: 'Friday only' };
  }
  if (
    ticketType === 'ga_2day' ||
    ticketType === 'tier_1_ga_2day' ||
    ticketType === 'early_bird_ga_2day' ||
    ticketType === 'youth_2day' ||
    ticketType === 'child_free'
  ) {
    return { dateRange: 'Fri, May 15 – Sat, May 16, 2026', dayDescription: 'Friday & Saturday' };
  }
  return { dateRange: 'Fri, May 15 – Sun, May 17, 2026', dayDescription: 'Friday through Sunday' };
}

type DeliveryTicket = {
  id: string;
  holder_name: string | null;
  ticket_type: string;
  holder_email?: string | null;
  assignedNote?: string | null; // e.g. "Assigned to Adam Lee" or "Assigned to you by Suzanne Lee"
};
type DeliveryLodging = {
  id: string;
  zone_key: string | null;
  zone_name: string;
  quantity: number;
  assigned_unit_name: string | null;
  assignment_status: string | null;
};

const LODGING_IMAGES: Record<string, string> = {
  grove_tents: "https://hglwwpcwlndozzahyuyx.supabase.co/storage/v1/object/public/marketing-assets/lodging/grove-tents-1q.webp",
  grove_tents_2q: "https://hglwwpcwlndozzahyuyx.supabase.co/storage/v1/object/public/marketing-assets/lodging/grove-tents-2q.webp",
  front_row_tents: "https://hglwwpcwlndozzahyuyx.supabase.co/storage/v1/object/public/marketing-assets/lodging/front-row-tents.webp",
  front_row_cabins: "https://hglwwpcwlndozzahyuyx.supabase.co/storage/v1/object/public/marketing-assets/lodging/front-row-cabins.webp",
};
type DeliveryAddon = {
  id: string;
  display_name: string;
  quantity: number;
  description: string | null;
  addon_type: string | null;
};

const SUPABASE_PUBLIC_URL = Deno.env.get("SUPABASE_URL") ?? "";

// Hosted Analog wordmark.
const LOGO_URL = "https://hglwwpcwlndozzahyuyx.supabase.co/storage/v1/object/public/marketing-assets/email/analog-wordmark.png";

const walletPassUrl = (ticketId: string) =>
  `${SUPABASE_PUBLIC_URL}/functions/v1/generate-apple-wallet-pass?ticket_id=${encodeURIComponent(ticketId)}`;

const walletAddonUrl = (addonPurchaseId: string, index: number) =>
  `${SUPABASE_PUBLIC_URL}/functions/v1/generate-apple-wallet-pass?addon_purchase_id=${encodeURIComponent(addonPurchaseId)}&index=${index}`;

// Add-on types that should get an Apple Wallet pass (sauna is unticketed)
const WALLET_ELIGIBLE_ADDONS = new Set(["friday_dinner", "wine_camp", "kids_camp"]);

// Returns a human-readable instruction for each add-on: what it gets you and when.
function getAddonInstruction(addonType: string | null): { gets: string; when: string } {
  switch (addonType) {
    case "friday_dinner":
      return { gets: "Admits one to the Friday picnic dinner", when: "Friday, May 15 · evening seating" };
    case "wine_camp":
      return { gets: "Admits one to the Wine Camp tasting", when: "Saturday, May 16 · afternoon" };
    case "kids_camp":
      return { gets: "Admits one child to Kids Camp programming", when: "Saturday, May 16 · daytime" };
    case "sauna":
      return { gets: "Reserved sauna session", when: "Scheduled on site — no scan required" };
    default:
      return { gets: "Show this QR at the add-on station", when: "Valid during the festival weekend" };
  }
}

const generateTicketEmailHtml = (
  name: string,
  firstName: string,
  ticketType: string,
  quantity: number,
  registrationId: string,
  eventDetails: any,
  tickets: DeliveryTicket[] = [],
  lodging: DeliveryLodging[] = [],
  addons: DeliveryAddon[] = [],
) => {
  const ticketName = TICKET_NAMES[ticketType] || ticketType;
  const qrFor = (data: string) =>
    `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=10&data=${encodeURIComponent(data)}`;

  const eventDate = format(new Date(eventDetails.event_date), "EEEE, MMMM d, yyyy");
  const eventTime = eventDetails.event_time
    ? format(new Date(`2000-01-01T${eventDetails.event_time}`), "h:mm a")
    : "See schedule";

  // ===== Order summary =====
  const summaryLines: string[] = [];
  const ticketCount = tickets.length || quantity;
  if (ticketCount > 0) summaryLines.push(`${ticketCount}× ${ticketName}`);
  lodging.forEach((l) => summaryLines.push(`${l.quantity > 1 ? `${l.quantity}× ` : ""}${l.zone_name}`));
  addons.forEach((a) => summaryLines.push(`${a.quantity > 1 ? `${a.quantity}× ` : ""}${a.display_name}`));
  const summarySection = `
    <tr>
      <td style="padding: 0 0 28px 0;">
        <p style="margin: 0 0 10px 0; color: #6b6256; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;">What you ordered</p>
        <ul style="margin: 0; padding: 0 0 0 18px; color: #1a1a1a; font-size: 14px; line-height: 1.8;">
          ${summaryLines.map((l) => `<li>${l}</li>`).join("")}
        </ul>
      </td>
    </tr>
  `;

  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    `${eventDetails.venue_name}, ${eventDetails.venue_address}`
  )}`;

  const preheader = `QR codes inside. Save this email — gates open ${format(new Date(eventDetails.event_date), "EEEE")} at ${eventTime}.`;

  // ===== Tickets (one QR per attendee) =====
  const ticketRows = (tickets.length > 0
    ? tickets.map((t, i) => ({
        idx: i + 1,
        id: t.id,
        name: TICKET_NAMES[t.ticket_type] || t.ticket_type,
        ticketType: t.ticket_type,
        holder: t.holder_name || name,
        walletUrl: walletPassUrl(t.id),
        assignedNote: t.assignedNote || null,
      }))
    : Array.from({ length: quantity }, (_, i) => ({
        idx: i + 1,
        id: registrationId,
        name: ticketName,
        ticketType: ticketType,
        holder: name,
        walletUrl: null as string | null,
        assignedNote: null as string | null,
      }))
  )
    .map(
      (row) => {
        const days = getTicketDateRange(row.ticketType);
        const assignedBadge = row.assignedNote
          ? `<p style="margin: 0 0 10px 0; display:inline-block; background:#f5f0e4; color:#6b4d1f; padding:4px 10px; font-size:11px; letter-spacing:0.08em; text-transform:uppercase; border:1px solid #d9c89a;">${row.assignedNote}</p>`
          : "";
        return `
    <tr>
      <td style="padding: 28px 0; border-top: 1px solid #d9d2c2;">
        <p style="margin: 0; color: #1a1a1a; font-size: 17px; font-family: Georgia, 'Times New Roman', serif;">${row.holder}</p>
        <p style="margin: 4px 0 4px 0; color: #6b6256; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase;">${row.name}</p>
        <p style="margin: 0 0 10px 0; color: #4a4338; font-size: 12px; font-family: Georgia, serif; font-style: italic;">Valid ${days.dayDescription} · ${days.dateRange}</p>
        ${assignedBadge}
        <div style="background:#1a1a1a;color:#f5f0e4;padding:10px 14px;margin:0 0 12px 0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          Scan at the festival gate
        </div>
        <p style="margin: 0 0 12px 0; color: #4a4338; font-size: 13px; line-height: 1.55;">
          Admits <strong>${row.holder}</strong> for entry on <strong>${days.dayDescription}</strong> (${days.dateRange}). One QR per attendee — single check-in only.
        </p>
        <img src="${qrFor(row.id)}" alt="Entry QR for ${row.holder}" width="180" height="180" style="display: block; width: 180px; height: 180px; background: #ffffff; padding: 8px; border: 1px solid #d9d2c2;" />
        <p style="margin: 10px 0 0 0; color: #8a8275; font-size: 10px; font-family: Menlo, monospace; letter-spacing: 0.06em;">ID · ${row.id.slice(0, 8).toUpperCase()}</p>
        ${
          row.walletUrl
            ? `<p style="margin: 14px 0 0 0;"><a href="${row.walletUrl}" style="display: inline-block; background: #1a1a1a; color: #f5f0e4; text-decoration: none; padding: 11px 18px; font-size: 13px; letter-spacing: 0.04em; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Add to Apple Wallet</a></p>`
            : ""
        }
      </td>
    </tr>
  `;
      },
    )
    .join("");

  // ===== Lodging (no QR — Wildhaven assigns site at check-in) =====
  const lodgingSection = lodging.length === 0 ? "" : `
    <tr>
      <td style="padding: 36px 0 12px 0;">
        <p style="margin: 0 0 4px 0; color: #6b6256; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;">Your Stay</p>
        <p style="margin: 0 0 18px 0; color: #6b6256; font-size: 13px; font-family: Georgia, serif; font-style: italic;">No scan needed — Wildhaven Sonoma will assign your site when you check in.</p>
        ${lodging.map((l) => {
          const img = l.zone_key ? LODGING_IMAGES[l.zone_key] : null;
          return `
          <div style="padding: 18px 0; border-top: 1px solid #d9d2c2;">
            ${img ? `<img src="${img}" alt="${l.zone_name}" width="520" style="display:block; width:100%; max-width:520px; height:auto; margin:0 0 14px 0; border-radius:2px;" />` : ""}
            <p style="margin: 0; color: #1a1a1a; font-size: 16px; font-family: Georgia, serif;">${l.zone_name}${l.quantity > 1 ? ` × ${l.quantity}` : ""}</p>
            <p style="margin: 6px 0 0 0; color: #4a4338; font-size: 13px; line-height:1.5;">
              When you check in with Wildhaven Sonoma, you'll receive your specific site assignment.
            </p>
          </div>
          `;
        }).join("")}
      </td>
    </tr>
  `;

  // ===== Add-ons (one QR per item — scan at the station) =====
  const addonRows = addons.flatMap((a) => {
    const walletEligible = a.addon_type ? WALLET_ELIGIBLE_ADDONS.has(a.addon_type) : false;
    const instr = getAddonInstruction(a.addon_type);
    return Array.from({ length: a.quantity }, (_, i) => ({
      id: `${a.id}-${i + 1}`,
      label: a.display_name + (a.quantity > 1 ? ` · ${i + 1} of ${a.quantity}` : ""),
      desc: a.description || "",
      gets: instr.gets,
      when: instr.when,
      qrPayload: `addon:${a.id}:${i + 1}`,
      walletUrl: walletEligible ? walletAddonUrl(a.id, i + 1) : null,
    }));
  });

  const addonsSection = addonRows.length === 0 ? "" : `
    <tr>
      <td style="padding: 36px 0 12px 0;">
        <p style="margin: 0 0 4px 0; color: #6b6256; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;">Your Add-ons</p>
        <p style="margin: 0 0 18px 0; color: #6b6256; font-size: 13px; font-family: Georgia, serif; font-style: italic;">Show each QR at the station — one scan per item.</p>
        ${addonRows.map((row) => `
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
            ${row.walletUrl ? `<p style="margin: 14px 0 0 0;"><a href="${row.walletUrl}" style="display: inline-block; background: #1a1a1a; color: #f5f0e4; text-decoration: none; padding: 11px 18px; font-size: 13px; letter-spacing: 0.04em; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Add to Apple Wallet</a></p>` : ""}
          </div>
        `).join("")}
      </td>
    </tr>
  `;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Cosmico 2026 tickets</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; background-color: #f5f0e4; color: #1a1a1a;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f5f0e4;">
    <tr>
      <td align="center" style="padding: 48px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom: 36px;">
              <img src="${LOGO_URL}" alt="Cosmico" width="220" style="display: block; max-width: 220px; height: auto;" />
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding-bottom: 28px;">
              <p style="margin: 0 0 18px 0; font-family: Georgia, 'Times New Roman', serif; font-size: 26px; line-height: 1.25; color: #1a1a1a; font-weight: 400;">
                ${firstName}, your tickets are here.
              </p>
              <p style="margin: 0 0 14px 0; font-size: 15px; line-height: 1.65; color: #4a4338;">
                Below are your tickets for Cosmico at ${eventDetails.venue_name} — five minutes north of Healdsburg. Save this email and bring it to the gate.
              </p>
              <p style="margin: 0; font-size: 14px; line-height: 1.65; color: #6b6256; font-style: italic; font-family: Georgia, serif;">
                A full guide to your weekend — schedule, what to bring, parking, lodging — is coming in a separate email shortly.
              </p>
            </td>
          </tr>

          ${summaryLines.length > 0 ? summarySection : ""}

          <!-- How to use -->

          <tr>
            <td style="padding: 20px 0 28px 0; border-top: 1px solid #d9d2c2; border-bottom: 1px solid #d9d2c2;">
              <p style="margin: 0 0 10px 0; color: #6b6256; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;">How to get in</p>
              <p style="margin: 0 0 8px 0; font-size: 14px; line-height: 1.6; color: #1a1a1a;">
                <strong>iPhone:</strong> tap <em>Add to Apple Wallet</em> under each ticket.
              </p>
              <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #1a1a1a;">
                <strong>Anyone else:</strong> show this email at the gate, or screenshot the QR codes. No app required.
              </p>
            </td>
          </tr>

          <!-- Tickets -->
          <tr>
            <td style="padding-top: 28px;">
              <p style="margin: 0 0 4px 0; color: #6b6256; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;">Your Tickets</p>
              <p style="margin: 0 0 6px 0; color: #6b6256; font-size: 13px; font-family: Georgia, serif; font-style: italic;">One QR per attendee.</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                ${ticketRows}
              </table>
            </td>
          </tr>

          ${lodgingSection}
          ${addonsSection}

          <!-- Event details -->
          <tr>
            <td style="padding: 36px 0 12px 0; border-top: 1px solid #d9d2c2; margin-top: 36px;">
              <p style="margin: 0 0 14px 0; color: #6b6256; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;">Event Details</p>
              <p style="margin: 0 0 6px 0; font-size: 15px; color: #1a1a1a;"><strong>${getTicketDateRange(ticketType).dateRange}</strong> · Gates at ${eventTime} Friday</p>
              <p style="margin: 0 0 12px 0; font-size: 13px; color: #6b6256; font-style: italic; font-family: Georgia, serif;">Each ticket above lists its specific valid days.</p>
              <p style="margin: 0 0 4px 0; font-size: 11px; color: #6b6256; letter-spacing: 0.08em; text-transform: uppercase;">Friday & Saturday</p>
              <p style="margin: 0 0 12px 0; font-size: 14px; color: #4a4338;">${eventDetails.venue_name}<br/>2411 Alexander Valley Rd, Healdsburg, CA 95448</p>
              <p style="margin: 0 0 16px 0;"><a href="${directionsUrl}" style="display:inline-block;background:#1a1a1a;color:#f5f0e4;text-decoration:none;padding:10px 16px;font-size:13px;letter-spacing:0.04em;">Get directions</a></p>
              ${(() => {
                const hasSunday = (tickets.length > 0 ? tickets : [{ ticket_type: ticketType }])
                  .some((t: any) => getTicketDateRange(t.ticket_type).dayDescription === "Friday through Sunday");
                if (!hasSunday) return "";
                const bloodrootDirections = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent("Bloodroot Tasting Room, 118 North St, Healdsburg, CA 95448")}`;
                return `
                  <div style="margin-top: 20px; padding-top: 18px; border-top: 1px dashed #d9d2c2;">
                    <p style="margin: 0 0 4px 0; font-size: 11px; color: #6b6256; letter-spacing: 0.08em; text-transform: uppercase;">Sunday · VIP &amp; Krewe only</p>
                    <p style="margin: 0 0 6px 0; font-size: 14px; color: #1a1a1a;"><strong>Secret location</strong> — shuttles depart from Bloodroot Tasting Room.</p>
                    <p style="margin: 0 0 12px 0; font-size: 14px; color: #4a4338;">Bloodroot Tasting Room<br/>118 North St, Healdsburg, CA 95448</p>
                    <p style="margin: 0;"><a href="${bloodrootDirections}" style="display:inline-block;background:#1a1a1a;color:#f5f0e4;text-decoration:none;padding:10px 16px;font-size:13px;letter-spacing:0.04em;">Get directions</a></p>
                  </div>
                `;
              })()}
            </td>
          </tr>

          <!-- Reminders -->
          <tr>
            <td style="padding: 28px 0;">
              <p style="margin: 0 0 12px 0; color: #6b6256; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;">Before you come</p>
              <ul style="margin: 0 0 14px 0; padding: 0 0 0 18px; color: #1a1a1a; font-size: 14px; line-height: 1.85;">
                <li>Save or screenshot this email so your QR codes are handy at the gate.</li>
                <li>Bring a photo ID — we may verify at check-in.</li>
                <li>Parking &amp; shuttle details: see the <a href="https://example.invalid/getting-here" style="color: #1a1a1a; text-decoration: underline;">Getting Here</a> guide.</li>
              </ul>
              <p style="margin: 0 0 14px 0; font-size: 13px; color: #4a4338; font-family: Georgia, serif; font-style: italic; line-height: 1.6;">Parking is for stay-on-site guests only. All other guests must park offsite — see the <a href="https://example.invalid/getting-here" style="color: #1a1a1a; text-decoration: underline; font-style: italic;">Getting Here</a> guide for shuttle service from the lot just five minutes away.</p>
              <p style="margin: 0; font-size: 14px;">
                <a href="https://example.invalid/getting-here" style="color: #1a1a1a; text-decoration: underline;">Getting Here</a>
                &nbsp;·&nbsp;
                <a href="https://example.invalid/almost-here" style="color: #1a1a1a; text-decoration: underline;">Almost Here guide</a>
                &nbsp;·&nbsp;
                <a href="https://example.invalid/faq" style="color: #1a1a1a; text-decoration: underline;">FAQ</a>
              </p>
            </td>
          </tr>

          <!-- Sign-off -->
          <tr>
            <td style="padding: 24px 0 40px 0;">
              <p style="margin: 0; font-family: Georgia, serif; font-size: 16px; font-style: italic; color: #1a1a1a;">See you out there,</p>
              <p style="margin: 4px 0 0 0; font-family: Georgia, serif; font-size: 16px; color: #1a1a1a;">Chris &amp; Anne</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top: 28px; border-top: 1px solid #d9d2c2;">
              <p style="margin: 0 0 6px 0; font-size: 11px; color: #8a8275; letter-spacing: 0.04em;">Cosmico 2026</p>
              <p style="margin: 0 0 12px 0; font-size: 11px; color: #8a8275;">Produced by the Launch Pad Foundation, a 501(c)(3) public charity.</p>
              <p style="margin: 0; font-size: 11px; color: #8a8275;">Questions? <a href="mailto:hello@example.invalid" style="color: #4a4338;">hello@example.invalid</a></p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

const getFirstName = (fullName: string): string => {
  return fullName.split(" ")[0] || fullName;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { testEmail, eventId, autoScheduled, singleRegistrationId, overrideEmail, force } = await req.json();

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // If not auto-scheduled, verify admin authentication
    if (!autoScheduled) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: "Missing authorization header" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
        );
      }

      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? ""
      ).auth.getUser(token);

      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: "Invalid or expired token" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
        );
      }

      const { data: hasAdminRole } = await supabaseClient.rpc("has_role", {
        _user_id: user.id,
        _role: "admin"
      });

      if (!hasAdminRole) {
        return new Response(
          JSON.stringify({ error: "Unauthorized: Admin access required" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
        );
      }
    }

    // Build a set of recipient emails that already received a tickets_delivery
    // email within the last 30 minutes, plus a set of registration_ids that
    // already had a successful send in that window. Used to dedupe re-clicks
    // so the same person isn't blasted repeatedly. Bypassed when `force: true`
    // is passed or when `overrideEmail` is set (test/proof sends).
    const recentRecipientEmails = new Set<string>();
    const recentlySentRegIds = new Map<string, string>();
    if (!overrideEmail && !force) {
      const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: recentLogs } = await supabaseClient
        .from("email_logs")
        .select("registration_id, sent_at, email_content")
        .eq("email_type", "tickets_delivery")
        .eq("status", "sent")
        .gte("sent_at", cutoff);
      const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
      for (const row of recentLogs || []) {
        if (row.registration_id && !recentlySentRegIds.has(row.registration_id)) {
          recentlySentRegIds.set(row.registration_id, row.sent_at);
        }
        const matches = (row.email_content || "").match(emailRegex) || [];
        for (const m of matches) recentRecipientEmails.add(m.toLowerCase().trim());
      }
    }

    // Single-registration recent-send guard: if an admin re-triggers a send
    // for one registration that just went out within 30 min, refuse with 409
    // so the UI can confirm before re-blasting. `force: true` bypasses.
    if (singleRegistrationId && !overrideEmail && !force && recentlySentRegIds.has(singleRegistrationId)) {
      const recentAt = recentlySentRegIds.get(singleRegistrationId);
      return new Response(
        JSON.stringify({
          error: "recently_sent",
          message: `Tickets for this registration were already sent at ${recentAt}. Pass force:true to send again.`,
          recentlySentAt: recentAt,
          requiresForce: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409 }
      );
    }

    // Fetch event details
    let eventQuery = supabaseClient.from("event_details").select("*");
    if (eventId) {
      eventQuery = eventQuery.eq("id", eventId);
    } else {
      eventQuery = eventQuery.eq("is_active", true);
    }
    
    const { data: eventDetails, error: eventError } = await eventQuery.single();

    if (eventError || !eventDetails) {
      throw new Error("Event details not found");
    }

    // Check if we're within 7 days of the event (for auto-scheduled, but skip when sending a test)
    if (autoScheduled && !testEmail && !singleRegistrationId) {
      const eventDate = new Date(eventDetails.event_date);
      const now = new Date();
      const daysUntilEvent = Math.ceil((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysUntilEvent > 7) {
        console.log(`[send-tickets-delivery] Event is ${daysUntilEvent} days away, not sending yet`);
        return new Response(
          JSON.stringify({ message: `Event is ${daysUntilEvent} days away. Tickets will be sent when 7 days or fewer remain.` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }
    }

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

    // If testEmail is provided, send only to that email
    if (testEmail) {
      const sampleRegistration = {
        id: "test-id",
        name: "John Doe",
        email: testEmail,
        ticket_type: "tier_1_krewe_3day",
        quantity: 2,
      };

      const sampleLodging: DeliveryLodging[] = [{
        id: "test-lodging",
        zone_key: "grove_tents",
        zone_name: "Grove Tents — 1 Queen",
        quantity: 1,
        assigned_unit_name: null,
        assignment_status: "unassigned",
      }];
      // Pull real paid addon_purchases so the Apple Wallet add-on passes resolve.
      const { data: realAddons } = await supabaseClient
        .from("addon_purchases")
        .select("id, quantity, addon_inventory:inventory_id(display_name, description, addon_type)")
        .in("payment_status", ["paid", "payment_plan"])
        .limit(10);

      const byType: Record<string, any> = {};
      (realAddons || []).forEach((a: any) => {
        const t = a.addon_inventory?.addon_type;
        if (t && !byType[t]) byType[t] = a;
      });

      const buildSample = (type: string, fallbackName: string, fallbackDesc: string, fallbackQty: number): DeliveryAddon => {
        const real = byType[type];
        if (real) {
          return {
            id: real.id,
            display_name: real.addon_inventory.display_name,
            quantity: real.quantity,
            description: real.addon_inventory.description,
            addon_type: type,
          };
        }
        return {
          id: `test-${type}`,
          display_name: fallbackName,
          quantity: fallbackQty,
          description: fallbackDesc,
          addon_type: null, // no wallet link in fallback
        };
      };

      const sampleAddons: DeliveryAddon[] = [
        buildSample("friday_dinner", "Field Day Ca Japanese Picnic Dinner", "Friday evening · long-table supper", 2),
        buildSample("wine_camp", "Wine Camp", "Saturday afternoon tasting flight", 1),
        buildSample("kids_camp", "Kids Camp", "Daytime programming for ages 5–12", 1),
      ];

      // Pull 2 real active ticket UUIDs so the Apple Wallet links actually resolve.
      const { data: realTickets } = await supabaseClient
        .from("tickets")
        .select("id, holder_name, ticket_type, registrations!inner(payment_status)")
        .eq("status", "active")
        .in("registrations.payment_status", ["paid", "payment_plan"])
        .not("holder_name", "is", null)
        .limit(2);

      const sampleTickets: DeliveryTicket[] = (realTickets && realTickets.length >= 2)
        ? realTickets.map((t: any) => ({
            id: t.id,
            holder_name: t.holder_name,
            ticket_type: "tier_1_krewe_3day", // override label for test
          }))
        : [
            { id: crypto.randomUUID(), holder_name: "John Doe", ticket_type: "tier_1_krewe_3day" },
            { id: crypto.randomUUID(), holder_name: "Jane Doe", ticket_type: "tier_1_krewe_3day" },
          ];

      const emailHtml = generateTicketEmailHtml(
        sampleRegistration.name,
        getFirstName(sampleRegistration.name),
        sampleRegistration.ticket_type,
        sampleRegistration.quantity,
        sampleRegistration.id,
        eventDetails,
        sampleTickets,
        sampleLodging,
        sampleAddons,
      );

      const { error: emailError } = await resend.emails.send({
        from: "Cosmico <hello@example.invalid>",
        to: [testEmail],
        reply_to: "hello@example.invalid",
        subject: `[TEST] Your Cosmico tickets — ${format(new Date(eventDetails.event_date), "EEEE, MMMM d")}`,
        html: emailHtml,
      });

      if (emailError) {
        throw emailError;
      }

      console.log(`[send-tickets-delivery] Test email sent to ${testEmail}`);
      return new Response(
        JSON.stringify({ message: "Test ticket email sent successfully", email: testEmail }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Fetch all eligible registrations that haven't received their tickets yet.
    // Eligible = paid OR payment_plan OR partially_refunded (still has active tickets).
    const ELIGIBLE_STATUSES = ["paid", "payment_plan", "partially_refunded"];
    let regQuery = supabaseClient
      .from("registrations")
      .select("*")
      .in("payment_status", ELIGIBLE_STATUSES)
      .eq("event_id", eventDetails.id);
    if (singleRegistrationId) {
      regQuery = supabaseClient
        .from("registrations")
        .select("*")
        .eq("id", singleRegistrationId);
    }
    const { data: registrations, error: regError } = await regQuery;

    if (regError) {
      throw new Error("Failed to fetch registrations");
    }

    if (!registrations || registrations.length === 0) {
      return new Response(
        JSON.stringify({ message: "No paid registrations found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    let sentCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const failedRegs: Array<{ id: string; email: string }> = [];

    // Resend rate limit: 2 requests per second. We pace at 600ms between sends
    // (≈ 1.66/sec) to stay safely below the limit even with retries.
    const PACE_MS = 600;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const sendOne = async (registration: any, isRetry = false): Promise<"sent" | "skipped" | "failed"> => {
      // Check if tickets were already delivered (skip when manually re-sending one)
      if (!singleRegistrationId && !isRetry) {
        const { data: existingLog } = await supabaseClient
          .from("email_logs")
          .select("id")
          .eq("registration_id", registration.id)
          .eq("email_type", "tickets_delivery")
          .eq("status", "sent")
          .limit(1)
          .maybeSingle();

        if (existingLog) {
          console.log(`[send-tickets-delivery] Tickets already delivered to ${registration.email}`);
          return "skipped";
        }
      }

      const { data: ticketRows } = await supabaseClient
        .from("tickets")
        .select("id, holder_name, holder_email, ticket_type")
        .eq("registration_id", registration.id)
        .eq("status", "active");

      // Lodging bookings linked to this registration
      const { data: lodgingRows } = await supabaseClient
        .from("lodging_bookings")
        .select("id, zone_key, quantity, assigned_unit_id, assignment_status, accommodation_zones(zone_name), accommodation_units!lodging_bookings_assigned_unit_id_fkey(unit_name)")
        .eq("registration_id", registration.id)
        .in("payment_status", ["paid", "completed", "comp"]);

      const lodging: DeliveryLodging[] = (lodgingRows || []).map((l: any) => ({
        id: l.id,
        zone_key: l.zone_key || null,
        zone_name: l.accommodation_zones?.zone_name || l.zone_key,
        quantity: l.quantity,
        assigned_unit_name: l.accommodation_units?.unit_name || null,
        assignment_status: l.assignment_status,
      }));

      // Add-on purchases (dinners, sauna, etc.)
      const { data: addonRows } = await supabaseClient
        .from("addon_purchases")
        .select("id, quantity, addon_inventory:inventory_id(display_name, description, addon_type)")
        .eq("registration_id", registration.id)
        .eq("payment_status", "paid");

      const addons: DeliveryAddon[] = (addonRows || [])
        .filter((a: any) => a.addon_inventory)
        .map((a: any) => ({
          id: a.id,
          display_name: a.addon_inventory.display_name,
          quantity: a.quantity,
          description: a.addon_inventory.description,
          addon_type: a.addon_inventory.addon_type ?? null,
        }));

      // Recipient model:
      //  • Purchaser receives ALL QR codes (assigned ones get an "Assigned to <name>" badge),
      //    plus lodging + add-ons. This way the purchaser has the full set in one place.
      //  • Each assignee also receives their own email containing the SAME QR code
      //    for their ticket(s), with a note that the ticket was assigned by the purchaser.
      //    The QR is single-use — whoever scans first checks in.
      const purchaserEmailLower = (registration.email || "").toLowerCase().trim();
      const purchaserDisplayName = registration.name || "your friend";
      const allTickets = (ticketRows || []) as Array<DeliveryTicket & { holder_email?: string | null }>;

      // Build assignee groups (for the per-assignee emails)
      const assigneeGroups = new Map<string, { tickets: DeliveryTicket[]; toName: string | null }>();
      for (const t of allTickets) {
        const holderEmail = (t.holder_email || "").toLowerCase().trim();
        if (holderEmail && holderEmail !== purchaserEmailLower) {
          const existing = assigneeGroups.get(holderEmail);
          if (existing) {
            existing.tickets.push(t);
          } else {
            assigneeGroups.set(holderEmail, { tickets: [t], toName: t.holder_name });
          }
        }
      }

      const sendErrors: string[] = [];
      const recipientsList: string[] = [];

      // 1) Purchaser email — ALL tickets, with "Assigned to <name>" badge on those given away.
      const purchaserTicketsAnnotated: DeliveryTicket[] = allTickets.map((t) => {
        const holderEmail = (t.holder_email || "").toLowerCase().trim();
        const isAssigned = !!holderEmail && holderEmail !== purchaserEmailLower;
        return {
          ...t,
          assignedNote: isAssigned
            ? `Assigned to ${t.holder_name || holderEmail}`
            : null,
        };
      });

      const purchaserHtml = generateTicketEmailHtml(
        registration.name,
        getFirstName(registration.name),
        registration.ticket_type,
        purchaserTicketsAnnotated.length || registration.quantity,
        registration.id,
        eventDetails,
        purchaserTicketsAnnotated,
        lodging,
        addons,
      );
      const purchaserToEmail = (overrideEmail || registration.email || "").toLowerCase().trim();
      const skippedRecipients: string[] = [];
      if (!overrideEmail && recentRecipientEmails.has(purchaserToEmail)) {
        console.log(`[send-tickets-delivery] Skipping purchaser ${purchaserToEmail} — sent within last 30 min`);
        skippedRecipients.push(purchaserToEmail);
      } else {
        const { error: purchaserErr } = await resend.emails.send({
          from: "Cosmico <hello@example.invalid>",
          to: [overrideEmail || registration.email],
          reply_to: "hello@example.invalid",
          subject: `${overrideEmail ? `[TEST → ${registration.email}] ` : ""}Your Cosmico tickets — ${format(new Date(eventDetails.event_date), "EEEE, MMMM d")}`,
          html: purchaserHtml,
        });
        if (purchaserErr) sendErrors.push(`${registration.email}: ${purchaserErr.message}`);
        else {
          recipientsList.push(overrideEmail || registration.email);
          recentRecipientEmails.add(purchaserToEmail);
        }
        await sleep(PACE_MS);
      }

      // 2) Each assignee gets their own copy of just their ticket(s),
      //    with a note that it was assigned to them by the purchaser.
      for (const [holderEmail, group] of assigneeGroups.entries()) {
        const holderName = group.toName || "Friend";
        const annotatedForAssignee: DeliveryTicket[] = group.tickets.map((t) => ({
          ...t,
          assignedNote: `Assigned to you by ${purchaserDisplayName}`,
        }));
        const html = generateTicketEmailHtml(
          holderName,
          getFirstName(holderName),
          group.tickets[0].ticket_type,
          group.tickets.length,
          registration.id,
          eventDetails,
          annotatedForAssignee,
          [],
          [],
        );
        const assigneeToEmail = (overrideEmail || holderEmail).toLowerCase().trim();
        if (!overrideEmail && recentRecipientEmails.has(assigneeToEmail)) {
          console.log(`[send-tickets-delivery] Skipping assignee ${assigneeToEmail} — sent within last 30 min`);
          skippedRecipients.push(assigneeToEmail);
          continue;
        }
        const { error: holderErr } = await resend.emails.send({
          from: "Cosmico <hello@example.invalid>",
          to: [overrideEmail || holderEmail],
          reply_to: "hello@example.invalid",
          subject: `${overrideEmail ? `[TEST → ${holderEmail}] ` : ""}${purchaserDisplayName} sent you an Cosmico ticket — ${format(new Date(eventDetails.event_date), "EEEE, MMMM d")}`,
          html,
        });
        if (holderErr) sendErrors.push(`${holderEmail}: ${holderErr.message}`);
        else {
          recipientsList.push(holderEmail);
          recentRecipientEmails.add(assigneeToEmail);
        }
        await sleep(PACE_MS);
      }

      if (sendErrors.length > 0) {
        console.error(`[send-tickets-delivery] Errors for ${registration.id}:`, sendErrors);
        if (!overrideEmail) {
          await supabaseClient.from("email_logs").insert({
            registration_id: registration.id,
            email_type: "tickets_delivery",
            status: "failed",
            error_message: sendErrors.join("; ") + (isRetry ? " (retry)" : ""),
          });
        }
        return "failed";
      }

      // Everything was skipped by the per-recipient dedupe — treat as skipped,
      // do not insert a duplicate "sent" log row.
      if (recipientsList.length === 0 && skippedRecipients.length > 0) {
        console.log(`[send-tickets-delivery] All recipients skipped (recent send) for ${registration.id}: ${skippedRecipients.join(", ")}`);
        return "skipped";
      }

      if (!overrideEmail) {
        await supabaseClient.from("email_logs").insert({
          registration_id: registration.id,
          email_type: "tickets_delivery",
          status: "sent",
          email_content: `Ticket delivery emails sent to: ${recipientsList.join(", ")}${skippedRecipients.length ? ` | skipped (recent): ${skippedRecipients.join(", ")}` : ""}${isRetry ? " (retry)" : ""}`,
        });
      }
      console.log(`[send-tickets-delivery] Tickets delivered for ${registration.id} → ${recipientsList.join(", ")}${isRetry ? " (retry)" : ""}${overrideEmail ? " [PROOF — not logged]" : ""}`);
      return "sent";
    };

    // First pass — paced sends
    for (const registration of registrations) {
      try {
        const result = await sendOne(registration, false);
        if (result === "sent") sentCount++;
        else if (result === "skipped") skippedCount++;
        else { errorCount++; failedRegs.push({ id: registration.id, email: registration.email }); }
      } catch (error: any) {
        console.error(`[send-tickets-delivery] Error processing ${registration.id}:`, error);
        errorCount++;
        failedRegs.push({ id: registration.id, email: registration.email });
      }
      await sleep(PACE_MS);
    }

    // Retry pass — one automatic retry for any failures (likely transient 429/5xx)
    let retrySent = 0;
    if (failedRegs.length > 0) {
      console.log(`[send-tickets-delivery] Retrying ${failedRegs.length} failed sends after backoff`);
      await sleep(2000);
      for (const failed of failedRegs) {
        const reg = registrations.find((r: any) => r.id === failed.id);
        if (!reg) continue;
        try {
          const result = await sendOne(reg, true);
          if (result === "sent") { retrySent++; errorCount--; sentCount++; }
        } catch (error: any) {
          console.error(`[send-tickets-delivery] Retry failed for ${failed.id}:`, error);
        }
        await sleep(PACE_MS);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sentCount,
        skippedCount,
        errorCount,
        retrySent,
        totalRegistrations: registrations.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("[send-tickets-delivery] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
