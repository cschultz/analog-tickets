// Idempotency utilities for preventing duplicate operations
// Note: These utilities work with the payment_idempotency_keys table

/**
 * Generate a hash for request parameters
 */
export async function hashRequest(params: Record<string, unknown>): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(params));
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate an idempotency key from request parameters
 */
export function generateIdempotencyKey(
  operation: string,
  email: string,
  ...additionalParams: string[]
): string {
  const parts = [operation, email.toLowerCase(), ...additionalParams];
  return parts.join(":");
}

interface IdempotencyRecord {
  registration_id: string | null;
  stripe_session_id: string | null;
  status: string;
}

/**
 * Check if an operation with this idempotency key already exists
 * Returns the existing result if found, null if this is a new operation
 */
export async function checkIdempotency(
  supabase: { from: (table: string) => any },
  idempotencyKey: string
): Promise<{ exists: boolean; result?: { registrationId: string; stripeSessionId: string } }> {
  const { data, error } = await supabase
    .from("payment_idempotency_keys")
    .select("registration_id, stripe_session_id, status")
    .eq("idempotency_key", idempotencyKey)
    .gt("expires_at", new Date().toISOString())
    .single() as { data: IdempotencyRecord | null; error: any };

  if (error || !data) {
    return { exists: false };
  }

  // If completed, return the existing result
  if (data.status === "completed" && data.registration_id && data.stripe_session_id) {
    return {
      exists: true,
      result: {
        registrationId: data.registration_id,
        stripeSessionId: data.stripe_session_id,
      },
    };
  }

  // If pending (in-flight), treat as duplicate
  if (data.status === "pending") {
    return { exists: true };
  }

  return { exists: false };
}

/**
 * Create an idempotency record for a new operation
 */
export async function createIdempotencyRecord(
  supabase: { from: (table: string) => any },
  idempotencyKey: string,
  requestHash: string
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("payment_idempotency_keys")
    .insert({
      idempotency_key: idempotencyKey,
      request_hash: requestHash,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[idempotency] Failed to create record:", error);
    return null;
  }

  return data as { id: string };
}

/**
 * Complete an idempotency record with the result
 */
export async function completeIdempotencyRecord(
  supabase: { from: (table: string) => any },
  idempotencyKey: string,
  registrationId: string,
  stripeSessionId: string
): Promise<void> {
  const { error } = await supabase
    .from("payment_idempotency_keys")
    .update({
      registration_id: registrationId,
      stripe_session_id: stripeSessionId,
      status: "completed",
    })
    .eq("idempotency_key", idempotencyKey);

  if (error) {
    console.error("[idempotency] Failed to complete record:", error);
  }
}

/**
 * Mark an idempotency record as failed
 */
export async function failIdempotencyRecord(
  supabase: { from: (table: string) => any },
  idempotencyKey: string
): Promise<void> {
  const { error } = await supabase
    .from("payment_idempotency_keys")
    .update({ status: "failed" })
    .eq("idempotency_key", idempotencyKey);

  if (error) {
    console.error("[idempotency] Failed to mark record as failed:", error);
  }
}

/**
 * Cleanup expired idempotency records
 */
export async function cleanupExpiredRecords(
  supabase: { from: (table: string) => any }
): Promise<number> {
  const { data, error } = await supabase
    .from("payment_idempotency_keys")
    .delete()
    .lt("expires_at", new Date().toISOString())
    .select("id");

  if (error) {
    console.error("[idempotency] Cleanup failed:", error);
    return 0;
  }

  return (data as { id: string }[])?.length || 0;
}
