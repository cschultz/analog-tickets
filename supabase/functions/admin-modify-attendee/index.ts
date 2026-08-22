import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: any) => {
  console.log(
    `[ADMIN-MODIFY-ATTENDEE] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`,
  );
};

type Action =
  | "change_ticket_type"
  | "change_quantity"
  | "transfer_email"
  | "add_addon_comp"
  | "send_addon_payment_link"
  | "send_ticket_change_payment_link"
  | "remove_addon"
  | "update_addon_dietary";

interface RequestBody {
  action: Action;
  registration_id: string;
  // change_ticket_type / send_ticket_change_payment_link
  new_ticket_type?: string;
  // change_quantity
  new_quantity?: number;
  // transfer_email
  new_email?: string;
  new_name?: string;
  // addon actions
  addon_inventory_id?: string;
  addon_quantity?: number;
  addon_purchase_id?: string;
  has_dietary_restrictions?: boolean;
  dietary_restrictions?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // Verify admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonError("Missing authorization", 401);
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAdmin.auth
      .getUser(token);
    if (userError || !user) {
      return jsonError("Unauthorized", 401);
    }

    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) {
      return jsonError("Admin access required", 403);
    }

    const body: RequestBody = await req.json();
    log("Action received", { action: body.action, reg: body.registration_id });

    if (!body.action || !body.registration_id) {
      return jsonError("Missing action or registration_id", 400);
    }

    const { data: registration, error: regError } = await supabaseAdmin
      .from("registrations")
      .select("*")
      .eq("id", body.registration_id)
      .single();

    if (regError || !registration) {
      return jsonError("Registration not found", 404);
    }

    const adminEmail = user.email ?? "unknown";

    switch (body.action) {
      case "change_ticket_type":
        return await changeTicketType(
          supabaseAdmin,
          registration,
          body.new_ticket_type!,
          user.id,
          adminEmail,
        );
      case "change_quantity":
        return await changeQuantity(
          supabaseAdmin,
          registration,
          body.new_quantity!,
          user.id,
          adminEmail,
        );
      case "transfer_email":
        return await transferEmail(
          supabaseAdmin,
          registration,
          body.new_email!,
          body.new_name,
          user.id,
          adminEmail,
        );
      case "add_addon_comp":
        return await addAddonComp(
          supabaseAdmin,
          registration,
          body.addon_inventory_id!,
          body.addon_quantity ?? 1,
          user.id,
          adminEmail,
        );
      case "send_addon_payment_link":
        return await sendAddonPaymentLink(
          supabaseAdmin,
          req,
          registration,
          body.addon_inventory_id!,
          body.addon_quantity ?? 1,
        );
      case "send_ticket_change_payment_link":
        return await sendTicketChangePaymentLink(
          supabaseAdmin,
          req,
          registration,
          body.new_ticket_type!,
        );
      case "remove_addon":
        return await removeAddon(
          supabaseAdmin,
          registration,
          body.addon_purchase_id!,
          user.id,
          adminEmail,
        );
      case "update_addon_dietary":
        return await updateAddonDietary(
          supabaseAdmin,
          body.addon_purchase_id!,
          body.has_dietary_restrictions ?? false,
          body.dietary_restrictions ?? null,
          user.id,
          adminEmail,
        );
      default:
        return jsonError("Unknown action", 400);
    }
  } catch (err: any) {
    console.error("[ADMIN-MODIFY-ATTENDEE] Error:", err);
    return jsonError(err.message || "Internal error", 500);
  }
});

function jsonOk(data: any) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function logAudit(
  supabase: any,
  adminId: string,
  adminEmail: string,
  action: string,
  registration: any,
  oldValue: any,
  newValue: any,
  metadata?: any,
) {
  try {
    await supabase.rpc("log_admin_action", {
      p_admin_user_id: adminId,
      p_admin_email: adminEmail,
      p_action: action,
      p_entity_type: "registration",
      p_entity_id: registration.id,
      p_entity_name: registration.name,
      p_old_value: oldValue ?? null,
      p_new_value: newValue ?? null,
      p_metadata: metadata ?? null,
    });
  } catch (e) {
    console.error("[ADMIN-MODIFY-ATTENDEE] Audit log failed:", e);
  }
}

async function changeTicketType(
  supabase: any,
  registration: any,
  newTicketType: string,
  adminId: string,
  adminEmail: string,
) {
  if (newTicketType === registration.ticket_type) {
    return jsonError("New ticket type matches existing", 400);
  }

  const { data: newType, error: typeErr } = await supabase
    .from("ticket_types")
    .select("key, label, price")
    .eq("key", newTicketType)
    .maybeSingle();
  if (typeErr || !newType) {
    return jsonError("Ticket type not found", 404);
  }

  const qty = registration.quantity || 1;
  const newTotal = newType.price * qty;
  const oldTicketType = registration.ticket_type;
  const oldTotal = registration.total_amount;
  const priceDelta = newTotal - oldTotal;
  // Track uncharged upgrade delta so reports can separate face value vs collected
  const prevCompUpgrade = registration.comp_upgrade_amount || 0;
  const newCompUpgrade = Math.max(0, prevCompUpgrade + priceDelta);

  // Adjust ticket_inventory if paid
  if (registration.payment_status === "paid") {
    // Reserve from new type first (atomic check)
    const { data: ok } = await supabase.rpc("reserve_tickets", {
      p_ticket_type: newTicketType,
      p_quantity: qty,
    });
    if (!ok) return jsonError("Insufficient inventory for new ticket type", 409);

    // Release from old type
    const { data: oldInv } = await supabase
      .from("ticket_inventory")
      .select("id, sold_quantity")
      .eq("ticket_type", oldTicketType)
      .eq("event_id", registration.event_id)
      .maybeSingle();
    if (oldInv) {
      await supabase
        .from("ticket_inventory")
        .update({ sold_quantity: Math.max(0, oldInv.sold_quantity - qty) })
        .eq("id", oldInv.id);
    }
  }

  const { error: updErr } = await supabase
    .from("registrations")
    .update({
      ticket_type: newTicketType,
      total_amount: newTotal,
      comp_upgrade_amount: newCompUpgrade,
      updated_at: new Date().toISOString(),
    })
    .eq("id", registration.id);

  if (updErr) return jsonError(updErr.message, 500);

  // Update tickets table
  await supabase
    .from("tickets")
    .update({
      ticket_type: newTicketType,
      unit_price: newType.price,
      updated_at: new Date().toISOString(),
    })
    .eq("registration_id", registration.id);

  await logAudit(
    supabase,
    adminId,
    adminEmail,
    "change_ticket_type_comp",
    registration,
    { ticket_type: oldTicketType, total_amount: oldTotal, comp_upgrade_amount: prevCompUpgrade },
    { ticket_type: newTicketType, total_amount: newTotal, comp_upgrade_amount: newCompUpgrade },
    { quantity: qty, charge_collected: false, comp_delta: priceDelta },
  );

  return jsonOk({ success: true, new_total: newTotal, comp_upgrade_amount: newCompUpgrade });
}


async function changeQuantity(
  supabase: any,
  registration: any,
  newQuantity: number,
  adminId: string,
  adminEmail: string,
) {
  if (!newQuantity || newQuantity < 1 || newQuantity > 50) {
    return jsonError("Quantity must be between 1 and 50", 400);
  }
  const oldQuantity = registration.quantity || 1;
  if (newQuantity === oldQuantity) {
    return jsonError("Quantity unchanged", 400);
  }

  const { data: ticketType } = await supabase
    .from("ticket_types")
    .select("price")
    .eq("key", registration.ticket_type)
    .maybeSingle();

  const unitPrice = ticketType?.price ?? Math.floor(registration.total_amount / oldQuantity);
  const newTotal = unitPrice * newQuantity;
  const delta = newQuantity - oldQuantity;

  if (registration.payment_status === "paid") {
    if (delta > 0) {
      const { data: ok } = await supabase.rpc("reserve_tickets", {
        p_ticket_type: registration.ticket_type,
        p_quantity: delta,
      });
      if (!ok) return jsonError("Insufficient inventory", 409);
    } else {
      // Release
      const { data: inv } = await supabase
        .from("ticket_inventory")
        .select("id, sold_quantity")
        .eq("ticket_type", registration.ticket_type)
        .eq("event_id", registration.event_id)
        .maybeSingle();
      if (inv) {
        await supabase
          .from("ticket_inventory")
          .update({
            sold_quantity: Math.max(0, inv.sold_quantity + delta),
          })
          .eq("id", inv.id);
      }
    }
  }

  const { error: updErr } = await supabase
    .from("registrations")
    .update({
      quantity: newQuantity,
      total_amount: newTotal,
      updated_at: new Date().toISOString(),
    })
    .eq("id", registration.id);
  if (updErr) return jsonError(updErr.message, 500);

  // Sync tickets table - add or remove tickets
  if (delta > 0) {
    const newTickets = Array.from({ length: delta }).map(() => ({
      registration_id: registration.id,
      event_id: registration.event_id,
      holder_name: registration.name,
      holder_email: registration.email,
      owner_email: registration.email,
      original_purchaser_email: registration.email,
      ticket_type: registration.ticket_type,
      unit_price: unitPrice,
      status: "active",
    }));
    await supabase.from("tickets").insert(newTickets);
  } else {
    const { data: removable } = await supabase
      .from("tickets")
      .select("id")
      .eq("registration_id", registration.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(Math.abs(delta));
    if (removable?.length) {
      await supabase
        .from("tickets")
        .update({ status: "cancelled" })
        .in("id", removable.map((t: any) => t.id));
    }
  }

  await logAudit(
    supabase,
    adminId,
    adminEmail,
    "change_quantity",
    registration,
    { quantity: oldQuantity, total_amount: registration.total_amount },
    { quantity: newQuantity, total_amount: newTotal },
    { delta },
  );

  return jsonOk({ success: true, new_total: newTotal, delta });
}

async function transferEmail(
  supabase: any,
  registration: any,
  newEmail: string,
  newName: string | undefined,
  adminId: string,
  adminEmail: string,
) {
  const cleaned = newEmail.trim().toLowerCase();
  if (!cleaned || !cleaned.includes("@")) {
    return jsonError("Invalid email", 400);
  }

  const updates: any = {
    email: cleaned,
    updated_at: new Date().toISOString(),
  };
  if (newName) updates.name = newName;

  const { error: updErr } = await supabase
    .from("registrations")
    .update(updates)
    .eq("id", registration.id);
  if (updErr) return jsonError(updErr.message, 500);

  await supabase
    .from("tickets")
    .update({
      holder_email: cleaned,
      owner_email: cleaned,
      ...(newName ? { holder_name: newName } : {}),
    })
    .eq("registration_id", registration.id);

  await supabase
    .from("addon_purchases")
    .update({ purchaser_email: cleaned })
    .eq("registration_id", registration.id);

  await logAudit(
    supabase,
    adminId,
    adminEmail,
    "transfer_email",
    registration,
    { email: registration.email, name: registration.name },
    { email: cleaned, name: newName ?? registration.name },
  );

  return jsonOk({ success: true });
}

async function addAddonComp(
  supabase: any,
  registration: any,
  addonId: string,
  quantity: number,
  adminId: string,
  adminEmail: string,
) {
  if (quantity < 1 || quantity > 20) {
    return jsonError("Quantity must be between 1 and 20", 400);
  }
  const { data: addon, error: addonErr } = await supabase
    .from("addon_inventory")
    .select("*")
    .eq("id", addonId)
    .maybeSingle();
  if (addonErr || !addon) return jsonError("Add-on not found", 404);

  const available = addon.total_quantity - addon.sold_quantity;
  if (available < quantity) return jsonError("Insufficient add-on inventory", 409);

  const { data: inserted, error: insErr } = await supabase
    .from("addon_purchases")
    .insert({
      registration_id: registration.id,
      purchase_type: "addon",
      inventory_id: addon.id,
      quantity,
      unit_price: 0,
      total_amount: 0,
      payment_status: "paid",
      purchaser_email: registration.email,
    })
    .select()
    .single();
  if (insErr) return jsonError(insErr.message, 500);

  await supabase
    .from("addon_inventory")
    .update({ sold_quantity: addon.sold_quantity + quantity })
    .eq("id", addon.id);

  await logAudit(
    supabase,
    adminId,
    adminEmail,
    "add_addon_comp",
    registration,
    null,
    { addon: addon.display_name, quantity, total_amount: 0 },
    { addon_purchase_id: inserted.id, comped: true, original_price: addon.price },
  );

  return jsonOk({ success: true, addon_purchase: inserted });
}

async function removeAddon(
  supabase: any,
  registration: any,
  addonPurchaseId: string,
  adminId: string,
  adminEmail: string,
) {
  const { data: purchase, error: pErr } = await supabase
    .from("addon_purchases")
    .select("*, addon_inventory:inventory_id(id, display_name, sold_quantity)")
    .eq("id", addonPurchaseId)
    .eq("registration_id", registration.id)
    .maybeSingle();
  if (pErr || !purchase) return jsonError("Add-on purchase not found", 404);

  const { error: delErr } = await supabase
    .from("addon_purchases")
    .delete()
    .eq("id", addonPurchaseId);
  if (delErr) return jsonError(delErr.message, 500);

  if (purchase.addon_inventory) {
    await supabase
      .from("addon_inventory")
      .update({
        sold_quantity: Math.max(
          0,
          purchase.addon_inventory.sold_quantity - purchase.quantity,
        ),
      })
      .eq("id", purchase.addon_inventory.id);
  }

  await logAudit(
    supabase,
    adminId,
    adminEmail,
    "remove_addon",
    registration,
    {
      addon: purchase.addon_inventory?.display_name,
      quantity: purchase.quantity,
      total_amount: purchase.total_amount,
    },
    null,
  );

  return jsonOk({ success: true });
}

async function updateAddonDietary(
  supabase: any,
  addonPurchaseId: string,
  hasRestrictions: boolean,
  restrictions: string | null,
  adminId: string,
  adminEmail: string,
) {
  const { data: existing } = await supabase
    .from("addon_purchases")
    .select("id, registration_id, has_dietary_restrictions, dietary_restrictions")
    .eq("id", addonPurchaseId)
    .maybeSingle();
  if (!existing) return jsonError("Add-on purchase not found", 404);

  const { error: updErr } = await supabase
    .from("addon_purchases")
    .update({
      has_dietary_restrictions: hasRestrictions,
      dietary_restrictions: hasRestrictions ? restrictions : null,
    })
    .eq("id", addonPurchaseId);
  if (updErr) return jsonError(updErr.message, 500);

  await logAudit(
    supabase,
    adminId,
    adminEmail,
    "update_addon_dietary",
    { id: existing.registration_id, name: "" },
    {
      has_dietary_restrictions: existing.has_dietary_restrictions,
      dietary_restrictions: existing.dietary_restrictions,
    },
    {
      has_dietary_restrictions: hasRestrictions,
      dietary_restrictions: restrictions,
    },
    { addon_purchase_id: addonPurchaseId },
  );

  return jsonOk({ success: true });
}

async function sendTicketChangePaymentLink(
  supabase: any,
  req: Request,
  registration: any,
  newTicketType: string,
) {
  const { data: newType } = await supabase
    .from("ticket_types")
    .select("key, label, price, stripe_price_id")
    .eq("key", newTicketType)
    .maybeSingle();
  if (!newType) return jsonError("Ticket type not found", 404);

  const qty = registration.quantity || 1;
  const newTotal = newType.price * qty;
  const diff = newTotal - registration.total_amount;
  if (diff <= 0) return jsonError("Price difference must be positive to send link", 400);

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
    apiVersion: "2025-08-27.basil",
  });

  const origin = req.headers.get("origin") ?? "https://example.invalid";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: registration.email,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `Cosmico — Ticket Change to ${newType.label}`,
            description: `Upgrade ${qty} ticket(s) from current type to ${newType.label}`,
          },
          unit_amount: diff,
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      description: `Cosmico ticket change for registration ${registration.id}`,
      metadata: {
        action: "admin_ticket_change",
        registration_id: registration.id,
        from_ticket_type: registration.ticket_type,
        to_ticket_type: newTicketType,
        quantity: String(qty),
      },
    },
    metadata: {
      action: "admin_ticket_change",
      registration_id: registration.id,
      from_ticket_type: registration.ticket_type,
      to_ticket_type: newTicketType,
    },
    success_url: `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/admin/registrations`,
  });

  return jsonOk({ success: true, url: session.url });
}

async function sendAddonPaymentLink(
  supabase: any,
  req: Request,
  registration: any,
  addonId: string,
  quantity: number,
) {
  const { data: addon } = await supabase
    .from("addon_inventory")
    .select("*")
    .eq("id", addonId)
    .maybeSingle();
  if (!addon) return jsonError("Add-on not found", 404);
  if (quantity < 1 || quantity > 20) return jsonError("Invalid quantity", 400);

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
    apiVersion: "2025-08-27.basil",
  });

  const origin = req.headers.get("origin") ?? "https://example.invalid";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: registration.email,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `Cosmico — ${addon.display_name}`,
          },
          unit_amount: addon.price,
        },
        quantity,
      },
    ],
    payment_intent_data: {
      description: `Cosmico add-on for registration ${registration.id}`,
      metadata: {
        action: "admin_addon_addition",
        registration_id: registration.id,
        addon_inventory_id: addon.id,
        addon_type: addon.addon_type,
        quantity: String(quantity),
      },
    },
    metadata: {
      action: "admin_addon_addition",
      registration_id: registration.id,
      addon_inventory_id: addon.id,
    },
    success_url: `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/admin/registrations`,
  });

  return jsonOk({ success: true, url: session.url });
}
