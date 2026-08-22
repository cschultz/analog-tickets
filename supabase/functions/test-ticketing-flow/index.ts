import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TestResult {
  name: string;
  status: "passed" | "failed" | "skipped";
  message?: string;
  error?: string;
  duration_ms: number;
}

interface TestSuite {
  name: string;
  tests: TestResult[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication and admin role
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization header required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Verify admin
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: userRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!userRole) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const suites: TestSuite[] = [];

    // Helper to run tests
    const runTest = async (
      name: string,
      fn: () => Promise<{ message?: string }>
    ): Promise<TestResult> => {
      const start = Date.now();
      try {
        const result = await fn();
        return {
          name,
          status: "passed",
          message: result.message,
          duration_ms: Date.now() - start,
        };
      } catch (error: any) {
        return {
          name,
          status: "failed",
          error: error.message,
          duration_ms: Date.now() - start,
        };
      }
    };

    // ========== SUITE 1: Database Tests ==========
    const dbTests: TestResult[] = [];

    dbTests.push(await runTest("Can query event_details table", async () => {
      const { data, error } = await supabase.from("event_details").select("id, title").limit(1);
      if (error) throw new Error(error.message);
      return { message: `Found ${data?.length || 0} events` };
    }));

    dbTests.push(await runTest("Active event exists", async () => {
      const { data, error } = await supabase
        .from("event_details")
        .select("id, title, event_date")
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("No active event found");
      return { message: `Active: ${data.title} on ${data.event_date}` };
    }));

    dbTests.push(await runTest("Can query ticket_inventory table", async () => {
      const { data, error } = await supabase.from("ticket_inventory").select("*");
      if (error) throw new Error(error.message);
      return { message: `${data?.length || 0} ticket types configured` };
    }));

    dbTests.push(await runTest("Can query registrations table", async () => {
      const { data, error } = await supabase.from("registrations").select("id").limit(1);
      if (error) throw new Error(error.message);
      return { message: "Registrations table accessible" };
    }));

    dbTests.push(await runTest("Can query tickets table", async () => {
      const { data, error } = await supabase.from("tickets").select("id").limit(1);
      if (error) throw new Error(error.message);
      return { message: "Tickets table accessible" };
    }));

    dbTests.push(await runTest("Can query email_logs table", async () => {
      const { data, error } = await supabase.from("email_logs").select("id").limit(1);
      if (error) throw new Error(error.message);
      return { message: "Email logs table accessible" };
    }));

    suites.push({ name: "Database Access", tests: dbTests });

    // ========== SUITE 2: Stripe Integration Tests ==========
    const stripeTests: TestResult[] = [];

    stripeTests.push(await runTest("Stripe API connection", async () => {
      const balance = await stripe.balance.retrieve();
      return { message: `Connected, ${balance.available.length} currencies` };
    }));

    stripeTests.push(await runTest("Krewe ticket price exists", async () => {
      const price = await stripe.prices.retrieve("");
      return { message: `${price.nickname || "Krewe"}: $${(price.unit_amount || 0) / 100}` };
    }));

    stripeTests.push(await runTest("VIP ticket price exists", async () => {
      const price = await stripe.prices.retrieve("");
      return { message: `${price.nickname || "VIP"}: $${(price.unit_amount || 0) / 100}` };
    }));

    stripeTests.push(await runTest("Ultimate Patrons price exists", async () => {
      const price = await stripe.prices.retrieve("");
      return { message: `Ultimate: $${(price.unit_amount || 0) / 100}` };
    }));

    stripeTests.push(await runTest("Premier Patrons price exists", async () => {
      const price = await stripe.prices.retrieve("");
      return { message: `Premier: $${(price.unit_amount || 0) / 100}` };
    }));

    stripeTests.push(await runTest("Can create test checkout session", async () => {
      // Create a minimal checkout session to verify everything works
      const session = await stripe.checkout.sessions.create({
        line_items: [{ price: "", quantity: 1 }],
        mode: "payment",
        success_url: "https://example.com/success",
        cancel_url: "https://example.com/cancel",
        metadata: { test: "true", created_by: "test-ticketing-flow" },
      });
      // Immediately expire the session to clean up
      await stripe.checkout.sessions.expire(session.id);
      return { message: `Session ${session.id} created and expired` };
    }));

    suites.push({ name: "Stripe Integration", tests: stripeTests });

    // ========== SUITE 3: Inventory Tests ==========
    const inventoryTests: TestResult[] = [];

    inventoryTests.push(await runTest("Inventory quantities are valid", async () => {
      const { data, error } = await supabase
        .from("ticket_inventory")
        .select("ticket_type, total_quantity, sold_quantity");
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) throw new Error("No inventory configured");
      
      for (const inv of data) {
        if (inv.sold_quantity < 0) throw new Error(`${inv.ticket_type} has negative sold quantity`);
        if (inv.sold_quantity > inv.total_quantity) throw new Error(`${inv.ticket_type} oversold`);
      }
      return { message: `${data.length} ticket types valid` };
    }));

    inventoryTests.push(await runTest("At least one ticket type available", async () => {
      const { data, error } = await supabase
        .from("ticket_inventory")
        .select("ticket_type, total_quantity, sold_quantity");
      if (error) throw new Error(error.message);
      
      const available = data?.filter((inv) => inv.total_quantity - inv.sold_quantity > 0);
      if (!available || available.length === 0) throw new Error("No tickets available for sale");
      return { message: `${available.length} ticket types available` };
    }));

    suites.push({ name: "Inventory Validation", tests: inventoryTests });

    // ========== SUITE 4: Registration Flow Tests ==========
    const registrationTests: TestResult[] = [];

    registrationTests.push(await runTest("Paid registrations have tickets", async () => {
      const { data: registrations, error } = await supabase
        .from("registrations")
        .select("id, name, quantity")
        .eq("payment_status", "paid")
        .limit(10);
      if (error) throw new Error(error.message);
      if (!registrations || registrations.length === 0) {
        return { message: "No paid registrations to check" };
      }

      for (const reg of registrations) {
        const { data: tickets, error: ticketError } = await supabase
          .from("tickets")
          .select("id")
          .eq("registration_id", reg.id);
        if (ticketError) throw new Error(ticketError.message);
        if (!tickets || tickets.length !== reg.quantity) {
          throw new Error(`Registration ${reg.id} has ${tickets?.length || 0} tickets but quantity is ${reg.quantity}`);
        }
      }
      return { message: `Checked ${registrations.length} registrations` };
    }));

    registrationTests.push(await runTest("Pending registrations are not stale", async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("registrations")
        .select("id, created_at")
        .eq("payment_status", "pending")
        .lt("created_at", oneHourAgo);
      if (error) throw new Error(error.message);
      if (data && data.length > 10) {
        throw new Error(`${data.length} pending registrations older than 1 hour - consider cleanup`);
      }
      return { message: `${data?.length || 0} stale pending registrations` };
    }));

    suites.push({ name: "Registration Integrity", tests: registrationTests });

    // ========== SUITE 5: Payment Plan Tests ==========
    const paymentPlanTests: TestResult[] = [];

    paymentPlanTests.push(await runTest("Payment plan config exists and is valid", async () => {
      const { data, error } = await supabase
        .from("payment_plan_config")
        .select("*")
        .limit(1)
        .single();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("No payment plan config found");
      if (!data.cutoff_date) throw new Error("Missing cutoff_date");
      if (!data.pre_cutoff_splits || !data.post_cutoff_splits) throw new Error("Missing payment splits");
      return { message: `Config: ${data.is_enabled ? "enabled" : "disabled"}, cutoff: ${data.cutoff_date}` };
    }));

    paymentPlanTests.push(await runTest("Payment plan enrollments table accessible", async () => {
      const { data, error } = await supabase.from("payment_plan_enrollments").select("id, status").limit(5);
      if (error) throw new Error(error.message);
      return { message: `${data?.length || 0} enrollments found` };
    }));

    paymentPlanTests.push(await runTest("Scheduled payments table accessible", async () => {
      const { data, error } = await supabase.from("scheduled_payments").select("id, status").limit(5);
      if (error) throw new Error(error.message);
      return { message: `${data?.length || 0} scheduled payments found` };
    }));

    paymentPlanTests.push(await runTest("Active enrollments have matching scheduled payments", async () => {
      const { data: enrollments, error } = await supabase
        .from("payment_plan_enrollments")
        .select("id, payment_count")
        .eq("status", "active")
        .limit(10);
      if (error) throw new Error(error.message);
      if (!enrollments || enrollments.length === 0) return { message: "No active enrollments to check" };

      for (const enrollment of enrollments) {
        const { data: payments, error: pErr } = await supabase
          .from("scheduled_payments")
          .select("id")
          .eq("enrollment_id", enrollment.id);
        if (pErr) throw new Error(pErr.message);
        if (!payments || payments.length !== enrollment.payment_count) {
          throw new Error(`Enrollment ${enrollment.id} has ${payments?.length || 0} payments but expected ${enrollment.payment_count}`);
        }
      }
      return { message: `Checked ${enrollments.length} active enrollments` };
    }));

    paymentPlanTests.push(await runTest("No orphaned scheduled payments", async () => {
      const { data: payments, error } = await supabase
        .from("scheduled_payments")
        .select("id, enrollment_id")
        .in("status", ["pending", "processing"])
        .limit(20);
      if (error) throw new Error(error.message);
      if (!payments || payments.length === 0) return { message: "No pending payments" };

      for (const payment of payments) {
        const { data: enrollment } = await supabase
          .from("payment_plan_enrollments")
          .select("id, status")
          .eq("id", payment.enrollment_id)
          .single();
        if (!enrollment) throw new Error(`Scheduled payment ${payment.id} has no matching enrollment`);
        if (enrollment.status === "cancelled") throw new Error(`Scheduled payment ${payment.id} belongs to cancelled enrollment`);
      }
      return { message: `Checked ${payments.length} pending payments` };
    }));

    suites.push({ name: "Payment Plan System", tests: paymentPlanTests });

    // ========== SUITE 6: Email Flow Tests ==========
    const emailTests: TestResult[] = [];

    emailTests.push(await runTest("Confirmation emails sent for paid registrations", async () => {
      const { data: paid, error: paidError } = await supabase
        .from("registrations")
        .select("id")
        .eq("payment_status", "paid")
        .limit(5);
      if (paidError) throw new Error(paidError.message);
      if (!paid || paid.length === 0) return { message: "No paid registrations to check" };

      let missingEmails = 0;
      for (const reg of paid) {
        const { data: logs } = await supabase
          .from("email_logs")
          .select("id")
          .eq("registration_id", reg.id)
          .in("email_type", ["confirmation", "cosmico_confirmation", "patrons_confirmation", "ticket_confirmation"])
          .limit(1);
        if (!logs || logs.length === 0) missingEmails++;
      }
      if (missingEmails > 0) {
        throw new Error(`${missingEmails} paid registrations missing confirmation emails`);
      }
      return { message: `All ${paid.length} checked registrations have confirmation emails` };
    }));

    suites.push({ name: "Email Delivery", tests: emailTests });

    // Calculate summary
    const allTests = suites.flatMap((s) => s.tests);
    const passed = allTests.filter((t) => t.status === "passed").length;
    const failed = allTests.filter((t) => t.status === "failed").length;
    const skipped = allTests.filter((t) => t.status === "skipped").length;

    const response = {
      timestamp: new Date().toISOString(),
      summary: {
        total: allTests.length,
        passed,
        failed,
        skipped,
        status: failed > 0 ? "FAILED" : "PASSED",
      },
      suites,
    };

    return new Response(JSON.stringify(response, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: failed > 0 ? 422 : 200,
    });
  } catch (error: any) {
    console.error("[test-ticketing-flow] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
