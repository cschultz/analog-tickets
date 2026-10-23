/**
 * Private staging endpoint (Gate 99.1): current holder initiates a ticket
 * transfer to an already-existing recipient account.
 *
 * Authenticated, owner-only. The sender is derived from the bearer token; the
 * ticket's ownership/state is re-checked in SQL under a row lock. The response
 * carries no identifiers, e-mail, code, or token. Sandbox mode must be on.
 */
import { createFileRoute } from "@tanstack/react-router";

import {
  errorResponse,
  isSandboxEnabled,
  jsonResponse,
  normalizeFailure,
  parseBearer,
  resolveCors,
  ticketEligibility,
} from "@/lib/transfer-otp-core";
import { parseInitiateInput, transferExpiry } from "@/lib/ticket-transfer-core";

export const Route = createFileRoute("/api/public/initiate-ticket-transfer")({
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
        const input = parseInitiateInput(body);
        if (typeof input === "string") return errorResponse(input, headers);

        try {
          const { createUserClient, resolveUserId } = await import("@/lib/transfer-otp.server");
          const userClient = createUserClient(token);
          const userId = await resolveUserId(userClient, token);
          if (!userId) return errorResponse("unauthorized", headers);

          // Ownership pre-check through the caller's own RLS-scoped client.
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
          const { initiateTransfer, resolveRecipientUserId } = await import(
            "@/lib/ticket-transfer.server"
          );
          const admin = supabaseAdmin as unknown as Parameters<typeof initiateTransfer>[0];

          const recipientUserId = await resolveRecipientUserId(admin, input.recipientEmail);
          if (!recipientUserId || recipientUserId === userId) {
            return errorResponse("not_eligible", headers);
          }

          const failure = await initiateTransfer(admin, {
            ticketId: input.ticketId,
            senderUserId: userId,
            recipientUserId,
            expiresAt: transferExpiry(Date.now()),
          });
          if (failure) return errorResponse(failure, headers);

          return jsonResponse({ ok: true, pending: true }, headers);
        } catch (error) {
          return errorResponse(normalizeFailure(error), headers);
        }
      },
    },
  },
});
