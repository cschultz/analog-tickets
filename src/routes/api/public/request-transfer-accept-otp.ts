/**
 * Private staging endpoint (Gate 99.1): the intended RECIPIENT requests their
 * own one-time acceptance code for a pending transfer.
 *
 * Recipient-only (derived from the bearer token, matched against the row's
 * bound recipient). In sandbox mode the code is returned to that authenticated
 * recipient instead of being e-mailed — the same test-only capture semantics as
 * the existing owner OTP. Never logged or persisted in plaintext.
 */
import { createFileRoute } from "@tanstack/react-router";

import {
  errorResponse,
  generateSixDigitCode,
  isSandboxEnabled,
  jsonResponse,
  normalizeFailure,
  parseBearer,
  resolveCors,
} from "@/lib/transfer-otp-core";
import {
  otpIssuanceAllowed,
  parseRecipientOtpInput,
  pendingTransferUsability,
} from "@/lib/ticket-transfer-core";

export const Route = createFileRoute("/api/public/request-transfer-accept-otp")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => {
        const cors = resolveCors(
          request.headers.get("origin"),
          process.env["STAGING_ALLOWED_ORIGIN"],
        );
        if (!cors.allowed) return new Response(null, { status: 403, headers: cors.headers });
        return new Response(null, { status: 204, headers: cors.headers });
      },
      POST: async ({ request }) => {
        const cors = resolveCors(
          request.headers.get("origin"),
          process.env["STAGING_ALLOWED_ORIGIN"],
        );
        if (!cors.allowed) return errorResponse("forbidden", cors.headers);
        const headers = cors.headers;

        if (!isSandboxEnabled(process.env["TRANSFER_SANDBOX_MODE"])) {
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
        const input = parseRecipientOtpInput(body);
        if (typeof input === "string") return errorResponse(input, headers);

        try {
          const { createUserClient, resolveUserId } = await import("@/lib/transfer-otp.server");
          const userId = await resolveUserId(createUserClient(token), token);
          if (!userId) return errorResponse("unauthorized", headers);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { loadPendingTransfer, rotateRecipientOtp } =
            await import("@/lib/ticket-transfer.server");
          const admin = supabaseAdmin as unknown as Parameters<typeof loadPendingTransfer>[0];

          const now = Date.now();
          const { row, failed } = await loadPendingTransfer(admin, input.ticketId);
          if (failed) return errorResponse("server_error", headers);
          const problem = pendingTransferUsability(
            row
              ? {
                  status: row.status,
                  expiresAt: row.expires_at,
                  recipientUserId: row.recipient_user_id,
                  otpIssuedCount: row.otp_issued_count,
                }
              : null,
            userId,
            now,
          );
          if (problem || !row) return errorResponse(problem ?? "not_eligible", headers);
          if (!otpIssuanceAllowed(row.otp_issued_count)) {
            return errorResponse("rate_limited", headers);
          }

          const code = generateSixDigitCode();
          const rotated = await rotateRecipientOtp(admin, row, code);
          if (rotated === "failed") return errorResponse("server_error", headers);
          if (rotated === "lost_race") return errorResponse("rate_limited", headers);

          // Gate 124: best-effort test-only sandbox capture (see send route).
          try {
            const { deliverOtpToSandbox } = await import("@/lib/otp-mail-delivery.server");
            await deliverOtpToSandbox(userId, code);
          } catch {
            /* capture never affects issuance */
          }

          // Sandbox only: plaintext returned to the authenticated recipient.
          return jsonResponse({ ok: true, sandbox: true, code }, headers);
        } catch (error) {
          return errorResponse(normalizeFailure(error), headers);
        }
      },
    },
  },
});
