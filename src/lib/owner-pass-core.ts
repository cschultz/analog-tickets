import { isUuid, isSandboxEnabled, parseBearer, resolveCors } from "./transfer-otp-core";
import { PASS_CODE_RE } from "./checkin-core";
import type { PassIssuanceResult } from "./pass-issuance.server";

export type OwnerPassInspection =
  { outcome: "ready"; activePassId: string | null } | { outcome: "not_eligible" | "unavailable" };
export interface OwnerPassDependencies {
  enabled: string | undefined;
  allowedOrigin: string | undefined;
  authenticate: (token: string) => Promise<string | null>;
  inspect: (ticketId: string, ownerId: string) => Promise<OwnerPassInspection>;
  issue: (
    ticketId: string,
    ownerId: string,
    expectedPassId: string | null,
  ) => Promise<PassIssuanceResult>;
}

/** Inspection never returns a raw code; issue is one deliberate atomic attempt, never retried. */
export async function handleOwnerPass(request: Request, deps: OwnerPassDependencies) {
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
  if (!isSandboxEnabled(deps.enabled)) return reply({ error: "Service unavailable." }, 503);
  const token = parseBearer(request.headers.get("authorization"));
  if (!token) return reply({ error: "Authentication required." }, 401);
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body))
      return reply({ error: "Invalid request." }, 400);
    const b = body as Record<string, unknown>;
    const keys =
      b["action"] === "inspect"
        ? ["action", "ticketId"]
        : ["action", "ticketId", "expectedActivePassId", "confirmed"];
    if (
      Object.keys(b).some((k) => !keys.includes(k)) ||
      !isUuid(b["ticketId"]) ||
      (b["action"] !== "inspect" && b["action"] !== "issue") ||
      (b["action"] === "issue" &&
        (b["confirmed"] !== true ||
          (b["expectedActivePassId"] !== null && !isUuid(b["expectedActivePassId"]))))
    )
      return reply({ error: "Invalid request." }, 400);
    const owner = await deps.authenticate(token);
    if (!isUuid(owner)) return reply({ error: "Authentication required." }, 401);
    if (b["action"] === "inspect") {
      const result = await deps.inspect(b["ticketId"], owner);
      if (
        result.outcome === "ready" &&
        (result.activePassId === null || isUuid(result.activePassId))
      )
        return reply({ outcome: "ready", activePassId: result.activePassId });
      return reply(
        { outcome: result.outcome === "not_eligible" ? "not_eligible" : "unavailable" },
        result.outcome === "not_eligible" ? 409 : 503,
      );
    }
    const result = await deps.issue(
      b["ticketId"],
      owner,
      b["expectedActivePassId"] as string | null,
    );
    if (result.outcome === "issued" && isUuid(result.passId) && PASS_CODE_RE.test(result.passCode))
      return reply({ outcome: "issued", passId: result.passId, passCode: result.passCode });
    if (result.outcome === "state_changed" || result.outcome === "not_eligible")
      return reply({ outcome: result.outcome }, 409);
    return reply({ outcome: "unavailable" }, 503);
  } catch {
    // A write may have committed. Never assert rollback and never retry.
    return reply({ outcome: "unavailable" }, 503);
  }
}
