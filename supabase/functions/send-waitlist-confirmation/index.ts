import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  corsHeaders,
  escapeHtml,
  getFirstName,
  formatTicketType,
  colors,
} from "../_shared/email-template.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

// Input validation constants
const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 255;
const VALID_TICKET_TYPES = ['dinner_party', 'party_only'];

// Validate email format
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

interface WaitlistConfirmationRequest {
  name: string;
  email: string;
  ticketType: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { name, email, ticketType } = body as WaitlistConfirmationRequest;

    // Validate required fields
    if (!name || typeof name !== 'string') {
      return new Response(
        JSON.stringify({ error: "Name is required and must be a string" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!email || typeof email !== 'string') {
      return new Response(
        JSON.stringify({ error: "Email is required and must be a string" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!ticketType || typeof ticketType !== 'string') {
      return new Response(
        JSON.stringify({ error: "Ticket type is required and must be a string" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate input lengths
    if (name.trim().length === 0 || name.length > MAX_NAME_LENGTH) {
      return new Response(
        JSON.stringify({ error: `Name must be between 1 and ${MAX_NAME_LENGTH} characters` }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (email.length > MAX_EMAIL_LENGTH) {
      return new Response(
        JSON.stringify({ error: `Email must be less than ${MAX_EMAIL_LENGTH} characters` }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate email format
    if (!isValidEmail(email.trim())) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate ticket type
    if (!VALID_TICKET_TYPES.includes(ticketType)) {
      return new Response(
        JSON.stringify({ error: "Invalid ticket type" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Sanitize inputs
    const sanitizedName = escapeHtml(name.trim());
    const sanitizedEmail = email.trim().toLowerCase();

    // Fetch email signature settings and event title
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    
    const { data: emailSettings } = await supabaseClient
      .from('email_settings')
      .select('signature_line, signature_name')
      .limit(1)
      .single();

    const signatureLine = emailSettings?.signature_line || '✌️&❤️,';
    const signatureName = emailSettings?.signature_name || 'The Cosmico Team';

    // Fetch active event title
    const { data: eventData } = await supabaseClient
      .from('event_details')
      .select('title')
      .eq('is_active', true)
      .limit(1)
      .single();

    const eventTitle = eventData?.title || 'Cosmico';

    console.log(`Sending waitlist confirmation to ${sanitizedEmail} for ${ticketType}`);

    const firstName = getFirstName(name);
    const ticketTypeDisplay = formatTicketType(ticketType);

    const emailResponse = await resend.emails.send({
      from: "The Cosmico Team <hello@example.invalid>",
      to: [sanitizedEmail],
      subject: "You're on the Cosmico Waitlist!",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: ${colors.darkBg}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${colors.darkBg}; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background: linear-gradient(135deg, ${colors.darkSurface} 0%, ${colors.darkBg} 100%); border-radius: 16px; overflow: hidden;">
                  <!-- Header -->
                  <tr>
                    <td style="padding: 40px 40px 20px; text-align: center;">
                      <h1 style="color: ${colors.accent}; font-size: 32px; margin: 0; font-weight: 600; letter-spacing: 2px;">${escapeHtml(eventTitle)}</h1>
                      <p style="color: ${colors.darkMuted}; font-size: 14px; margin: 8px 0 0; letter-spacing: 1px;">You're on the Waitlist!</p>
                    </td>
                  </tr>
                  
                  <!-- Main Content -->
                  <tr>
                    <td style="padding: 20px 40px;">
                      <h2 style="color: #ffffff; font-size: 24px; margin: 0 0 20px; text-align: center;">You're on the Waitlist!</h2>
                      <p style="color: ${colors.darkText}; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                        Hi ${escapeHtml(firstName)},
                      </p>
                      <p style="color: ${colors.darkText}; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                        Thanks for joining our waitlist for <strong style="color: ${colors.accent};">${ticketTypeDisplay}</strong> tickets. We'll reach out the moment a spot opens up!
                      </p>
                    </td>
                  </tr>

                  <!-- Party Ticket CTA -->
                  <tr>
                    <td style="padding: 0 40px 30px;">
                      <div style="background: rgba(212, 165, 116, 0.1); border: 1px solid rgba(212, 165, 116, 0.3); border-radius: 12px; padding: 24px;">
                        <h3 style="color: ${colors.accent}; font-size: 18px; margin: 0 0 12px;">Don't Want to Wait?</h3>
                        <p style="color: ${colors.darkText}; font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
                          Party Only tickets are still available! Grab one now and dance the night away. If dinner spots open up, we'll contact you first so you can upgrade.
                        </p>
                        <a href="${Deno.env.get('SITE_URL') || 'https://example.invalid'}/#tickets" style="display: inline-block; background: linear-gradient(135deg, ${colors.accent} 0%, #c49464 100%); color: ${colors.darkBg}; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
                          Get Party Only Tickets →
                        </a>
                      </div>
                    </td>
                  </tr>

                  <!-- Upgrade Promise -->
                  <tr>
                    <td style="padding: 0 40px 30px;">
                      <p style="color: ${colors.darkMuted}; font-size: 14px; line-height: 1.6; margin: 0; text-align: center;">
                        ✨ If dinner slots become available, waitlist members get first dibs to upgrade their Party Only ticket to the full Dinner + Party experience.
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="padding: 30px 40px; border-top: 1px solid rgba(255,255,255,0.1);">
                      <p style="color: ${colors.accent}; font-size: 14px; margin: 0 0 16px; text-align: center;">
                        ${escapeHtml(signatureLine)}<br>${escapeHtml(signatureName)}
                      </p>
                      <p style="color: #808090; font-size: 13px; line-height: 1.5; margin: 0; text-align: center;">
                        Wildhaven Sonoma • Cloverdale, CA<br>
                        May 15–17, 2026
                      </p>
                      <p style="color: #606070; font-size: 12px; margin: 16px 0 0; text-align: center;">
                        © ${new Date().getFullYear()} Cosmico. All rights reserved.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    });

    console.log("Waitlist confirmation email sent:", emailResponse);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending waitlist confirmation:", error);
    return new Response(
      JSON.stringify({ error: "Failed to send confirmation email" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
