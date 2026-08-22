import { useState, useEffect } from "react";
import { useParams, useSearchParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Package, Calendar, MapPin, Clock, XCircle, Minus, Plus, AlertTriangle } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import analogLogo from "@/assets/analog-wordmark-black.webp";
import { COLORS, typography } from "@/styles/may-theme";
import { redirectToExternal } from "@/lib/safeRedirect";

interface OfferItem {
  id: string;
  item_type: "ticket" | "lodging" | "addon";
  ticket_type: string | null;
  accommodation_unit_id?: string | null;
  quantity: number;
  unit_price: number;
  name: string;
  description: string | null;
  required_ticket_types: string[] | null;
}

interface Offer {
  id: string;
  offer_type: string;
  recipient_email: string;
  recipient_name: string | null;
  custom_message: string | null;
  discount_type: string;
  discount_value: number;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  expires_at: string;
  event: {
    title: string;
    event_date: string;
    event_time: string;
    venue_name: string;
  };
}

export default function CustomOffer() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [items, setItems] = useState<OfferItem[]>([]);
  const [maxQuantities, setMaxQuantities] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [accepting, setAccepting] = useState(false);

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

  // Redirect to success page if session_id is present
  const sessionId = searchParams.get("session_id");
  useEffect(() => {
    if (sessionId && token) {
      navigate(`/offer/${token}/success?session_id=${sessionId}`, { replace: true });
    }
  }, [sessionId, token, navigate]);

  useEffect(() => {
    if (token && !sessionId) {
      fetchOffer();
    }
  }, [token, sessionId]);

  const fetchOffer = async () => {
    try {
      const { data, error: fetchError } = await supabase.functions.invoke("get-custom-offer", {
        body: { token },
      });

      if (fetchError) throw fetchError;
      if (data?.error) throw new Error(data.error);

      setOffer(data.offer);
      const fetchedItems: OfferItem[] = data.items || [];
      setItems(fetchedItems);
      setMaxQuantities(
        Object.fromEntries(fetchedItems.map((i) => [i.id, i.quantity]))
      );
      setRecipientName(data.offer.recipient_name || "");
      setRecipientEmail(data.offer.recipient_email || "");
    } catch (err: any) {
      setError(err.message || "Failed to load offer");
    } finally {
      setLoading(false);
    }
  };

  const updateItemQuantity = (itemId: string, delta: number) => {
    setItems((prev) =>
      prev
        .map((item) => {
          if (item.id === itemId) {
            const max = maxQuantities[itemId] ?? item.quantity;
            const newQty = Math.min(max, Math.max(0, item.quantity + delta));
            return { ...item, quantity: newQty };
          }
          return item;
        })
        .filter((item) => item.quantity > 0)
    );
  };

  const calculateTotals = () => {
    const subtotal = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
    let discountAmount = 0;
    if (offer) {
      if (offer.discount_type === "percentage" && offer.discount_value > 0) {
        discountAmount = Math.round(subtotal * (offer.discount_value / 100));
      } else if (offer.discount_type === "fixed" && offer.discount_value > 0) {
        discountAmount = Math.min(offer.discount_value, subtotal);
      }
    }
    const total = Math.max(0, subtotal - discountAmount);
    return { subtotal, discountAmount, total };
  };

  const validateItems = (): string | null => {
    return null;
  };

  const handleAccept = async () => {
    if (!recipientName.trim()) {
      toast.error("Please enter your name");
      return;
    }

    if (!isValidEmail(recipientEmail)) {
      toast.error("Please enter a valid email address");
      return;
    }

    const validationError = validateItems();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    if (items.length === 0) {
      toast.error("Your package is empty. Please add at least one item.");
      return;
    }

    setAccepting(true);
    try {
      const modifications = items.map((item) => ({
        item_id: item.id,
        new_quantity: item.quantity,
      }));

      const { data, error: acceptError } = await supabase.functions.invoke("accept-custom-offer", {
        body: {
          token,
          recipient_name: recipientName.trim(),
          recipient_email: recipientEmail.trim().toLowerCase(),
          modifications,
        },
      });

      if (acceptError) throw acceptError;
      if (data?.error) throw new Error(data.error);

      if (data?.url) {
        redirectToExternal(data.url);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to accept offer");
      setAccepting(false);
    }
  };

  // Show loading while redirecting to success
  if (sessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.dustySky }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: COLORS.boulder }} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.dustySky }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: COLORS.boulder }} />
      </div>
    );
  }

  if (error || !offer) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: COLORS.dustySky }}>
        <div
          className="max-w-md w-full rounded-xl p-8 border text-center"
          style={{ backgroundColor: COLORS.white, borderColor: `${COLORS.charcoal}15` }}
        >
          <div
            className="h-16 w-16 mx-auto mb-6 rounded-full flex items-center justify-center"
            style={{ backgroundColor: '#FEE2E2' }}
          >
            <XCircle className="h-8 w-8" style={{ color: '#DC2626' }} />
          </div>
          <h1 style={{ ...typography.headline, color: COLORS.charcoal, fontSize: '24px', marginBottom: '8px' }}>
            Offer Not Available
          </h1>
          <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '15px' }}>
            {error || "This offer may have expired or already been used."}
          </p>
        </div>
      </div>
    );
  }

  const { subtotal, discountAmount, total } = calculateTotals();
  const validationError = validateItems();
  const expiresIn = formatDistanceToNow(new Date(offer.expires_at), { addSuffix: true });

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.dustySky }}>
      {/* Header */}
      <header
        className="fixed top-0 left-0 right-0 z-50 backdrop-blur-sm border-b"
        style={{
          backgroundColor: `${COLORS.dustySky}f0`,
          borderColor: `${COLORS.charcoal}15`,
        }}
      >
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/">
            <img src={analogLogo} alt="Analog" className="h-8 md:h-10" />
          </Link>
          <span style={{ ...typography.caption, color: COLORS.boulder, fontSize: '11px' }}>
            CUSTOM OFFER
          </span>
        </div>
      </header>

      <main className="pt-24 pb-20 px-6">
        <div className="max-w-2xl mx-auto">
          {/* Title */}
          <div className="text-center mb-8">
            <p style={{ ...typography.caption, color: COLORS.clay, marginBottom: '12px' }}>
              YOUR EXCLUSIVE PACKAGE
            </p>
            <h1
              style={{
                ...typography.headline,
                color: COLORS.charcoal,
                fontSize: 'clamp(28px, 5vw, 40px)',
                marginBottom: '8px',
              }}
            >
              Your Custom Package
            </h1>
            {offer.recipient_name && (
              <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '16px' }}>
                Hi {offer.recipient_name}!
              </p>
            )}
          </div>

          {/* Custom message */}
          {offer.custom_message && (
            <div
              className="rounded-xl p-5 border mb-6 text-center"
              style={{
                backgroundColor: `${COLORS.denim}08`,
                borderColor: `${COLORS.denim}20`,
              }}
            >
              <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', fontStyle: 'italic' }}>
                "{offer.custom_message}"
              </p>
            </div>
          )}

          {/* Expiration warning */}
          <div
            className="flex items-center justify-center gap-2 mb-6 py-2.5 px-4 rounded-lg"
            style={{ backgroundColor: `${COLORS.mustard}15`, color: COLORS.mustard }}
          >
            <Clock className="h-4 w-4" />
            <span style={{ ...typography.body, fontSize: '13px', fontWeight: 600 }}>
              This offer expires {expiresIn}
            </span>
          </div>

          {/* Event info */}
          <div
            className="rounded-xl p-5 border mb-6"
            style={{ backgroundColor: COLORS.white, borderColor: `${COLORS.charcoal}15` }}
          >
            <h2 style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '18px', marginBottom: '12px' }}>
              {offer.event.title}
            </h2>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" style={{ color: COLORS.boulder }} />
                <span style={{ ...typography.body, color: COLORS.boulder, fontSize: '14px' }}>
                  {format(new Date(offer.event.event_date + "T00:00:00"), "EEEE, MMMM d, yyyy")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" style={{ color: COLORS.boulder }} />
                <span style={{ ...typography.body, color: COLORS.boulder, fontSize: '14px' }}>
                  {offer.event.venue_name}
                </span>
              </div>
            </div>
          </div>

          {/* Package items */}
          <div
            className="rounded-xl border mb-6 overflow-hidden"
            style={{ backgroundColor: COLORS.white, borderColor: `${COLORS.charcoal}15` }}
          >
            <div className="p-5 border-b" style={{ borderColor: `${COLORS.charcoal}10` }}>
              <h2 className="flex items-center gap-2" style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '18px' }}>
                <Package className="h-5 w-5" style={{ color: COLORS.clay }} />
                Package Contents
              </h2>
              <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px', marginTop: '4px' }}>
                You can adjust quantities or remove items before checkout
              </p>
            </div>

            <div className="p-5 space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-4 rounded-lg"
                  style={{ backgroundColor: `${COLORS.dustySky}80` }}
                >
                  <div className="flex-1">
                    <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', fontWeight: 600 }}>
                      {item.name}
                    </p>
                    <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
                      ${(item.unit_price / 100).toFixed(0)} each
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', fontWeight: 600, width: '80px', textAlign: 'right' as const }}>
                      ${((item.unit_price * item.quantity) / 100).toFixed(0)}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        className="h-8 w-8 rounded-md border flex items-center justify-center transition-colors hover:bg-gray-50"
                        style={{ borderColor: `${COLORS.charcoal}20` }}
                        onClick={() => updateItemQuantity(item.id, -1)}
                      >
                        <Minus className="h-4 w-4" style={{ color: COLORS.charcoal }} />
                      </button>
                      <span
                        className="w-8 text-center"
                        style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', fontWeight: 600 }}
                      >
                        {item.quantity}
                      </span>
                      <button
                        className="h-8 w-8 rounded-md border flex items-center justify-center transition-colors hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ borderColor: `${COLORS.charcoal}20` }}
                        onClick={() => updateItemQuantity(item.id, 1)}
                        disabled={
                          !!item.accommodation_unit_id ||
                          item.quantity >= (maxQuantities[item.id] ?? item.quantity)
                        }
                      >
                        <Plus className="h-4 w-4" style={{ color: COLORS.charcoal }} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {items.length === 0 && (
                <div className="text-center py-8">
                  <Package className="h-12 w-12 mx-auto mb-2 opacity-30" style={{ color: COLORS.boulder }} />
                  <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '14px' }}>Your package is empty</p>
                </div>
              )}

              {/* Validation error */}
              {validationError && (
                <div
                  className="flex items-start gap-2 p-3 rounded-lg text-sm"
                  style={{ backgroundColor: '#FEF2F2', color: '#B91C1C' }}
                >
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span style={{ ...typography.body, fontSize: '13px' }}>{validationError}</span>
                </div>
              )}

              {/* Totals */}
              <div className="pt-4 space-y-2" style={{ borderTop: `1px solid ${COLORS.charcoal}10` }}>
                <div className="flex justify-between">
                  <span style={{ ...typography.body, color: COLORS.boulder, fontSize: '14px' }}>Subtotal</span>
                  <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px' }}>
                    ${(subtotal / 100).toFixed(2)}
                  </span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between">
                    <span style={{ ...typography.body, color: COLORS.forest, fontSize: '14px' }}>
                      Discount
                      {offer.discount_type === "percentage" && ` (${offer.discount_value}%)`}
                    </span>
                    <span style={{ ...typography.body, color: COLORS.forest, fontSize: '14px' }}>
                      -${(discountAmount / 100).toFixed(2)}
                    </span>
                  </div>
                )}
                <div
                  className="flex justify-between pt-3"
                  style={{ borderTop: `1px solid ${COLORS.charcoal}10` }}
                >
                  <span style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '18px' }}>Total</span>
                  <span style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '18px' }}>
                    ${(total / 100).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Name input */}
          <div
            className="rounded-xl p-5 border mb-6"
            style={{ backgroundColor: COLORS.white, borderColor: `${COLORS.charcoal}15` }}
          >
            <h2 style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '18px', marginBottom: '12px' }}>
              Your Details
            </h2>
            <div className="space-y-2">
              <label
                style={{ ...typography.caption, color: COLORS.boulder, fontSize: '11px' }}
              >
                YOUR NAME *
              </label>
              <Input
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Enter your full name"
                className="h-12 rounded-lg"
                style={{
                  backgroundColor: COLORS.dustySky,
                  borderColor: `${COLORS.charcoal}15`,
                  color: COLORS.charcoal,
                  ...typography.body,
                  fontSize: '15px',
                }}
              />
            </div>
            <div className="space-y-2 mt-4">
              <label
                style={{ ...typography.caption, color: COLORS.boulder, fontSize: '11px' }}
              >
                YOUR EMAIL *
              </label>
              <Input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-12 rounded-lg"
                style={{
                  backgroundColor: COLORS.dustySky,
                  borderColor: `${COLORS.charcoal}15`,
                  color: COLORS.charcoal,
                  ...typography.body,
                  fontSize: '15px',
                }}
              />
              {recipientEmail && !isValidEmail(recipientEmail) && (
                <p style={{ ...typography.caption, color: '#b91c1c', fontSize: '12px' }}>
                  Please enter a valid email address.
                </p>
              )}
            </div>
          </div>

          {/* Accept button */}
          <Button
            className="w-full h-14 rounded-xl text-lg transition-all"
            style={{
              backgroundColor: COLORS.clay,
              color: COLORS.white,
              ...typography.button,
              fontSize: '17px',
            }}
            onClick={handleAccept}
            disabled={accepting || items.length === 0 || !!validationError || !recipientName.trim() || !isValidEmail(recipientEmail)}
          >
            {accepting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Processing...
              </>
            ) : (
              `Accept & Pay $${(total / 100).toFixed(2)}`
            )}
          </Button>

          <p
            className="text-center mt-4"
            style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px' }}
          >
            You'll be redirected to Stripe to complete your payment securely.
          </p>
        </div>
      </main>
    </div>
  );
}
