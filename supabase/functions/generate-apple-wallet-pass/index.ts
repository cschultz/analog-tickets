// Apple Wallet .pkpass generator
// GET /generate-apple-wallet-pass?ticket_id=<uuid>
// Returns: application/vnd.apple.pkpass (signed)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import forge from "https://esm.sh/node-forge@1.3.1?bundle";
import JSZip from "https://esm.sh/jszip@3.10.1";
import { PASS_IMAGES } from "./assets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const PASS_TYPE_ID = Deno.env.get("APPLE_PASS_TYPE_ID")!;
const TEAM_ID = Deno.env.get("APPLE_PASS_TEAM_ID")!;
const P12_BASE64 = Deno.env.get("APPLE_PASS_P12_BASE64")!;
const P12_PASSWORD = Deno.env.get("APPLE_PASS_P12_PASSWORD")!;
const WWDR_PEM_B64 = Deno.env.get("APPLE_PASS_WWDR_PEM_BASE64")!;
const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ---------- helpers ----------
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBinary(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

async function sha1Hex(data: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// 1x1 transparent PNG fallback for required pass images
const FALLBACK_PNG = b64ToBytes(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
);

// ---------- ticket type theming ----------
// Editorial palette mapped from index.css tokens (charcoal / clay / denim / forest / cream).
type TicketTheme = {
  label: string;
  badge: string; // short label
  bg: string; // backgroundColor rgb()
  fg: string; // foregroundColor rgb()
  label_color: string;
  validDays?: string; // human readable
};

// Palette pulled from analog-poster-2026-v2.webp:
//   indigo  rgb(25,20,38)    #191426  — top of poster sky
//   plum    rgb(56,43,72)    #382b48
//   purple  rgb(91,68,115)   #5b4473
//   mauve   rgb(140,80,121)  #8c5079  — sunset belt
//   cream   rgb(253,250,203) #fdfacb  — illustration line work
//   clay    rgb(217,167,102)         — warm accent for premium tiers
const POSTER_BG = "rgb(25, 20, 38)";
const POSTER_BG_DEEP = "rgb(15, 12, 26)";
const POSTER_FG = "rgb(253, 250, 203)";
const POSTER_LABEL = "rgb(217, 162, 184)"; // soft mauve, readable on indigo
const POSTER_LABEL_WARM = "rgb(217, 167, 102)";

const TICKET_THEMES: Record<string, TicketTheme> = {
  early_bird_krewe_3day: {
    label: "Krewe — 3 Day",
    badge: "KREWE",
    bg: POSTER_BG,
    fg: POSTER_FG,
    label_color: POSTER_LABEL,
    validDays: "Fri · Sat · Sun",
  },
  early_bird_vip_3day: {
    label: "VIP — 3 Day",
    badge: "VIP",
    bg: POSTER_BG_DEEP,
    fg: POSTER_FG,
    label_color: POSTER_LABEL_WARM,
    validDays: "Fri · Sat · Sun",
  },
  early_bird_ga_2day: {
    label: "GA — 2 Day",
    badge: "GA",
    bg: POSTER_BG,
    fg: POSTER_FG,
    label_color: POSTER_LABEL,
    validDays: "Fri · Sat",
  },
  tier_1_krewe_3day: {
    label: "Krewe — 3 Day",
    badge: "KREWE",
    bg: POSTER_BG,
    fg: POSTER_FG,
    label_color: POSTER_LABEL,
    validDays: "Fri · Sat · Sun",
  },
  tier_1_vip_3day: {
    label: "VIP — 3 Day",
    badge: "VIP",
    bg: POSTER_BG_DEEP,
    fg: POSTER_FG,
    label_color: POSTER_LABEL_WARM,
    validDays: "Fri · Sat · Sun",
  },
  tier_1_ga_2day: {
    label: "GA — 2 Day",
    badge: "GA",
    bg: POSTER_BG,
    fg: POSTER_FG,
    label_color: POSTER_LABEL,
    validDays: "Fri · Sat",
  },
  tier_1_ga_friday: {
    label: "GA — Friday",
    badge: "GA",
    bg: POSTER_BG,
    fg: POSTER_FG,
    label_color: POSTER_LABEL,
    validDays: "Friday only",
  },
  tier_1_ga_saturday: {
    label: "GA — Saturday",
    badge: "GA",
    bg: POSTER_BG,
    fg: POSTER_FG,
    label_color: POSTER_LABEL,
    validDays: "Saturday only",
  },
  youth_2day: {
    label: "Youth — 2 Day",
    badge: "YOUTH",
    bg: "rgb(91, 68, 115)", // purple band
    fg: POSTER_FG,
    label_color: POSTER_LABEL,
    validDays: "Fri · Sat",
  },
  youth_saturday: {
    label: "Youth — Saturday",
    badge: "YTH SAT",
    bg: "rgb(91, 68, 115)",
    fg: POSTER_FG,
    label_color: POSTER_LABEL,
    validDays: "Saturday only",
  },
  child_free: {
    label: "Child (0–12)",
    badge: "CHILD",
    bg: "rgb(140, 80, 121)", // mauve sunset
    fg: POSTER_FG,
    label_color: POSTER_FG,
    validDays: "Fri · Sat (with adult)",
  },
  patrons_premier: {
    label: "Premier Patron",
    badge: "PREMIER",
    bg: POSTER_BG_DEEP,
    fg: POSTER_FG,
    label_color: POSTER_LABEL_WARM,
    validDays: "Fri · Sat · Sun",
  },
  patrons_ultimate: {
    label: "Ultimate Patron",
    badge: "ULTIMATE",
    bg: "rgb(10, 8, 18)",
    fg: POSTER_FG,
    label_color: POSTER_LABEL_WARM,
    validDays: "Fri · Sat · Sun",
  },
  artist_guest: {
    label: "Artist Guest",
    badge: "GUEST",
    bg: POSTER_BG_DEEP,
    fg: POSTER_FG,
    label_color: POSTER_LABEL,
    validDays: "All days",
  },
};

// ---------- add-on theming ----------
const ADDON_THEMES: Record<string, TicketTheme> = {
  friday_dinner: {
    label: "Friday Dinner + Party",
    badge: "DINNER",
    bg: "rgb(99, 36, 38)", // deep clay/wine
    fg: POSTER_FG,
    label_color: POSTER_LABEL_WARM,
    validDays: "Friday evening",
  },
  wine_camp: {
    label: "Wine Camp",
    badge: "WINE CAMP",
    bg: "rgb(74, 24, 50)", // deep burgundy
    fg: POSTER_FG,
    label_color: POSTER_LABEL_WARM,
    validDays: "Saturday afternoon",
  },
  kids_camp: {
    label: "Kids Camp",
    badge: "KIDS CAMP",
    bg: "rgb(56, 90, 76)", // forest green
    fg: POSTER_FG,
    label_color: POSTER_LABEL,
    validDays: "Daytime · ages 5–12",
  },
};

function themeForAddon(addonType: string): TicketTheme {
  return ADDON_THEMES[addonType] ?? {
    label: addonType,
    badge: "ADD-ON",
    bg: POSTER_BG,
    fg: POSTER_FG,
    label_color: POSTER_LABEL,
  };
}

function themeFor(ticketType: string): TicketTheme {
  return TICKET_THEMES[ticketType] ?? {
    label: ticketType,
    badge: "TICKET",
    bg: POSTER_BG,
    fg: POSTER_FG,
    label_color: POSTER_LABEL,
  };
}

// Festival days (Pacific). Pick a relevantDate that keeps the pass surfaced
// on the lock screen during the day(s) the holder can actually attend.
// Apple Wallet de-emphasizes passes more than ~24h past relevantDate, which
// is why Saturday/Sunday holders reported their passes disappearing.
const FESTIVAL_DAYS_PT = {
  friday: "2026-05-15",
  saturday: "2026-05-16",
  sunday: "2026-05-17",
} as const;

function relevantDateForTicket(ticketType: string, fallbackIso: string): string {
  const t = (ticketType || "").toLowerCase();
  // Pick today if the holder can attend today; otherwise next valid day.
  const todayPT = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }),
  );
  const ymd = `${todayPT.getFullYear()}-${String(todayPT.getMonth() + 1).padStart(2, "0")}-${String(todayPT.getDate()).padStart(2, "0")}`;

  const validToday =
    (ymd === FESTIVAL_DAYS_PT.friday && /friday|2day|3day|krewe|vip|patron|ultimate|premier|artist/.test(t)) ||
    (ymd === FESTIVAL_DAYS_PT.saturday && /saturday|2day|3day|krewe|vip|patron|ultimate|premier|artist|youth|child/.test(t)) ||
    (ymd === FESTIVAL_DAYS_PT.sunday && /sunday|3day|krewe|vip|patron|ultimate|premier|artist/.test(t));

  let day: string;
  if (validToday) {
    day = ymd;
  } else if (/saturday/.test(t) && !/3day|2day/.test(t)) {
    day = FESTIVAL_DAYS_PT.saturday;
  } else if (/sunday/.test(t)) {
    day = FESTIVAL_DAYS_PT.sunday;
  } else if (/friday/.test(t)) {
    day = FESTIVAL_DAYS_PT.friday;
  } else {
    // Multi-day: surface for today if within festival window, else fallback
    if (ymd >= FESTIVAL_DAYS_PT.friday && ymd <= FESTIVAL_DAYS_PT.sunday) {
      day = ymd;
    } else {
      return fallbackIso;
    }
  }
  // Anchor at 9am PT so the pass is on the lock screen all day.
  return `${day}T09:00:00-07:00`;
}

function relevantDateForAddon(addonType: string, fallbackIso: string): string {
  const a = (addonType || "").toLowerCase();
  const todayPT = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }),
  );
  const ymd = `${todayPT.getFullYear()}-${String(todayPT.getMonth() + 1).padStart(2, "0")}-${String(todayPT.getDate()).padStart(2, "0")}`;
  if (ymd >= FESTIVAL_DAYS_PT.friday && ymd <= FESTIVAL_DAYS_PT.sunday) {
    return `${ymd}T09:00:00-07:00`;
  }
  if (a.includes("friday")) return `${FESTIVAL_DAYS_PT.friday}T17:00:00-07:00`;
  if (a.includes("wine")) return `${FESTIVAL_DAYS_PT.saturday}T13:00:00-07:00`;
  return fallbackIso;
}

// ---------- pass.json builder ----------
function buildPassJson(opts: {
  serial: string;
  holderName: string;
  ticketType: string;
  ticketTypeRaw: string;
  eventDate: string; // ISO
  venueName: string;
  venueAddress: string;
  qrPayload: string;
  orderNumber?: string;
}) {
  const theme = themeFor(opts.ticketTypeRaw);
  return {
    formatVersion: 1,
    passTypeIdentifier: PASS_TYPE_ID,
    teamIdentifier: TEAM_ID,
    organizationName: "Cosmico",
    description: `Cosmico 2026 — ${theme.label}`,
    serialNumber: opts.serial,
    backgroundColor: theme.bg,
    foregroundColor: theme.fg,
    labelColor: theme.label_color,
    
    barcodes: [
      {
        format: "PKBarcodeFormatQR",
        message: opts.qrPayload,
        messageEncoding: "iso-8859-1",
        altText: opts.serial.slice(0, 8).toUpperCase(),
      },
    ],
    locations: [
      // Wildhaven Sonoma approximate coordinates (Healdsburg, CA)
      { latitude: 38.6102, longitude: -122.8694, relevantText: "Welcome to Cosmico" },
    ],
    relevantDate: relevantDateForTicket(opts.ticketTypeRaw, opts.eventDate),
    eventTicket: {
      headerFields: [
        { key: "tier", label: "TIER", value: theme.badge },
      ],
      // No primaryFields — the strip image is the hero. Apple lays
      // secondary/auxiliary directly under the strip when primary is empty.
      primaryFields: [],
      secondaryFields: [
        { key: "name", label: "ATTENDEE", value: opts.holderName },
        {
          key: "type",
          label: "TICKET",
          value: theme.validDays ? `${theme.label} · ${theme.validDays}` : theme.label,
        },
      ],
      auxiliaryFields: [
        {
          key: "valid",
          label: "VALID",
          value: theme.validDays || "See schedule",
        },
        { key: "venue", label: "VENUE", value: opts.venueName },
      ],
      backFields: [
        { key: "valid", label: "Valid days", value: theme.validDays || "See schedule" },
        { key: "address", label: "Location", value: opts.venueAddress },
        ...(opts.orderNumber
          ? [{ key: "order", label: "Order #", value: opts.orderNumber }]
          : []),
        {
          key: "info",
          label: "Check-in",
          value:
            "Present this pass at the gate. Doors open in the afternoon. Shuttle loops run from designated lots — see example.invalid for the schedule.",
        },
        {
          key: "transfers",
          label: "Transfers",
          value:
            "Transferred your ticket? The new holder should download a fresh pass from My Tickets — old passes are voided automatically.",
        },
        { key: "support", label: "Support", value: "hello@example.invalid" },
        { key: "site", label: "Website", value: "https://example.invalid" },
      ],
    },
  };
}


// ---------- PKCS#7 signature ----------
function signManifest(manifestJson: string): Uint8Array {
  const p12Der = forge.util.createBuffer(bytesToBinary(b64ToBytes(P12_BASE64)));
  const p12Asn1 = forge.asn1.fromDer(p12Der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, P12_PASSWORD);

  // Find cert + private key
  let cert: forge.pki.Certificate | null = null;
  let key: forge.pki.PrivateKey | null = null;
  for (const safe of p12.safeContents) {
    for (const bag of safe.safeBags) {
      if (bag.type === forge.pki.oids.certBag && bag.cert) cert = bag.cert;
      if (
        (bag.type === forge.pki.oids.pkcs8ShroudedKeyBag ||
          bag.type === forge.pki.oids.keyBag) &&
        bag.key
      )
        key = bag.key;
    }
  }
  if (!cert || !key) throw new Error("p12 missing cert or key");

  const wwdrPem = new TextDecoder().decode(b64ToBytes(WWDR_PEM_B64));
  const wwdr = forge.pki.certificateFromPem(wwdrPem);

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifestJson, "utf8");
  p7.addCertificate(cert);
  p7.addCertificate(wwdr);
  p7.addSigner({
    key: key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  p7.sign({ detached: true });

  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  const out = new Uint8Array(der.length);
  for (let i = 0; i < der.length; i++) out[i] = der.charCodeAt(i) & 0xff;
  return out;
}

// ---------- main handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const ticketId = url.searchParams.get("ticket_id");
    const addonPurchaseId = url.searchParams.get("addon_purchase_id");
    const addonIndex = parseInt(url.searchParams.get("index") || "1", 10);

    if (!ticketId && !addonPurchaseId) {
      return new Response(JSON.stringify({ error: "ticket_id or addon_purchase_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Branch: add-on pass
    if (addonPurchaseId) {
      const { data: addon, error: aErr } = await supabase
        .from("addon_purchases")
        .select("id, quantity, registration_id, payment_status, addon_inventory:inventory_id(display_name, addon_type, description)")
        .eq("id", addonPurchaseId)
        .maybeSingle();

      if (aErr || !addon) {
        return new Response(JSON.stringify({ error: "add-on not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!["paid", "payment_plan"].includes(addon.payment_status)) {
        return new Response(
          JSON.stringify({ error: `add-on status is ${addon.payment_status}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const inv: any = addon.addon_inventory;
      const addonType = inv?.addon_type || "";
      const theme = themeForAddon(addonType);

      // Look up event + holder name from registration
      const { data: reg } = await supabase
        .from("registrations")
        .select("name, order_number, event_id")
        .eq("id", addon.registration_id)
        .maybeSingle();

      const { data: event } = await supabase
        .from("event_details")
        .select("event_date, event_time, venue_name, venue_address")
        .eq("id", reg?.event_id || "")
        .maybeSingle();

      const isoDate = `${event?.event_date ?? "2026-05-15"}T${event?.event_time ?? "16:00:00"}-07:00`;
      const safeIndex = Math.max(1, Math.min(addonIndex, addon.quantity));
      const serial = `${addon.id}-${safeIndex}`;
      const labelWithIndex = addon.quantity > 1
        ? `${inv?.display_name || theme.label} · ${safeIndex} of ${addon.quantity}`
        : (inv?.display_name || theme.label);

      const passJson = {
        formatVersion: 1,
        passTypeIdentifier: PASS_TYPE_ID,
        teamIdentifier: TEAM_ID,
        organizationName: "Cosmico",
        description: `Cosmico 2026 — ${theme.label}`,
        serialNumber: serial,
        backgroundColor: theme.bg,
        foregroundColor: theme.fg,
        labelColor: theme.label_color,
        barcodes: [{
          format: "PKBarcodeFormatQR",
          message: `addon:${addon.id}:${safeIndex}`,
          messageEncoding: "iso-8859-1",
          altText: serial.slice(0, 12).toUpperCase(),
        }],
        locations: [{ latitude: 38.6102, longitude: -122.8694, relevantText: theme.label }],
        relevantDate: relevantDateForAddon(addonType, isoDate),
        eventTicket: {
          headerFields: [{ key: "kind", label: "ADD-ON", value: theme.badge }],
          primaryFields: [],
          secondaryFields: [
            { key: "name", label: "ATTENDEE", value: reg?.name || "Guest" },
            { key: "type", label: "ADD-ON", value: theme.validDays ? `${labelWithIndex} · ${theme.validDays}` : labelWithIndex },
          ],
          auxiliaryFields: [
            { key: "when", label: "WHEN", value: theme.validDays || "See schedule" },
            { key: "venue", label: "VENUE", value: event?.venue_name || "Wildhaven Sonoma" },
          ],
          backFields: [
            { key: "info", label: "Check-in", value: "Show this pass at the add-on station — one scan per item." },
            ...(inv?.description ? [{ key: "desc", label: "Details", value: inv.description }] : []),
            ...(reg?.order_number ? [{ key: "order", label: "Order #", value: reg.order_number }] : []),
            { key: "support", label: "Support", value: "hello@example.invalid" },
            { key: "site", label: "Website", value: "https://example.invalid" },
          ],
        },
      };

      const enc = new TextEncoder();
      const passBytes = enc.encode(JSON.stringify(passJson));
      const files: Record<string, Uint8Array> = { "pass.json": passBytes };
      for (const [name, b64] of Object.entries(PASS_IMAGES)) files[name] = b64ToBytes(b64);
      const manifest: Record<string, string> = {};
      for (const [name, bytes] of Object.entries(files)) manifest[name] = await sha1Hex(bytes);
      const manifestJson = JSON.stringify(manifest);
      const manifestBytes = enc.encode(manifestJson);
      const signature = signManifest(manifestJson);
      const zip = new JSZip();
      for (const [name, bytes] of Object.entries(files)) zip.file(name, bytes);
      zip.file("manifest.json", manifestBytes);
      zip.file("signature", signature);
      const pkpass = await zip.generateAsync({ type: "uint8array" });
      return new Response(pkpass, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/vnd.apple.pkpass",
          "Content-Disposition": `attachment; filename="analog-addon-${addon.id.slice(0, 8)}-${safeIndex}.pkpass"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // Branch: ticket pass (existing behavior)
    const { data: ticket, error: tErr } = await supabase
      .from("tickets")
      .select(
        "id, holder_name, holder_email, owner_email, ticket_type, status, event_id, registration_id",
      )
      .eq("id", ticketId)
      .maybeSingle();

    if (tErr || !ticket) {
      return new Response(JSON.stringify({ error: "ticket not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (ticket.status !== "active") {
      return new Response(
        JSON.stringify({ error: `ticket status is ${ticket.status}` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: event } = await supabase
      .from("event_details")
      .select("event_date, event_time, venue_name, venue_address, title")
      .eq("id", ticket.event_id)
      .maybeSingle();

    let orderNumber: string | undefined;
    if (ticket.registration_id) {
      const { data: reg } = await supabase
        .from("registrations")
        .select("order_number")
        .eq("id", ticket.registration_id)
        .maybeSingle();
      orderNumber = reg?.order_number ?? undefined;
    }

    const isoDate = `${event?.event_date ?? "2026-05-15"}T${
      event?.event_time ?? "16:00:00"
    }-07:00`;

    const passJson = buildPassJson({
      serial: ticket.id,
      holderName: ticket.holder_name || "Guest",
      ticketType: ticket.ticket_type || "General",
      ticketTypeRaw: ticket.ticket_type || "",
      eventDate: isoDate,
      venueName: event?.venue_name || "Wildhaven Sonoma",
      venueAddress: event?.venue_address || "Near Healdsburg, CA",
      qrPayload: ticket.id,
      orderNumber,
    });

    const enc = new TextEncoder();
    const passBytes = enc.encode(JSON.stringify(passJson));

    const files: Record<string, Uint8Array> = {
      "pass.json": passBytes,
    };
    for (const [name, b64] of Object.entries(PASS_IMAGES)) {
      files[name] = b64ToBytes(b64);
    }

    const manifest: Record<string, string> = {};
    for (const [name, bytes] of Object.entries(files)) {
      manifest[name] = await sha1Hex(bytes);
    }
    const manifestJson = JSON.stringify(manifest);
    const manifestBytes = enc.encode(manifestJson);

    const signature = signManifest(manifestJson);

    const zip = new JSZip();
    for (const [name, bytes] of Object.entries(files)) {
      zip.file(name, bytes);
    }
    zip.file("manifest.json", manifestBytes);
    zip.file("signature", signature);

    const pkpass = await zip.generateAsync({ type: "uint8array" });

    return new Response(pkpass, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/vnd.apple.pkpass",
        "Content-Disposition": `attachment; filename="analog-reunion-${ticket.id.slice(0, 8)}.pkpass"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("pkpass error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
