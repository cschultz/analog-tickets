import type { CSSProperties, ReactNode } from "react";
import {
  checkoutBrandingConfig,
  type CheckoutBrandingConfig,
} from "@/lib/checkout-branding-config";
import "./checkout-shell.css";
type CheckoutStep =
  "Account" | "Reservation" | "Stripe TEST checkout" | "Details" | "Payment" | "Tickets";

/** Shared presentation only; this shell never reads checkout, auth or browser storage. */
export function CheckoutShell({
  children,
  summary,
  title = "Checkout",
  currentStep,
  steps = ["Account", "Reservation", "Stripe TEST checkout"],
  branding = checkoutBrandingConfig,
}: {
  children: ReactNode;
  summary?: ReactNode;
  title?: string;
  currentStep?: CheckoutStep;
  steps?: readonly CheckoutStep[];
  branding?: CheckoutBrandingConfig;
}) {
  const brandStyle = { "--checkout-brand-accent": branding.accentColor } as CSSProperties;
  return (
    <div className="ticket-checkout" style={brandStyle}>
      <header className="checkout-header">
        <div className="checkout-header-inner">
          <div className="checkout-brand">
            {branding.wordmark ? (
              <>
                <img
                  src={branding.wordmark.src}
                  alt={branding.wordmark.alt}
                  width={112}
                  height={56}
                  onError={(event) => {
                    event.currentTarget.hidden = true;
                  }}
                />
                <span className="checkout-brand-fallback">{branding.organizerName}</span>
              </>
            ) : (
              branding.organizerName
            )}
          </div>
          <a href="/" className="checkout-back">
            ← All events
          </a>
        </div>
      </header>
      <div className="checkout-layout">
        <main className="checkout-main">
          {currentStep ? (
            <nav aria-label="Checkout progress">
              <ol className="checkout-progress">
                {steps.map((step) => (
                  <li key={step} aria-current={currentStep === step ? "step" : undefined}>
                    {step}
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}
          <div className="checkout-title-row">
            <h1>{title}</h1>
            <span className="checkout-test-label">TEST · PRIVATE PREVIEW</span>
          </div>
          {children}
          <footer className="checkout-footer">
            Analog Tickets · Private synthetic demonstration. No real admission.
          </footer>
        </main>
        <aside
          className="checkout-summary"
          aria-label={summary ? "Order summary" : "Preview information"}
        >
          <div className="checkout-summary-inner">
            {summary ?? (
              <>
                <h2>Private TEST preview</h2>
                <p className="checkout-note">No payment or ticket status is confirmed here.</p>
                <p className="checkout-note">
                  Private synthetic testing only. Do not complete payment without separate approval.
                </p>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
