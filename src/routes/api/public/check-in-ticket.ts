/**
 * Private staging endpoint (Gate 103): an authorized staff member checks a
 * ticket in by scanning its opaque pass code.
 *
 * Server-only, bearer-authenticated, strict allow-listed CORS, fail closed.
 * Staff identity comes exclusively from the validated token; event, ticket,
 * role and user values are never read from the body. The scanned code is
 * hashed server-side and never logged or echoed. Responses carry only
 * `accepted`, or `already_checked_in` plus the original timestamp — no ticket,
 * attendee, order, provider or backend detail. There is no UI and no
 * navigation to this route.
 */
import { createFileRoute } from "@tanstack/react-router";

import {
  checkInErrorResponse,
  checkInSuccessResponse,
  isCheckInEnabled,
  normalizeCheckInFailure,
  parseCheckInInput,
  readCheckInBody,
} from "@/lib/checkin-core";
import { parseBearer, resolveCors } from "@/lib/transfer-otp-core";

export const Route = createFileRoute("/api/public/check-in-ticket")({
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
        if (!cors.allowed) return checkInErrorResponse("forbidden", cors.headers);
        const headers = cors.headers;

        if (!isCheckInEnabled(process.env["CHECKIN_SANDBOX_MODE"])) {
          return checkInErrorResponse("configuration", headers);
        }

        const token = parseBearer(request.headers.get("authorization"));
        if (!token) return checkInErrorResponse("unauthorized", headers);

        const body = await readCheckInBody(request);
        const input = parseCheckInInput(body);
        if (typeof input === "string") return checkInErrorResponse(input, headers);

        try {
          const { createUserClient, resolveUserId } = await import("@/lib/transfer-otp.server");
          const staffUserId = await resolveUserId(createUserClient(token), token);
          if (!staffUserId) return checkInErrorResponse("unauthorized", headers);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { checkInScannedPass } = await import("@/lib/checkin.server");
          const admin = supabaseAdmin as unknown as Parameters<typeof checkInScannedPass>[0];

          const result = await checkInScannedPass(admin, {
            passCode: input.passCode,
            staffUserId,
          });
          if (typeof result === "string") return checkInErrorResponse(result, headers);
          return checkInSuccessResponse(result, headers);
        } catch (error) {
          return checkInErrorResponse(normalizeCheckInFailure(error), headers);
        }
      },
    },
  },
});
