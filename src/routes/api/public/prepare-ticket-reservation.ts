/** Off-by-default synthetic sandbox; no provider, order, ticket or payment work. */
import { createFileRoute } from "@tanstack/react-router";
import { checkoutErrorResponse, checkoutJsonResponse } from "@/lib/checkout-core";
import { parseOwnedReservationInput } from "@/lib/owned-reservation-core";
import { parseBearer, resolveCors } from "@/lib/transfer-otp-core";

export const Route = createFileRoute("/api/public/prepare-ticket-reservation")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => {
        const cors = resolveCors(
          request.headers.get("origin"),
          process.env["STAGING_ALLOWED_ORIGIN"],
        );
        return new Response(null, { status: cors.allowed ? 204 : 403, headers: cors.headers });
      },
      POST: async ({ request }) => {
        const cors = resolveCors(
          request.headers.get("origin"),
          process.env["STAGING_ALLOWED_ORIGIN"],
        );
        if (!cors.allowed) return checkoutErrorResponse("forbidden", cors.headers);
        const headers = { ...cors.headers, "Cache-Control": "no-store, private" };
        if (
          process.env["ATTENDEE_RESERVATION_SANDBOX_MODE"] !== "true" ||
          process.env["PAYMENTS_TEST_MODE"] !== "true" ||
          process.env["PAYMENT_PROVIDER"] !== "stripe_test"
        )
          return checkoutErrorResponse("configuration", headers);
        const token = parseBearer(request.headers.get("authorization"));
        if (!token) return checkoutErrorResponse("unauthorized", headers);
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return checkoutErrorResponse("invalid_request", headers);
        }
        const input = parseOwnedReservationInput(body);
        if (typeof input === "string") return checkoutErrorResponse(input, headers);
        try {
          const { createUserClient, resolveUserId } = await import("@/lib/transfer-otp.server");
          const owner = await resolveUserId(createUserClient(token), token);
          if (!owner) return checkoutErrorResponse("unauthorized", headers);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { prepareOwnedReservation } = await import("@/lib/owned-reservation.server");
          const result = await prepareOwnedReservation(supabaseAdmin, owner, input);
          return result.ok
            ? checkoutJsonResponse(
                {
                  ok: true,
                  status: "ready",
                  reservationId: result.reservationId,
                  expiresAt: result.expiresAt,
                },
                headers,
              )
            : checkoutErrorResponse(result.code, headers);
        } catch {
          return checkoutErrorResponse("server_error", headers);
        }
      },
    },
  },
});
