export type CheckoutReturnKind = "complete" | "cancelled";
const DESCRIPTION =
  "Private test checkout return. Payment, reservation and ticket status must be checked separately.";
export function checkoutReturnHead(
  kind: CheckoutReturnKind,
  robots: "noindex, nofollow" = "noindex, nofollow",
) {
  const title =
    kind === "complete"
      ? "Analog Tickets — Checkout Return"
      : "Analog Tickets — Checkout Cancellation Return";
  return {
    meta: [
      { title },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: robots },
      { property: "og:title", content: title },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "referrer", content: "no-referrer" },
    ],
  };
}
