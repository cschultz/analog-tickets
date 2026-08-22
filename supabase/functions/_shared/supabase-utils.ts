// Shared Supabase utilities for edge functions
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

// Lazily initialized clients
let _serviceClient: SupabaseClient | null = null;
let _anonClient: SupabaseClient | null = null;

/**
 * Get a Supabase client with service role (admin) privileges
 * Use this for operations that bypass RLS
 */
export function getServiceClient(): SupabaseClient {
  if (!_serviceClient) {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!url || !key) {
      throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured");
    }
    
    _serviceClient = createClient(url, key, {
      auth: { persistSession: false },
    });
  }
  
  return _serviceClient;
}

/**
 * Get a Supabase client with anon key (respects RLS)
 */
export function getAnonClient(): SupabaseClient {
  if (!_anonClient) {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_ANON_KEY");
    
    if (!url || !key) {
      throw new Error("SUPABASE_URL or SUPABASE_ANON_KEY not configured");
    }
    
    _anonClient = createClient(url, key, {
      auth: { persistSession: false },
    });
  }
  
  return _anonClient;
}

/**
 * Create an authenticated client from a request's Authorization header
 */
export function createAuthenticatedClient(authHeader: string): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY");
  
  if (!url || !key) {
    throw new Error("SUPABASE_URL or SUPABASE_ANON_KEY not configured");
  }
  
  return createClient(url, key, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
}

/**
 * Verify a request has valid authentication and return the user
 */
export async function verifyAuth(
  req: Request
): Promise<{ user: { id: string; email: string } | null; error?: string }> {
  const authHeader = req.headers.get("Authorization");
  
  if (!authHeader) {
    return { user: null, error: "Missing authorization header" };
  }
  
  const client = createAuthenticatedClient(authHeader);
  const { data: { user }, error } = await client.auth.getUser();
  
  if (error || !user) {
    return { user: null, error: error?.message || "Invalid token" };
  }
  
  return { 
    user: { 
      id: user.id, 
      email: user.email || "" 
    } 
  };
}

/**
 * Check if the authenticated user has admin role
 */
export async function verifyAdmin(
  req: Request
): Promise<{ isAdmin: boolean; user?: { id: string; email: string }; error?: string }> {
  const { user, error } = await verifyAuth(req);
  
  if (!user) {
    return { isAdmin: false, error };
  }
  
  const client = createAuthenticatedClient(req.headers.get("Authorization")!);
  
  const { data: isAdmin, error: roleError } = await client.rpc("has_role", {
    _user_id: user.id,
    _role: "admin",
  });
  
  if (roleError || !isAdmin) {
    return { isAdmin: false, user, error: "Admin role required" };
  }
  
  return { isAdmin: true, user };
}

/**
 * Get the active event ID
 */
export async function getActiveEventId(): Promise<string | null> {
  const supabase = getServiceClient();
  
  const { data } = await supabase
    .from("event_details")
    .select("id")
    .eq("is_active", true)
    .eq("status", "published")
    .order("event_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.id || null;
}

/**
 * Log an admin action to the audit log
 */
export async function logAdminAction(
  adminUserId: string,
  adminEmail: string,
  action: string,
  entityType: string,
  entityId?: string,
  entityName?: string,
  oldValue?: Record<string, unknown>,
  newValue?: Record<string, unknown>,
  metadata?: Record<string, unknown>,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  const supabase = getServiceClient();
  
  await supabase.rpc("log_admin_action", {
    p_admin_user_id: adminUserId,
    p_admin_email: adminEmail,
    p_action: action,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_entity_name: entityName,
    p_old_value: oldValue ? JSON.stringify(oldValue) : null,
    p_new_value: newValue ? JSON.stringify(newValue) : null,
    p_metadata: metadata ? JSON.stringify(metadata) : null,
    p_ip_address: ipAddress,
    p_user_agent: userAgent,
  });
}
