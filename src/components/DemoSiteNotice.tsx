import { BRANDING, DEMO_SITE_DISCLAIMER } from "@/platform/branding";

interface DemoSiteNoticeProps {
  /** `full` lists every disclaimer line; `compact` renders the one-sentence form. */
  variant?: "full" | "compact";
  className?: string;
}

/**
 * Public acknowledgment that this deployment is a demonstration of
 * Analog Tickets and not an active event. Rendered sitewide in the footer and
 * once on the homepage.
 */
const DemoSiteNotice = ({ variant = "full", className = "" }: DemoSiteNoticeProps) => {
  if (variant === "compact") {
    return (
      <p
        role="note"
        data-testid="demo-site-notice"
        className={`text-xs leading-relaxed opacity-80 ${className}`}
      >
        {DEMO_SITE_DISCLAIMER.short}
      </p>
    );
  }

  return (
    <aside
      role="note"
      data-testid="demo-site-notice"
      className={`rounded-sm border border-current/25 px-5 py-4 text-sm leading-relaxed opacity-90 ${className}`}
    >
      <strong className="block mb-2 text-xs uppercase tracking-widest">
        {DEMO_SITE_DISCLAIMER.heading}
      </strong>
      <div className="space-y-1">
        {DEMO_SITE_DISCLAIMER.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <p className="mt-2 text-xs opacity-75">
        {BRANDING.platformName} is part of {BRANDING.commonsName}.
      </p>
    </aside>
  );
};

export default DemoSiteNotice;
