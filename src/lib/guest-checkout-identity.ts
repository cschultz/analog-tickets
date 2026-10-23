/**
 * User-initiated guest identity adapter. No I/O until ensure() is called.
 * Compatible with the existing Supabase Auth client; the customer route uses it
 * only behind the explicit TEST guest-checkout gate.
 * Never stores buyer contact in user_metadata or treats email as ownership.
 */
import { isUuid } from "./checkout-core";

interface IdentitySession {
  access_token: string;
  user: { id: string };
}
export interface GuestIdentityAuth {
  getSession(): Promise<{ data: { session: IdentitySession | null }; error: unknown }>;
  getUser(token: string): Promise<{
    data: { user: { id: string; is_anonymous?: boolean } | null };
    error: unknown;
  }>;
  signInAnonymously(): Promise<{ data: { session: IdentitySession | null }; error: unknown }>;
}
export type GuestIdentityResult =
  | { ok: true; ownerId: string; kind: "guest" | "account" }
  | { ok: false; code: "unavailable" | "uncertain" | "session_changed" };

export function createGuestCheckoutIdentity(auth: GuestIdentityAuth) {
  let inFlight: Promise<GuestIdentityResult> | null = null;
  let creationAttempted = false;

  async function verify(session: IdentitySession): Promise<GuestIdentityResult> {
    if (!isUuid(session.user.id) || !session.access_token)
      return { ok: false, code: "unavailable" };
    // getSession is only a local hint. Validate the explicit bearer with Auth.
    const result = await auth.getUser(session.access_token);
    if (result.error || !result.data.user || result.data.user.id !== session.user.id) {
      return { ok: false, code: "unavailable" };
    }
    const current = await auth.getSession();
    if (current.error || current.data.session?.user.id !== result.data.user.id) {
      return { ok: false, code: "session_changed" };
    }
    return {
      ok: true,
      ownerId: result.data.user.id,
      kind: result.data.user.is_anonymous === true ? "guest" : "account",
    };
  }

  async function ensureIdentity(allowCreate: boolean): Promise<GuestIdentityResult> {
    try {
      const existing = await auth.getSession();
      if (existing.error) return { ok: false, code: "unavailable" };
      // Never replace an invalid, expired or existing signed-in session.
      if (existing.data.session) return await verify(existing.data.session);
      if (!allowCreate) return { ok: false, code: "unavailable" };
      // A lost creation response may have created a user. Do not silently repeat.
      if (creationAttempted) return { ok: false, code: "uncertain" };
      creationAttempted = true;
      const created = await auth.signInAnonymously();
      if (created.error || !created.data.session) return { ok: false, code: "uncertain" };
      return await verify(created.data.session);
    } catch {
      return { ok: false, code: creationAttempted ? "uncertain" : "unavailable" };
    }
  }

  return {
    ensure(options: { allowCreate?: boolean } = {}): Promise<GuestIdentityResult> {
      // Coalesce double-clicks, without caching identity across sign-out/switch.
      if (!inFlight) {
        inFlight = ensureIdentity(options.allowCreate !== false).finally(() => {
          inFlight = null;
        });
      }
      return inFlight;
    },
  };
}
