/**
 * Private staging endpoint (Gate 99.1): the intended RECIPIENT accepts a
 * pending transfer with their own one-time code.
 *
 * Recipient-only. The digest is verified here (constant-time) and then passed
 * back to the atomic SQL routine as a compare-and-set token, so a rotated code,
 * a replay, a racing duplicate, expiry, a wrong recipient, or a changed ticket
 * state all lose inside one row-locked transaction. Every denial returns the
 * same generic `invalid_code`.
 */
import { createFileRoute } from "@tanstack/react-router";

import {
  errorResponse,
  isSandboxEnabled,
  jsonResponse,
  normalizeFailure,
  parseBearer,
  resolveCors,
} from "@/lib/transfer-otp-core";
import { parseAcceptInput, pendingTransferUsability } from "@/lib/ticket-transfer-core";

export const Route = createFileRoute("/api/public/accept-ticket-transfer")({
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
        const input = parseAcceptInput(body);
        if (typeof input === "string") return errorResponse(input, headers);

        try {
          const { createUserClient, resolveUserId } = await import("@/lib/transfer-otp.server");
          const userId = await resolveUserId(createUserClient(token), token);
          if (!userId) return errorResponse("unauthorized", headers);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { acceptTransfer, loadPendingTransfer, verifyRecipientOtp } = await import(
            "@/lib/ticket-transfer.server"
          );
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
          if (problem || !row) return errorResponse("invalid_code", headers);
          if (row.otp_issued_count < 1) return errorResponse("invalid_code", headers);
          if (!(await verifyRecipientOtp(row, userId, input.code))) {
            return errorResponse("invalid_code", headers);
          }

          const failure = await acceptTransfer(admin, {
            transferId: row.id,
            recipientUserId: userId,
            tokenHash: row.token_hash,
          });
          if (failure) return errorResponse(failure, headers);

          return jsonResponse({ ok: true, accepted: true }, headers);
        } catch (error) {
          return errorResponse(normalizeFailure(error), headers);
        }
      },
    },
  },
});
