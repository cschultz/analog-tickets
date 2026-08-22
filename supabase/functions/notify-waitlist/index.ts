import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { formatTicketType } from "../_shared/email-template.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotifyRequest {
  ticket_type: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify admin authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify user is admin
    const { data: userData } = await supabaseClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleData } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { ticket_type }: NotifyRequest = await req.json();

    if (!ticket_type) {
      return new Response(JSON.stringify({ error: "ticket_type is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Notifying waitlist for ticket type: ${ticket_type}`);

    // Use service role to fetch and update waitlist
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch all non-notified waitlist entries for this ticket type
    const { data: waitlistEntries, error: fetchError } = await supabaseAdmin
      .from("ticket_waitlist")
      .select("*")
      .eq("ticket_type", ticket_type)
      .is("notified_at", null);

    if (fetchError) {
      console.error("Error fetching waitlist:", fetchError);
      throw new Error("Failed to fetch waitlist entries");
    }

    if (!waitlistEntries || waitlistEntries.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: "No entries to notify",
        notified: 0 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found ${waitlistEntries.length} waitlist entries to notify`);

    // Get ticket type label for email
    const ticketTypeLabel = formatTicketType(ticket_type);

    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // Send emails to each waitlist entry
    for (const entry of waitlistEntries) {
      try {
        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: 'Georgia', serif; background-color: #F3EEE6; margin: 0; padding: 40px 20px;">
            <div style="max-width: 600px; margin: 0 auto; background: #FFFFFF; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
              <div style="background: linear-gradient(135deg, #A37552 0%, #8B5E3C 100%); padding: 40px 30px; text-align: center;">
                <h1 style="color: #FFFFFF; margin: 0; font-size: 28px; font-weight: normal; font-style: italic;">
                  Great News, ${entry.name}!
                </h1>
              </div>
              
              <div style="padding: 40px 30px;">
                <p style="color: #322821; font-size: 18px; line-height: 1.6; margin: 0 0 20px;">
                  Tickets are now available for the experience you've been waiting for!
                </p>
                
                <div style="background: #F3EEE6; border-left: 4px solid #C7A97A; padding: 20px; margin: 25px 0;">
                  <p style="margin: 0; color: #7B6E61; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">
                    Ticket Type
                  </p>
                  <p style="margin: 8px 0 0; color: #322821; font-size: 20px; font-weight: 600;">
                    ${ticketTypeLabel}
                  </p>
                </div>
                
                <p style="color: #7B6E61; font-size: 16px; line-height: 1.6; margin: 25px 0;">
                  We wanted to let you know right away since you signed up for our waitlist. Tickets are limited, so we recommend securing yours soon.
                </p>
                
                <div style="text-align: center; margin: 35px 0;">
                  <a href="https://example.invalid/#tickets" 
                     style="display: inline-block; background: #A37552; color: #FFFFFF; text-decoration: none; padding: 16px 40px; border-radius: 4px; font-size: 16px; font-weight: 500;">
                    Get Your Tickets Now
                  </a>
                </div>
                
                <p style="color: #7B6E61; font-size: 14px; line-height: 1.6; margin: 30px 0 0; text-align: center;">
                  See you under the redwoods! 🌲
                </p>
              </div>
              
              <div style="background: #322821; padding: 25px 30px; text-align: center;">
                <p style="color: #C7A97A; margin: 0; font-size: 14px;">
                  Cosmico Winter Escape
                </p>
                <p style="color: rgba(255,255,255,0.6); margin: 8px 0 0; font-size: 12px;">
                  You received this email because you signed up for our ticket waitlist.
                </p>
              </div>
            </div>
          </body>
          </html>
        `;

        const { error: emailError } = await resend.emails.send({
          from: "The Cosmico Team <hello@example.invalid>",
          to: [entry.email],
          subject: `🎉 ${ticketTypeLabel} Tickets Now Available!`,
          html: emailHtml,
        });

        if (emailError) {
          console.error(`Failed to send email to ${entry.email}:`, emailError);
          errors.push(`${entry.email}: ${emailError.message}`);
          failedCount++;
          continue;
        }

        // Mark as notified
        const { error: updateError } = await supabaseAdmin
          .from("ticket_waitlist")
          .update({ notified_at: new Date().toISOString() })
          .eq("id", entry.id);

        if (updateError) {
          console.error(`Failed to update notified_at for ${entry.email}:`, updateError);
        }

        successCount++;
        console.log(`Successfully notified: ${entry.email}`);
      } catch (emailErr: unknown) {
        const errMessage = emailErr instanceof Error ? emailErr.message : String(emailErr);
        console.error(`Error processing ${entry.email}:`, emailErr);
        errors.push(`${entry.email}: ${errMessage}`);
        failedCount++;
      }
    }

    console.log(`Notification complete. Success: ${successCount}, Failed: ${failedCount}`);

    return new Response(JSON.stringify({ 
      success: true,
      message: `Notified ${successCount} waitlist entries`,
      notified: successCount,
      failed: failedCount,
      errors: errors.length > 0 ? errors : undefined
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    console.error("Error in notify-waitlist function:", error);
    return new Response(JSON.stringify({ error: errMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});