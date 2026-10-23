import { isUuid } from "./checkout-core";
import { parseBearer, resolveCors } from "./transfer-otp-core";

export interface OwnedExpiryHttpDependencies {
  enabled: string | undefined;
  testMode: string | undefined;
  provider: string | undefined;
  allowedOrigin: string | undefined;
  authenticate: (token: string) => Promise<string | null>;
  recover: (reservationId: string, verifiedUserId: string) => Promise<unknown>;
}

/** Bound input before JSON parsing. No user/provider facts are accepted. */
async function reservationSelector(request: Request): Promise<string | null> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    const row = body as Record<string, unknown>;
    if (Object.keys(row).length !== 1 || !isUuid(row["reservationId"])) return null;
    return row["reservationId"];
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

/** Deliberate owner reconciliation, not checkout creation or payment proof. */
export async function handleOwnedExpiryRecovery(
  request: Request,
  deps: OwnedExpiryHttpDependencies,
): Promise<Response> {
  const cors = resolveCors(request.headers.get("origin"), deps.allowedOrigin);
  const headers = {
    ...cors.headers,
    "Cache-Control": "no-store, private",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (!cors.allowed) return reply({ error: "Not permitted." }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return reply({ error: "Not permitted." }, 405);
  if (deps.enabled !== "true" || deps.testMode !== "true" || deps.provider !== "stripe_test")
    return reply({ error: "Service unavailable." }, 503);
  const token = parseBearer(request.headers.get("authorization"));
  if (!token) return reply({ error: "Authentication required." }, 401);
  try {
    const owner = await deps.authenticate(token);
    if (!isUuid(owner)) return reply({ error: "Authentication required." }, 401);
    const reservationId = await reservationSelector(request);
    if (!reservationId) return reply({ error: "Invalid request." }, 400);
    // Callback is reachable only after server authentication and strict input.
    const raw = await deps.recover(reservationId, owner);
    const status =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>)["status"] : null;
    if (status === "released" || status === "already_released") return reply({ status });
    return reply({ status: "unresolved" });
  } catch {
    // A write might have committed. Never promise rollback or retry silently.
    return reply({ status: "unresolved" }, 503);
  }
}
