import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmailSenderConfig } from "../_shared/email-sender-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MergeData {
  artist_name: string;
  contact_name: string;
  contact_first_name: string;
  contact_last_name: string;
  contact_role: string;
  performance_date: string;
  set_time: string;
  stage: string;
  set_length: string;
  offer_amount: string;
  guest_list: string;
  event_name: string;
  event_dates: string;
  venue_name: string;
}

const ROLE_LABELS: Record<string, string> = {
  manager: "Manager",
  agent: "Agent",
  publicist: "Publicist",
  tour_manager: "Tour Manager",
  artist_direct: "Artist Direct",
  label_rep: "Label Rep",
  other: "Other",
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/Los_Angeles" });
}

function formatEventDates(eventDate: string | null): string {
  if (!eventDate) return "";
  const start = new Date(eventDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 2);
  return `${start.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/Los_Angeles" })}-${end.getDate()}, ${end.getFullYear()}`;
}

function replaceMergeFields(text: string, data: MergeData): string {
  let result = text;
  result = result.replace(/\{\{artist_name\}\}/gi, data.artist_name || "[Artist Name]");
  result = result.replace(/\{\{contact_name\}\}/gi, data.contact_name || "[Contact Name]");
  result = result.replace(/\{\{contact_first_name\}\}/gi, data.contact_first_name || "[First Name]");
  result = result.replace(/\{\{contact_last_name\}\}/gi, data.contact_last_name || "[Last Name]");
  result = result.replace(/\{\{contact_role\}\}/gi, data.contact_role || "[Role]");
  result = result.replace(/\{\{performance_date\}\}/gi, data.performance_date || "[Performance Date]");
  result = result.replace(/\{\{set_time\}\}/gi, data.set_time || "[Set Time]");
  result = result.replace(/\{\{stage\}\}/gi, data.stage || "[Stage]");
  result = result.replace(/\{\{set_length\}\}/gi, data.set_length || "[Set Length]");
  result = result.replace(/\{\{offer_amount\}\}/gi, data.offer_amount || "[Offer Amount]");
  result = result.replace(/\{\{guest_list\}\}/gi, data.guest_list || "[Guest List]");
  result = result.replace(/\{\{event_name\}\}/gi, data.event_name || "[Event Name]");
  result = result.replace(/\{\{event_dates\}\}/gi, data.event_dates || "[Event Dates]");
  result = result.replace(/\{\{venue_name\}\}/gi, data.venue_name || "[Venue Name]");
  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    // Verify admin
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const { data: isAdmin } = await supabaseClient.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });

    if (!isAdmin) {
      throw new Error("Admin access required");
    }

    const { 
      eventId, 
      subject, 
      bodyHtml, 
      targetRoles, 
      artistIds, 
      attachments,
      isTest,
      testEmail,
      sampleArtistId,
      scheduledFor,
      ccEmails,
      replyTo,
      fromUserId,
    } = await req.json();

    console.log("Request received:", { eventId, artistIds, ccEmails, replyTo, fromUserId });

    if (!eventId || !subject || !bodyHtml) {
      throw new Error("Missing required fields");
    }

    // Get event details for merge fields
    const { data: eventDetails, error: eventError } = await supabaseClient
      .from("event_details")
      .select("title, event_date, venue_name")
      .eq("id", eventId)
      .single();

    if (eventError) {
      console.error("Failed to fetch event details:", eventError);
    }

    // Get email sender config for artist emails
    // Artist emails come from hello@example.invalid with inbox@example.invalid CC'd
    const senderConfig = await getEmailSenderConfig('artist');
    let fromName = senderConfig.fromName;
    let fromEmail = senderConfig.fromEmail;

    // Override sender if fromUserId provided
    if (fromUserId) {
      const { data: senderAlias } = await supabaseClient
        .from("admin_email_aliases")
        .select("email")
        .eq("admin_user_id", fromUserId)
        .eq("is_primary", true)
        .maybeSingle();

      const { data: senderProfile } = await supabaseClient
        .from("profiles")
        .select("full_name")
        .eq("id", fromUserId)
        .single();

      if (senderAlias?.email) {
        fromEmail = senderAlias.email;
        fromName = senderProfile?.full_name || fromName;
      }
    }
    
    // Merge sender's default CC with any CC emails passed in the request
    const allCcEmails = [...new Set([...senderConfig.defaultCc, ...(ccEmails || [])])];

    // Handle test email
    if (isTest && testEmail) {
      // Get sample artist data for merge field preview
      let sampleMergeData: MergeData = {
        artist_name: "Sample Artist",
        contact_name: "Sample Contact",
        contact_first_name: "Sample",
        contact_last_name: "Contact",
        contact_role: "Manager",
        performance_date: "Saturday, May 16",
        set_time: "3:00pm",
        stage: "Main Stage",
        set_length: "90 min",
        offer_amount: "$2,500",
        guest_list: "5",
        event_name: eventDetails?.title || "Event Name",
        event_dates: formatEventDates(eventDetails?.event_date),
        venue_name: eventDetails?.venue_name || "Venue Name",
      };

      // If a sample artist is provided, get their actual data
      if (sampleArtistId) {
        const { data: artistData } = await supabaseClient
          .from("artists")
          .select("name")
          .eq("id", sampleArtistId)
          .single();

        const { data: offerData } = await supabaseClient
          .from("artist_offers")
          .select("performance_date, set_time, stage, set_length_minutes, offer_amount, guest_list_count, venue_name")
          .eq("artist_id", sampleArtistId)
          .eq("event_id", eventId)
          .single();

        const { data: contactData } = await supabaseClient
          .from("artist_contacts")
          .select("name, first_name, last_name, role")
          .eq("artist_id", sampleArtistId)
          .limit(1)
          .single();

        if (artistData) {
          sampleMergeData.artist_name = artistData.name;
        }
        if (contactData) {
          sampleMergeData.contact_name = contactData.name;
          sampleMergeData.contact_first_name = contactData.first_name || contactData.name?.split(' ')[0] || "";
          sampleMergeData.contact_last_name = contactData.last_name || contactData.name?.split(' ').slice(1).join(' ') || "";
          sampleMergeData.contact_role = ROLE_LABELS[contactData.role] || contactData.role;
        }
        if (offerData) {
          sampleMergeData.performance_date = formatDate(offerData.performance_date);
          sampleMergeData.set_time = offerData.set_time || "";
          sampleMergeData.stage = offerData.stage || "";
          sampleMergeData.set_length = offerData.set_length_minutes ? `${offerData.set_length_minutes} min` : "";
          sampleMergeData.offer_amount = offerData.offer_amount ? `$${offerData.offer_amount.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}` : "";
          sampleMergeData.guest_list = offerData.guest_list_count?.toString() || "";
          sampleMergeData.venue_name = offerData.venue_name || eventDetails?.venue_name || "";
        }
      }

      const testSubject = `[TEST] ${replaceMergeFields(subject, sampleMergeData)}`;
      const testBody = replaceMergeFields(bodyHtml, sampleMergeData);

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to: [testEmail],
          subject: testSubject,
          html: testBody + `<p style="color:#999;font-size:12px;margin-top:40px;border-top:1px solid #ddd;padding-top:20px;">This is a test email. Merge fields have been replaced with sample data.</p>`,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to send test email: ${errorText}`);
      }

      return new Response(
        JSON.stringify({ success: true, message: "Test email sent" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle scheduled send - store for later processing
    if (scheduledFor) {
      // For now, we'll just note that scheduling is not yet implemented
      // In a production system, you'd store this in a scheduled_emails table
      // and have a cron job process them
      console.log("Scheduled send requested for:", scheduledFor);
      // Continue with immediate send for now, but log the scheduled time
    }

    if (!artistIds || artistIds.length === 0) {
      throw new Error("No artists selected");
    }

    // Get contacts for selected artists
    let contactsQuery = supabaseClient
      .from("artist_contacts")
      .select(`
        id, 
        name,
        first_name,
        last_name,
        email, 
        role,
        artist_id,
        artists!inner(id, name, event_id)
      `)
      .in("artist_id", artistIds);

    if (targetRoles && targetRoles.length > 0) {
      contactsQuery = contactsQuery.in("role", targetRoles);
    }

    const { data: contacts, error: contactsError } = await contactsQuery;
    
    if (contactsError) throw contactsError;

    if (!contacts || contacts.length === 0) {
      throw new Error("No contacts found matching criteria");
    }

    // Filter contacts by event
    const eventContacts = contacts.filter((c: any) => c.artists?.event_id === eventId);

    if (eventContacts.length === 0) {
      throw new Error("No contacts found for this event");
    }

    // Get offers for all selected artists
    const { data: offers } = await supabaseClient
      .from("artist_offers")
      .select("artist_id, performance_date, set_time, stage, set_length_minutes, offer_amount, guest_list_count, venue_name")
      .eq("event_id", eventId)
      .in("artist_id", artistIds);

    const offersByArtist = new Map(offers?.map(o => [o.artist_id, o]) || []);

    // Create email record
    const { data: emailRecord, error: emailError } = await supabaseClient
      .from("artist_emails")
      .insert({
        event_id: eventId,
        subject,
        body_html: bodyHtml,
        target_roles: targetRoles,
        sent_by: user.id,
      })
      .select()
      .single();

    if (emailError) throw emailError;

    // Save attachments
    if (attachments && attachments.length > 0) {
      const attachmentRecords = attachments.map((att: any) => ({
        email_id: emailRecord.id,
        file_name: att.name,
        file_path: att.path,
      }));

      await supabaseClient
        .from("artist_email_attachments")
        .insert(attachmentRecords);
    }

    // Prepare attachment URLs for email
    const attachmentUrls: { filename: string; content: string }[] = [];
    if (attachments && attachments.length > 0) {
      for (const att of attachments) {
        const { data: fileData } = await supabaseClient.storage
          .from("artist-attachments")
          .download(att.path);
        
        if (fileData) {
          const arrayBuffer = await fileData.arrayBuffer();
          const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
          attachmentUrls.push({
            filename: att.name,
            content: base64,
          });
        }
      }
    }

    // Group contacts by artist - one email per artist with all contacts CC'd
    const contactsByArtist = new Map<string, typeof eventContacts>();
    for (const contact of eventContacts) {
      const artistId = contact.artist_id;
      if (!contactsByArtist.has(artistId)) {
        contactsByArtist.set(artistId, []);
      }
      contactsByArtist.get(artistId)!.push(contact);
    }

    console.log(`Sending emails to ${contactsByArtist.size} artists`);

    // Send one email per artist
    const results = [];
    for (const [artistId, artistContacts] of contactsByArtist) {
      const trackingId = crypto.randomUUID();
      
      // Find artist name and offer data
      const artistOffer = offersByArtist.get(artistId);
      const artistName = (artistContacts[0] as any).artists?.name || "";
      
      // Sort contacts: primary first, then by role
      const sortedContacts = [...artistContacts].sort((a, b) => {
        // Prefer artist_direct or manager as primary
        const primaryRoles = ['artist_direct', 'manager', 'agent'];
        const aIndex = primaryRoles.indexOf(a.role);
        const bIndex = primaryRoles.indexOf(b.role);
        if (aIndex !== -1 && bIndex === -1) return -1;
        if (aIndex === -1 && bIndex !== -1) return 1;
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        return a.name.localeCompare(b.name);
      });

      // First contact is TO, rest are CC
      const primaryContact = sortedContacts[0];
      const ccContacts = sortedContacts.slice(1);
      
      // Build merge data for this artist - use primary contact for contact-specific fields
      // Get first/last name from fields or parse from full name
      const contactFirstName = (primaryContact as any).first_name || primaryContact.name?.split(' ')[0] || "";
      const contactLastName = (primaryContact as any).last_name || primaryContact.name?.split(' ').slice(1).join(' ') || "";
      
      const mergeData: MergeData = {
        artist_name: artistName,
        contact_name: primaryContact.name,
        contact_first_name: contactFirstName,
        contact_last_name: contactLastName,
        contact_role: ROLE_LABELS[primaryContact.role] || primaryContact.role,
        performance_date: formatDate(artistOffer?.performance_date),
        set_time: artistOffer?.set_time || "",
        stage: artistOffer?.stage || "",
        set_length: artistOffer?.set_length_minutes ? `${artistOffer.set_length_minutes} min` : "",
        offer_amount: artistOffer?.offer_amount ? `$${artistOffer.offer_amount.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}` : "",
        guest_list: artistOffer?.guest_list_count?.toString() || "",
        event_name: eventDetails?.title || "",
        event_dates: formatEventDates(eventDetails?.event_date),
        venue_name: artistOffer?.venue_name || eventDetails?.venue_name || "",
      };

      console.log(`Processing artist: ${artistName}, merge data:`, mergeData);

      // Replace merge fields
      const personalizedSubject = replaceMergeFields(subject, mergeData);
      const personalizedBody = replaceMergeFields(bodyHtml, mergeData);

      console.log(`Subject after merge: ${personalizedSubject}`);
      
      // Create recipient records for all contacts on this email
      for (const contact of sortedContacts) {
        const isTO = contact.id === primaryContact.id;
        await supabaseClient
          .from("artist_email_recipients")
          .insert({
            email_id: emailRecord.id,
            contact_id: contact.id,
            artist_id: artistId,
            tracking_id: isTO ? trackingId : crypto.randomUUID(),
            status: "pending",
          });
      }

      // Add tracking pixel
      const trackingPixel = `<img src="${supabaseUrl}/functions/v1/track-artist-email-open?id=${trackingId}" width="1" height="1" style="display:none" />`;
      const emailWithTracking = personalizedBody + trackingPixel;

      try {
        // Use configured from settings
        const fromAddress = `${fromName} <${fromEmail}>`;
        
        const emailPayload: any = {
          from: fromAddress,
          to: [primaryContact.email],
          subject: personalizedSubject,
          html: emailWithTracking,
          reply_to: replyTo || fromEmail,
        };

        // Combine: artist contacts CC + default artist CC from settings + user's team CC
        const allCc = [
          ...ccContacts.map(c => c.email),
          ...allCcEmails,
        ];
        
        // Deduplicate CC list
        const uniqueCc = [...new Set(allCc)];
        
        if (uniqueCc.length > 0) {
          emailPayload.cc = uniqueCc;
        }

        if (attachmentUrls.length > 0) {
          emailPayload.attachments = attachmentUrls;
        }

        console.log(`Sending email for ${artistName} to ${primaryContact.email} with ${ccContacts.length} CC'd`);

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
          throw new Error(errorText);
        }

        // Update all recipient statuses for this artist
        for (const contact of sortedContacts) {
          await supabaseClient
            .from("artist_email_recipients")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("email_id", emailRecord.id)
            .eq("contact_id", contact.id);
        }

        results.push({ artist: artistName, primaryEmail: primaryContact.email, ccCount: ccContacts.length, status: "sent" });
      } catch (sendError: any) {
        // Update all recipients with error
        for (const contact of sortedContacts) {
          await supabaseClient
            .from("artist_email_recipients")
            .update({ status: "failed", error_message: sendError.message })
            .eq("email_id", emailRecord.id)
            .eq("contact_id", contact.id);
        }

        results.push({ artist: artistName, primaryEmail: primaryContact.email, status: "failed", error: sendError.message });
      }
    }

    const successCount = results.filter(r => r.status === "sent").length;
    const failCount = results.filter(r => r.status === "failed").length;

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: successCount, 
        failed: failCount,
        emailId: emailRecord.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error sending artist email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
