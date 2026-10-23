/**
 * Gate 124 — server-only bridge between OTP issuance and the private Mailtrap
 * **Email Testing** (sandbox) capture adapter.
 *
 * This is the smallest wiring that lets an in-process harness observe a
 * captured test message. It is:
 *  - fail-closed: without the exact `MAILTRAP_*` staging configuration every
 *    call returns a skipped aggregate record before any request is built;
 *  - synthetic-only: the adapter refuses any recipient outside the configured
 *    reserved domain, so a real address can never be contacted;
 *  - best-effort: issuance behaviour, status codes, TTL, rate limits, and
 *    replay rules are unchanged whether or not capture succeeds;
 *  - silent: it returns an aggregate record only — never a code, address,
 *    token, URL, or provider text — and it logs nothing itself.
 *
 * Server-only by filename. Imported by route handlers through a dynamic import
 * inside the handler body; never by a browser module, and it exposes no
 * retrieval path of any kind.
 */
import { captureLog, type CaptureLogRecord } from "./mail-capture-core";
import { deliver, isEnabled } from "./mailtrap-capture.server";

/**
 * Hands a freshly issued OTP to the sandbox inbox for the given user, when and
 * only when capture is explicitly configured. Never throws.
 */
export async function deliverOtpToSandbox(
  userId: unknown,
  code: unknown,
): Promise<CaptureLogRecord> {
  if (!isEnabled()) return captureLog("capture_deliver", "skipped", "disabled");
  if (typeof userId !== "string" || !userId) {
    return captureLog("capture_deliver", "skipped", "invalid_input");
  }
  let address: unknown;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !data?.user?.email) {
      return captureLog("capture_deliver", "skipped", "invalid_input");
    }
    address = data.user.email;
  } catch {
    return captureLog("capture_deliver", "failed", "provider_unavailable");
  }
  try {
    const result = await deliver({ to: address, code });
    return result.log;
  } catch {
    return captureLog("capture_deliver", "failed", "provider_unavailable");
  }
}
