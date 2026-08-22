import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Parse thread ID from email address like talent+abc123@example.invalid
const parseThreadId = (email: string): string | null => {
  const match = email.match(/talent\+([a-f0-9-]+)@/i);
  return match ? match[1] : null;
};

// Strip quoted replies from email body
const stripQuotedContent = (text: string): string => {
  if (!text) return '';
  
  const patterns = [
    /^On .+ wrote:$/m,
    /^-{2,}Original Message-{2,}/m,
    /^>{1,}/m,
    /^From: .+$/m,
    /^Sent: .+$/m,
  ];
  
  let result = text;
  for (const pattern of patterns) {
    const match = result.search(pattern);
    if (match > 0) {
      result = result.substring(0, match).trim();
    }
  }
  
  return result;
// Strip quoted replies from email body
};

// Extract asset URLs from email body
const extractAssetUrls = (text: string): string[] => {
  if (!text) return [];
  
  const urlPattern = /https?:\/\/[^\s<>"']+/gi;
  const matches = text.match(urlPattern) || [];
  
  // Filter to supported sources
  return matches.filter(url => {
    const lowerUrl = url.toLowerCase();
    return (
      lowerUrl.includes('dropbox.com') ||
      lowerUrl.includes('dl.dropboxusercontent.com') ||
      lowerUrl.includes('drive.google.com') ||
      lowerUrl.includes('docs.google.com') ||
      // Direct file URLs
      lowerUrl.match(/\.(jpg|jpeg|png|gif|webp|mp3|wav|flac|mp4|mov|pdf|zip)/)
    );
  });
};

// Extract name and email from "Name <email@domain.com>" format
const parseFromField = (from: string): { email: string; name: string | null } => {
  const match = from.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].trim().replace(/^["']|["']$/g, ''), email: match[2] };
  }
  return { email: from, name: null };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse inbound email from Resend
    const payload = await req.json();
    console.log("Received inbound artist email:", JSON.stringify(payload, null, 2));

    const {
      from,
      to,
      cc,
      subject,
      text,
      html,
      email_id,
    } = payload;

    if (!from || !to) {
      console.error('Missing required fields: from or to');
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse sender info
    const sender = parseFromField(from);
    const toAddresses = Array.isArray(to) ? to : [to];
    
    // Try to find thread ID from to/cc addresses
    let threadId: string | null = null;
    
    for (const addr of toAddresses) {
      threadId = parseThreadId(addr);
      if (threadId) break;
    }
    
    if (!threadId && cc) {
      const ccAddresses = Array.isArray(cc) ? cc : [cc];
      for (const addr of ccAddresses) {
        threadId = parseThreadId(addr);
        if (threadId) break;
      }
    }

    // Try to match the sender to an artist contact
    const { data: contact } = await supabase
      .from("artist_contacts")
      .select("id, artist_id, name, artists(id, name, event_id)")
      .ilike("email", sender.email)
      .limit(1)
      .single();

    let artistId = contact?.artist_id || null;
    let artistName = (contact as any)?.artists?.name || "Unknown Artist";
    let eventId = (contact as any)?.artists?.event_id || null;

    // If no thread ID found but we have an artist, find or create a thread
    if (!threadId && artistId && eventId) {
      // Look for existing thread
      const { data: existingThread } = await supabase
        .from("production_email_threads")
        .select("id")
        .eq("entity_type", "artist")
        .eq("entity_id", artistId)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .single();

      if (existingThread) {
        threadId = existingThread.id;
        console.log("Found existing artist thread:", threadId);
      } else {
        // Create new thread
        const { data: newThread, error: newThreadError } = await supabase
          .from("production_email_threads")
          .insert({
            event_id: eventId,
            entity_type: "artist",
            entity_id: artistId,
            subject: subject || "Email from artist",
            from_email: sender.email,
            from_name: sender.name,
          })
          .select()
          .single();

        if (newThreadError || !newThread) {
          console.error("Failed to create thread:", newThreadError);
        } else {
          threadId = newThread.id;
          console.log("Created new artist thread:", threadId);
        }
      }
    }

    // Clean up body text
    const cleanedText = stripQuotedContent(text || '');

    // Store in both systems for now (legacy + thread)
    // Legacy: artist_email_replies table
    let originalEmailId = null;
    if (artistId) {
      const { data: recentEmail } = await supabase
        .from("artist_email_recipients")
        .select("email_id")
        .eq("artist_id", artistId)
        .order("sent_at", { ascending: false })
        .limit(1)
        .single();

      if (recentEmail) {
        originalEmailId = recentEmail.email_id;
      }
    }

    const { data: legacyReply, error: legacyError } = await supabase
      .from("artist_email_replies")
      .insert({
        artist_id: artistId,
        original_email_id: originalEmailId,
        from_email: sender.email,
        from_name: sender.name,
        to_email: toAddresses[0] || "",
        subject: subject || "(No subject)",
        body_text: cleanedText || text,
        body_html: html,
        resend_email_id: email_id,
        raw_payload: payload,
        is_read: false,
      })
      .select()
      .single();

    if (legacyError) {
      console.error("Failed to store legacy reply:", legacyError);
    } else {
      console.log("Stored legacy reply with id:", legacyReply.id);
    }

    // Thread system: production_email_messages
    if (threadId) {
      const { data: threadMessage, error: threadMsgError } = await supabase
        .from("production_email_messages")
        .insert({
          thread_id: threadId,
          direction: "inbound",
          from_email: sender.email,
          from_name: sender.name,
          to_emails: toAddresses,
          cc_emails: cc ? (Array.isArray(cc) ? cc : [cc]) : [],
          subject: subject,
          body_html: html,
          body_text: cleanedText || text,
          sent_at: new Date().toISOString(),
          raw_payload: payload,
        })
        .select()
        .single();

      if (threadMsgError) {
        console.error("Error storing thread message:", threadMsgError);
      } else {
        console.log("Stored thread message:", threadMessage.id);
      }
    }

    // Extract assets from email (links + attachments) if we have an artist
    let extractedAssets = 0;
    if (artistId) {
      const assetUrls = extractAssetUrls(text || '');
      const attachments = payload.attachments || [];
      
      if (assetUrls.length > 0 || attachments.length > 0) {
        console.log(`Found ${assetUrls.length} asset URLs and ${attachments.length} attachments`);
        
        try {
          // Call extract-artist-assets function
          const extractResponse = await fetch(
            `${supabaseUrl}/functions/v1/extract-artist-assets`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                artist_id: artistId,
                urls: assetUrls,
                attachments: attachments.map((att: any) => ({
                  filename: att.filename || att.name,
                  content: att.content, // Base64 content from Resend
                  content_type: att.contentType || att.content_type,
                })),
                source_email_id: legacyReply?.id,
              }),
            }
          );
          
          const extractResult = await extractResponse.json();
          if (extractResult.success) {
            extractedAssets = extractResult.results?.filter((r: any) => r.success).length || 0;
            console.log(`Extracted ${extractedAssets} assets from email`);
          } else {
            console.error("Asset extraction failed:", extractResult.error);
          }
        } catch (extractError) {
          console.error("Error calling extract-artist-assets:", extractError);
        }
      }
    }

    // Create admin notification
    const notificationMessage = extractedAssets > 0
      ? `${sender.name || sender.email} replied with ${extractedAssets} asset(s): ${(subject || "").substring(0, 40)}`
      : `${sender.name || sender.email} replied: ${(subject || "").substring(0, 50)}`;

    await supabase
      .from("admin_notifications")
      .insert({
        type: "artist_reply",
        title: extractedAssets > 0 ? "Artist Reply with Assets" : "New Artist Reply",
        message: notificationMessage,
        metadata: {
          reply_id: legacyReply?.id,
          thread_id: threadId,
          artist_id: artistId,
          artist_name: artistName,
          from_email: sender.email,
          extracted_assets: extractedAssets,
        },
      });

    return new Response(
      JSON.stringify({ 
        success: true, 
        legacy_reply_id: legacyReply?.id,
        thread_id: threadId 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error processing inbound artist email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
