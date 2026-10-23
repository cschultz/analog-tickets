/**
 * Private staging endpoint (Gate 105): an organizer or admin reverses a prior
 * check-in for a ticket, identified by its opaque pass code, with a mandatory
 * staff-entered reason.
 *
 * Server-only, bearer-authenticated, strict allow-listed CORS, fail closed.
 * Staff identity comes exclusively from the validated token; event, ticket,
 * role and user values are never read from the body. The entered code is
 * hashed server-side and never logged or echoed. Responses carry only
 * `reversed` plus its timestamp — no ticket, attendee, order, provider or
 * backend detail. There is no UI and no navigation to this route.
 */
import { createFileRoute } from "@tanstack/react-router";

import { isCheckInEnabled } from "@/lib/checkin-core";
import {
  normalizeReversalFailure,
  parseReversalInput,
  reversalErrorResponse,
  reversalSuccessResponse,
} from "@/lib/checkin-reversal-core";
import { parseBearer, resolveCors } from "@/lib/transfer-otp-core";

export const Route = createFileRoute("/api/public/reverse-check-in")({
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
        if (!cors.allowed) return reversalErrorResponse("forbidden", cors.headers);
        const headers = cors.headers;

        if (!isCheckInEnabled(process.env['CHECKIN_SANDBOX_MODE'])) {
          return reversalErrorResponse("configuration", headers);
        }

        const token = parseBearer(request.headers.get("authorization"));
        if (!token) return reversalErrorResponse("unauthorized", headers);

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return reversalErrorResponse("invalid_request", headers);
        }
        const input = parseReversalInput(body);
        if (typeof input === "string") return reversalErrorResponse(input, headers);

        try {
          const { createUserClient, resolveUserId } = await import("@/lib/transfer-otp.server");
          const staffUserId = await resolveUserId(createUserClient(token), token);
          if (!staffUserId) return reversalErrorResponse("unauthorized", headers);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { reverseScannedCheckIn } = await import("@/lib/checkin-reversal.server");
          const admin = supabaseAdmin as unknown as Parameters<typeof reverseScannedCheckIn>[0];

          const result = await reverseScannedCheckIn(admin, {
            passCode: input.passCode,
            reason: input.reason,
            staffUserId,
          });
          if (typeof result === "string") return reversalErrorResponse(result, headers);
          return reversalSuccessResponse(result, headers);
        } catch (error) {
          return reversalErrorResponse(normalizeReversalFailure(error), headers);
        }
      },
    },
  },
});
