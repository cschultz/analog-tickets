import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getEmailSenderConfig, mapTargetTypeToCategory } from "../_shared/email-sender-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  eventId: string;
  targetType: "vendor" | "artisan" | "volunteer" | "partner" | "artist";
  subject: string;
  bodyHtml: string;
  recipientIds: string[];
  toEmails?: string[];
  ccEmails?: string[];
  testEmail?: string;
  fromUserId?: string; // Admin user ID to send as
}

function replaceMergeFields(text: string, data: Record<string, string>): string {
  let result = text;
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '');
  }
  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      throw new Error("Admin access required");
    }

    const { eventId, targetType, subject, bodyHtml, recipientIds, toEmails, ccEmails, testEmail, fromUserId }: EmailRequest = await req.json();

    // Get sender config based on target type (vendor, artisan, partner, etc.)
    const emailCategory = mapTargetTypeToCategory(targetType);
    const senderConfig = await getEmailSenderConfig(emailCategory);
    let fromName = senderConfig.fromName;
    let fromEmail = senderConfig.fromEmail;

    // Override sender if fromUserId provided
    // Skip override for volunteer emails — always use category defaults for deliverability
    if (fromUserId && targetType !== 'volunteer') {
      const { data: senderAlias } = await supabase
        .from("admin_email_aliases")
        .select("email")
        .eq("admin_user_id", fromUserId)
        .eq("is_primary", true)
        .maybeSingle();

      const { data: senderProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", fromUserId)
        .single();

      if (senderAlias?.email) {
        fromEmail = senderAlias.email;
        fromName = senderProfile?.full_name || fromName;
      }
    }
    
    // Merge: sender's default CC + provided CC (deduplicated)
    const allCcEmails = [...new Set([...senderConfig.defaultCc, ...(ccEmails || [])])];

    // Handle test email sends
    if (testEmail) {
      console.log(`Sending test email to ${testEmail}`);
      
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: senderConfig.fromAddress,
          to: [testEmail],
          subject: subject,
          html: bodyHtml,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Resend error: ${errorText}`);
      }

      return new Response(
        JSON.stringify({ sent: 1, failed: 0 }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Sending ${targetType} email to ${recipientIds.length} recipients`);

    // Fetch event details
    const { data: eventDetails } = await supabase
      .from("event_details")
      .select("title, event_date")
      .eq("id", eventId)
      .single();

    // Fetch recipients based on target type
    let recipients: Array<{ id: string; name: string; email: string; entityName?: string; [key: string]: any }> = [];

    if (targetType === "artist") {
      // For artists, fetch all contacts for each artist
      const { data: artists } = await supabase
        .from("artists")
        .select("id, name, genre, stage_name")
        .in("id", recipientIds);
      
      const { data: contacts } = await supabase
        .from("artist_contacts")
        .select("id, artist_id, name, email, role, is_primary")
        .in("artist_id", recipientIds);
      
      // Build recipients from contacts, with artist info attached
      for (const artist of (artists || [])) {
        const artistContacts = (contacts || []).filter(c => c.artist_id === artist.id);
        for (const contact of artistContacts) {
          if (contact.email) {
            recipients.push({
              id: artist.id,
              contactId: contact.id,
              name: contact.name,
              email: contact.email,
              role: contact.role,
              entityName: artist.name,
              genre: artist.genre,
              stage_name: artist.stage_name,
            });
          }
        }
      }
    } else if (targetType === "vendor") {
      const { data } = await supabase
        .from("vendors")
        .select("id, name, company_name, email")
        .in("id", recipientIds);
      recipients = data || [];
    } else if (targetType === "artisan") {
      const { data } = await supabase
        .from("artisans")
        .select("id, name, business_name, email, booth_number")
        .in("id", recipientIds);
      recipients = data || [];
    } else if (targetType === "volunteer") {
      const { data } = await supabase
        .from("volunteer_interests")
        .select("id, name, email, shift_assigned, check_in_location")
        .in("id", recipientIds);
      recipients = data || [];
    } else if (targetType === "partner") {
      const { data } = await supabase
        .from("partners")
        .select("id, name, company_name, email, tier")
        .in("id", recipientIds);
      recipients = data || [];
    }

    // Create email record in legacy table (for backward compatibility)
    const { data: emailRecord, error: emailError } = await supabase
      .from("production_emails")
      .insert({
        event_id: eventId,
        target_type: targetType,
        subject,
        body_html: bodyHtml,
        sent_by: user.id,
      })
      .select()
      .single();

    if (emailError) throw emailError;

    let sentCount = 0;
    let failedCount = 0;

    for (const recipient of recipients) {
      if (!recipient.email) continue;

      // Create thread for this conversation
      const { data: thread, error: threadError } = await supabase
        .from("production_email_threads")
        .insert({
          event_id: eventId,
          entity_type: targetType,
          entity_id: recipient.id,
          subject: subject,
        })
        .select()
        .single();

      if (threadError) {
        console.error("Error creating thread:", threadError);
        failedCount++;
        continue;
      }

      // Build merge data
      // Parse first/last name from full name
      const nameParts = (recipient.name || "").split(' ');
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(' ') || "";
      
      const mergeData: Record<string, string> = {
        name: recipient.name,
        first_name: firstName,
        last_name: lastName,
        contact_first_name: firstName,
        contact_last_name: lastName,
        email: recipient.email,
        event_name: eventDetails?.title || "",
        event_date: eventDetails?.event_date || "",
      };

      if (targetType === "artist") {
        mergeData.artist_name = recipient.entityName || "";
        mergeData.genre = recipient.genre || "";
        mergeData.stage_name = recipient.stage_name || "";
        mergeData.contact_role = recipient.role || "";
      } else if (targetType === "vendor") {
        mergeData.company = recipient.company_name || "";
      } else if (targetType === "artisan") {
        mergeData.business_name = recipient.business_name || "";
        mergeData.booth_number = recipient.booth_number || "";
      } else if (targetType === "volunteer") {
        mergeData.shift = recipient.shift_assigned || "";
        mergeData.check_in_location = recipient.check_in_location || "";
      } else if (targetType === "partner") {
        mergeData.company = recipient.company_name || "";
        mergeData.tier = recipient.tier || "";
      }

      const personalizedSubject = replaceMergeFields(subject, mergeData);
      const personalizedBody = replaceMergeFields(bodyHtml, mergeData);

      // Create tracking ID for legacy system
      const trackingId = crypto.randomUUID();

      // Create recipient record (legacy)
      await supabase.from("production_email_recipients").insert({
        email_id: emailRecord.id,
        target_type: targetType,
        target_id: recipient.id,
        contact_email: recipient.email,
        contact_name: recipient.name,
        tracking_id: trackingId,
        status: "pending",
      });

      // Add tracking pixel
      const trackingPixel = `<img src="${supabaseUrl}/functions/v1/track-production-email-open?id=${trackingId}" width="1" height="1" style="display:none" />`;

      // Simple, minimal styling - more like a plain text email
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #ffffff;">
          <div style="max-width: 600px; margin: 0 auto;">
            ${personalizedBody}
          </div>
          ${trackingPixel}
        </body>
        </html>
      `;

      try {
        // Build reply-to with thread ID for tracking replies
        const threadReplyTo = `team+${thread.id}@example.invalid`;
        // Use category-specific replyTo if available, otherwise fall back to thread reply address
        const categoryReplyTo = senderConfig.replyTo;
        const replyToAddresses = categoryReplyTo 
          ? [categoryReplyTo, threadReplyTo, ...allCcEmails.filter(e => e.trim())]
          : [threadReplyTo, ...allCcEmails.filter(e => e.trim())];

        // Use explicit toEmails if provided, otherwise use recipient email
        const actualToEmails = toEmails && toEmails.length > 0 ? toEmails : [recipient.email];
        
        const emailPayload: Record<string, any> = {
          from: `${fromName} <${fromEmail}>`,
          to: actualToEmails,
          reply_to: replyToAddresses,
          subject: personalizedSubject,
          html: emailHtml,
        };

        // Add CC if provided
        if (allCcEmails.length > 0) {
          emailPayload.cc = allCcEmails.filter(e => e.trim());
        }

        console.log("Sending email with payload:", JSON.stringify({
          to: emailPayload.to,
          cc: emailPayload.cc,
          reply_to: emailPayload.reply_to,
          subject: personalizedSubject,
        }));

        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(emailPayload),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Resend error: ${errorText}`);
        }

        console.log(`Email sent to ${recipient.email}`);

        // Update legacy recipient record
        await supabase
          .from("production_email_recipients")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("tracking_id", trackingId);

        // Store in new thread system
        await supabase.from("production_email_messages").insert({
          thread_id: thread.id,
          direction: "outbound",
          from_email: fromEmail,
          from_name: fromName,
          to_emails: [recipient.email],
          cc_emails: allCcEmails,
          subject: personalizedSubject,
          body_html: emailHtml,
          sent_at: new Date().toISOString(),
          sent_by: user.id,
        });

        sentCount++;
      } catch (sendError: any) {
        console.error(`Failed to send to ${recipient.email}:`, sendError);

        await supabase
          .from("production_email_recipients")
          .update({ status: "failed", error_message: sendError.message })
          .eq("tracking_id", trackingId);

        failedCount++;
      }
    }

    console.log(`Email sending complete: ${sentCount} sent, ${failedCount} failed`);

    return new Response(
      JSON.stringify({ sent: sentCount, failed: failedCount }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-production-email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
