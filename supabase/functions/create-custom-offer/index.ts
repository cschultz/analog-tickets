import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OfferItem {
  item_type: "ticket" | "lodging" | "addon";
  ticket_type?: string;
  lodging_inventory_id?: string;
  accommodation_unit_id?: string;
  addon_inventory_id?: string;
  zone_key?: string;
  quantity: number;
  unit_price: number;
}

interface CreateOfferRequest {
  event_id: string;
  recipient_email: string;
  recipient_name?: string;
  custom_message?: string;
  discount_type: "percentage" | "fixed" | "none";
  discount_value: number;
  expires_at?: string;
  items: OfferItem[];
  // New lodging offer fields
  offer_type?: "standard" | "lodging_only" | "ticket_plus_lodging";
  max_redemptions?: number;
  requires_existing_ticket?: boolean;
  notes?: string;
}

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CREATE-CUSTOM-OFFER] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    // Verify admin auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Authentication failed");

    // Check admin role
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) throw new Error("Admin access required");
    logStep("Admin verified", { userId: userData.user.id });

    const body: CreateOfferRequest = await req.json();
    logStep("Request body", body);

    // Validate items
    if (!body.items || body.items.length === 0) {
      throw new Error("At least one item is required");
    }

    // Calculate totals
    let subtotal = 0;
    for (const item of body.items) {
      subtotal += item.unit_price * item.quantity;
    }

    let discountAmount = 0;
    if (body.discount_type === "percentage" && body.discount_value > 0) {
      discountAmount = Math.round(subtotal * (body.discount_value / 100));
    } else if (body.discount_type === "fixed" && body.discount_value > 0) {
      discountAmount = body.discount_value;
    }

    const totalAmount = Math.max(0, subtotal - discountAmount);

    // Generate unique token
    const offerToken = crypto.randomUUID().replace(/-/g, "");
    
    // Use custom expiration date if provided, otherwise default to 7 days
    let expiresAt: Date;
    if (body.expires_at) {
      expiresAt = new Date(body.expires_at);
      // Ensure expiration is at least in the future
      if (expiresAt <= new Date()) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
      }
    } else {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
    }

    logStep("Calculated totals", { subtotal, discountAmount, totalAmount });

    const normalizedItems: OfferItem[] = [];

    // Reserve inventory for each item. Room-level lodging is the source of truth for custom offers;
    // zone counters can intentionally be lower for public sales and should not block admin offers.
    for (const item of body.items) {
      // Hard guard: a lodging line MUST be tied to a specific unit, zone, or legacy inventory row.
      // A "generic" lodging line with no binding silently fails to allocate at accept time and
      // leaves the recipient without a tent (see Alba incident, May 2026). Reject it up front.
      if (item.item_type === "lodging" &&
          !item.accommodation_unit_id &&
          !item.zone_key &&
          !item.lodging_inventory_id) {
        throw new Error(
          "Each lodging line must have a tent/cabin or zone selected. " +
          "Pick a specific unit or a zone before sending the offer."
        );
      }

      if (item.item_type === "ticket" && item.ticket_type) {
        const { data: inventory, error: invError } = await supabaseAdmin
          .from("ticket_inventory")
          .select("total_quantity, sold_quantity")
          .eq("ticket_type", item.ticket_type)
          .eq("event_id", body.event_id)
          .single();

        if (invError || !inventory) {
          throw new Error(`Ticket type ${item.ticket_type} not found`);
        }

        const available = inventory.total_quantity - inventory.sold_quantity;
        if (available < item.quantity) {
          throw new Error(`Not enough ${item.ticket_type} tickets available (${available} left)`);
        }

        // Reserve tickets
        const { error: updateError } = await supabaseAdmin
          .from("ticket_inventory")
          .update({ sold_quantity: inventory.sold_quantity + item.quantity })
          .eq("ticket_type", item.ticket_type)
          .eq("event_id", body.event_id);

        if (updateError) throw updateError;
        logStep("Reserved tickets", { ticket_type: item.ticket_type, quantity: item.quantity });
        normalizedItems.push(item);
      }

      if (item.item_type === "lodging" && item.accommodation_unit_id) {
        const { data: unit, error: unitError } = await supabaseAdmin
          .from("accommodation_units")
          .update({ inventory_status: "pending_offer" })
          .eq("id", item.accommodation_unit_id)
          .eq("inventory_status", "available")
          .select("id, unit_name")
          .single();

        if (unitError || !unit) {
          throw new Error("Selected lodging room is no longer available");
        }
        logStep("Reserved specific lodging unit", { id: item.accommodation_unit_id, unit_name: unit.unit_name });
        normalizedItems.push({ ...item, quantity: 1 });
      } else if (item.item_type === "lodging" && item.zone_key) {
        const { data: availableUnits, error: unitsError } = await supabaseAdmin
          .from("accommodation_units")
          .select("id, unit_name, night_price")
          .eq("zone_key", item.zone_key)
          .eq("inventory_status", "available")
          .order("unit_name", { ascending: true })
          .limit(item.quantity);

        if (unitsError) throw unitsError;

        if ((availableUnits?.length || 0) >= item.quantity) {
          const unitIds = availableUnits!.map((unit: any) => unit.id);
          const { data: reservedUnits, error: reserveUnitsError } = await supabaseAdmin
            .from("accommodation_units")
            .update({ inventory_status: "pending_offer" })
            .in("id", unitIds)
            .eq("inventory_status", "available")
            .select("id, unit_name, night_price");

          if (reserveUnitsError) throw reserveUnitsError;
          if ((reservedUnits?.length || 0) < item.quantity) {
            throw new Error(`Not enough ${item.zone_key} lodging available`);
          }

          for (const unit of reservedUnits || []) {
            normalizedItems.push({
              ...item,
              accommodation_unit_id: unit.id,
              quantity: 1,
              unit_price: item.unit_price || ((unit as any).night_price ?? 0) * 2,
            });
          }
          logStep("Reserved zone lodging as specific rooms", { zone_key: item.zone_key, quantity: item.quantity });
        } else {
          const success = await supabaseAdmin.rpc("decrement_zone_inventory", {
            p_zone_key: item.zone_key,
            p_quantity: item.quantity,
          });

          if (!success.data) {
            throw new Error(`Not enough ${item.zone_key} lodging available`);
          }
          normalizedItems.push(item);
          logStep("Reserved zone lodging", { zone_key: item.zone_key, quantity: item.quantity });
        }
      } else if (item.item_type === "lodging" && item.lodging_inventory_id) {
        // Legacy: lodging_inventory based
        const { data: lodging, error: lodgingError } = await supabaseAdmin
          .from("lodging_inventory")
          .select("total_quantity, sold_quantity, display_name")
          .eq("id", item.lodging_inventory_id)
          .single();

        if (lodgingError || !lodging) {
          throw new Error("Lodging not found");
        }

        const available = lodging.total_quantity - lodging.sold_quantity;
        if (available < item.quantity) {
          throw new Error(`Not enough ${lodging.display_name} available (${available} left)`);
        }

        const { error: updateError } = await supabaseAdmin
          .from("lodging_inventory")
          .update({ sold_quantity: lodging.sold_quantity + item.quantity })
          .eq("id", item.lodging_inventory_id);

        if (updateError) throw updateError;
        logStep("Reserved lodging", { id: item.lodging_inventory_id, quantity: item.quantity });
        normalizedItems.push(item);
      }

      if (item.item_type === "addon" && item.addon_inventory_id) {
        const { data: addon, error: addonError } = await supabaseAdmin
          .from("addon_inventory")
          .select("total_quantity, sold_quantity, display_name")
          .eq("id", item.addon_inventory_id)
          .single();

        if (addonError || !addon) {
          throw new Error("Add-on not found");
        }

        const available = addon.total_quantity - addon.sold_quantity;
        if (available < item.quantity) {
          throw new Error(`Not enough ${addon.display_name} available (${available} left)`);
        }

        const { error: updateError } = await supabaseAdmin
          .from("addon_inventory")
          .update({ sold_quantity: addon.sold_quantity + item.quantity })
          .eq("id", item.addon_inventory_id);

        if (updateError) throw updateError;
        logStep("Reserved addon", { id: item.addon_inventory_id, quantity: item.quantity });
        normalizedItems.push(item);
      }
    }

    // Create the offer
    const { data: offer, error: offerError } = await supabaseAdmin
      .from("custom_offers")
      .insert({
        event_id: body.event_id,
        recipient_email: body.recipient_email.toLowerCase().trim(),
        recipient_name: body.recipient_name?.trim() || null,
        custom_message: body.custom_message?.trim() || null,
        discount_type: body.discount_type,
        discount_value: body.discount_value,
        subtotal,
        discount_amount: discountAmount,
        total_amount: totalAmount,
        offer_token: offerToken,
        expires_at: expiresAt.toISOString(),
        created_by: userData.user.id,
        // New lodging offer fields
        offer_type: body.offer_type || "standard",
        max_redemptions: body.max_redemptions || 1,
        redemptions_used: 0,
        requires_existing_ticket: body.requires_existing_ticket || false,
        notes: body.notes || null,
      })
      .select()
      .single();

    if (offerError) throw offerError;
    logStep("Offer created", { offerId: offer.id });

    // Create offer items
    const offerItems = normalizedItems.map((item) => ({
      offer_id: offer.id,
      item_type: item.item_type,
      ticket_type: item.ticket_type || null,
      lodging_inventory_id: item.lodging_inventory_id || null,
      accommodation_unit_id: item.accommodation_unit_id || null,
      addon_inventory_id: item.addon_inventory_id || null,
      zone_key: item.zone_key || null,
      quantity: item.quantity,
      unit_price: item.unit_price,
    }));

    const { error: itemsError } = await supabaseAdmin
      .from("custom_offer_items")
      .insert(offerItems);

    if (itemsError) throw itemsError;
    logStep("Offer items created", { count: offerItems.length });

    // Send email
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey) {
      const resend = new Resend(resendKey);
      const siteUrl = Deno.env.get("SITE_URL") || req.headers.get("origin") || "https://example.invalid";
      const offerUrl = `${siteUrl}/offer/${offerToken}`;

      // Build items list for email
      let itemsHtml = "";
      for (const item of body.items) {
        let itemName = "";
        if (item.item_type === "ticket") {
          itemName = item.ticket_type?.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") || "Ticket";
        } else if (item.item_type === "lodging" && item.accommodation_unit_id) {
          const { data: u } = await supabaseAdmin
            .from("accommodation_units")
            .select("unit_name, product_type, bed_configuration")
            .eq("id", item.accommodation_unit_id)
            .single();
          itemName = u ? `${u.product_type === "cabin" ? "Cabin" : "Tent"} ${u.unit_name} — ${u.bed_configuration}` : "Lodging Room";
        } else if (item.item_type === "lodging" && item.zone_key) {
          const { data: z } = await supabaseAdmin
            .from("accommodation_zones")
            .select("zone_name")
            .eq("zone_key", item.zone_key)
            .single();
          itemName = z?.zone_name || "Lodging";
        } else if (item.item_type === "lodging" && item.lodging_inventory_id) {
          const { data: l } = await supabaseAdmin
            .from("lodging_inventory")
            .select("display_name")
            .eq("id", item.lodging_inventory_id)
            .single();
          itemName = l?.display_name || "Lodging";
        } else if (item.item_type === "addon" && item.addon_inventory_id) {
          const { data: a } = await supabaseAdmin
            .from("addon_inventory")
            .select("display_name")
            .eq("id", item.addon_inventory_id)
            .single();
          itemName = a?.display_name || "Add-on";
        }
        itemsHtml += `<li>${item.quantity}x ${itemName} - $${(item.unit_price * item.quantity / 100).toFixed(2)}</li>`;
      }

      const emailHtml = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1a1a1a;">You've Received a Custom Offer!</h1>
          ${body.recipient_name ? `<p>Hi ${body.recipient_name},</p>` : "<p>Hi there,</p>"}
          ${body.custom_message ? `<p style="font-style: italic; color: #666;">"${body.custom_message}"</p>` : ""}
          <p>We've put together a special package just for you for Cosmico 2026:</p>
          <ul style="background: #f5f5f5; padding: 20px 40px; border-radius: 8px;">
            ${itemsHtml}
          </ul>
          <div style="background: #f5f5f5; padding: 15px 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Subtotal:</strong> $${(subtotal / 100).toFixed(2)}</p>
            ${discountAmount > 0 ? `<p style="margin: 5px 0; color: #16a34a;"><strong>Discount:</strong> -$${(discountAmount / 100).toFixed(2)}</p>` : ""}
            <p style="margin: 5px 0; font-size: 18px;"><strong>Total:</strong> $${(totalAmount / 100).toFixed(2)}</p>
          </div>
          <p style="color: #dc2626;"><strong>This offer expires on ${expiresAt.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/Los_Angeles" })}.</strong></p>
          <a href="${offerUrl}" style="display: inline-block; background: #1a1a1a; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 20px 0;">Review & Accept Offer</a>
          <p style="color: #666; font-size: 14px;">If you have any questions, just reply to this email.</p>
          <p>✌️&❤️,<br>The Cosmico Team</p>
        </div>
      `;

      try {
        await resend.emails.send({
          from: "The Cosmico Team <hello@example.invalid>",
          to: [body.recipient_email],
          subject: `Your Custom Cosmico 2026 Package${body.recipient_name ? `, ${body.recipient_name}` : ""}`,
          html: emailHtml,
        });
        logStep("Email sent successfully");
      } catch (emailError) {
        console.error("Email error:", emailError);
        // Don't fail the whole request if email fails
      }
    }

    return new Response(
      JSON.stringify({ success: true, offer_id: offer.id, offer_token: offerToken }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    logStep("ERROR", { message: error.message });
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
