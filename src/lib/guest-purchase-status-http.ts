import { handleGuestLookup } from "./guest-checkout-lookup-http";
import type { GuestPurchaseStatus } from "./guest-purchase-status";

/** Same strict Origin/TEST/bearer/exact-cart request boundary as cart recovery. */
export async function handleGuestPurchaseStatus(
  request: Request,
  deps: Omit<Parameters<typeof handleGuestLookup>[1], "lookup"> & {
    load(owner: string, cart: string): Promise<GuestPurchaseStatus | null>;
  },
): Promise<Response> {
  // Share the request boundary, not the resume response contract. Its handler
  // intentionally only discriminates unavailable vs a successful JSON payload.
  return handleGuestLookup(request, {
    ...deps,
    lookup: async (owner, cart) => {
      const result = await deps.load(owner, cart);
      return result ?? { status: "unavailable" };
    },
  });
}
