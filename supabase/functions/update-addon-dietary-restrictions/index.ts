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
    const { purchaseId, verifiedEmail, hasDietaryRestrictions, dietaryRestrictions } = await req.json();

    if (!purchaseId || typeof purchaseId !== "string") {
      throw new Error("Purchase ID is required");
    }

    if (!verifiedEmail || typeof verifiedEmail !== "string") {
      throw new Error("Verified email is required");
    }

    if (typeof hasDietaryRestrictions !== "boolean") {
      throw new Error("Dietary restriction selection is required");
    }

    const normalizedDietaryRestrictions = typeof dietaryRestrictions === "string" ? dietaryRestrictions.trim() : "";

    if (hasDietaryRestrictions && normalizedDietaryRestrictions.length === 0) {
      throw new Error("Please share your dietary restrictions");
    }

    if (normalizedDietaryRestrictions.length > 1000) {
      throw new Error("Dietary restrictions must be 1000 characters or fewer");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: purchase, error: purchaseError } = await supabaseClient
      .from("addon_purchases")
      .select("id, purchaser_email, payment_status, addon_inventory!inner(addon_type)")
      .eq("id", purchaseId)
      .single();

    if (purchaseError || !purchase) {
      console.error("Addon purchase fetch error:", purchaseError);
      throw new Error("Add-on purchase not found");
    }

    if (purchase.purchaser_email.toLowerCase() !== verifiedEmail.toLowerCase()) {
      throw new Error("You don't have permission to update this add-on");
    }

    if (purchase.payment_status !== "paid") {
      throw new Error("Only paid add-ons can be updated");
    }

    const addonType = Array.isArray(purchase.addon_inventory)
      ? purchase.addon_inventory[0]?.addon_type
      : purchase.addon_inventory?.addon_type;

    if (addonType !== "friday_dinner") {
      throw new Error("This add-on does not support dietary restriction updates");
    }

    const { error: updateError } = await supabaseClient
      .from("addon_purchases")
      .update({
        has_dietary_restrictions: hasDietaryRestrictions,
        dietary_restrictions: hasDietaryRestrictions ? normalizedDietaryRestrictions : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", purchaseId);

    if (updateError) {
      console.error("Addon purchase update error:", updateError);
      throw new Error("Failed to update dietary restrictions");
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Error in update-addon-dietary-restrictions:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});