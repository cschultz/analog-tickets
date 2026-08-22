import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  eventId: string;
  targetType: "vendor" | "artisan" | "volunteer" | "partner";
  recipientId: string;
  subject: string;
  bodyHtml: string;
  ccEmails?: string[];
  replyTo?: string;
  attachments?: Array<{ name: string; path: string }>;
}

function replaceMergeFields(text: string, data: Record<string, string>): string {
  let result = text;
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'gi'), value || '');
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

    const { 
      eventId, 
      targetType, 
      recipientId, 
      subject, 
      bodyHtml, 
      ccEmails, 
      replyTo,
      attachments 
    }: EmailRequest = await req.json();

    console.log(`Individual send: ${targetType} ID ${recipientId}`);

    // Fetch event details
    const { data: eventDetails } = await supabase
      .from("event_details")
      .select("title, event_date")
      .eq("id", eventId)
      .single();

    // Fetch email settings for from name/email
    const { data: emailSettings } = await supabase
      .from("email_settings")
      .select("production_from_email, production_from_name")
      .single();
    
    const fromName = emailSettings?.production_from_name || "The Cosmico Team";
    const fromEmail = emailSettings?.production_from_email || "team@example.invalid";

    // Fetch recipient based on target type
    let recipient: { id: string; name: string; email: string; [key: string]: any } | null = null;

    if (targetType === "vendor") {
      const { data } = await supabase
        .from("vendors")
        .select("id, name, company_name, email")
        .eq("id", recipientId)
        .single();
      if (data) recipient = { ...data, company: data.company_name };
    } else if (targetType === "artisan") {
      const { data } = await supabase
        .from("artisans")
        .select("id, name, business_name, email, booth_number")
        .eq("id", recipientId)
        .single();
      if (data) recipient = { ...data, company: data.business_name };
    } else if (targetType === "volunteer") {
      const { data } = await supabase
        .from("volunteer_interests")
        .select("id, name, email, shift_assigned, check_in_location")
        .eq("id", recipientId)
        .single();
      if (data) recipient = { ...data, shift: data.shift_assigned };
    } else if (targetType === "partner") {
      const { data } = await supabase
        .from("partners")
        .select("id, name, company_name, email, tier")
        .eq("id", recipientId)
        .single();
      if (data) recipient = { ...data, company: data.company_name };
    }

    if (!recipient || !recipient.email) {
      throw new Error("Recipient not found or has no email");
    }

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
      throw threadError;
    }

    // Build merge data - include contact_first_name for primary contact fields
    // Parse first/last name from the contact's full name
    const nameParts = (recipient.name || "").split(' ');
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(' ') || "";
    
    const mergeData: Record<string, string> = {
      name: recipient.name,
      first_name: firstName,
      contact_name: recipient.name,
      contact_first_name: firstName,
      contact_last_name: lastName,
      email: recipient.email,
      company: recipient.company || "",
      business_name: recipient.company || "",
      booth_number: recipient.booth_number || "",
      shift: recipient.shift || "",
      check_in_location: recipient.check_in_location || "",
      tier: recipient.tier || "",
      event_name: eventDetails?.title || "",
      event_date: eventDetails?.event_date || "",
    };

    const personalizedSubject = replaceMergeFields(subject, mergeData);
    const personalizedBody = replaceMergeFields(bodyHtml, mergeData);

    // Create tracking ID
    const trackingId = crypto.randomUUID();

    // Create email record
    const { data: emailRecord, error: emailError } = await supabase
      .from("production_emails")
      .insert({
        event_id: eventId,
        target_type: targetType,
        subject: personalizedSubject,
        body_html: personalizedBody,
        sent_by: user.id,
      })
      .select()
      .single();

    if (emailError) throw emailError;

    // Create recipient record
    await supabase.from("production_email_recipients").insert({
      email_id: emailRecord.id,
      target_type: targetType,
      target_id: recipient.id,
      contact_email: recipient.email,
      contact_name: recipient.name,
      tracking_id: trackingId,
      status: "pending",
    });

    // Prepare attachments
    const attachmentPayloads: Array<{ filename: string; content: string }> = [];
    if (attachments && attachments.length > 0) {
      for (const att of attachments) {
        const { data: fileData } = await supabase.storage
          .from("production-documents")
          .download(att.path);
        
        if (fileData) {
          const arrayBuffer = await fileData.arrayBuffer();
          const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
          attachmentPayloads.push({
            filename: att.name,
            content: base64,
          });
        }
      }

      // Store attachment records
      if (attachmentPayloads.length > 0) {
        await supabase.from("production_email_attachments").insert(
          attachments.map(att => ({
            email_id: emailRecord.id,
            file_name: att.name,
            file_path: att.path,
          }))
        );
      }
    }

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

    // Build reply-to with thread ID for tracking replies
    const replyToBase = replyTo || `team+${thread.id}@example.invalid`;
    const allCcEmails = ccEmails?.filter(e => e.trim()) || [];

    const emailPayload: Record<string, any> = {
      from: `${fromName} <${fromEmail}>`,
      to: [recipient.email],
      reply_to: replyToBase,
      subject: personalizedSubject,
      html: emailHtml,
    };

    if (allCcEmails.length > 0) {
      emailPayload.cc = allCcEmails;
    }

    if (attachmentPayloads.length > 0) {
      emailPayload.attachments = attachmentPayloads;
    }

    console.log("Sending individual email to:", recipient.email);

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
      console.error("Resend error:", errorText);
      
      await supabase
        .from("production_email_recipients")
        .update({ status: "failed", error_message: errorText })
        .eq("tracking_id", trackingId);

      throw new Error(`Failed to send email: ${errorText}`);
    }

    console.log(`Email sent successfully to ${recipient.email}`);

    // Update recipient record
    await supabase
      .from("production_email_recipients")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("tracking_id", trackingId);

    // Store in thread system
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

    // Auto-assign sender as owner if they have an email alias match
    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .single();

    if (senderProfile?.email) {
      // Check if user's email is in aliases (or use their primary email)
      const { data: aliasMatch } = await supabase
        .from("admin_email_aliases")
        .select("admin_user_id")
        .eq("admin_user_id", user.id)
        .limit(1)
        .maybeSingle();

      // If user has aliases set up, or just use them as the sender
      const ownerId = aliasMatch?.admin_user_id || user.id;

      // Upsert ownership - sender becomes owner if not already set
      const { data: existingOwnership } = await supabase
        .from("entity_ownership")
        .select("owner_id")
        .eq("entity_type", targetType)
        .eq("entity_id", recipient.id)
        .eq("event_id", eventId)
        .maybeSingle();

      if (!existingOwnership?.owner_id) {
        await supabase
          .from("entity_ownership")
          .upsert({
            entity_type: targetType,
            entity_id: recipient.id,
            event_id: eventId,
            owner_id: ownerId,
          }, {
            onConflict: "entity_type,entity_id,event_id",
          });
        
        console.log(`Auto-assigned sender ${user.id} as owner for ${targetType} ${recipient.id}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, threadId: thread.id }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-production-email-individual:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
