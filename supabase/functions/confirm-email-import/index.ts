import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VALID_CATEGORIES = ["artist", "partner", "vendor", "artisan", "winery", "volunteer"] as const;
type Category = typeof VALID_CATEGORIES[number];

interface ParsedContact {
  name: string;
  email: string;
  phone?: string;
  role?: string;
  confidence: number;
}

interface ParsedCompany {
  name?: string;
  website?: string;
  instagram?: string;
  description?: string;
}

interface ParsedSummary {
  opportunity_type?: string;
  financial_details?: string;
  key_dates?: string;
  follow_up_actions?: string[];
  raw_summary?: string;
}

async function createEntityWithContacts(
  supabase: any,
  eventId: string,
  category: Category,
  company: ParsedCompany,
  contacts: ParsedContact[],
  summary: ParsedSummary,
  customNotes?: string,
  customEntityName?: string,
  customFields?: Record<string, any>
): Promise<{ entityId: string; entityType: string } | null> {
  // Use custom entity name if provided, otherwise fall back to parsed data
  const entityName = customEntityName || company.name || contacts[0]?.name || "Unknown";
  console.log(`Creating ${category} entity:`, entityName);

  const primaryContact = contacts[0];
  
  // Build notes from summary + custom notes
  const buildNotes = (baseSummary?: string) => {
    const parts: string[] = [];
    if (baseSummary) parts.push(baseSummary);
    if (customNotes) parts.push(`\n[Admin Note] ${customNotes}`);
    return parts.join("\n") || null;
  };

  try {
    let entityId: string;
    let contactTable: string | null = null;
    let entityIdField: string;

    switch (category) {
      case "artist": {
        const { data, error } = await supabase
          .from("artists")
          .insert({
            event_id: eventId,
            name: entityName,
            website_url: company.website,
            instagram_url: company.instagram ? `https://instagram.com/${company.instagram.replace("@", "")}` : null,
            bio: company.description,
            notes: buildNotes(summary.raw_summary),
            custom_fields: customFields || {},
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
            website_url: company.website,
            notes: buildNotes(`${summary.opportunity_type || ""}\n${summary.raw_summary || ""}`.trim()),
            pipeline_status: "lead",
            custom_fields: customFields || {},
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
            website_url: company.website,
            notes: buildNotes(summary.raw_summary),
            pipeline_status: "lead",
            custom_fields: customFields || {},
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
            business_name: company.name,
            email: primaryContact?.email,
            phone: primaryContact?.phone,
            website_url: company.website,
            instagram_url: company.instagram ? `https://instagram.com/${company.instagram.replace("@", "")}` : null,
            notes: buildNotes(summary.raw_summary),
            pipeline_status: "lead",
            custom_fields: customFields || {},
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
            website_url: company.website,
            instagram_url: company.instagram ? `https://instagram.com/${company.instagram.replace("@", "")}` : null,
            notes: buildNotes(summary.raw_summary),
            pipeline_status: "lead",
            confirmed: false,
            custom_fields: customFields || {},
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
            notes: buildNotes(summary.raw_summary),
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
          [entityIdField!]: entityId,
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

    return { entityId, entityType: category };
  } catch (error) {
    console.error(`Failed to create ${category}:`, error);
    return null;
  }
}

async function mergeWithExisting(
  supabase: any,
  entityType: string,
  entityId: string,
  contacts: ParsedContact[],
  summary: ParsedSummary,
  customNotes?: string
): Promise<boolean> {
  const contactTables: Record<string, string> = {
    artist: "artist_contacts",
    partner: "partner_contacts",
    vendor: "vendor_contacts",
    artisan: "artisan_contacts",
    winery: "winery_contacts",
  };

  const contactTable = contactTables[entityType];
  if (!contactTable) return false;

  const entityIdField = `${entityType}_id`;

  try {
    const { data: existingContacts } = await supabase
      .from(contactTable)
      .select("email")
      .eq(entityIdField, entityId);

    const existingEmails = new Set((existingContacts || []).map((c: any) => c.email.toLowerCase()));

    for (const contact of contacts) {
      if (!existingEmails.has(contact.email.toLowerCase())) {
        const nameParts = contact.name.split(" ");
        
        await supabase.from(contactTable).insert({
          [entityIdField]: entityId,
          name: contact.name,
          first_name: nameParts[0] || null,
          last_name: nameParts.slice(1).join(" ") || null,
          email: contact.email,
          phone: contact.phone,
          role: contact.role || null,
          is_primary: false,
        });
      }
    }

    // Append summary and custom notes to entity notes
    const entityTable = {
      artist: "artists",
      partner: "partners",
      vendor: "vendors",
      artisan: "artisans",
      winery: "wineries",
    }[entityType];

    if (entityTable && (summary.raw_summary || customNotes)) {
      const { data: entity } = await supabase
        .from(entityTable)
        .select("notes")
        .eq("id", entityId)
        .single();

      const existingNotes = entity?.notes || "";
      const datestamp = new Date().toISOString().split("T")[0];
      let newNote = "";
      if (summary.raw_summary) {
        newNote += `\n\n[${datestamp}] ${summary.raw_summary}`;
      }
      if (customNotes) {
        newNote += `\n[${datestamp} Admin Note] ${customNotes}`;
      }
      
      await supabase
        .from(entityTable)
        .update({ notes: existingNotes + newNote })
        .eq("id", entityId);
    }

    return true;
  } catch (error) {
    console.error("Merge failed:", error);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify admin auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role for actual operations
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { 
      import_id, 
      action, 
      confirmed_category, 
      merge_with_entity_id, 
      merge_with_entity_type,
      custom_notes,
      selected_contacts,
      custom_entity_name,
      custom_fields
    } = await req.json();

    if (!import_id || !action) {
      return new Response(JSON.stringify({ error: "Missing import_id or action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the import record
    const { data: importRecord, error: fetchError } = await supabaseAdmin
      .from("pending_email_imports")
      .select("*")
      .eq("id", import_id)
      .single();

    if (fetchError || !importRecord) {
      return new Response(JSON.stringify({ error: "Import not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (importRecord.status !== "pending") {
      return new Response(JSON.stringify({ error: "Import already processed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result: any = { success: true };
    
    // Use selected contacts if provided, otherwise use all parsed contacts
    const contactsToUse = selected_contacts || importRecord.parsed_contacts;

    if (action === "confirm") {
      const category = confirmed_category || importRecord.recommended_category;
      
      if (!VALID_CATEGORIES.includes(category)) {
        return new Response(JSON.stringify({ error: "Invalid category" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const created = await createEntityWithContacts(
        supabaseAdmin,
        importRecord.event_id,
        category as Category,
        importRecord.parsed_company as ParsedCompany,
        contactsToUse as ParsedContact[],
        importRecord.parsed_summary as ParsedSummary,
        custom_notes,
        custom_entity_name,
        custom_fields
      );

      if (created) {
        await supabaseAdmin
          .from("pending_email_imports")
          .update({
            status: "confirmed",
            confirmed_category: category,
            confirmed_by: user.id,
            confirmed_at: new Date().toISOString(),
            created_entity_type: created.entityType,
            created_entity_id: created.entityId,
          })
          .eq("id", import_id);

        // Register emails in the Smart Learning registry for future auto-matching
        const entityName = custom_entity_name || (importRecord.parsed_company as any)?.name || "Unknown";
        for (const contact of contactsToUse as ParsedContact[]) {
          if (contact.email) {
            await supabaseAdmin.rpc("register_entity_email", {
              p_email: contact.email,
              p_entity_type: created.entityType,
              p_entity_id: created.entityId,
              p_entity_name: entityName,
              p_event_id: importRecord.event_id,
              p_import_id: import_id,
              p_user_id: user.id,
            });
            console.log(`Registered email ${contact.email} -> ${entityName} (${created.entityType})`);
          }
        }

        result = { ...result, entity_id: created.entityId, entity_type: created.entityType };
      } else {
        return new Response(JSON.stringify({ error: "Failed to create entity" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

    } else if (action === "merge") {
      if (!merge_with_entity_id || !merge_with_entity_type) {
        return new Response(JSON.stringify({ error: "Missing merge target" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const merged = await mergeWithExisting(
        supabaseAdmin,
        merge_with_entity_type,
        merge_with_entity_id,
        contactsToUse as ParsedContact[],
        importRecord.parsed_summary as ParsedSummary,
        custom_notes
      );

      if (merged) {
        await supabaseAdmin
          .from("pending_email_imports")
          .update({
            status: "merged",
            confirmed_category: merge_with_entity_type,
            confirmed_by: user.id,
            confirmed_at: new Date().toISOString(),
            merged_with_entity_id: merge_with_entity_id,
            created_entity_type: merge_with_entity_type,
          })
          .eq("id", import_id);

        // Register emails in the Smart Learning registry for future auto-matching
        // Look up the entity name from the target
        const entityTables: Record<string, string> = {
          artist: "artists", partner: "partners", vendor: "vendors",
          artisan: "artisans", winery: "wineries",
        };
        const tableName = entityTables[merge_with_entity_type];
        let entityName = "Unknown";
        if (tableName) {
          const { data: entity } = await supabaseAdmin
            .from(tableName)
            .select("name")
            .eq("id", merge_with_entity_id)
            .single();
          entityName = entity?.name || "Unknown";
        }

        for (const contact of contactsToUse as ParsedContact[]) {
          if (contact.email) {
            await supabaseAdmin.rpc("register_entity_email", {
              p_email: contact.email,
              p_entity_type: merge_with_entity_type,
              p_entity_id: merge_with_entity_id,
              p_entity_name: entityName,
              p_event_id: importRecord.event_id,
              p_import_id: import_id,
              p_user_id: user.id,
            });
            console.log(`Registered email ${contact.email} -> ${entityName} (${merge_with_entity_type})`);
          }
        }

        result = { ...result, merged_with: merge_with_entity_id };
      } else {
        return new Response(JSON.stringify({ error: "Merge failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

    } else if (action === "reject") {
      await supabaseAdmin
        .from("pending_email_imports")
        .update({
          status: "rejected",
          confirmed_by: user.id,
          confirmed_at: new Date().toISOString(),
        })
        .eq("id", import_id);

    } else {
      return new Response(JSON.stringify({ error: "Invalid action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Error confirming import:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
