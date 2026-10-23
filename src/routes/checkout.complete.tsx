import { createFileRoute } from "@tanstack/react-router";
import { GuestCheckoutReturn } from "@/components/GuestCheckoutReturn";
import { checkoutReturnHead } from "@/lib/checkout-return-head";

export const Route = createFileRoute("/checkout/complete")({
  head: () => checkoutReturnHead("complete", "noindex, nofollow"),
  component: () => <GuestCheckoutReturn kind="complete" />,
});
