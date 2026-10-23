import { createFileRoute } from "@tanstack/react-router";
import { GuestCheckoutReturn } from "@/components/GuestCheckoutReturn";
import { checkoutReturnHead } from "@/lib/checkout-return-head";

export const Route = createFileRoute("/checkout/cancelled")({
  head: () => checkoutReturnHead("cancelled", "noindex, nofollow"),
  component: () => <GuestCheckoutReturn kind="cancelled" />,
});
