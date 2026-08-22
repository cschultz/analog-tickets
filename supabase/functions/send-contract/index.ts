import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { getEmailSenderConfig } from "../_shared/email-sender-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendContractRequest {
  contract_id: string;
  resend?: boolean;
}

const logStep = (step: string, details?: any) => {
  console.log(`[SEND-CONTRACT] ${step}`, details ? JSON.stringify(details) : "");
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const siteUrl = Deno.env.get("SITE_URL") || "https://example.invalid";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resend = new Resend(resendApiKey);

    // Verify admin authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Authorization required");
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      throw new Error("Invalid authorization");
    }

    // Check admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      throw new Error("Admin access required");
    }

    const { contract_id, resend: isResend }: SendContractRequest = await req.json();
    logStep("Processing request", { contract_id, isResend });

    // Fetch contract with entity details
    const { data: contract, error: contractError } = await supabase
      .from("contracts")
      .select("*")
      .eq("id", contract_id)
      .single();

    if (contractError || !contract) {
      throw new Error("Contract not found");
    }

    // Fetch entity details based on type
    let entity: any = null;
    const tableName = contract.entity_type === "artisan" ? "artisans" :
                      contract.entity_type === "partner" ? "partners" : "vendors";
    
    const { data: entityData } = await supabase
      .from(tableName)
      .select("name, email, business_name, company_name")
      .eq("id", contract.entity_id)
      .single();
    
    entity = entityData;

    if (!entity?.email) {
      throw new Error(`${contract.entity_type} email not found`);
    }

    // Fetch event details
    const { data: eventDetails } = await supabase
      .from("event_details")
      .select("title, event_date")
      .eq("id", contract.event_id)
      .single();

    // Build signing URL
    const signingUrl = `${siteUrl}/sign-contract?token=${contract.access_token}`;

    // Build email HTML
    const entityName = entity.name;
    const companyName = entity.business_name || entity.company_name || "";
    const eventName = eventDetails?.title || "Cosmico";
    
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Contract for Review</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">Contract Ready for Signature</h1>
          </div>
          
          <div style="background: #fff; padding: 30px; border: 1px solid #e5e5e5; border-top: none;">
            <p>Hello ${entityName}${companyName ? ` (${companyName})` : ""},</p>
            
            <p>We have a contract ready for your review and signature for <strong>${eventName}</strong>.</p>
            
            <p><strong>Contract:</strong> ${contract.title}</p>
            
            ${contract.expires_at ? `<p style="color: #e67e22;"><strong>Please sign by:</strong> ${new Date(contract.expires_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" })}</p>` : ""}
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${signingUrl}" 
                 style="display: inline-block; background: #2563eb; color: #fff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600;">
                Review & Sign Contract
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px;">
              If you have any questions about the contract, please reply to this email.
            </p>
          </div>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 0 0 10px 10px; text-align: center; font-size: 12px; color: #666;">
            <p style="margin: 0;">This is an official contract from ${eventName}</p>
          </div>
        </body>
      </html>
    `;

    // Get sender config for contracts
    const senderConfig = await getEmailSenderConfig('contract');
    
    // Send email with proper sender and CC
    const { error: emailError } = await resend.emails.send({
      from: senderConfig.fromAddress,
      to: [entity.email],
      cc: senderConfig.defaultCc.length > 0 ? senderConfig.defaultCc : undefined,
      subject: `${isResend ? "[Reminder] " : ""}Contract for Your Signature - ${contract.title}`,
      html: emailHtml,
    });

    if (emailError) {
      logStep("Email error", emailError);
      throw new Error("Failed to send email: " + emailError.message);
    }

    // Update contract status
    if (!isResend) {
      await supabase
        .from("contracts")
        .update({ 
          status: "sent", 
          sent_at: new Date().toISOString() 
        })
        .eq("id", contract_id);
    }

    logStep("Contract email sent successfully");

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    logStep("Error", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
