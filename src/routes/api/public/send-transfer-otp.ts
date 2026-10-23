/**
 * Private staging endpoint: issue a ticket-transfer OTP.
 *
 * Owner-only, authenticated, read-mostly. No roles, no admin bypass, no
 * client-supplied identity. Sandbox mode must be explicitly enabled.
 */
import { createFileRoute } from "@tanstack/react-router";

import {
  errorResponse,
  exceedsHourlyLimit,
  expiryTimestamp,
  generateSixDigitCode,
  hashOtp,
  isSandboxEnabled,
  jsonResponse,
  normalizeFailure,
  parseBearer,
  parseSendInput,
  randomSaltHex,
  resolveCors,
  ticketEligibility,
} from "@/lib/transfer-otp-core";

export const Route = createFileRoute("/api/public/send-transfer-otp")({
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
        const input = parseSendInput(body);
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
          const since = new Date(now - 60 * 60 * 1000).toISOString();
          const { data: recent, error: recentError } = await supabaseAdmin
            .from("transfer_otp_codes")
            .select("created_at")
            .eq("ticket_id", input.ticketId)
            .gte("created_at", since);
          if (recentError) return errorResponse("server_error", headers);
          if (exceedsHourlyLimit((recent ?? []).map((r) => r.created_at), now)) {
            return errorResponse("rate_limited", headers);
          }

          const code = generateSixDigitCode();
          const codeHash = await hashOtp(randomSaltHex(), input.ticketId, code);
          const { error: insertError } = await supabaseAdmin.from("transfer_otp_codes").insert({
            ticket_id: input.ticketId,
            requester_user_id: userId,
            code_hash: codeHash,
            expires_at: expiryTimestamp(now),
          });
          if (insertError) return errorResponse("server_error", headers);

          // Gate 124: best-effort test-only sandbox capture. Disabled unless the
          // exact server-only Mailtrap Email Testing configuration is present;
          // synthetic recipients only; never alters the response or status.
          try {
            const { deliverOtpToSandbox } = await import("@/lib/otp-mail-delivery.server");
            await deliverOtpToSandbox(userId, code);
          } catch {
            /* capture never affects issuance */
          }

          // Sandbox only: the plaintext code is returned to the authenticated
          // owner and never logged, persisted, or emailed to a real address.
          return jsonResponse({ ok: true, sandbox: true, code }, headers);

        } catch (error) {
          return errorResponse(normalizeFailure(error), headers);
        }
      },
    },
  },
});
