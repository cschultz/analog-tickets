import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  code?: string;
  email?: string;
  ticket_type?: string;
  order_total?: number;
  quantity?: number;
  page?: string;
}

function logLine(obj: Record<string, unknown>) {
  console.log(JSON.stringify({ fn: "validate-promo-code", ts: new Date().toISOString(), ...obj }));
}

/**
 * Privacy: neither the customer email nor the raw promo code may ever reach
 * logs or the checkout_errors table. We emit a short, non-reversible
 * fingerprint so operators can still correlate repeated attempts.
 */
async function fingerprint(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest).slice(0, 6))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const userAgent = req.headers.get("user-agent") || null;

  const respond = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const logRejection = async (
    code: string, email: string | null, ticketType: string | null,
    orderTotal: number | null, reason: string, errorCode: string,
  ) => {
    const codeRef = await fingerprint(code);
    const emailRef = email ? await fingerprint(email.toLowerCase()) : null;
    logLine({
      event: "rejected",
      code_ref: codeRef,
      email_ref: emailRef,
      ticket_type: ticketType,
      error_code: errorCode,
      reason,
    });
    try {
      await supabase.from("checkout_errors").insert({
        error_type: "promo_code_rejected",
        error_message: reason.slice(0, 500),
        error_code: errorCode,
        ticket_type: ticketType,
        user_email: null,
        user_agent: userAgent,
        request_payload: { code_ref: codeRef, email_ref: emailRef, order_total: orderTotal },
      });
    } catch (err) {
      logLine({ event: "log_insert_failed", error: String(err) });
    }
  };

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return respond(400, { valid: false, error_code: "BAD_REQUEST", message: "Invalid JSON" });
  }

  const code = (body.code ?? "").trim().toUpperCase();
  const email = (body.email ?? "").trim();
  const ticketType = body.ticket_type ?? "";
  const orderTotal = typeof body.order_total === "number" ? body.order_total : 0;
  const quantity = typeof body.quantity === "number" && body.quantity > 0 ? body.quantity : 1;

  if (!code) {
    return respond(400, { valid: false, error_code: "EMPTY", message: "Please enter a promo code" });
  }

  logLine({
    event: "attempt",
    code_ref: await fingerprint(code),
    email_ref: email ? await fingerprint(email.toLowerCase()) : null,
    ticket_type: ticketType,
    order_total: orderTotal,
  });

  const { data: promo, error: fetchError } = await supabase
    .from("promo_codes")
    .select("*")
    .eq("code", code)
    .eq("is_active", true)
    .maybeSingle();

  if (fetchError) {
    logLine({ event: "fetch_error", error: fetchError.message });
    await logRejection(code, email, ticketType, orderTotal, `DB error: ${fetchError.message}`, "DB_ERROR");
    return respond(500, { valid: false, error_code: "DB_ERROR", message: "Unable to validate promo code" });
  }

  if (!promo) {
    await logRejection(code, email, ticketType, orderTotal, "Invalid or inactive promo code", "INVALID");
    return respond(200, { valid: false, error_code: "INVALID", message: "Invalid promo code" });
  }

  const now = new Date();
  if (promo.valid_from && new Date(promo.valid_from) > now) {
    await logRejection(code, email, ticketType, orderTotal, "Promo not yet active", "NOT_YET_ACTIVE");
    return respond(200, { valid: false, error_code: "NOT_YET_ACTIVE", message: "This promo code is not yet active" });
  }
  if (promo.valid_until && new Date(promo.valid_until) < now) {
    await logRejection(code, email, ticketType, orderTotal, `Expired at ${promo.valid_until}`, "EXPIRED");
    return respond(200, { valid: false, error_code: "EXPIRED", message: "This promo code has expired" });
  }
  if (promo.max_uses !== null && promo.current_uses >= promo.max_uses) {
    await logRejection(code, email, ticketType, orderTotal, `Max uses reached (${promo.current_uses}/${promo.max_uses})`, "MAX_USES");
    return respond(200, { valid: false, error_code: "MAX_USES", message: "This promo code has been fully redeemed" });
  }
  if (promo.allowed_ticket_types?.length && !promo.allowed_ticket_types.includes(ticketType)) {
    await logRejection(code, email, ticketType, orderTotal, `Ticket type ${ticketType} not in ${promo.allowed_ticket_types.join(",")}`, "TICKET_TYPE_NOT_ALLOWED");
    return respond(200, { valid: false, error_code: "TICKET_TYPE_NOT_ALLOWED", message: "This promo code doesn't apply to your ticket type" });
  }
  if (promo.min_order_amount && orderTotal < promo.min_order_amount) {
    await logRejection(code, email, ticketType, orderTotal, `Order ${orderTotal} below min ${promo.min_order_amount}`, "MIN_ORDER");
    return respond(200, { valid: false, error_code: "MIN_ORDER", message: `Minimum order of $${promo.min_order_amount} required` });
  }
  if (promo.max_quantity_per_use !== null && promo.max_quantity_per_use !== undefined && quantity > promo.max_quantity_per_use) {
    await logRejection(code, email, ticketType, orderTotal, `Quantity ${quantity} exceeds max ${promo.max_quantity_per_use}`, "MAX_QUANTITY");
    const n = promo.max_quantity_per_use;
    return respond(200, { valid: false, error_code: "MAX_QUANTITY", message: `This promo code is limited to ${n} ticket${n === 1 ? "" : "s"} per order` });
  }
  if (promo.is_single_use && email) {
    const { count } = await supabase
      .from("promo_code_uses")
      .select("*", { count: "exact", head: true })
      .eq("promo_code_id", promo.id)
      .eq("email", email.toLowerCase());
    if (count && count > 0) {
      await logRejection(code, email, ticketType, orderTotal, "Already used by this email", "ALREADY_USED");
      return respond(200, { valid: false, error_code: "ALREADY_USED", message: "You've already used this promo code" });
    }
  }

  logLine({ event: "accepted", promo_id: promo.id, ticket_type: ticketType });
  return respond(200, {
    valid: true,
    promo: {
      id: promo.id,
      code: promo.code,
      description: promo.description,
      discount_type: promo.discount_type,
      discount_value: Number(promo.discount_value),
    },
  });
});
