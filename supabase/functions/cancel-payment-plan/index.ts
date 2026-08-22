import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify admin auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    ).auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const { data: hasAdminRole } = await supabaseClient.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });

    if (!hasAdminRole) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    const { enrollmentId, reason } = await req.json();

    if (!enrollmentId) {
      return new Response(
        JSON.stringify({ error: "enrollmentId is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Cancel all pending/failed scheduled payments
    const { error: cancelPaymentsError } = await supabaseClient
      .from("scheduled_payments")
      .update({ status: "cancelled" })
      .eq("enrollment_id", enrollmentId)
      .in("status", ["pending", "failed"]);

    if (cancelPaymentsError) {
      console.error("[cancel-payment-plan] Error cancelling payments:", cancelPaymentsError);
    }

    // Update enrollment status
    const { error: updateError } = await supabaseClient
      .from("payment_plan_enrollments")
      .update({ status: "cancelled" })
      .eq("id", enrollmentId);

    if (updateError) {
      throw updateError;
    }

    // Create admin notification
    const { data: enrollment } = await supabaseClient
      .from("payment_plan_enrollments")
      .select("buyer_name, buyer_email")
      .eq("id", enrollmentId)
      .single();

    await supabaseClient.from("admin_notifications").insert({
      type: "payment_plan_cancelled",
      title: "Payment Plan Cancelled",
      message: `${enrollment?.buyer_name || "Unknown"} (${enrollment?.buyer_email || ""}) plan cancelled by admin. Reason: ${reason || "None provided"}`,
      metadata: { enrollment_id: enrollmentId, cancelled_by: user.id, reason },
    });

    // Send cancellation email to customer
    fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-payment-plan-notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ type: "plan_cancelled", enrollmentId }),
    }).catch(err => console.error("[cancel-payment-plan] Notification error:", err));

    // Audit log
    await supabaseClient.rpc("log_admin_action", {
      p_admin_user_id: user.id,
      p_admin_email: user.email || "",
      p_action: "cancel_payment_plan",
      p_entity_type: "payment_plan",
      p_entity_id: enrollmentId,
      p_entity_name: enrollment?.buyer_name || "",
      p_metadata: { reason },
    });

    console.log(`[cancel-payment-plan] Cancelled enrollment ${enrollmentId}`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[cancel-payment-plan] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
