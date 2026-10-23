/**
 * Private staging endpoint: verify (and atomically redeem) a transfer OTP.
 *
 * Owner-only, authenticated. Replays, races, invalid codes, missing records,
 * and expired codes all fail closed with the same generic error.
 */
import { createFileRoute } from "@tanstack/react-router";

import {
  errorResponse,
  isSandboxEnabled,
  jsonResponse,
  normalizeFailure,
  parseBearer,
  parseVerifyInput,
  recordUsability,
  resolveCors,
  ticketEligibility,
  verifyOtpHash,
} from "@/lib/transfer-otp-core";

export const Route = createFileRoute("/api/public/verify-transfer-otp")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => {
        const cors = resolveCors(
          request.headers.get("origin"),
          process.env['STAGING_ALLOWED_ORIGIN'],
        );
        if (!cors.allowed) return new Response(null, { status: 403, headers: cors.headers });
        return new Response(null, { status: 204, headers: cors.headers });
      },
      POST: async ({ request }) => {
        const cors = resolveCors(
          request.headers.get("origin"),
          process.env['STAGING_ALLOWED_ORIGIN'],
        );
        if (!cors.allowed) return errorResponse("forbidden", cors.headers);
        const headers = cors.headers;

        if (!isSandboxEnabled(process.env['TRANSFER_SANDBOX_MODE'])) {
          return errorResponse("configuration", headers);
        }

        const token = parseBearer(request.headers.get("authorization"));
        if (!token) return errorResponse("unauthorized", headers);

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return errorResponse("invalid_request", headers);
        }
        const input = parseVerifyInput(body);
        if (typeof input === "string") return errorResponse(input, headers);

        try {
          const { createUserClient, resolveUserId } = await import("@/lib/transfer-otp.server");
          const userClient = createUserClient(token);
          const userId = await resolveUserId(userClient, token);
          if (!userId) return errorResponse("unauthorized", headers);

          const { data: ticket, error: ticketError } = await userClient
            .from("tickets")
            .select("owner_user_id, status, checked_in_at")
            .eq("id", input.ticketId)
            .maybeSingle();
          if (ticketError) return errorResponse("server_error", headers);

          const problem = ticketEligibility(
            ticket
              ? {
                  ownerUserId: ticket.owner_user_id,
                  status: ticket.status,
                  checkedInAt: ticket.checked_in_at,
                }
              : null,
            userId,
          );
          if (problem) return errorResponse(problem, headers);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const now = Date.now();
          const { data: records, error: readError } = await supabaseAdmin
            .from("transfer_otp_codes")
            .select("id, code_hash, expires_at, redeemed_at")
            .eq("ticket_id", input.ticketId)
            .eq("requester_user_id", userId)
            .order("created_at", { ascending: false })
            .limit(10);
          if (readError) return errorResponse("server_error", headers);

          for (const record of records ?? []) {
            if (recordUsability(
              { expiresAt: record.expires_at, redeemedAt: record.redeemed_at },
              now,
            )) {
              continue;
            }
            if (!(await verifyOtpHash(record.code_hash, input.ticketId, input.code))) continue;

            // Atomic single redemption: the conditional update loses the race
            // for any concurrent replay, which then falls through to failure.
            const { data: redeemed, error: redeemError } = await supabaseAdmin
              .from("transfer_otp_codes")
              .update({ redeemed_at: new Date(now).toISOString() })
              .eq("id", record.id)
              .is("redeemed_at", null)
              .select("id");
            if (redeemError) return errorResponse("server_error", headers);
            if (!redeemed || redeemed.length === 0) return errorResponse("invalid_code", headers);
            return jsonResponse({ ok: true, verified: true }, headers);
          }

          return errorResponse("invalid_code", headers);
        } catch (error) {
          return errorResponse(normalizeFailure(error), headers);
        }
      },
    },
  },
});
