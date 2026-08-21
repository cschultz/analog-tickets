import { 
  AdminDialog, 
  AdminDialogContent, 
  AdminDialogHeader, 
  AdminDialogTitle, 
  AdminDialogTrigger,
  AdminButton,
  AdminBadge
} from "@/components/admin";
import { Mail, ExternalLink, Calendar, MapPin, Check, Clock } from "lucide-react";
import { format } from "date-fns";

// Color palettes matching email templates
const previewColors = {
  bg: '#F4F6F8',
  surface: '#E8EBEF',
  text: '#1A2A3A',
  muted: '#5B6B7B',
  accent: '#3A8A8F',
  border: '#C5CCD4',
};

const volunteerColors = {
  background: "#F3EEE6",
  surface: "#FFFFFF",
  surfaceAlt: "#F9F7F4",
  primary: "#A37552",
  primaryGold: "#C7A97A",
  text: "#322821",
  textMuted: "#7B6E61",
  border: "#D1C2AE",
};

const paymentReminderColors = {
  background: "#F3EEE6",
  surface: "#FFFFFF",
  surfaceAlt: "#F9F7F4",
  primary: "#A37552",
  primaryGold: "#C7A97A",
  text: "#322821",
  textMuted: "#7B6E61",
  border: "#D1C2AE",
};

// Ticket type labels
const ticketTypeLabels: Record<string, string> = {
  early_bird_ga_2day: "Early Bird GA — 2 Day",
  early_bird_krewe_3day: "Early Bird Crew — 3 Day",
  early_bird_vip_3day: "Early Bird VIP — 3 Day",
  ga_2day: "GA — 2 Day Pass",
  krewe_3day: "Crew — 3 Day Pass",
  vip_3day: "VIP — 3 Day Pass",
  patrons_premier: "Patrons Premier",
  patrons_ultimate: "Patrons Ultimate",
  patrons_vip: "Patrons VIP",
  weekend_pass: "Weekend Pass",
  day_pass: "Day Pass",
  kids_pass: "Kids Pass",
  dinner_party: "Dinner + Party",
  party: "Party Only",
  party_only: "Party Only",
};

const participationLabels: Record<string, string> = {
  volunteer: "Volunteer",
  band_musician: "Band or Musician",
  artisan_vendor: "Artisan or Vendor",
  partner: "Partner",
  donate: "Donate",
};

function getFirstName(fullName: string): string {
  if (!fullName) return "there";
  return fullName.trim().split(" ")[0] || "there";
}

function formatAmount(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function getEventDateRange(ticketType: string) {
  const is2Day = ticketType === 'ga_2day' || ticketType === 'early_bird_ga_2day';
  return {
    dateRange: is2Day ? 'May 15–16, 2026' : 'May 14–16, 2027',
    dayDescription: is2Day ? 'Friday & Saturday' : 'Friday through Sunday'
  };
}

// Email type definitions
export type EmailType = 'ticket_confirmation' | 'payment_reminder' | 'volunteer_confirmation' | 'waitlist_confirmation' | 'custom_offer';

interface BaseEmailProps {
  name: string;
  email: string;
  trigger?: React.ReactNode;
}

interface TicketConfirmationProps extends BaseEmailProps {
  type: 'ticket_confirmation';
  ticketType: string;
  quantity: number;
  totalAmount: number;
  donationAmount?: number;
  confirmationCode?: string;
}

interface PaymentReminderProps extends BaseEmailProps {
  type: 'payment_reminder';
  ticketType: string;
  totalAmount: number;
}

interface VolunteerConfirmationProps extends BaseEmailProps {
  type: 'volunteer_confirmation';
  participationType: string;
}

interface WaitlistConfirmationProps extends BaseEmailProps {
  type: 'waitlist_confirmation';
  ticketType: string;
}

interface CustomOfferProps extends BaseEmailProps {
  type: 'custom_offer';
  items: Array<{ name: string; quantity: number; unitPrice: number }>;
  subtotal: number;
  discountAmount: number;
  totalAmount: number;
  expiresAt: string;
  customMessage?: string;
}

export type EmailPreviewProps = 
  | TicketConfirmationProps 
  | PaymentReminderProps 
  | VolunteerConfirmationProps
  | WaitlistConfirmationProps
  | CustomOfferProps;

// Email metadata display
function EmailMetadata({ from, to, subject }: { from: string; to: string; subject: string }) {
  return (
    <div className="bg-[hsl(var(--admin-hover))] rounded-lg p-4 mb-4 text-sm space-y-1">
      <div className="flex gap-2">
        <span className="font-medium text-[hsl(var(--admin-text-muted))] w-16">From:</span>
        <span className="text-[hsl(var(--admin-text))]">{from}</span>
      </div>
      <div className="flex gap-2">
        <span className="font-medium text-[hsl(var(--admin-text-muted))] w-16">To:</span>
        <span className="text-[hsl(var(--admin-text))]">{to}</span>
      </div>
      <div className="flex gap-2">
        <span className="font-medium text-[hsl(var(--admin-text-muted))] w-16">Subject:</span>
        <span className="text-[hsl(var(--admin-text))]">{subject}</span>
      </div>
    </div>
  );
}

// Ticket Confirmation Email Preview
function TicketConfirmationPreview({ 
  name, 
  ticketType, 
  quantity, 
  totalAmount, 
  donationAmount,
  confirmationCode 
}: Omit<TicketConfirmationProps, 'email' | 'trigger' | 'type'>) {
  const firstName = getFirstName(name);
  const ticketLabel = ticketTypeLabels[ticketType] || ticketType;
  const code = confirmationCode || "XXXXXXXX";
  const { dateRange, dayDescription } = getEventDateRange(ticketType);

  return (
    <div style={{ backgroundColor: previewColors.bg }}>
      <div style={{ maxWidth: 560, margin: "0 auto", background: "#FFFFFF" }}>
        {/* Header */}
        <div style={{ 
          background: previewColors.bg, 
          padding: "40px 30px", 
          textAlign: "center",
          borderBottom: `1px solid ${previewColors.border}`
        }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: previewColors.text }}>Cosmico</div>
          <div style={{ fontSize: 13, color: previewColors.muted, marginTop: 12 }}>{dateRange}</div>
        </div>

        {/* Content */}
        <div style={{ padding: "40px 30px" }}>
          {/* Success Icon */}
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ 
              width: 56, height: 56, borderRadius: "50%", 
              background: "rgba(16, 185, 129, 0.15)", 
              display: "inline-flex", alignItems: "center", justifyContent: "center" 
            }}>
              <div style={{ 
                width: 40, height: 40, borderRadius: "50%", 
                background: "#10B981", 
                display: "flex", alignItems: "center", justifyContent: "center" 
              }}>
                <Check className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>

          <h1 style={{ fontSize: 28, fontWeight: 600, color: previewColors.text, margin: "0 0 8px", textAlign: "center" }}>
            You're In
          </h1>
          <p style={{ fontSize: 16, color: previewColors.muted, margin: "0 0 32px", textAlign: "center" }}>
            Hi {firstName}, your order for {ticketLabel} has been confirmed.
          </p>

          {/* Confirmation Code */}
          <div style={{ 
            background: previewColors.bg, 
            border: `1px solid ${previewColors.border}`,
            borderRadius: 8, padding: 20, marginBottom: 24, textAlign: "center"
          }}>
            <div style={{ fontSize: 12, color: previewColors.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
              Confirmation Code
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: previewColors.text, fontFamily: "monospace", letterSpacing: 2 }}>
              {code}
            </div>
          </div>

          {/* Order Details */}
          <div style={{ 
            background: previewColors.bg, 
            border: `1px solid ${previewColors.border}`,
            borderRadius: 8, padding: 20, marginBottom: 24
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: previewColors.text, marginBottom: 16 }}>Order Details</div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${previewColors.border}`, fontSize: 14 }}>
              <span style={{ color: previewColors.muted }}>Name</span>
              <span style={{ color: previewColors.text }}>{name}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${previewColors.border}`, fontSize: 14 }}>
              <span style={{ color: previewColors.muted }}>Ticket</span>
              <span style={{ color: previewColors.text }}>{ticketLabel}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${previewColors.border}`, fontSize: 14 }}>
              <span style={{ color: previewColors.muted }}>Quantity</span>
              <span style={{ color: previewColors.text }}>{quantity}</span>
            </div>
            {donationAmount && donationAmount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${previewColors.border}`, fontSize: 14 }}>
                <span style={{ color: previewColors.muted }}>Donation</span>
                <span style={{ color: previewColors.text }}>{formatAmount(donationAmount)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0 0", fontSize: 14, fontWeight: 600 }}>
              <span style={{ color: previewColors.muted }}>Total Paid</span>
              <span style={{ color: previewColors.text }}>{formatAmount(totalAmount)}</span>
            </div>
          </div>

          {/* Event Details */}
          <div style={{ 
            background: "#FFFFFF", 
            border: `1px solid ${previewColors.border}`,
            borderRadius: 8, padding: 20, marginBottom: 24
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: previewColors.text, marginBottom: 16 }}>See You at the Reunion</div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
              <div style={{ 
                width: 32, height: 32, borderRadius: 6, 
                background: "rgba(58, 138, 143, 0.15)", 
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 
              }}>
                <Calendar className="w-4 h-4" style={{ color: previewColors.accent }} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: previewColors.text }}>{dateRange}</div>
                <div style={{ fontSize: 13, color: previewColors.muted }}>{dayDescription}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ 
                width: 32, height: 32, borderRadius: 6, 
                background: "rgba(58, 138, 143, 0.15)", 
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 
              }}>
                <MapPin className="w-4 h-4" style={{ color: previewColors.accent }} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: previewColors.text }}>Example Meadow</div>
                <div style={{ fontSize: 13, color: previewColors.muted }}>Near Example Valley, California</div>
              </div>
            </div>
          </div>

          {/* Note */}
          <div style={{ 
            background: "rgba(58, 138, 143, 0.08)", 
            border: "1px solid rgba(58, 138, 143, 0.2)",
            borderRadius: 8, padding: "16px 20px", marginBottom: 24
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: previewColors.accent, marginBottom: 4 }}>About Your Tickets</div>
            <p style={{ fontSize: 13, color: previewColors.muted, margin: 0 }}>
              This is your order confirmation. Your actual event tickets with QR codes will be emailed to you <strong>7 days before the event</strong>.
            </p>
          </div>

          {/* CTA */}
          <div style={{ textAlign: "center", margin: "24px 0" }}>
            <div style={{ 
              display: "inline-block", 
              background: previewColors.accent, 
              color: "#FFFFFF", 
              padding: "14px 32px", 
              borderRadius: 6, 
              fontWeight: 600, 
              fontSize: 14 
            }}>
              View My Order
            </div>
            <p style={{ fontSize: 12, color: previewColors.muted, marginTop: 12 }}>Access order details and manage your tickets</p>
          </div>
        </div>

        {/* Footer */}
        <div style={{ 
          textAlign: "center", padding: 30, 
          color: previewColors.muted, fontSize: 13,
          borderTop: `1px solid ${previewColors.border}`,
          background: previewColors.bg
        }}>
          <p><strong>✌️&❤️,</strong></p>
          <p><strong>Demo Organizers</strong></p>
          <p style={{ marginTop: 16, fontSize: 11 }}>Questions? Email us at hello@example.org</p>
        </div>
      </div>
    </div>
  );
}

// Payment Reminder Email Preview
function PaymentReminderPreview({ name, ticketType, totalAmount }: Omit<PaymentReminderProps, 'email' | 'trigger' | 'type'>) {
  const firstName = getFirstName(name);
  const ticketLabel = ticketTypeLabels[ticketType] || ticketType;
  const c = paymentReminderColors;

  return (
    <div style={{ 
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      lineHeight: 1.6, color: c.text, maxWidth: 600, margin: "0 auto", padding: 20, background: c.background
    }}>
      <div style={{ background: c.surface, border: `2px solid ${c.border}`, padding: 40, textAlign: "center" }}>
        <h1 style={{ color: c.primary, fontSize: 36, fontStyle: "italic", marginBottom: 20 }}>Cosmico</h1>
        <p style={{ color: c.textMuted, marginBottom: 20 }}>⏰ Complete Your Registration</p>
        
        <p style={{ fontSize: 18, color: c.text }}>
          Hi {firstName}, you started a ticket purchase but didn't complete it.
        </p>

        <div style={{ 
          textAlign: "left", margin: "30px 0", padding: 20, 
          background: c.surfaceAlt, borderLeft: `3px solid ${c.primaryGold}`
        }}>
          <p><strong>Your Order:</strong></p>
          <p>{ticketLabel} - {formatAmount(totalAmount)}</p>
        </div>

        <div style={{ 
          display: "inline-block", 
          background: c.primaryGold, 
          color: c.background, 
          padding: "15px 30px", 
          borderRadius: 5, 
          fontWeight: "bold",
          margin: "30px 0"
        }}>
          Complete Your Purchase
        </div>

        <p style={{ fontSize: 16, lineHeight: 1.8 }}>
          Don't miss out! Complete your purchase soon.
        </p>

        <div style={{ 
          textAlign: "center", marginTop: 30, paddingTop: 20, 
          borderTop: `1px solid ${c.border}`, color: c.textMuted, fontSize: 14
        }}>
          <p style={{ margin: "10px 0" }}>✌️&❤️,<br />Demo Organizers</p>
          <p style={{ fontSize: 12 }}>© {new Date().getFullYear()} Cosmico. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}

// Volunteer Confirmation Email Preview
function VolunteerConfirmationPreview({ name, participationType }: Omit<VolunteerConfirmationProps, 'email' | 'trigger' | 'type'>) {
  const firstName = getFirstName(name);
  const participationLabel = participationLabels[participationType] || participationType;
  const c = volunteerColors;

  return (
    <div style={{ background: c.background }}>
      <div style={{ maxWidth: 600, margin: "0 auto", background: c.surface }}>
        {/* Header */}
        <div style={{ 
          background: `linear-gradient(135deg, ${c.primary} 0%, ${c.primaryGold} 100%)`,
          color: c.background, padding: "40px 20px", textAlign: "center"
        }}>
          <h1 style={{ margin: 0, fontSize: 28, fontFamily: "Georgia, serif" }}>Cosmico</h1>
          <p style={{ margin: "10px 0 0", fontSize: 16, opacity: 0.9 }}>Thanks for Your Interest!</p>
        </div>

        {/* Content */}
        <div style={{ padding: "40px 30px" }}>
          <p style={{ fontSize: 16, color: c.text, marginBottom: 20 }}>Hi {firstName},</p>
          
          <p style={{ color: c.text, lineHeight: 1.6 }}>
            Thank you for expressing your interest in getting involved with Cosmico! We're thrilled that you want to be part of our community.
          </p>
          
          {/* Highlight box */}
          <div style={{ 
            background: "#FFF9F0", border: `2px solid ${c.primaryGold}`,
            borderRadius: 8, padding: 20, margin: "20px 0"
          }}>
            <p style={{ margin: 0, fontSize: 14, color: c.textMuted }}>You signed up as:</p>
            <p style={{ margin: "8px 0 0", fontSize: 18, fontWeight: 600, color: c.primary }}>
              {participationLabel}
            </p>
          </div>
          
          <p style={{ color: c.text, lineHeight: 1.6 }}>
            We've received your submission and our team will review it. We'll be in touch when opportunities open up that match your interests.
          </p>
          
          {/* Next steps */}
          <div style={{ background: c.surfaceAlt, borderLeft: `4px solid ${c.primaryGold}`, padding: 20, margin: "20px 0" }}>
            <h3 style={{ margin: "0 0 15px", color: c.primary, fontSize: 16 }}>What happens next?</h3>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li style={{ marginBottom: 10, color: c.textMuted }}>
                We'll review your submission and reach out when we have opportunities that match your interests
              </li>
              <li style={{ marginBottom: 10, color: c.textMuted }}>
                Volunteer applications typically open in Spring 2026
              </li>
              <li style={{ marginBottom: 10, color: c.textMuted }}>
                Build weekends are usually the 2-3 weekends before the festival
              </li>
              <li style={{ marginBottom: 0, color: c.textMuted }}>
                Follow us on social media to stay connected with the community
              </li>
            </ul>
          </div>
          
          <p style={{ marginTop: 30, color: c.text, lineHeight: 1.6 }}>
            In the meantime, feel free to explore our website to learn more about what makes Cosmico special. We can't wait to create something magical together!
          </p>
          
          <p style={{ marginTop: 30, color: c.text }}>
            With gratitude,<br /><strong>The Cosmico Crew</strong>
          </p>
        </div>

        {/* Footer */}
        <div style={{ 
          textAlign: "center", padding: "30px 20px", color: c.textMuted, fontSize: 14,
          borderTop: `1px solid ${c.border}`, background: c.surfaceAlt
        }}>
          <p style={{ margin: "10px 0" }}>
            <a href="https://example.org" style={{ color: c.primary, textDecoration: "none" }}>example.org</a>
          </p>
          <p style={{ margin: "16px 0 0", fontSize: 12 }}>© {new Date().getFullYear()} Cosmico. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}

// Waitlist Confirmation Email Preview
function WaitlistConfirmationPreview({ name, ticketType }: Omit<WaitlistConfirmationProps, 'email' | 'trigger' | 'type'>) {
  const firstName = getFirstName(name);
  const ticketLabel = ticketTypeLabels[ticketType] || ticketType;
  const c = volunteerColors;

  return (
    <div style={{ background: c.background }}>
      <div style={{ maxWidth: 600, margin: "0 auto", background: c.surface }}>
        {/* Header */}
        <div style={{ 
          background: `linear-gradient(135deg, ${c.primary} 0%, ${c.primaryGold} 100%)`,
          color: c.background, padding: "40px 20px", textAlign: "center"
        }}>
          <h1 style={{ margin: 0, fontSize: 28, fontFamily: "Georgia, serif" }}>Cosmico</h1>
          <p style={{ margin: "10px 0 0", fontSize: 16, opacity: 0.9 }}>You're on the Waitlist!</p>
        </div>

        {/* Content */}
        <div style={{ padding: "40px 30px" }}>
          <p style={{ fontSize: 16, color: c.text, marginBottom: 20 }}>Hi {firstName},</p>
          
          <p style={{ color: c.text, lineHeight: 1.6 }}>
            Thank you for joining the waitlist! We've added you to the list for the ticket type you're interested in.
          </p>
          
          {/* Highlight box */}
          <div style={{ 
            background: "#FFF9F0", border: `2px solid ${c.primaryGold}`,
            borderRadius: 8, padding: 20, margin: "20px 0"
          }}>
            <p style={{ margin: 0, fontSize: 14, color: c.textMuted }}>You're waiting for:</p>
            <p style={{ margin: "8px 0 0", fontSize: 18, fontWeight: 600, color: c.primary }}>
              {ticketLabel}
            </p>
          </div>
          
          <p style={{ color: c.text, lineHeight: 1.6 }}>
            If tickets become available, we'll notify you immediately so you can grab your spot.
          </p>
          
          {/* What happens next */}
          <div style={{ background: c.surfaceAlt, borderLeft: `4px solid ${c.primaryGold}`, padding: 20, margin: "20px 0" }}>
            <h3 style={{ margin: "0 0 15px", color: c.primary, fontSize: 16 }}>What happens next?</h3>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li style={{ marginBottom: 10, color: c.textMuted }}>
                We'll email you as soon as this ticket type becomes available
              </li>
              <li style={{ marginBottom: 10, color: c.textMuted }}>
                You'll have priority access to purchase tickets
              </li>
              <li style={{ marginBottom: 0, color: c.textMuted }}>
                Make sure to check your inbox (and spam folder) regularly
              </li>
            </ul>
          </div>
          
          <p style={{ marginTop: 30, color: c.text, lineHeight: 1.6 }}>
            Thank you for your patience and interest in Cosmico. We hope to see you there!
          </p>
          
          <p style={{ marginTop: 30, color: c.text }}>
            With gratitude,<br /><strong>The Cosmico Crew</strong>
          </p>
        </div>

        {/* Footer */}
        <div style={{ 
          textAlign: "center", padding: "30px 20px", color: c.textMuted, fontSize: 14,
          borderTop: `1px solid ${c.border}`, background: c.surfaceAlt
        }}>
          <p style={{ margin: "10px 0" }}>
            <a href="https://example.org" style={{ color: c.primary, textDecoration: "none" }}>example.org</a>
          </p>
          <p style={{ margin: "16px 0 0", fontSize: 12 }}>© {new Date().getFullYear()} Cosmico. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}

// Custom Offer Email Preview
function CustomOfferPreview({ 
  name, 
  items, 
  subtotal, 
  discountAmount, 
  totalAmount, 
  expiresAt, 
  customMessage 
}: Omit<CustomOfferProps, 'email' | 'trigger' | 'type'>) {
  const firstName = getFirstName(name);
  const c = previewColors;
  const expirationDate = format(new Date(expiresAt), 'MMMM d, yyyy');

  return (
    <div style={{ backgroundColor: c.bg }}>
      <div style={{ maxWidth: 560, margin: "0 auto", background: "#FFFFFF" }}>
        {/* Header */}
        <div style={{ 
          background: c.bg, 
          padding: "40px 30px", 
          textAlign: "center",
          borderBottom: `1px solid ${c.border}`
        }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: c.text }}>Cosmico</div>
          <div style={{ fontSize: 16, color: c.accent, marginTop: 12, fontWeight: 500 }}>✨ Special Offer Just for You</div>
        </div>

        {/* Content */}
        <div style={{ padding: "40px 30px" }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: c.text, margin: "0 0 16px", textAlign: "center" }}>
            You've Received a Custom Offer
          </h1>
          <p style={{ fontSize: 16, color: c.muted, margin: "0 0 24px", textAlign: "center" }}>
            Hi {firstName}, we've put together something special for you.
          </p>

          {/* Custom message */}
          {customMessage && (
            <div style={{ 
              background: "rgba(58, 138, 143, 0.08)", 
              border: "1px solid rgba(58, 138, 143, 0.2)",
              borderRadius: 8, padding: "16px 20px", marginBottom: 24,
              fontStyle: "italic", color: c.text
            }}>
              "{customMessage}"
            </div>
          )}

          {/* Package Details */}
          <div style={{ 
            background: c.bg, 
            border: `1px solid ${c.border}`,
            borderRadius: 8, padding: 20, marginBottom: 24
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: c.text, marginBottom: 16 }}>Your Package Includes:</div>
            
            {items.map((item, idx) => (
              <div key={idx} style={{ 
                display: "flex", justifyContent: "space-between", 
                padding: "10px 0", 
                borderBottom: idx < items.length - 1 ? `1px solid ${c.border}` : "none",
                fontSize: 14
              }}>
                <span style={{ color: c.text }}>
                  {item.name} × {item.quantity}
                </span>
                <span style={{ color: c.muted }}>{formatAmount(item.unitPrice * item.quantity)}</span>
              </div>
            ))}
            
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: `2px solid ${c.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 14 }}>
                <span style={{ color: c.muted }}>Subtotal</span>
                <span style={{ color: c.text }}>{formatAmount(subtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 14 }}>
                  <span style={{ color: "#10B981", fontWeight: 500 }}>Discount</span>
                  <span style={{ color: "#10B981", fontWeight: 500 }}>-{formatAmount(discountAmount)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", fontSize: 18, fontWeight: 600 }}>
                <span style={{ color: c.text }}>Total</span>
                <span style={{ color: c.accent }}>{formatAmount(totalAmount)}</span>
              </div>
            </div>
          </div>

          {/* Expiration Warning - using amber, not orange */}
          <div style={{ 
            background: "#FEF9C3", 
            border: "1px solid #CA8A04",
            borderRadius: 8, padding: "12px 16px", marginBottom: 24,
            display: "flex", alignItems: "center", gap: 10
          }}>
            <Clock className="w-5 h-5" style={{ color: "#CA8A04" }} />
            <span style={{ fontSize: 14, color: "#854D0E" }}>
              This offer expires on <strong>{expirationDate}</strong>
            </span>
          </div>

          {/* CTA */}
          <div style={{ textAlign: "center", margin: "24px 0" }}>
            <div style={{ 
              display: "inline-block", 
              background: c.accent, 
              color: "#FFFFFF", 
              padding: "14px 40px", 
              borderRadius: 6, 
              fontWeight: 600, 
              fontSize: 16 
            }}>
              Accept This Offer
            </div>
            <p style={{ fontSize: 12, color: c.muted, marginTop: 12 }}>Click to proceed to checkout</p>
          </div>
        </div>

        {/* Footer */}
        <div style={{ 
          textAlign: "center", padding: 30, 
          color: c.muted, fontSize: 13,
          borderTop: `1px solid ${c.border}`,
          background: c.bg
        }}>
          <p><strong>✌️&❤️,</strong></p>
          <p><strong>Demo Organizers</strong></p>
          <p style={{ marginTop: 16, fontSize: 11 }}>Questions? Email us at hello@example.org</p>
        </div>
      </div>
    </div>
  );
}

// Main Email Preview Modal Component
export function EmailPreviewModal(props: EmailPreviewProps) {
  const { name, email, trigger, type } = props;
  
  const emailTypeLabels: Record<EmailType, { title: string; subject: string; from: string }> = {
    ticket_confirmation: {
      title: "Ticket Confirmation Email",
      subject: "Order Confirmed — Cosmico 2026",
      from: "Analog <hello@example.org>"
    },
    payment_reminder: {
      title: "Payment Reminder Email",
      subject: "Complete Your Purchase - Cosmico",
      from: "Analog <hello@example.org>"
    },
    volunteer_confirmation: {
      title: "Volunteer Interest Confirmation",
      subject: "Thanks for Your Interest in Cosmico!",
      from: "Analog <noreply@example.org>"
    },
    waitlist_confirmation: {
      title: "Waitlist Confirmation Email",
      subject: "You're on the Waitlist — Cosmico 2026",
      from: "Analog <hello@example.org>"
    },
    custom_offer: {
      title: "Custom Offer Email",
      subject: "A Special Offer Just for You — Cosmico 2026",
      from: "Analog <hello@example.org>"
    }
  };

  const typeConfig = emailTypeLabels[type];

  const renderPreview = () => {
    switch (type) {
      case 'ticket_confirmation':
        return (
          <TicketConfirmationPreview
            name={props.name}
            ticketType={props.ticketType}
            quantity={props.quantity}
            totalAmount={props.totalAmount}
            donationAmount={props.donationAmount}
            confirmationCode={props.confirmationCode}
          />
        );
      case 'payment_reminder':
        return (
          <PaymentReminderPreview
            name={props.name}
            ticketType={props.ticketType}
            totalAmount={props.totalAmount}
          />
        );
      case 'volunteer_confirmation':
        return (
          <VolunteerConfirmationPreview
            name={props.name}
            participationType={props.participationType}
          />
        );
      case 'waitlist_confirmation':
        return (
          <WaitlistConfirmationPreview
            name={props.name}
            ticketType={props.ticketType}
          />
        );
      case 'custom_offer':
        return (
          <CustomOfferPreview
            name={props.name}
            items={props.items}
            subtotal={props.subtotal}
            discountAmount={props.discountAmount}
            totalAmount={props.totalAmount}
            expiresAt={props.expiresAt}
            customMessage={props.customMessage}
          />
        );
    }
  };

  return (
    <AdminDialog>
      <AdminDialogTrigger asChild>
        {trigger || (
          <AdminButton variant="adminOutline" size="sm">
            <Mail className="w-4 h-4 mr-2" />
            Preview Email
          </AdminButton>
        )}
      </AdminDialogTrigger>
      <AdminDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        <AdminDialogHeader className="p-6 pb-0">
          <AdminDialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            {typeConfig.title}
          </AdminDialogTitle>
          <p className="text-sm text-[hsl(var(--admin-text-muted))]">
            This is what <strong>{name}</strong> received at <strong>{email}</strong>.
          </p>
        </AdminDialogHeader>
        
        <div className="p-4">
          <EmailMetadata 
            from={typeConfig.from}
            to={email}
            subject={typeConfig.subject}
          />

          {/* Email preview container */}
          <div className="border border-[hsl(var(--admin-border))] rounded-lg overflow-hidden shadow-sm">
            {renderPreview()}
          </div>

          {/* Info note */}
          <div className="mt-4 flex items-start gap-2 text-sm text-[hsl(var(--admin-text-muted))] bg-[hsl(var(--admin-hover))] rounded-lg p-3">
            <ExternalLink className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>
              This email was sent automatically. The actual email may vary slightly based on email client rendering.
            </p>
          </div>
        </div>
      </AdminDialogContent>
    </AdminDialog>
  );
}

// Legacy export for backward compatibility with VolunteerInterests page
export { EmailPreviewModal as VolunteerEmailPreviewModal };
