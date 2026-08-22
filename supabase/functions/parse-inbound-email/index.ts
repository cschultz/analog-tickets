import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Valid categories and roles
const VALID_CATEGORIES = ["artist", "partner", "vendor", "artisan", "winery", "volunteer"] as const;
type Category = typeof VALID_CATEGORIES[number];
const VALID_ARTIST_ROLES = ["manager", "agent", "publicist", "tour_manager", "artist_direct", "label", "other"];

interface ParsedContact {
  name: string;
  email: string;
  phone?: string;
  role?: string;
  confidence: number;
}

interface ParsedEntity {
  name: string;
  website?: string;
  instagram?: string;
  spotify?: string;
  description?: string;
  genre?: string;
}

interface ParsedSummary {
  opportunity_type?: string;
  financial_details?: string;
  key_dates?: string;
  follow_up_actions?: string[];
  raw_summary?: string;
}

interface ParsedOffer {
  artist_name: string;
  offer_amount?: number;
  offer_currency?: string;
  performance_date?: string;
  set_time?: string;
  set_length_minutes?: number;
  stage?: string;
  venue_name?: string;
  venue_address?: string;
  city?: string;
  state?: string;
  capacity?: number;
  ticket_price?: number;
  deposit_percentage?: number;
  deposit_notes?: string;
  guest_list_count?: number;
  guest_list_notes?: string;
  merchandise_terms?: string;
  radius_clause?: string;
  radius_days?: number;
  radius_miles?: number;
  expiration_date?: string;
  ages?: string;
  indoor_outdoor?: string;
  others_on_lineup?: string;
  past_lineup_url?: string;
  additional_perks?: string;
  other_terms?: string;
  confidence: number;
}

interface ParseResult {
  contacts: ParsedContact[];
  entity: ParsedEntity;
  summary: ParsedSummary;
  offer?: ParsedOffer;
  recommended_category: Category;
  category_confidence: number;
  reasoning: string;
  ambiguities: string[];
}

interface DuplicateMatch {
  entity_type: string;
  entity_id: string;
  entity_name: string;
  match_type: "email" | "name";
  matched_value: string;
}

const AUTO_CONFIRM_THRESHOLD = 0.85;
const HIGH_CONFIDENCE_THRESHOLD = 0.75;

// Research artist using AI
async function researchArtist(artistName: string): Promise<Partial<ParsedEntity>> {
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableApiKey) return {};

  try {
    console.log(`Researching artist: ${artistName}`);
    
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { 
            role: "system", 
            content: `You are an expert music industry researcher. Given an artist/band name, provide accurate information.
Only provide information you are confident about. Leave field empty if unknown.
Return JSON: { "genre": "", "description": "", "website": "", "instagram": "", "spotify": "" }
Only output valid JSON, no markdown.` 
          },
          { role: "user", content: `Research: "${artistName}"` }
        ],
      }),
    });

    if (!response.ok) return {};

    const data = await response.json();
    let content = data.choices[0]?.message?.content?.trim() || "";
    
    // Clean markdown
    if (content.startsWith("```")) content = content.replace(/```json?\n?|```/g, "");
    
    const parsed = JSON.parse(content);
    const result: Partial<ParsedEntity> = {};
    
    if (parsed.genre?.trim()) result.genre = parsed.genre.trim();
    if (parsed.description?.trim()) result.description = parsed.description.trim();
    if (parsed.website?.includes("http")) result.website = parsed.website.trim();
    if (parsed.instagram?.includes("instagram")) result.instagram = parsed.instagram.trim();
    if (parsed.spotify?.includes("spotify")) result.spotify = parsed.spotify.trim();
    
    return result;
  } catch (e) {
    console.error("Error researching artist:", e);
    return {};
  }
}

// Main AI parsing function - unified for all categories
async function parseEmailWithAI(
  emailContent: string,
  subject: string,
  fromEmail: string,
  toAddress: string
): Promise<ParseResult> {
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableApiKey) throw new Error("LOVABLE_API_KEY not configured");

  // Determine initial category hint from email address
  const addressHint = toAddress.toLowerCase();
  let categoryHint = "";
  if (addressHint.includes("talent@") || addressHint.includes("artist@")) {
    categoryHint = "This email was sent to talent/artist address, likely about performers.";
  } else if (addressHint.includes("partner@") || addressHint.includes("sponsor@")) {
    categoryHint = "This email was sent to partner/sponsor address, likely about sponsorships or partnerships.";
  } else if (addressHint.includes("vendor@")) {
    categoryHint = "This email was sent to vendor address, likely about services or equipment.";
  } else if (addressHint.includes("artisan@") || addressHint.includes("market@")) {
    categoryHint = "This email was sent to artisan/market address, likely about marketplace vendors.";
  } else if (addressHint.includes("wine@") || addressHint.includes("winery@")) {
    categoryHint = "This email was sent to wine address, likely about wineries or beverage partners.";
  } else if (addressHint.includes("volunteer@")) {
    categoryHint = "This email was sent to volunteer address, likely someone offering to help.";
  }

  const systemPrompt = `You are an expert at parsing emails for a music/arts festival called Cosmico. Extract structured information and categorize the sender.

${categoryHint}

CATEGORIES (choose the most appropriate):
- "artist": Musicians, bands, DJs, performers, booking agents, managers contacting about performances
- "partner": Sponsors, brand partnerships, marketing collaborations, media partners, corporate sponsors
- "vendor": Service providers, equipment rentals, catering, production services, AV, staging
- "artisan": Crafters, makers, marketplace vendors, artisan market booth inquiries
- "winery": Wineries, wine brands, beverage sponsors, wine tasting providers
- "volunteer": People offering to help, volunteer inquiries, crew applications

EXTRACT:
1. **CONTACTS**: All people mentioned with name, email, phone, role/title, confidence (0-1)
2. **ENTITY**: Business/artist name, website, Instagram, Spotify (for artists), description, genre (for artists)
3. **SUMMARY**: opportunity_type, financial_details, key_dates, follow_up_actions (array), raw_summary (1-2 sentences)
4. **OFFER** (for artists only): If this is a performance offer, extract offer details including:
   - artist_name, offer_amount, offer_currency, performance_date (YYYY-MM-DD, use 2026 for Cosmico dates)
   - set_time (exact as written), set_length_minutes, stage, venue details
   - deposit info, guest list, merchandise terms, radius clause, expiration, ages, perks

5. **CATEGORY**: Most appropriate from list above
6. **CONFIDENCE**: How confident in category (0-1)
7. **REASONING**: Brief explanation
8. **AMBIGUITIES**: List unclear aspects that need human review

CRITICAL - ENTITY NAME EXTRACTION:
The entity.name field is REQUIRED. Use these strategies in order:
1. **Look in email body**: Find artist/band names, business names, winery names explicitly mentioned
2. **Look at email signatures**: Company names, business names in signature blocks
3. **Extract from email domain**: "artist@example.invalid" → "Maggie Koerner"
4. **Extract from website URLs**: "www.wildcattlewinery.com" → "Wild Cattle Winery"  
5. **Use sender name**: If sender is clearly the entity (not a manager/agent)
6. **Look at subject line**: Often contains the artist/company name
7. **Parse forwarded content**: Original sender's signature/company

NEVER leave entity.name empty. Make your best inference - it can be corrected later.

IMPORTANT:
- Extract ALL contacts mentioned, not just the sender
- For forwarded emails, look at the original content for the REAL entity, not the forwarder
- For artist roles, use: manager, agent, publicist, tour_manager, artist_direct, label, other
- If no clear category, use the one matching the email address hint or "partner" with lower confidence
- Cosmico takes place MAY 15-17, 2026 - convert any dates to 2026

Return ONLY valid JSON:
{
  "contacts": [{ "name": "", "email": "", "phone": "", "role": "", "confidence": 0.9 }],
  "entity": { "name": "", "website": "", "instagram": "", "spotify": "", "description": "", "genre": "" },
  "summary": { "opportunity_type": "", "financial_details": "", "key_dates": "", "follow_up_actions": [], "raw_summary": "" },
  "offer": { ... } // only if artist performance offer
  "recommended_category": "partner",
  "category_confidence": 0.85,
  "reasoning": "",
  "ambiguities": []
}`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${lovableApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `To: ${toAddress}\nFrom: ${fromEmail}\nSubject: ${subject}\n\nEmail Content:\n${emailContent}` }
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("AI API error:", error);
    throw new Error(`AI parsing failed: ${response.status}`);
  }

  const data = await response.json();
  let content = data.choices[0]?.message?.content?.trim() || "";
  
  // Clean markdown
  if (content.startsWith("```")) content = content.replace(/```json?\n?|```/g, "");

  try {
    const parsed = JSON.parse(content) as ParseResult;
    
    // Validate category
    if (!VALID_CATEGORIES.includes(parsed.recommended_category)) {
      parsed.recommended_category = "partner";
      parsed.category_confidence = 0.5;
    }
    
    // Validate artist roles
    for (const contact of parsed.contacts || []) {
      if (parsed.recommended_category === "artist" && contact.role) {
        if (!VALID_ARTIST_ROLES.includes(contact.role)) {
          contact.role = "other";
        }
      }
    }
    
    return parsed;
  } catch (e) {
    console.error("Failed to parse AI response:", content);
    throw new Error("Failed to parse AI response as JSON");
  }
}

// Internal/admin email patterns to exclude from duplicate matching and
// contact lists. Configure with INTERNAL_EMAIL_PATTERNS (comma separated,
// e.g. "@example.org,noreply@"). Empty by default — no operator-specific
// address or domain is hardcoded here.
const INTERNAL_EMAIL_PATTERNS = (Deno.env.get("INTERNAL_EMAIL_PATTERNS") ?? "")
  .split(",")
  .map((p) => p.trim().toLowerCase())
  .filter(Boolean);

// Known admin team emails - filter these from contact lists.
// Configure with PLATFORM_ADMIN_EMAILS (comma separated). Empty by default.
const ADMIN_TEAM_EMAILS = (Deno.env.get("PLATFORM_ADMIN_EMAILS") ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter((e) => e.includes("@"));


function isInternalEmail(email: string): boolean {
  const emailLower = email.toLowerCase();
  return INTERNAL_EMAIL_PATTERNS.some(pattern => emailLower.includes(pattern)) ||
    ADMIN_TEAM_EMAILS.some(e => emailLower === e.toLowerCase());
}

function isAdminTeamEmail(email: string): boolean {
  const emailLower = email.toLowerCase();
  return ADMIN_TEAM_EMAILS.some(e => emailLower === e.toLowerCase()) ||
    INTERNAL_EMAIL_PATTERNS.some(pattern => emailLower.includes(pattern));
}

// Find the admin who forwarded/sent the email
async function findForwardingAdmin(supabase: any, fromEmail: string, emailContent: string): Promise<string | null> {
  // Check if the sender is an admin
  const senderLower = fromEmail.toLowerCase();
  
  // First check direct match against admin team
  for (const adminEmail of ADMIN_TEAM_EMAILS) {
    if (senderLower === adminEmail.toLowerCase() || senderLower.includes(adminEmail.split('@')[0])) {
      // Look up admin user ID
      const { data } = await supabase.rpc('find_admin_by_email', { p_email: adminEmail });
      if (data) {
        console.log(`Found forwarding admin by email: ${adminEmail} -> ${data}`);
        return data;
      }
    }
  }
  
  // Check admin_email_aliases
  const { data: aliasMatch } = await supabase
    .from('admin_email_aliases')
    .select('admin_user_id')
    .ilike('email', senderLower)
    .limit(1)
    .maybeSingle();
    
  if (aliasMatch?.admin_user_id) {
    console.log(`Found forwarding admin by alias: ${fromEmail} -> ${aliasMatch.admin_user_id}`);
    return aliasMatch.admin_user_id;
  }
  
  // Check profiles table
  const { data: profileMatch } = await supabase
    .from('profiles')
    .select('id')
    .ilike('email', senderLower)
    .limit(1)
    .maybeSingle();
    
  if (profileMatch?.id) {
    console.log(`Found forwarding admin by profile: ${fromEmail} -> ${profileMatch.id}`);
    return profileMatch.id;
  }
  
  return null;
}

// Create email thread linked to entity
async function createEmailThread(
  supabase: any,
  eventId: string,
  entityType: string,
  entityId: string,
  subject: string,
  fromEmail: string,
  fromName: string | null,
  toEmails: string[],
  bodyHtml: string,
  bodyText: string,
  sentBy: string | null
): Promise<string | null> {
  try {
    // Create thread
    const { data: thread, error: threadError } = await supabase
      .from('production_email_threads')
      .insert({
        event_id: eventId,
        entity_type: entityType,
        entity_id: entityId,
        subject: subject,
        message_count: 1,
        last_message_at: new Date().toISOString(),
      })
      .select('id')
      .single();
      
    if (threadError) {
      console.error('Failed to create email thread:', threadError);
      return null;
    }
    
    // Create message
    const { error: msgError } = await supabase
      .from('production_email_messages')
      .insert({
        thread_id: thread.id,
        direction: 'inbound',
        from_email: fromEmail,
        from_name: fromName,
        to_emails: toEmails,
        subject: subject,
        body_html: bodyHtml,
        body_text: bodyText,
        sent_at: new Date().toISOString(),
        sent_by: sentBy,
      });
      
    if (msgError) {
      console.error('Failed to create email message:', msgError);
    }
    
    console.log(`Created email thread ${thread.id} for ${entityType}:${entityId}`);
    return thread.id;
  } catch (e) {
    console.error('Error creating email thread:', e);
    return null;
  }
}

// Set entity ownership (only if not already set)
async function setEntityOwnership(
  supabase: any,
  entityType: string,
  entityId: string,
  eventId: string,
  ownerId: string
): Promise<boolean> {
  try {
    // Check if ownership already exists
    const { data: existing } = await supabase
      .from('entity_ownership')
      .select('owner_id')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .eq('event_id', eventId)
      .maybeSingle();
      
    if (existing?.owner_id) {
      console.log(`Ownership already set for ${entityType}:${entityId}, skipping`);
      return false;
    }
    
    // Set ownership
    const { error } = await supabase
      .from('entity_ownership')
      .upsert({
        entity_type: entityType,
        entity_id: entityId,
        event_id: eventId,
        owner_id: ownerId,
      }, {
        onConflict: 'entity_type,entity_id,event_id'
      });
      
    if (error) {
      console.error('Failed to set ownership:', error);
      return false;
    }
    
    console.log(`Set ownership for ${entityType}:${entityId} to ${ownerId}`);
    return true;
  } catch (e) {
    console.error('Error setting ownership:', e);
    return false;
  }
}

// Find duplicates across ALL entity types
async function findDuplicates(
  supabase: any,
  eventId: string,
  contacts: ParsedContact[],
  entity: ParsedEntity
): Promise<DuplicateMatch[]> {
  const duplicates: DuplicateMatch[] = [];
  
  // Filter out internal/admin emails - only check external contacts for duplicates
  const externalContacts = contacts.filter(c => !isInternalEmail(c.email));
  const emails = externalContacts.map(c => c.email.toLowerCase());
  
  console.log(`Duplicate check: ${contacts.length} total contacts, ${externalContacts.length} external (excluding internal team emails)`);
  
  const entityName = entity.name?.trim();
  const entityNameLower = entityName?.toLowerCase();

  const entityChecks = [
    { table: "artists", contactTable: "artist_contacts", type: "artist", nameField: "name" },
    { table: "partners", contactTable: "partner_contacts", type: "partner", nameField: "name" },
    { table: "vendors", contactTable: "vendor_contacts", type: "vendor", nameField: "name" },
    { table: "artisans", contactTable: "artisan_contacts", type: "artisan", nameField: "name" },
    { table: "wineries", contactTable: "winery_contacts", type: "winery", nameField: "name" },
    { table: "volunteer_interests", contactTable: null, type: "volunteer", nameField: "name" },
  ];

  for (const check of entityChecks) {
    // Check by email (only external emails)
    if (check.contactTable) {
      for (const email of emails) {
        const { data: contactMatch } = await supabase
          .from(check.contactTable)
          .select(`id, ${check.type}_id`)
          .ilike("email", email)
          .limit(1)
          .maybeSingle();

        if (contactMatch) {
          const entityIdField = `${check.type}_id`;
          const entityId = contactMatch[entityIdField];
          
          const { data: entityData } = await supabase
            .from(check.table)
            .select(check.nameField)
            .eq("id", entityId)
            .single();

          if (entityData && !duplicates.find(d => d.entity_id === entityId)) {
            duplicates.push({
              entity_type: check.type,
              entity_id: entityId,
              entity_name: entityData[check.nameField],
              match_type: "email",
              matched_value: email,
            });
          }
        }
      }
    } else {
      // Direct email check (volunteer_interests)
      for (const email of emails) {
        const { data: directMatch } = await supabase
          .from(check.table)
          .select("id, name")
          .ilike("email", email)
          .limit(1)
          .maybeSingle();

        if (directMatch && !duplicates.find(d => d.entity_id === directMatch.id)) {
          duplicates.push({
            entity_type: check.type,
            entity_id: directMatch.id,
            entity_name: directMatch.name,
            match_type: "email",
            matched_value: email,
          });
        }
      }
    }

    // Check by name
    if (entityName && check.table !== "volunteer_interests") {
      const nameField = check.table === "artisans" ? "business_name" : check.nameField;
      
      // Exact match first
      const { data: exactMatches } = await supabase
        .from(check.table)
        .select(`id, ${nameField}`)
        .eq("event_id", eventId)
        .ilike(nameField, entityName)
        .limit(3);

      for (const match of exactMatches || []) {
        if (!duplicates.find(d => d.entity_id === match.id)) {
          duplicates.push({
            entity_type: check.type,
            entity_id: match.id,
            entity_name: match[nameField],
            match_type: "name",
            matched_value: entityName,
          });
        }
      }
    }
  }

  console.log(`Duplicate detection found ${duplicates.length} matches for "${entityName}"`);
  return duplicates;
}

// Create entity with contacts
async function createEntity(
  supabase: any,
  eventId: string,
  category: Category,
  entity: ParsedEntity,
  contacts: ParsedContact[],
  summary: ParsedSummary
): Promise<{ entityId: string; entityType: string } | null> {
  console.log(`Creating ${category} entity:`, entity.name);

  const entityName = entity.name || contacts[0]?.name || "Unknown";
  const primaryContact = contacts[0];

  try {
    let entityId: string;
    let contactTable: string | null = null;
    let entityIdField: string = "";

    switch (category) {
      case "artist": {
        const { data, error } = await supabase
          .from("artists")
          .insert({
            event_id: eventId,
            name: entityName,
            genre: entity.genre,
            bio: entity.description,
            website_url: entity.website,
            instagram_url: entity.instagram,
            spotify_url: entity.spotify,
            notes: summary.raw_summary,
          })
          .select("id")
          .single();
        if (error) throw error;
        entityId = data.id;
        contactTable = "artist_contacts";
        entityIdField = "artist_id";
        break;
      }
      case "partner": {
        const { data, error } = await supabase
          .from("partners")
          .insert({
            event_id: eventId,
            name: entityName,
            email: primaryContact?.email,
            phone: primaryContact?.phone,
            website: entity.website,
            notes: `${summary.opportunity_type || ""}\n${summary.raw_summary || ""}`.trim(),
            pipeline_status: "lead",
          })
          .select("id")
          .single();
        if (error) throw error;
        entityId = data.id;
        contactTable = "partner_contacts";
        entityIdField = "partner_id";
        break;
      }
      case "vendor": {
        const { data, error } = await supabase
          .from("vendors")
          .insert({
            event_id: eventId,
            name: entityName,
            email: primaryContact?.email,
            phone: primaryContact?.phone,
            website: entity.website,
            notes: summary.raw_summary,
            pipeline_status: "lead",
          })
          .select("id")
          .single();
        if (error) throw error;
        entityId = data.id;
        contactTable = "vendor_contacts";
        entityIdField = "vendor_id";
        break;
      }
      case "artisan": {
        const { data, error } = await supabase
          .from("artisans")
          .insert({
            event_id: eventId,
            name: primaryContact?.name || entityName,
            business_name: entity.name,
            email: primaryContact?.email,
            phone: primaryContact?.phone,
            website_url: entity.website,
            instagram_url: entity.instagram,
            notes: summary.raw_summary,
            pipeline_status: "lead",
          })
          .select("id")
          .single();
        if (error) throw error;
        entityId = data.id;
        contactTable = "artisan_contacts";
        entityIdField = "artisan_id";
        break;
      }
      case "winery": {
        const { data, error } = await supabase
          .from("wineries")
          .insert({
            event_id: eventId,
            name: entityName,
            email: primaryContact?.email,
            phone: primaryContact?.phone,
            website_url: entity.website,
            notes: summary.raw_summary,
            pipeline_status: "lead",
            confirmed: false,
          })
          .select("id")
          .single();
        if (error) throw error;
        entityId = data.id;
        contactTable = "winery_contacts";
        entityIdField = "winery_id";
        break;
      }
      case "volunteer": {
        const { data, error } = await supabase
          .from("volunteer_interests")
          .insert({
            event_id: eventId,
            name: primaryContact?.name || entityName,
            email: primaryContact?.email,
            phone: primaryContact?.phone,
            notes: summary.raw_summary,
          })
          .select("id")
          .single();
        if (error) throw error;
        entityId = data.id;
        break;
      }
      default:
        throw new Error(`Unknown category: ${category}`);
    }

    // Create contacts
    if (contactTable && contacts.length > 0) {
      for (let i = 0; i < contacts.length; i++) {
        const contact = contacts[i];
        const nameParts = contact.name.split(" ");
        
        await supabase.from(contactTable).insert({
          [entityIdField]: entityId,
          name: contact.name,
          first_name: nameParts[0] || null,
          last_name: nameParts.slice(1).join(" ") || null,
          email: contact.email,
          phone: contact.phone,
          role: contact.role || null,
          is_primary: i === 0,
        });
      }
    }

    console.log(`Created ${category} entity with ID: ${entityId}`);
    return { entityId, entityType: category };

  } catch (error) {
    console.error(`Failed to create ${category}:`, error);
    return null;
  }
}

// Merge with existing entity
async function mergeWithExisting(
  supabase: any,
  duplicate: DuplicateMatch,
  contacts: ParsedContact[],
  summary: ParsedSummary
): Promise<boolean> {
  console.log(`Merging with existing ${duplicate.entity_type}: ${duplicate.entity_name}`);

  const contactTables: Record<string, string> = {
    artist: "artist_contacts",
    partner: "partner_contacts",
    vendor: "vendor_contacts",
    artisan: "artisan_contacts",
    winery: "winery_contacts",
  };

  const contactTable = contactTables[duplicate.entity_type];
  if (!contactTable) return false;

  const entityIdField = `${duplicate.entity_type}_id`;

  try {
    // Get existing emails
    const { data: existingContacts } = await supabase
      .from(contactTable)
      .select("email")
      .eq(entityIdField, duplicate.entity_id);

    const existingEmails = new Set((existingContacts || []).map((c: any) => c.email.toLowerCase()));

    // Add new contacts
    for (const contact of contacts) {
      if (!existingEmails.has(contact.email.toLowerCase())) {
        const nameParts = contact.name.split(" ");
        
        await supabase.from(contactTable).insert({
          [entityIdField]: duplicate.entity_id,
          name: contact.name,
          first_name: nameParts[0] || null,
          last_name: nameParts.slice(1).join(" ") || null,
          email: contact.email,
          phone: contact.phone,
          role: contact.role || null,
          is_primary: false,
        });
        
        console.log(`Added new contact ${contact.email}`);
      }
    }

    // Append to notes
    const entityTable = {
      artist: "artists",
      partner: "partners",
      vendor: "vendors",
      artisan: "artisans",
      winery: "wineries",
    }[duplicate.entity_type];

    if (entityTable && summary.raw_summary) {
      const { data: entityData } = await supabase
        .from(entityTable)
        .select("notes")
        .eq("id", duplicate.entity_id)
        .single();

      const existingNotes = entityData?.notes || "";
      const newNote = `\n\n[${new Date().toISOString().split("T")[0]}] ${summary.raw_summary}`;
      
      await supabase
        .from(entityTable)
        .update({ notes: existingNotes + newNote })
        .eq("id", duplicate.entity_id);
    }

    return true;
  } catch (error) {
    console.error("Merge failed:", error);
    return false;
  }
}

// Create artist offer
async function createArtistOffer(
  supabase: any,
  eventId: string,
  artistId: string | null,
  offer: ParsedOffer,
  rawContent: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("artist_offers")
      .insert({
        event_id: eventId,
        artist_id: artistId,
        artist_name: offer.artist_name,
        offer_amount: offer.offer_amount,
        offer_currency: offer.offer_currency || "USD",
        performance_date: offer.performance_date,
        set_time: offer.set_time,
        set_length_minutes: offer.set_length_minutes,
        stage: offer.stage,
        venue_name: offer.venue_name,
        venue_address: offer.venue_address,
        city: offer.city,
        state: offer.state,
        capacity: offer.capacity,
        ticket_price: offer.ticket_price,
        deposit_percentage: offer.deposit_percentage,
        deposit_notes: offer.deposit_notes,
        guest_list_count: offer.guest_list_count,
        guest_list_notes: offer.guest_list_notes,
        merchandise_terms: offer.merchandise_terms,
        radius_clause: offer.radius_clause,
        radius_miles: offer.radius_miles,
        radius_days: offer.radius_days,
        expiration_date: offer.expiration_date,
        ages: offer.ages,
        indoor_outdoor: offer.indoor_outdoor,
        others_on_lineup: offer.others_on_lineup,
        past_lineup_url: offer.past_lineup_url,
        additional_perks: offer.additional_perks,
        other_terms: offer.other_terms,
        raw_offer_text: rawContent.substring(0, 10000),
        status: "draft",
      });

    if (error) {
      console.error("Error creating offer:", error);
      return false;
    }
    
    console.log("Created artist offer for:", offer.artist_name);
    return true;
  } catch (e) {
    console.error("Failed to create offer:", e);
    return false;
  }
}

// Create contract records from detected W9s and contracts in attachments
async function linkContractAttachments(
  supabase: any,
  eventId: string,
  entityType: string,
  entityId: string,
  attachments: { filename: string; file_path?: string; document_type?: string; content_type?: string }[],
  fromEmail: string
): Promise<number> {
  let linkedCount = 0;
  
  // Get entity name for contract title
  let entityName = "Unknown";
  const entityTable = {
    artist: "artists",
    partner: "partners", 
    vendor: "vendors",
    artisan: "artisans",
    winery: "wineries",
  }[entityType];
  
  if (entityTable) {
    const nameField = entityType === "artisan" ? "business_name" : "name";
    const { data: entity } = await supabase
      .from(entityTable)
      .select(nameField + ", name")
      .eq("id", entityId)
      .single();
    entityName = entity?.[nameField] || entity?.name || entityName;
  }
  
  for (const att of attachments) {
    if (!att.file_path) continue;
    
    // Only process W9s and contracts
    if (att.document_type === "w9" || att.document_type === "contract") {
      const isW9 = att.document_type === "w9";
      const title = isW9 
        ? `W-9 from ${entityName}` 
        : `Contract - ${att.filename.replace(/\.(pdf|doc|docx)$/i, "")}`;
      
      try {
        // Create contract record with status 'completed' (since it's already signed/received)
        const { error } = await supabase
          .from("contracts")
          .insert({
            event_id: eventId,
            entity_type: entityType,
            entity_id: entityId,
            title: title,
            content_html: `<p>Document received via email from ${fromEmail}</p><p>Filename: ${att.filename}</p>`,
            pdf_path: att.file_path,
            status: "completed", // Already received
            requires_countersign: false,
            notes: `Auto-imported from inbound email. Document type: ${att.document_type}`,
          });
        
        if (error) {
          console.error(`Failed to create contract record for ${att.filename}:`, error);
        } else {
          console.log(`Linked ${att.document_type} ${att.filename} to ${entityType}:${entityId}`);
          linkedCount++;
        }
      } catch (e) {
        console.error(`Error linking attachment ${att.filename}:`, e);
      }
    }
  }
  
  return linkedCount;
}

// Verify Resend webhook signature
async function verifyWebhookSignature(req: Request, body: string): Promise<boolean> {
  const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.log("No webhook secret configured, skipping verification");
    return true;
  }

  const signature = req.headers.get("svix-signature");
  const timestamp = req.headers.get("svix-timestamp");
  const webhookId = req.headers.get("svix-id");

  if (!signature || !timestamp || !webhookId) {
    console.error("Missing required Svix headers");
    return false;
  }

  // Check timestamp is within 5 minutes
  const timestampSeconds = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestampSeconds) > 300) {
    console.error("Webhook timestamp too old or in future");
    return false;
  }

  // Verify signature using HMAC-SHA256
  try {
    const signedPayload = `${webhookId}.${timestamp}.${body}`;
    const encoder = new TextEncoder();
    
    // Decode the secret (Resend uses base64-encoded secrets with "whsec_" prefix)
    const secretKey = webhookSecret.replace("whsec_", "");
    const keyData = Uint8Array.from(atob(secretKey), c => c.charCodeAt(0));
    
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    
    const signatureBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
    const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)));
    
    // Resend sends multiple signatures, check if any match
    const signatures = signature.split(" ");
    for (const sig of signatures) {
      const [version, value] = sig.split(",");
      if (version === "v1" && value === expectedSignature) {
        console.log("Webhook signature verified successfully");
        return true;
      }
    }
    
    console.error("No matching signature found");
    return false;
  } catch (e) {
    console.error("Error verifying signature:", e);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get raw body for signature verification
    const body = await req.text();
    
    // Verify webhook signature
    const isValid = await verifyWebhookSignature(req, body);
    if (!isValid) {
      console.error("Invalid webhook signature");
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Parse the body
    const payload = JSON.parse(body);
    console.log("Received inbound email webhook:", JSON.stringify(payload, null, 2));

    const webhookData = payload.data || payload;
    const emailId = webhookData.email_id;
    const fromEmail = webhookData.from || "unknown";
    const subject = webhookData.subject || "";
    const toAddresses = webhookData.to || [];
    const toAddress = Array.isArray(toAddresses) ? toAddresses[0] : toAddresses;

    console.log("Parsed webhook - emailId:", emailId, "from:", fromEmail, "to:", toAddress, "subject:", subject);

    // Check if this is a chat reply (chat+sessionId@example.invalid)
    const chatMatch = toAddress?.match(/chat\+([^@]+)@/i);
    if (chatMatch) {
      const sessionId = chatMatch[1];
      console.log("Routing to chat reply handler, session:", sessionId);
      
      // Forward to receive-chat-reply function
      const chatReplyResponse = await fetch(`${supabaseUrl}/functions/v1/receive-chat-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      const chatResult = await chatReplyResponse.json();
      console.log("Chat reply handler result:", chatResult);
      
      return new Response(
        JSON.stringify({ success: true, routed: "chat-reply", result: chatResult }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if this is a production email reply (team+threadId@example.invalid)
    const teamMatch = toAddress?.match(/team\+([a-f0-9-]+)@/i);
    if (teamMatch) {
      const threadId = teamMatch[1];
      console.log("Detected production email reply, thread:", threadId);
      
      // Fetch email content first
      let replyContent = "";
      let replyHtml = "";
      
      if (emailId && resendApiKey) {
        const emailResponse = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
          headers: { "Authorization": `Bearer ${resendApiKey}` },
        });
        
        if (emailResponse.ok) {
          const emailData = await emailResponse.json();
          replyContent = emailData.text || "";
          replyHtml = emailData.html || "";
        }
      }
      replyContent = replyContent || webhookData.text || webhookData.html || "";
      replyHtml = replyHtml || webhookData.html || "";
      
      // Parse sender info
      const senderMatch = fromEmail.match(/^(.+?)\s*<(.+?)>$/);
      const senderName = senderMatch ? senderMatch[1].trim().replace(/^["']|["']$/g, '') : null;
      const senderEmail = senderMatch ? senderMatch[2] : fromEmail;
      
      // Verify thread exists and get entity info
      const { data: thread, error: threadError } = await supabase
        .from("production_email_threads")
        .select("id, entity_type, entity_id, subject")
        .eq("id", threadId)
        .single();
      
      if (threadError || !thread) {
        console.error("Thread not found:", threadId);
        // Fall through to normal processing
      } else {
        // Add message to thread
        const { error: msgError } = await supabase
          .from("production_email_messages")
          .insert({
            thread_id: threadId,
            direction: "inbound",
            from_email: senderEmail,
            from_name: senderName,
            to_emails: Array.isArray(toAddresses) ? toAddresses : [toAddresses],
            subject: subject,
            body_html: replyHtml,
            body_text: replyContent,
            sent_at: new Date().toISOString(),
            raw_payload: payload,
          });
        
        if (msgError) {
          console.error("Failed to add reply to thread:", msgError);
        } else {
          console.log(`Added inbound reply to thread ${threadId}`);
          
          // Update thread stats
          await supabase
            .from("production_email_threads")
            .update({
              message_count: (thread as any).message_count ? (thread as any).message_count + 1 : 2,
              last_message_at: new Date().toISOString(),
            })
            .eq("id", threadId);
          
          // Get entity name for notification
          let entityName = "Unknown";
          if (thread.entity_type === "artist") {
            const { data: artist } = await supabase.from("artists").select("name").eq("id", thread.entity_id).single();
            entityName = artist?.name || entityName;
          } else if (thread.entity_type === "vendor") {
            const { data: vendor } = await supabase.from("vendors").select("name, company_name").eq("id", thread.entity_id).single();
            entityName = vendor?.company_name || vendor?.name || entityName;
          } else if (thread.entity_type === "partner") {
            const { data: partner } = await supabase.from("partners").select("name, company_name").eq("id", thread.entity_id).single();
            entityName = partner?.company_name || partner?.name || entityName;
          }
          
          // Create admin notification
          await supabase.from("admin_notifications").insert({
            type: "email_reply",
            title: `Reply from ${entityName}`,
            message: `${senderName || senderEmail}: ${subject?.substring(0, 50) || "(No subject)"}`,
            metadata: {
              thread_id: threadId,
              entity_type: thread.entity_type,
              entity_id: thread.entity_id,
              from_email: senderEmail,
            },
          });
          
          // Forward copy to admin
          const resend = new Resend(resendApiKey);
          try {
            await resend.emails.send({
              from: "Cosmico <alerts@example.invalid>",
              to: ["hello@example.invalid"],
              subject: `[${entityName}] ${subject || "Reply received"}`,
              html: `
                <div style="font-family: sans-serif; max-width: 600px;">
                  <div style="background: #f3f4f6; padding: 12px; border-radius: 8px; margin-bottom: 16px;">
                    <strong>From:</strong> ${senderName || ""} &lt;${senderEmail}&gt;<br/>
                    <strong>Entity:</strong> ${entityName} (${thread.entity_type})<br/>
                    <strong>Thread:</strong> ${thread.subject}
                  </div>
                  <div style="border-left: 3px solid #3b82f6; padding-left: 16px;">
                    ${replyHtml || `<pre style="white-space: pre-wrap;">${replyContent}</pre>`}
                  </div>
                  <p style="margin-top: 24px; font-size: 12px; color: #6b7280;">
                    <a href="https://example.invalid/admin/pipelines/${thread.entity_type}s?id=${thread.entity_id}">View in Admin</a>
                  </p>
                </div>
              `,
            });
            console.log("Forwarded reply copy to admin");
          } catch (fwdError) {
            console.error("Failed to forward copy:", fwdError);
          }
        }
        
        return new Response(
          JSON.stringify({ success: true, routed: "thread-reply", thread_id: threadId }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
    let emailContent = "";
    let emailHtml = "";
    
    if (emailId && resendApiKey) {
      console.log("Fetching email content from Resend API for:", emailId);
      
      const emailResponse = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
        headers: { "Authorization": `Bearer ${resendApiKey}` },
      });
      
      if (emailResponse.ok) {
        const emailData = await emailResponse.json();
        emailContent = emailData.text || "";
        emailHtml = emailData.html || "";
        console.log("Email content length:", emailContent.length);
      } else {
        console.log("Failed to fetch from Resend:", emailResponse.status);
        emailContent = webhookData.text || webhookData.html || "";
        emailHtml = webhookData.html || "";
      }
    } else {
      emailContent = webhookData.text || webhookData.html || "";
      emailHtml = webhookData.html || "";
    }

    // Fetch and store attachments
    interface AttachmentMeta {
      id: string;
      filename: string;
      content_type: string;
      size: number;
      file_path?: string;
      document_type?: "w9" | "contract" | "rider" | "invoice" | "other";
    }
    const extractedAttachments: AttachmentMeta[] = [];
    
    // Pattern-based document type detection
    function detectDocumentType(filename: string, contentType: string): AttachmentMeta["document_type"] {
      const nameLower = filename.toLowerCase();
      const isPdf = contentType?.includes('pdf') || nameLower.endsWith('.pdf');
      const isDoc = nameLower.endsWith('.doc') || nameLower.endsWith('.docx');
      
      // W9 detection (highest priority)
      if (nameLower.includes('w9') || nameLower.includes('w-9') || nameLower.match(/fw9|w_9/)) {
        return "w9";
      }
      
      // Contract detection
      if (nameLower.includes('contract') || nameLower.includes('agreement') || 
          nameLower.includes('signed') || nameLower.includes('executed')) {
        return "contract";
      }
      
      // Rider detection
      if (nameLower.includes('rider') || nameLower.includes('tech rider') || 
          nameLower.includes('technical rider') || nameLower.includes('hospitality')) {
        return "rider";
      }
      
      // Invoice detection
      if (nameLower.includes('invoice') || nameLower.includes('receipt')) {
        return "invoice";
      }
      
      // If it's a PDF/doc but doesn't match patterns, might need AI analysis
      if (isPdf || isDoc) {
        return "other"; // Could be upgraded by AI later
      }
      
      return undefined;
    }
    
    if (emailId && resendApiKey) {
      try {
        console.log("Fetching attachments for email:", emailId);
        const attachmentsResponse = await fetch(
          `https://api.resend.com/emails/receiving/${emailId}/attachments`,
          { headers: { "Authorization": `Bearer ${resendApiKey}` } }
        );
        
        if (attachmentsResponse.ok) {
          const attachmentsData = await attachmentsResponse.json();
          const attachmentsList = attachmentsData.data || [];
          console.log(`Found ${attachmentsList.length} attachments`);
          
          for (const att of attachmentsList) {
            try {
              // Detect document type
              const docType = detectDocumentType(att.filename, att.content_type);
              console.log(`Attachment ${att.filename}: detected type = ${docType || 'none'}`);
              
              // Download the attachment
              const downloadResponse = await fetch(att.download_url, {
                headers: { "Authorization": `Bearer ${resendApiKey}` }
              });
              
              if (downloadResponse.ok) {
                const fileData = await downloadResponse.arrayBuffer();
                const filePath = `inbox-attachments/${emailId}/${att.filename}`;
                
                // Upload to Supabase storage
                const { error: uploadError } = await supabase.storage
                  .from("email-attachments")
                  .upload(filePath, fileData, {
                    contentType: att.content_type || "application/octet-stream",
                    upsert: true,
                  });
                
                if (uploadError) {
                  console.error(`Failed to upload attachment ${att.filename}:`, uploadError);
                  extractedAttachments.push({
                    id: att.id,
                    filename: att.filename,
                    content_type: att.content_type,
                    size: att.size,
                    document_type: docType,
                  });
                } else {
                  console.log(`Uploaded attachment: ${att.filename} (type: ${docType})`);
                  extractedAttachments.push({
                    id: att.id,
                    filename: att.filename,
                    content_type: att.content_type,
                    size: att.size,
                    file_path: filePath,
                    document_type: docType,
                  });
                }
              }
            } catch (attErr) {
              console.error(`Error processing attachment ${att.filename}:`, attErr);
              extractedAttachments.push({
                id: att.id,
                filename: att.filename,
                content_type: att.content_type,
                size: att.size,
              });
            }
          }
        }
      } catch (attError) {
        console.error("Error fetching attachments:", attError);
      }
    }
    
    // AI-based document classification for uncertain attachments
    async function classifyDocumentWithAI(filename: string, contentSnippet?: string): Promise<AttachmentMeta["document_type"]> {
      const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
      if (!lovableApiKey) return "other";
      
      try {
        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              { 
                role: "system", 
                content: `Classify this document based on filename. Return ONLY one word: w9, contract, rider, invoice, or other.
W9: Tax form W-9, W9, tax ID documents
Contract: Performance contracts, service agreements, signed deals
Rider: Technical riders, hospitality riders, stage requirements
Invoice: Bills, receipts, payment requests
Other: Anything else` 
              },
              { role: "user", content: `Filename: "${filename}"${contentSnippet ? `\nContent preview: ${contentSnippet.substring(0, 200)}` : ""}` }
            ],
          }),
        });
        
        if (!response.ok) return "other";
        
        const data = await response.json();
        const result = data.choices[0]?.message?.content?.trim().toLowerCase();
        
        if (["w9", "contract", "rider", "invoice"].includes(result)) {
          return result as AttachmentMeta["document_type"];
        }
        return "other";
      } catch (e) {
        console.error("AI document classification failed:", e);
        return "other";
      }
    }
    
    // Run AI classification on uncertain PDFs/docs
    for (const att of extractedAttachments) {
      if (att.document_type === "other" || (!att.document_type && att.content_type?.includes('pdf'))) {
        const aiType = await classifyDocumentWithAI(att.filename);
        if (aiType !== "other") {
          console.log(`AI classified ${att.filename} as: ${aiType}`);
          att.document_type = aiType;
        }
      }
    }

    // Get active event
    const { data: activeEvent, error: eventError } = await supabase
      .from("event_details")
      .select("id, title")
      .eq("is_active", true)
      .order("event_date", { ascending: false })
      .limit(1)
      .single();

    if (eventError || !activeEvent) {
      console.error("No active event found:", eventError);
      return new Response(
        JSON.stringify({ success: false, error: "No active event" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing email for event: ${activeEvent.title}`);

    // Handle case where we couldn't get email content
    if (!emailContent && !emailHtml) {
      console.log("No email content available");
      
      await supabase
        .from("pending_email_imports")
        .insert({
          event_id: activeEvent.id,
          source_email: fromEmail,
          source_subject: subject,
          raw_email_text: `Email ID: ${emailId}\n[Content could not be retrieved]`,
          recommended_category: "partner",
          category_confidence: 0,
          status: "pending",
          notes: "Email content could not be retrieved from Resend API",
        });
      
      return new Response(
        JSON.stringify({ success: false, error: "No email content - queued for manual review" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse email with AI
    const parseResult = await parseEmailWithAI(emailContent || emailHtml, subject, fromEmail, toAddress || "");
    console.log("Parse result:", JSON.stringify(parseResult, null, 2));

    // Filter out admin team members from contacts (they're internal, not useful to add)
    const externalContacts = parseResult.contacts.filter(c => !isAdminTeamEmail(c.email));
    console.log(`Filtered contacts: ${parseResult.contacts.length} total -> ${externalContacts.length} external`);

    // Find the admin who forwarded/sent this email
    const forwardingAdminId = await findForwardingAdmin(supabase, fromEmail, emailContent);
    console.log(`Forwarding admin: ${forwardingAdminId || 'none found'}`);

    // Find duplicates across all entity types (using filtered contacts)
    const duplicates = await findDuplicates(
      supabase,
      activeEvent.id,
      externalContacts,
      parseResult.entity
    );

    // Filter out minor ambiguities
    const criticalAmbiguities = parseResult.ambiguities.filter(amb => {
      const lower = amb.toLowerCase();
      if (lower.includes('2025') && lower.includes('2026')) return false;
      if (lower.includes('mapped to') || lower.includes('role')) return false;
      if (lower.includes('social') || lower.includes('handles') || lower.includes('tags')) return false;
      if (lower.includes('different email') || lower.includes('two different')) return false;
      return true;
    });

    // ============ SMART LEARNING: Check email registry first ============
    // Look up any registered email associations from previous manual assignments
    let registryMatch: { entity_type: string; entity_id: string; entity_name: string } | null = null;
    
    for (const contact of externalContacts) {
      const { data: lookup } = await supabase.rpc("lookup_entity_by_email", {
        p_email: contact.email
      });
      
      if (lookup && lookup.length > 0) {
        registryMatch = lookup[0];
        console.log(`Smart Learning: Found registered email ${contact.email} -> ${registryMatch!.entity_name} (${registryMatch!.entity_type})`);
        break;
      }
    }

    // Check for strong duplicate match (same category + email or exact name match)
    const categoryMatches = duplicates.filter(d => d.entity_type === parseResult.recommended_category);
    const hasEmailMatch = categoryMatches.some(d => d.match_type === "email");
    const hasExactNameMatch = categoryMatches.some(d => 
      d.match_type === "name" && 
      d.entity_name.toLowerCase().trim() === parseResult.entity.name?.toLowerCase().trim()
    );
    
    // Strong match = registry match OR (same category with email match OR exact name match)
    const hasRegistryMatch = registryMatch !== null;
    const hasStrongMatch = hasRegistryMatch || (categoryMatches.length > 0 && (hasEmailMatch || hasExactNameMatch));
    
    // High confidence for creating new entities
    const isHighConfidence = parseResult.category_confidence >= AUTO_CONFIRM_THRESHOLD &&
      externalContacts.every(c => c.confidence >= HIGH_CONFIDENCE_THRESHOLD) &&
      criticalAmbiguities.length === 0;
    
    const hasDuplicates = duplicates.length > 0;

    let status = "pending";
    let createdEntityId: string | null = null;
    let createdEntityType: string | null = null;
    let mergedWithEntityId: string | null = null;

    // Auto-process logic: Registry match takes highest priority, then strong match
    if (hasRegistryMatch && registryMatch) {
      // Smart Learning auto-merge: we've seen this email before
      console.log(`Smart Learning auto-merge: ${registryMatch.entity_name} (${registryMatch.entity_type})`);
      
      const merged = await mergeWithExisting(
        supabase,
        { 
          entity_type: registryMatch.entity_type, 
          entity_id: registryMatch.entity_id, 
          entity_name: registryMatch.entity_name,
          match_type: "email",
          matched_value: externalContacts[0]?.email || ""
        },
        externalContacts,
        parseResult.summary
      );
      
      if (merged) {
        status = "auto_merged";
        mergedWithEntityId = registryMatch.entity_id;
        createdEntityType = registryMatch.entity_type;
        console.log(`Smart Learning: Auto-merged with ${registryMatch.entity_name}`);
        
        // Update registry match count
        for (const contact of externalContacts) {
          if (contact.email) {
            await supabase.rpc("register_entity_email", {
              p_email: contact.email,
              p_entity_type: registryMatch.entity_type,
              p_entity_id: registryMatch.entity_id,
              p_entity_name: registryMatch.entity_name,
              p_event_id: activeEvent.id,
              p_import_id: null,
              p_user_id: forwardingAdminId,
            });
          }
        }
        
        if (forwardingAdminId) {
          await setEntityOwnership(supabase, registryMatch.entity_type, registryMatch.entity_id, activeEvent.id, forwardingAdminId);
        }
        
        await createEmailThread(
          supabase,
          activeEvent.id,
          registryMatch.entity_type,
          registryMatch.entity_id,
          subject,
          fromEmail,
          null,
          [toAddress],
          emailHtml,
          emailContent,
          forwardingAdminId
        );
        
        if (extractedAttachments.length > 0) {
          const linkedDocs = await linkContractAttachments(
            supabase,
            activeEvent.id,
            registryMatch.entity_type,
            registryMatch.entity_id,
            extractedAttachments,
            fromEmail
          );
          if (linkedDocs > 0) {
            console.log(`Linked ${linkedDocs} contract document(s) to ${registryMatch.entity_name}`);
          }
        }
      }
    } else if (hasStrongMatch) {
      // Original strong match logic (duplicate detection)
      const primaryDuplicate = categoryMatches.find(d => d.match_type === "email") || categoryMatches[0];
      console.log(`Strong match detected: merging with ${primaryDuplicate.entity_name} (${primaryDuplicate.match_type} match)`);
        
      const merged = await mergeWithExisting(
        supabase,
        primaryDuplicate,
        externalContacts,
        parseResult.summary
      );
      
      if (merged) {
        status = "merged";
        mergedWithEntityId = primaryDuplicate.entity_id;
        createdEntityType = primaryDuplicate.entity_type;
        console.log(`Auto-merged with ${primaryDuplicate.entity_name} (${primaryDuplicate.entity_type})`);
        
        if (forwardingAdminId) {
          await setEntityOwnership(supabase, primaryDuplicate.entity_type, primaryDuplicate.entity_id, activeEvent.id, forwardingAdminId);
        }
        
        await createEmailThread(
          supabase,
          activeEvent.id,
          primaryDuplicate.entity_type,
          primaryDuplicate.entity_id,
          subject,
          fromEmail,
          null,
          [toAddress],
          emailHtml,
          emailContent,
          forwardingAdminId
        );
        
        if (extractedAttachments.length > 0) {
          const linkedDocs = await linkContractAttachments(
            supabase,
            activeEvent.id,
            primaryDuplicate.entity_type,
            primaryDuplicate.entity_id,
            extractedAttachments,
            fromEmail
          );
          if (linkedDocs > 0) {
            console.log(`Linked ${linkedDocs} contract document(s) to ${primaryDuplicate.entity_name}`);
          }
        }
      }
    } else if (isHighConfidence && !hasDuplicates) {
      // High confidence with no duplicates = create new entity
      let finalEntity = parseResult.entity;
      if (parseResult.recommended_category === "artist") {
        const needsResearch = !finalEntity.genre || !finalEntity.description || 
          !finalEntity.website || !finalEntity.instagram || !finalEntity.spotify;
        
        if (needsResearch && finalEntity.name) {
          const research = await researchArtist(finalEntity.name);
          finalEntity = {
            ...finalEntity,
            genre: finalEntity.genre || research.genre,
            description: finalEntity.description || research.description,
            website: finalEntity.website || research.website,
            instagram: finalEntity.instagram || research.instagram,
            spotify: finalEntity.spotify || research.spotify,
          };
        }
      }

      const created = await createEntity(
        supabase,
        activeEvent.id,
        parseResult.recommended_category,
        finalEntity,
        externalContacts,
        parseResult.summary
      );
      
      if (created) {
        status = "auto_confirmed";
        createdEntityId = created.entityId;
        createdEntityType = created.entityType;
        console.log(`Auto-created ${created.entityType}: ${finalEntity.name}`);
        
        if (forwardingAdminId) {
          await setEntityOwnership(supabase, created.entityType, created.entityId, activeEvent.id, forwardingAdminId);
        }
        
        await createEmailThread(
          supabase,
          activeEvent.id,
          created.entityType,
          created.entityId,
          subject,
          fromEmail,
          null,
          [toAddress],
          emailHtml,
          emailContent,
          forwardingAdminId
        );
        
        if (extractedAttachments.length > 0) {
          const linkedDocs = await linkContractAttachments(
            supabase,
            activeEvent.id,
            created.entityType,
            created.entityId,
            extractedAttachments,
            fromEmail
          );
          if (linkedDocs > 0) {
            console.log(`Linked ${linkedDocs} contract document(s) to ${finalEntity.name}`);
          }
        }
      }
    }
    // Else: status remains "pending" for manual review

    // Create offer if artist with offer details
    if (parseResult.offer && (createdEntityId || mergedWithEntityId)) {
      const artistId = createdEntityId || mergedWithEntityId;
      await createArtistOffer(supabase, activeEvent.id, artistId, parseResult.offer, emailContent);
    }

    // Create pending import record for audit trail
    // Store filtered contacts (without admin team) for display
    const { data: importRecord, error: importError } = await supabase
      .from("pending_email_imports")
      .insert({
        event_id: activeEvent.id,
        source_email: fromEmail,
        source_subject: subject,
        raw_email_html: emailHtml,
        raw_email_text: emailContent,
        parsed_contacts: externalContacts, // Store filtered contacts only
        parsed_company: parseResult.entity,
        parsed_summary: {
          ...parseResult.summary,
          forwarding_admin_id: forwardingAdminId, // Track who forwarded
        },
        recommended_category: parseResult.recommended_category,
        category_confidence: parseResult.category_confidence,
        status,
        potential_duplicates: duplicates,
        created_entity_type: createdEntityType,
        created_entity_id: createdEntityId,
        merged_with_entity_id: mergedWithEntityId,
        notes: parseResult.reasoning,
        confirmed_by: status !== 'pending' ? forwardingAdminId : null, // Auto-set confirmed_by for auto-processed
        attachments: extractedAttachments.length > 0 ? extractedAttachments : null,
      })
      .select("id")
      .single();

    if (importError) {
      console.error("Failed to create import record:", importError);
    }

    // Extract media assets from email for artists (photos, videos, Dropbox/Google Drive links)
    const artistId = createdEntityType === "artist" ? (createdEntityId || mergedWithEntityId) : null;
    if (artistId && (emailContent || extractedAttachments.length > 0)) {
      try {
        // Extract URLs from email body (Dropbox, Google Drive, direct file links)
        const urlPattern = /https?:\/\/[^\s<>"']+/gi;
        const urlMatches = (emailContent || "").match(urlPattern) || [];
        const assetUrls = urlMatches.filter((url: string) => {
          const lowerUrl = url.toLowerCase();
          return (
            lowerUrl.includes("dropbox.com") ||
            lowerUrl.includes("dl.dropboxusercontent.com") ||
            lowerUrl.includes("drive.google.com") ||
            lowerUrl.includes("docs.google.com") ||
            // Direct media file URLs
            /\.(jpg|jpeg|png|gif|webp|mp3|wav|flac|m4a|aac|mp4|mov|avi|webm)(\?|$)/i.test(lowerUrl)
          );
        });

        // Filter attachments for media (photos, videos, audio)
        const mediaAttachments = extractedAttachments.filter(att => {
          const contentType = att.content_type?.toLowerCase() || "";
          const filename = att.filename?.toLowerCase() || "";
          return (
            contentType.startsWith("image/") ||
            contentType.startsWith("video/") ||
            contentType.startsWith("audio/") ||
            /\.(jpg|jpeg|png|gif|webp|mp3|wav|flac|m4a|mp4|mov|avi|webm)$/.test(filename)
          );
        });

        if (assetUrls.length > 0 || mediaAttachments.length > 0) {
          console.log(`Found ${assetUrls.length} asset URLs and ${mediaAttachments.length} media attachments for artist ${artistId}`);

          // Call extract-artist-assets function
          const extractResponse = await fetch(
            `${supabaseUrl}/functions/v1/extract-artist-assets`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                artist_id: artistId,
                urls: assetUrls,
                attachments: mediaAttachments
                  .filter(att => att.file_path)
                  .map(att => ({
                    filename: att.filename,
                    file_path: att.file_path,
                    content_type: att.content_type,
                  })),
                source_email_id: importRecord?.id || null,
              }),
            }
          );

          if (extractResponse.ok) {
            const extractResult = await extractResponse.json();
            const extractedCount = extractResult.results?.filter((r: any) => r.success).length || 0;
            console.log(`Extracted ${extractedCount} media assets for artist ${artistId}`);
          } else {
            console.error("Asset extraction failed:", await extractResponse.text());
          }
        }
      } catch (extractError) {
        console.error("Error extracting media assets:", extractError);
      }
    }

    // Create notification for pending items
    if (status === "pending") {
      await supabase.from("admin_notifications").insert({
        type: "email_import",
        title: "New Email to Review",
        message: `${parseResult.entity.name || fromEmail}: ${parseResult.summary.opportunity_type || subject}`,
        metadata: {
          import_id: importRecord?.id,
          category: parseResult.recommended_category,
          confidence: parseResult.category_confidence,
          to_address: toAddress,
        },
      });
    }

    // Email forwarding disabled - all emails visible in /admin/inbox dashboard

    console.log("Processing complete:", {
      status,
      category: parseResult.recommended_category,
      confidence: parseResult.category_confidence,
      duplicates: duplicates.length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        import_id: importRecord?.id,
        status,
        category: parseResult.recommended_category,
        confidence: parseResult.category_confidence,
        auto_confirmed: status === "auto_confirmed",
        merged: status === "merged",
        duplicates_found: duplicates.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error processing inbound email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
