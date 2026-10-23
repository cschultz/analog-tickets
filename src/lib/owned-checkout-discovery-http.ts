/** Fixed, read-only private discovery request. No client selector or provider work. */
import { isUuid } from "./checkout-core";
import type { OwnedCheckoutDiscovery } from "./owned-checkout-discovery.server";
import { parseBearer, resolveCors } from "./transfer-otp-core";

export interface DiscoveryHttpDependencies {
  enabled: string | undefined;
  testMode: string | undefined;
  provider: string | undefined;
  allowedOrigin: string | undefined;
  authenticate: (token: string) => Promise<string | null>;
  discover: (verifiedOwnerId: string) => Promise<OwnedCheckoutDiscovery>;
}

async function emptySelector(request: Request): Promise<boolean> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? ""))
    return false;
  const reader = request.body?.getReader();
  if (!reader) return false;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 64) {
        await reader.cancel();
        return false;
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
    return (
      !!body && typeof body === "object" && !Array.isArray(body) && Object.keys(body).length === 0
    );
  } catch {
    return false;
  } finally {
    reader.releaseLock();
  }
}

export async function handleOwnedCheckoutDiscovery(
  request: Request,
  deps: DiscoveryHttpDependencies,
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
    if (!(await emptySelector(request))) return reply({ error: "Invalid request." }, 400);
    const result = await deps.discover(owner);
    if (result.status === "none") return reply({ status: "none" });
    if (
      result.status === "found" &&
      isUuid(result.reservationId) &&
      isUuid(result.ticketTypeId) &&
      typeof result.expiresAt === "string" &&
      Number.isFinite(Date.parse(result.expiresAt)) &&
      typeof result.started === "boolean"
    )
      return reply({
        status: "found",
        reservationId: result.reservationId,
        ticketTypeId: result.ticketTypeId,
        expiresAt: result.expiresAt,
        started: result.started,
      });
    return reply({ status: "review" });
  } catch {
    return reply({ status: "review" }, 503);
  }
}
