import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Cleanup abandoned lodging checkouts
 * 
 * This function runs periodically to:
 * 1. Release units that were locked (pending_offer) but never completed checkout
 * 2. Clean up stale pending lodging bookings
 * 
 * Unit lock timeout: 35 minutes (Stripe sessions expire at 30 mins, +5 buffer)
 * Booking cleanup: 24 hours for pending bookings without Stripe sessions
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const now = new Date();
    const lockTimeout = new Date(now.getTime() - 35 * 60 * 1000); // 35 minutes ago
    const bookingTimeout = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago

    console.log("[cleanup-abandoned-lodging] Starting cleanup...");

    // 1. Find pending_offer units that have been locked too long
    // These are units where someone started checkout but never completed
    const { data: staleUnits, error: unitsError } = await supabaseClient
      .from("accommodation_units")
      .select("id, unit_name, updated_at")
      .eq("inventory_status", "pending_offer")
      .lt("updated_at", lockTimeout.toISOString());

    if (unitsError) {
      console.error("[cleanup-abandoned-lodging] Error fetching stale units:", unitsError);
    } else if (staleUnits && staleUnits.length > 0) {
      console.log(`[cleanup-abandoned-lodging] Found ${staleUnits.length} stale locked units`);

      // Check each unit - only release if there's no paid booking referencing it
      for (const unit of staleUnits) {
        const { data: booking } = await supabaseClient
          .from("lodging_bookings")
          .select("id, payment_status")
          .eq("assigned_unit_id", unit.id)
          .eq("payment_status", "paid")
          .maybeSingle();

        if (!booking) {
          // No paid booking - safe to release
          const { error: releaseError } = await supabaseClient
            .from("accommodation_units")
            .update({ inventory_status: "available" })
            .eq("id", unit.id)
            .eq("inventory_status", "pending_offer"); // Double-check status

          if (releaseError) {
            console.error(`[cleanup-abandoned-lodging] Failed to release unit ${unit.unit_name}:`, releaseError);
          } else {
            console.log(`[cleanup-abandoned-lodging] Released stale lock on unit: ${unit.unit_name}`);
          }
        } else {
          // Has paid booking - transition to assigned
          console.log(`[cleanup-abandoned-lodging] Unit ${unit.unit_name} has paid booking, marking as assigned`);
          await supabaseClient
            .from("accommodation_units")
            .update({ inventory_status: "assigned" })
            .eq("id", unit.id);
        }
      }
    } else {
      console.log("[cleanup-abandoned-lodging] No stale locked units found");
    }

    // 2. Find and clean up old pending bookings without Stripe sessions
    const { data: staleBookings, error: bookingsError } = await supabaseClient
      .from("lodging_bookings")
      .select("id, email, zone_key, assigned_unit_id, created_at")
      .eq("payment_status", "pending")
      .is("stripe_session_id", null)
      .lt("created_at", bookingTimeout.toISOString());

    if (bookingsError) {
      console.error("[cleanup-abandoned-lodging] Error fetching stale bookings:", bookingsError);
    } else if (staleBookings && staleBookings.length > 0) {
      console.log(`[cleanup-abandoned-lodging] Found ${staleBookings.length} orphaned pending bookings`);

      for (const booking of staleBookings) {
        // If booking had an assigned unit, release it
        if (booking.assigned_unit_id) {
          await supabaseClient
            .from("accommodation_units")
            .update({ inventory_status: "available" })
            .eq("id", booking.assigned_unit_id)
            .in("inventory_status", ["pending_offer", "reserved"]);
        }

        // Delete the orphaned booking
        const { error: deleteError } = await supabaseClient
          .from("lodging_bookings")
          .delete()
          .eq("id", booking.id);

        if (deleteError) {
          console.error(`[cleanup-abandoned-lodging] Failed to delete booking ${booking.id}:`, deleteError);
        } else {
          console.log(`[cleanup-abandoned-lodging] Cleaned up orphaned booking for ${booking.email}`);
        }
      }
    } else {
      console.log("[cleanup-abandoned-lodging] No orphaned pending bookings found");
    }

    // 3. Find pending bookings with expired Stripe sessions (older than 35 mins)
    const { data: expiredSessionBookings, error: expiredError } = await supabaseClient
      .from("lodging_bookings")
      .select("id, email, zone_key, assigned_unit_id, stripe_session_id, created_at")
      .eq("payment_status", "pending")
      .not("stripe_session_id", "is", null)
      .lt("created_at", lockTimeout.toISOString());

    if (expiredError) {
      console.error("[cleanup-abandoned-lodging] Error fetching expired session bookings:", expiredError);
    } else if (expiredSessionBookings && expiredSessionBookings.length > 0) {
      console.log(`[cleanup-abandoned-lodging] Found ${expiredSessionBookings.length} expired checkout bookings`);

      for (const booking of expiredSessionBookings) {
        // Release assigned unit if any
        if (booking.assigned_unit_id) {
          await supabaseClient
            .from("accommodation_units")
            .update({ inventory_status: "available" })
            .eq("id", booking.assigned_unit_id)
            .in("inventory_status", ["pending_offer", "reserved"]);

          console.log(`[cleanup-abandoned-lodging] Released unit from expired checkout for ${booking.email}`);
        }

        // Mark booking as expired instead of deleting (for audit trail)
        await supabaseClient
          .from("lodging_bookings")
          .update({ payment_status: "expired" })
          .eq("id", booking.id);
      }
    } else {
      console.log("[cleanup-abandoned-lodging] No expired checkout bookings found");
    }

    console.log("[cleanup-abandoned-lodging] Cleanup complete");

    return new Response(
      JSON.stringify({ 
        success: true,
        cleaned: {
          staleUnits: staleUnits?.length || 0,
          orphanedBookings: staleBookings?.length || 0,
          expiredCheckouts: expiredSessionBookings?.length || 0,
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: any) {
    console.error("[cleanup-abandoned-lodging] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
