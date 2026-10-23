/** Presentation only. Never pass branding to checkout or reservation endpoints. */
export type CheckoutBrandingConfig = {
  organizerName: string;
  wordmark?: { src: string; alt: string };
  accentColor: `oklch(${string})`;
};

export const checkoutBrandingConfig: CheckoutBrandingConfig = {
  organizerName: "Analog Tickets TEST",
  accentColor: "oklch(0.24 0.006 260)",
};
