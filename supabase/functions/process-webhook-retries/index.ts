import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (message: string, data?: Record<string, unknown>) => {
  console.log(JSON.stringify({
    fn: "process-webhook-retries",
    message,
    data,
    timestamp: new Date().toISOString(),
  }));
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
    apiVersion: "2025-08-27.basil",
  });

  log("Starting webhook retry processing");

  try {
    // Get pending retries that are due
    const { data: retries, error: fetchError } = await supabase
      .from("webhook_retry_queue")
      .select("*")
      .eq("status", "pending")
      .lte("next_retry_at", new Date().toISOString())
      .order("next_retry_at", { ascending: true })
      .limit(10);

    if (fetchError) {
      throw new Error(`Failed to fetch retries: ${fetchError.message}`);
    }

    if (!retries || retries.length === 0) {
      log("No pending retries to process");
      return new Response(
        JSON.stringify({ processed: 0, message: "No pending retries" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log("Found retries to process", { count: retries.length });

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const retry of retries) {
      log("Processing retry", { id: retry.id, event_type: retry.event_type, attempt: retry.attempt_count });

      // Mark as processing
      await supabase
        .from("webhook_retry_queue")
        .update({ status: "processing", updated_at: new Date().toISOString() })
        .eq("id", retry.id);

      try {
        // Handle based on event type
        if (retry.event_type === "checkout.session.completed") {
          const session = retry.payload as Stripe.Checkout.Session;
          
          // Verify the session is still valid and paid
          const stripeSession = await stripe.checkout.sessions.retrieve(session.id);
          
          if (stripeSession.payment_status === "paid") {
            // Find and update registration
            const { data: registration, error: regError } = await supabase
              .from("registrations")
              .select("*")
              .eq("stripe_session_id", session.id)
              .single();

            if (regError || !registration) {
              throw new Error(`Registration not found for session ${session.id}`);
            }

            if (registration.payment_status !== "paid") {
              // Update to paid
              await supabase
                .from("registrations")
                .update({ 
                  payment_status: "paid",
                  updated_at: new Date().toISOString()
                })
                .eq("id", registration.id);

              // Create tickets if needed
              const { data: existingTickets } = await supabase
                .from("tickets")
                .select("id")
                .eq("registration_id", registration.id);

              if (!existingTickets || existingTickets.length === 0) {
                const ticketsToCreate = [];
                for (let i = 0; i < registration.quantity; i++) {
                  ticketsToCreate.push({
                    registration_id: registration.id,
                    event_id: registration.event_id,
                    holder_name: i === 0 ? registration.name : `Guest ${i + 1}`,
                    holder_email: i === 0 ? registration.email : null,
                    ticket_type: registration.ticket_type,
                    unit_price: Math.round(registration.total_amount / registration.quantity),
                    status: "active",
                    original_purchaser_email: registration.email,
                  });
                }

                await supabase.from("tickets").insert(ticketsToCreate);
                log("Created tickets for registration", { 
                  registration_id: registration.id, 
                  count: ticketsToCreate.length 
                });
              }

              // Update inventory
              const { data: inventory } = await supabase
                .from("ticket_inventory")
                .select("sold_quantity")
                .eq("ticket_type", registration.ticket_type)
                .single();

              if (inventory) {
                await supabase
                  .from("ticket_inventory")
                  .update({ sold_quantity: inventory.sold_quantity + registration.quantity })
                  .eq("ticket_type", registration.ticket_type);
              }

              log("Successfully processed retry", { registration_id: registration.id });
            }

            // Mark as completed
            await supabase
              .from("webhook_retry_queue")
              .update({ 
                status: "completed", 
                updated_at: new Date().toISOString() 
              })
              .eq("id", retry.id);

            succeeded++;
          } else {
            throw new Error(`Session ${session.id} not paid: ${stripeSession.payment_status}`);
          }
        } else {
          // For other event types, mark as completed (no special handling)
          await supabase
            .from("webhook_retry_queue")
            .update({ 
              status: "completed", 
              updated_at: new Date().toISOString() 
            })
            .eq("id", retry.id);

          succeeded++;
        }

        processed++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        log("Retry failed", { id: retry.id, error: errorMessage });

        if (retry.attempt_count >= (retry.max_attempts || 5)) {
          // Max attempts reached - move to dead letter queue
          log("Moving to dead letter queue", { id: retry.id, attempts: retry.attempt_count });
          
          const { data: deadLetter } = await supabase.rpc("move_to_dead_letter", {
            p_original_table: "webhook_retry_queue",
            p_original_id: retry.id,
            p_operation_type: retry.event_type,
            p_payload: retry.payload,
            p_error_message: `Failed after ${retry.attempt_count} attempts. Last error: ${errorMessage}`
          });

          // Mark retry as moved to dead letter
          await supabase
            .from("webhook_retry_queue")
            .update({ 
              status: "failed", 
              last_error: errorMessage,
              moved_to_dead_letter: true,
              dead_letter_id: deadLetter,
              updated_at: new Date().toISOString() 
            })
            .eq("id", retry.id);

          failed++;
        } else {
          // Schedule next retry with exponential backoff
          const { data: nextRetry } = await supabase.rpc("calculate_retry_delay", {
            attempt_count: retry.attempt_count + 1
          });

          const nextRetryAt = new Date(Date.now() + (nextRetry || 60) * 1000);

          await supabase
            .from("webhook_retry_queue")
            .update({ 
              status: "pending",
              attempt_count: retry.attempt_count + 1,
              last_error: errorMessage,
              next_retry_at: nextRetryAt.toISOString(),
              updated_at: new Date().toISOString() 
            })
            .eq("id", retry.id);
        }

        processed++;
      }
    }

    log("Retry processing completed", { processed, succeeded, failed });

    return new Response(
      JSON.stringify({ processed, succeeded, failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log("Error processing retries", { error: errorMessage });
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
