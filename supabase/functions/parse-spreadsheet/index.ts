import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParsedGuest {
  firstName: string;
  lastName: string;
  fullName: string;
  email?: string;
  phone?: string;
  ticketType?: string;
  error?: string;
}

const TICKET_TYPES = ["GA", "VIP", "Artist Dinner", "Staff"];

const parseName = (fullName: string) => {
  const trimmed = fullName.trim();
  const parts = trimmed.split(" ");
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" ") || "",
    fullName: trimmed,
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify admin role
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!roles) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const defaultTicketType = formData.get("defaultTicketType") as string | null;

    if (!file) {
      return new Response(JSON.stringify({ error: "File is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "File too large (max 5MB)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate file type
    const validTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
    ];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls|csv)$/i)) {
      return new Response(JSON.stringify({ error: "Invalid file type. Please upload CSV or Excel file" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    
    const workbook = XLSX.read(data, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];

    const parsed: ParsedGuest[] = [];
    
    // Skip header row if present
    const dataRows = jsonData.slice(1);

    for (const row of dataRows) {
      if (row[0]) {
        const { firstName, lastName, fullName } = parseName(String(row[0]));
        const ticketType = row[3] ? String(row[3]) : (defaultTicketType || undefined);
        
        const guest: ParsedGuest = {
          firstName,
          lastName,
          fullName,
          email: row[1] ? String(row[1]).trim() : undefined,
          phone: row[2] ? String(row[2]).trim() : undefined,
          ticketType,
        };

        // Validate email format if provided
        if (guest.email && !guest.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
          guest.error = `Invalid email format: ${guest.email}`;
        } else if (!guest.ticketType) {
          guest.error = "Missing ticket type";
        } else if (!TICKET_TYPES.includes(guest.ticketType)) {
          guest.error = `Invalid ticket type: ${guest.ticketType}`;
        }

        parsed.push(guest);
      }
    }

    return new Response(JSON.stringify({ guests: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("parse-spreadsheet error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed to parse file" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
