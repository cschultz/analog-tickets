import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Parse thread ID from email address like team+abc123@example.invalid
const parseThreadId = (email: string): string | null => {
  const match = email.match(/team\+([a-f0-9-]+)@/i);
  return match ? match[1] : null;
};

// Strip quoted replies from email body
const stripQuotedContent = (text: string): string => {
  if (!text) return '';
  
  // Common reply patterns
  const patterns = [
    /^On .+ wrote:$/m, // "On Mon, Jan 13, 2025 wrote:"
    /^-{2,}Original Message-{2,}/m,
    /^>{1,}/m, // Lines starting with >
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
};

// Extract name from email like "John Doe <john@example.com>"
const parseFromField = (from: string): { email: string; name: string | null } => {
  const match = from.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].trim().replace(/^["']|["']$/g, ''), email: match[2] };
  }
  return { email: from, name: null };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Resend inbound webhook payload
    const payload = await req.json();
    console.log('Received inbound email webhook:', JSON.stringify(payload, null, 2));

    // Extract email data from Resend webhook
    const {
      from,
      to,
      cc,
      subject,
      text,
      html,
    } = payload;

    if (!from || !to) {
      console.error('Missing required fields: from or to');
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse the "to" field to find thread ID
    const toAddresses = Array.isArray(to) ? to : [to];
    let threadId: string | null = null;
    
    for (const addr of toAddresses) {
      threadId = parseThreadId(addr);
      if (threadId) break;
    }

    // Also check CC for thread ID
    if (!threadId && cc) {
      const ccAddresses = Array.isArray(cc) ? cc : [cc];
      for (const addr of ccAddresses) {
        threadId = parseThreadId(addr);
        if (threadId) break;
      }
    }

    // Parse sender info early for fallback lookup
    const sender = parseFromField(from);

    // If no thread ID, try to find entity by sender email
    if (!threadId) {
      console.log('No thread ID found, attempting sender email lookup:', sender.email);
      
      // Search for the sender email across all contact tables
      const contactTables = [
        { table: 'vendor_contacts', entityType: 'vendor', entityIdField: 'vendor_id' },
        { table: 'artisan_contacts', entityType: 'artisan', entityIdField: 'artisan_id' },
        { table: 'partner_contacts', entityType: 'partner', entityIdField: 'partner_id' },
        { table: 'production_volunteer_contacts', entityType: 'volunteer', entityIdField: 'volunteer_id' },
        { table: 'artist_contacts', entityType: 'artist', entityIdField: 'artist_id' },
      ];

      let matchedEntity: { type: string; id: string } | null = null;

      for (const { table, entityType, entityIdField } of contactTables) {
        const { data: contact } = await supabaseAdmin
          .from(table)
          .select('*')
          .ilike('email', sender.email)
          .limit(1)
          .single();

        if (contact && contact[entityIdField]) {
          matchedEntity = { type: entityType, id: String(contact[entityIdField]) };
          console.log(`Found matching ${entityType} contact:`, contact.id);
          break;
        }
      }

      if (!matchedEntity) {
        console.log('No matching contact found for email:', sender.email);
        return new Response(JSON.stringify({ 
          message: 'No thread ID and no matching contact found',
          sender_email: sender.email 
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Find the most recent thread for this entity, or create one
      const { data: existingThread } = await supabaseAdmin
        .from('production_email_threads')
        .select('id')
        .eq('entity_type', matchedEntity.type)
        .eq('entity_id', matchedEntity.id)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .single();

      if (existingThread) {
        threadId = existingThread.id;
        console.log('Found existing thread for entity:', threadId);
      } else {
        // Create a new thread for this entity
        const { data: newThread, error: newThreadError } = await supabaseAdmin
          .from('production_email_threads')
          .insert({
            entity_type: matchedEntity.type,
            entity_id: matchedEntity.id,
            subject: subject || 'Email from contact',
            from_email: sender.email,
            from_name: sender.name,
          })
          .select()
          .single();

        if (newThreadError || !newThread) {
          console.error('Failed to create new thread:', newThreadError);
          return new Response(JSON.stringify({ error: 'Failed to create thread' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        threadId = newThread.id;
        console.log('Created new thread for entity:', threadId);
      }
    }

    // Verify thread exists
    const { data: thread, error: threadError } = await supabaseAdmin
      .from('production_email_threads')
      .select('id, entity_type, entity_id')
      .eq('id', threadId)
      .single();

    if (threadError || !thread) {
      console.error('Thread not found:', threadId, threadError);
      return new Response(JSON.stringify({ error: 'Thread not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Clean up body text
    const cleanedText = stripQuotedContent(text || '');

    // Store the message
    const { data: message, error: messageError } = await supabaseAdmin
      .from('production_email_messages')
      .insert({
        thread_id: threadId,
        direction: 'inbound',
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

    if (messageError) {
      console.error('Error storing message:', messageError);
      return new Response(JSON.stringify({ error: 'Failed to store message' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Successfully stored inbound message:', message.id);

    // Auto-assign owner based on sender email alias
    // Check if the sender email matches an admin's email alias
    const { data: adminAlias } = await supabaseAdmin
      .from('admin_email_aliases')
      .select('admin_user_id')
      .ilike('email', sender.email)
      .limit(1)
      .single();

    if (adminAlias) {
      console.log('Found admin alias match, auto-assigning owner:', adminAlias.admin_user_id);
      
      // Get the active event
      const { data: activeEvent } = await supabaseAdmin
        .from('event_details')
        .select('id')
        .eq('is_active', true)
        .single();
      
      if (activeEvent) {
        // Upsert ownership record
        await supabaseAdmin
          .from('entity_ownership')
          .upsert({
            entity_type: thread.entity_type,
            entity_id: thread.entity_id,
            event_id: activeEvent.id,
            owner_id: adminAlias.admin_user_id,
          }, {
            onConflict: 'entity_type,entity_id,event_id',
            ignoreDuplicates: false,
          });
        
        console.log('Auto-assigned owner for entity:', thread.entity_id);
      }
    }

    // Notify admins of new reply
    await supabaseAdmin.from('admin_notifications').insert({
      type: 'email_reply',
      title: 'New Email Reply',
      message: `${sender.name || sender.email} replied to: ${subject}`,
      metadata: {
        thread_id: threadId,
        message_id: message.id,
        entity_type: thread.entity_type,
        entity_id: thread.entity_id,
        from_email: sender.email,
      },
    });

    return new Response(JSON.stringify({ success: true, message_id: message.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error processing inbound email:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
