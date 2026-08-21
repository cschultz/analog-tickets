// AUTO-EXTRACTED from src/pages/MyTickets.tsx
import { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { formatTicketType } from "@/lib/utils";
import { getTicketDateRange } from "@/config/ticketTypes";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Mail, Ticket, ArrowRight, UserPlus, ShoppingCart, X, Plus, Minus, Heart, Calendar, Sparkles, QrCode, Home, MapPin, Clock, Car, Backpack, CheckCircle2, Pencil, Check, LogOut, ExternalLink, Send, Users, History, ChevronDown, ChevronUp, Shield, Phone, Smartphone, Download } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import QRCode from "react-qr-code";
import dinnerImg from "@/assets/may/dinner-long-table.jpg";
import kidsCampImg from "@/assets/may/kids-sprinkler.webp";
import wineCampImg from "@/assets/may/winecamp-gathering.webp";
import { COLORS, typography } from "@/styles/may-theme";
import { useCheckoutErrorReporting } from "@/hooks/useCheckoutErrorReporting";
import { useIsMobile } from "@/hooks/use-mobile";
import { createEligibilitySignature, resolveAccordionState } from "@/pages/myTicketsAccordionState";
import { isQualifyingLodgingTicketType } from "@/lib/bookingRouteGuard";
import { LodgingSelector } from "@/components/may/LodgingSelector";
import { useLodgingVisualAssets, getAssetsByProductType } from "@/hooks/useLodgingVisualAssets";
import WineCampCardState, { getWineCampCardState } from "@/components/may/WineCampCardState";
import {
  type AddonItem,
  type SelectedAddon,
  DINNER_ADDON_TYPE,
  getAddonAvailability,
  getDisplayAddonsForTicket,
  getTicketIncludes,
  getMaxForAddon,
  normalizeSelectedAddonsForCheckout,
  validateSelectedAddonDietary,
} from "@/lib/addons";
import { getEligibleMyTicketsUpgradeDestinations } from "@/lib/ticketUpgrades";
import { CHECKOUT_TICKET_STORAGE_KEY, createCheckoutTicketSelection } from "@/lib/checkoutTicket";
import {
  type AccommodationUnit,
  type AccommodationZone,
  ACCOMMODATION_FAMILY_UNIT_SELECT,
  ACCOMMODATION_ZONE_SELECT,
  getLodgingEligibility,
  getLodgingSelectionState,
} from "@/lib/lodging";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trackCustomEvent } from "@/components/AnalyticsTracking";
import { getTicketConfig } from "@/config/ticketTypes";
import { MayButton, LODGING_IMAGES, type CartItem } from "@/components/my-tickets/shared";
import { getSupabaseUrl, getSupabaseAnonKey } from "@/platform/config/env";
import { redirectToExternal } from "@/lib/safeRedirect";

// ===== PURCHASED LODGING =====
export function PurchasedLodgingSection({ userEmail, verifiedEmail, sessionToken, registrations }: { userEmail: string; verifiedEmail: string; sessionToken?: string; registrations: any[] }) {
  const [lodgingBookings, setLodgingBookings] = useState<any[]>([]);
  const [legacyLodgingPurchases, setLegacyLodgingPurchases] = useState<any[]>([]);
  const [addonPurchases, setAddonPurchases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPurchase, setEditingPurchase] = useState<any | null>(null);
  const [selectedLodgingPurchase, setSelectedLodgingPurchase] = useState<any | null>(null);

  const normalizeLegacyText = (value?: string | null) =>
    (value || "")
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const resolveLegacyLodgingDetails = (
    purchase: any,
    lodgingInventoryById: Map<string, any>,
    zonesByKey: Map<string, any>,
    unitsById: Map<string, any>,
  ) => {
    const inventory = lodgingInventoryById.get(purchase.inventory_id);
    const searchText = normalizeLegacyText([
      inventory?.display_name,
      inventory?.description,
      inventory?.lodging_type,
    ].filter(Boolean).join(" "));

    const matchedZone = Array.from(zonesByKey.values()).find((zone: any) => {
      const zoneKey = normalizeLegacyText(zone.zone_key);
      const zoneName = normalizeLegacyText(zone.zone_name);
      return (zoneKey && searchText.includes(zoneKey)) || (zoneName && searchText.includes(zoneName));
    }) ?? null;

    const matchedUnit = Array.from(unitsById.values()).find((unit: any) => {
      const unitName = normalizeLegacyText(unit.unit_name);
      return unitName && searchText.includes(unitName);
    }) ?? null;

    return {
      ...purchase,
      inventory,
      zone: purchase.zone || matchedZone,
      unit: purchase.unit || matchedUnit,
      legacyDisplayName: inventory?.display_name || null,
      missingLegacyDetails: !matchedZone && !matchedUnit,
    };
  };

  useEffect(() => { fetchPurchases(); }, [userEmail]);

  const fetchPurchases = async () => {
    try {
      const registrationIds = registrations.map((registration) => registration.id).filter(Boolean);
      const normalizedEmail = userEmail.toLowerCase().trim();

      // Use raw fetch so we can pass x-lookup-email — the RLS policy on
      // lodging_bookings keys off this header for anonymous (verified) lookups.
      // The supabase-js client does not forward custom request headers per call.
      const supabaseUrl = getSupabaseUrl();
      const supabaseKey = getSupabaseAnonKey();
      const lodgingUrl = new URL(`${supabaseUrl}/rest/v1/lodging_bookings`);
      lodgingUrl.searchParams.set("select", "*");
      // Include paid (active stays) and pending/expired/failed (resume booking opportunities)
      lodgingUrl.searchParams.set("payment_status", "in.(paid,pending,expired,failed)");
      lodgingUrl.searchParams.set("order", "created_at.desc");
      if (registrationIds.length > 0) {
        lodgingUrl.searchParams.set(
          "or",
          `(email.ilike.${normalizedEmail},registration_id.in.(${registrationIds.join(",")}))`,
        );
      } else {
        lodgingUrl.searchParams.set("email", `ilike.${normalizedEmail}`);
      }
      const lodgingFetch = fetch(lodgingUrl.toString(), {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "x-mytickets-session": sessionToken || "",
        },
      }).then(async (res) => {
        if (!res.ok) return { data: null, error: new Error(`Failed to fetch lodging bookings: ${res.status}`) };
        const data = await res.json();
        return { data, error: null as Error | null };
      });

      // addon_purchases RLS keys off the x-mytickets-session header for
      // anon (verified) lookups, so we must use raw fetch like lodging.
      const addonsUrl = new URL(`${supabaseUrl}/rest/v1/addon_purchases`);
      addonsUrl.searchParams.set("select", "*,addon_inventory(*)");
      addonsUrl.searchParams.set("purchaser_email", `ilike.${normalizedEmail}`);
      addonsUrl.searchParams.set("payment_status", "eq.paid");
      addonsUrl.searchParams.set("order", "created_at.desc");
      const addonsFetch = fetch(addonsUrl.toString(), {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "x-mytickets-session": sessionToken || "",
        },
      }).then(async (res) => {
        if (!res.ok) return { data: null, error: new Error(`Failed to fetch addon purchases: ${res.status}`) };
        const data = await res.json();
        return { data, error: null as Error | null };
      });

      const [
        lodgingBookingsRes,
        purchasesRes,
        zonesRes,
        unitsRes,
        lodgingInventoryRes,
      ] = await Promise.all([
        lodgingFetch,
        addonsFetch,
        supabase.from("accommodation_zones").select("zone_key, zone_name, description"),
        supabase.from("accommodation_units").select("id, unit_name"),
        supabase.from("lodging_inventory").select("id, display_name, description, lodging_type"),
      ]);

      if (lodgingBookingsRes.error) throw lodgingBookingsRes.error;
      if (purchasesRes.error) throw purchasesRes.error;
      if (zonesRes.error) throw zonesRes.error;
      if (unitsRes.error) throw unitsRes.error;
      if (lodgingInventoryRes.error) throw lodgingInventoryRes.error;

      const zonesByKey = new Map((zonesRes.data || []).map((zone) => [zone.zone_key, zone]));
      const unitsById = new Map((unitsRes.data || []).map((unit) => [unit.id, unit]));
      const lodgingInventoryById = new Map((lodgingInventoryRes.data || []).map((inventory) => [inventory.id, inventory]));

      const enrichedBookings = (lodgingBookingsRes.data || []).map((booking) => ({
        ...booking,
        zone: booking.zone_key ? zonesByKey.get(booking.zone_key) : null,
        unit: booking.assigned_unit_id ? unitsById.get(booking.assigned_unit_id) : null,
      }));

      const purchases = purchasesRes.data || [];
      setLodgingBookings(enrichedBookings);
      setLegacyLodgingPurchases(
        purchases
          .filter((purchase) => purchase.purchase_type === "lodging")
          .map((purchase) => resolveLegacyLodgingDetails(purchase, lodgingInventoryById, zonesByKey, unitsById))
      );
      setAddonPurchases(purchases.filter((purchase) => purchase.purchase_type === "addon"));
    } catch (error) { console.error("Error fetching purchases:", error); }
    finally { setLoading(false); }
  };

  const formatPrice = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

  const lodgingEventDetails = registrations.find((registration) => {
    const eventDate = registration.event_details?.event_date;
    if (!eventDate) return false;
    const [year, month, day] = eventDate.split("T")[0].split("-").map(Number);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(year, (month || 1) - 1, day || 1) >= today;
  })?.event_details || registrations[0]?.event_details || null;

  if (loading || (lodgingBookings.length === 0 && legacyLodgingPurchases.length === 0 && addonPurchases.length === 0)) return null;

  const allLodgingPurchases = lodgingBookings.length > 0 ? lodgingBookings : legacyLodgingPurchases;
  // Only show confirmed lodging — hide pending/expired/failed checkout artifacts (too noisy)
  const lodgingPurchases = allLodgingPurchases.filter((purchase) => {
    const status = purchase.payment_status;
    return status !== "expired" && status !== "failed" && status !== "pending";
  });

  return (
    <div className="space-y-4">
      {lodgingPurchases.length > 0 && (
        <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: COLORS.white, borderColor: `${COLORS.charcoal}15` }}>
          <div className="px-6 py-4 flex items-center gap-3" style={{ borderBottom: `1px solid ${COLORS.charcoal}10` }}>
            <div className="h-10 w-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `${COLORS.denim}12` }}>
              <Home className="h-5 w-5" style={{ color: COLORS.denim }} />
            </div>
            <div>
              <h3 style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '16px' }}>Your Lodging</h3>
              <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px' }}>
                Accommodation for your stay · need a change? <a href="mailto:hello@example.org" className="underline" style={{ color: COLORS.denim }}>email us</a>
              </p>
            </div>
          </div>
          <div className="p-6 space-y-3">
            {lodgingPurchases.map((purchase) => {
              const isExpired = purchase.payment_status === "expired";
              const isFailed = purchase.payment_status === "failed";
              const expiresAt = purchase.checkout_expires_at ? new Date(purchase.checkout_expires_at).getTime() : null;
              const isInProgress = purchase.payment_status === "pending"
                && (!expiresAt || expiresAt > Date.now());
              const isStalePending = purchase.payment_status === "pending" && !isInProgress;
              const isPendingPayment = purchase.payment_status === "pending";
              const needsRebook = isExpired || isPendingPayment || isFailed;
              const statusLabel = isFailed
                ? "Payment failed"
                : isExpired
                ? "Checkout expired"
                : isInProgress
                ? "Checkout in progress"
                : isStalePending
                ? "Awaiting payment"
                : (purchase.assignment_status === "assigned" ? "Confirmed" : "Confirmed");
              const statusBody = isFailed
                ? (purchase.last_payment_error_message || "Your card was declined.") + " Try a different card to keep this stay."
                : isExpired
                ? "Your checkout window expired before payment finished. Pick up right where you left off."
                : isInProgress
                ? "Your Stripe checkout is still open. Finish payment to confirm this booking."
                : "We started a checkout but haven't received payment yet. Resume to confirm this booking.";
              const statusColor = isFailed
                ? ((COLORS as any).terracotta || COLORS.clay || "#c0392b")
                : isInProgress
                ? COLORS.denim
                : needsRebook
                ? COLORS.mustard
                : COLORS.forest;
              const handleResume = async () => {
                try {
                  const { data, error } = await supabase.functions.invoke("create-self-service-lodging", {
                    body: {
                      email: userEmail,
                      lodgingZoneKey: purchase.zone_key,
                      lodgingQuantity: purchase.quantity || 1,
                      registrationId: purchase.registration_id || registrations?.[0]?.id,
                    },
                  });
                  if (error) throw error;
                  if (data?.error) throw new Error(data.message || data.error);
                  if (data?.url) redirectToExternal(data.url);
                } catch (e: any) {
                  console.error("Resume booking error:", e);
                  toast.error(e.message || "Couldn't resume booking. Please try again.");
                }
              };
              const lodgingImage = purchase.zone_key ? LODGING_IMAGES[purchase.zone_key] : null;
              const productTitle = purchase.zone?.zone_name || purchase.legacyDisplayName || "Lodging";
              return (
              <div key={purchase.id} className="flex items-start justify-between gap-4 p-4 rounded-lg" style={{ backgroundColor: `${COLORS.charcoal}04`, border: `1px solid ${COLORS.charcoal}10` }}>
                <div className="flex-1 min-w-0">
                  {lodgingImage && !needsRebook && (
                    <img
                      src={lodgingImage}
                      alt={productTitle}
                      className="w-full h-40 object-cover rounded-md mb-3"
                      loading="lazy"
                    />
                  )}
                  <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', fontWeight: 600 }}>
                    {productTitle}
                  </p>
                  {purchase.zone?.description && !needsRebook && (
                    <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
                      {purchase.zone.description}
                    </p>
                  )}
                  {purchase.missingLegacyDetails && (
                    <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', marginTop: '4px' }}>
                      Exact details aren&apos;t available for this legacy lodging purchase, but your reservation is still confirmed.
                    </p>
                  )}
                  <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '11px', marginTop: '4px' }}>Quantity: {purchase.quantity}</p>
                  {!needsRebook && (
                    <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', marginTop: '8px', fontStyle: 'italic' }}>
                      When you check in with Example Meadow, you&apos;ll receive your specific site assignment.
                    </p>
                  )}

                  {needsRebook ? (
                    <div className="mt-3 flex flex-col gap-2">
                      <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px' }}>
                        {statusBody}
                      </p>
                      <button
                        type="button"
                        onClick={handleResume}
                        className="inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5 transition-opacity hover:opacity-80"
                        style={{ ...typography.caption, backgroundColor: COLORS.denim, color: COLORS.white, fontSize: '11px', letterSpacing: '0.06em' }}
                      >
                        {isFailed ? "Try a different card" : isInProgress ? "Continue checkout" : "Resume booking"}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSelectedLodgingPurchase(purchase)}
                      className="mt-3 inline-flex items-center gap-1.5 transition-opacity hover:opacity-70"
                      style={{ ...typography.caption, color: COLORS.denim, fontSize: '11px', letterSpacing: '0.06em' }}
                    >
                      View lodging details
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <span
                  className="px-2.5 py-0.5 rounded-full"
                  style={{
                    backgroundColor: `${statusColor}18`,
                    color: statusColor,
                    ...typography.caption,
                    fontSize: '10px'
                  }}
                >
                  {statusLabel}
                </span>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {addonPurchases.length > 0 && (
        <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: COLORS.white, borderColor: `${COLORS.charcoal}15` }}>
          <div className="px-6 py-4" style={{ borderBottom: `1px solid ${COLORS.charcoal}10` }}>
            <h3 style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '16px' }}>Your Add-Ons</h3>
            <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', marginTop: '2px' }}>
              Update dietary notes below · for guest reassignments, <a href="mailto:hello@example.org" className="underline" style={{ color: COLORS.denim }}>email us</a>
            </p>
          </div>
          <div className="p-6 space-y-2">
            {addonPurchases.map((purchase) => (
              <div key={purchase.id} className="rounded-lg p-3 sm:p-4" style={{ backgroundColor: `${COLORS.charcoal}04` }}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', fontWeight: 600 }}>{purchase.addon_inventory?.display_name || "Add-on"}</p>
                        <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px' }}>Qty: {purchase.quantity} × {formatPrice(purchase.unit_price)}</p>
                      </div>
                      <span className="self-start" style={{ ...typography.caption, color: COLORS.forest, fontSize: '10px' }}>Confirmed</span>
                    </div>
                    {purchase.has_dietary_restrictions && purchase.dietary_restrictions && (
                      <div
                        className="mt-3 px-3 py-3 sm:px-4"
                        style={{ backgroundColor: '#f8f0de', border: '1px solid #d8c59e' }}
                      >
                        <p style={{ ...typography.caption, color: '#6c5230', fontSize: '10px', letterSpacing: '0.08em' }}>
                          Dietary Restrictions
                        </p>
                        <p
                          style={{
                            ...typography.body,
                            color: COLORS.charcoal,
                            fontSize: '13px',
                            marginTop: '8px',
                            lineHeight: 1.65,
                            overflowWrap: 'anywhere',
                          }}
                        >
                          {purchase.dietary_restrictions}
                        </p>
                      </div>
                    )}
                    {purchase.addon_inventory?.addon_type === "friday_dinner" && (
                      <button
                        type="button"
                        onClick={() => setEditingPurchase(purchase)}
                        className="mt-3 inline-flex items-center gap-2 transition-opacity hover:opacity-70"
                        style={{ ...typography.button, color: COLORS.charcoal, fontSize: '11px' }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Update dietary restrictions
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedLodgingPurchase && (
        <LodgingDetailsDialog
          purchase={selectedLodgingPurchase}
          eventDetails={lodgingEventDetails}
          onClose={() => setSelectedLodgingPurchase(null)}
        />
      )}

      {editingPurchase && (
        <UpdateDietaryRestrictionsDialog
          purchase={editingPurchase}
          verifiedEmail={verifiedEmail}
          onClose={() => setEditingPurchase(null)}
          onSuccess={() => {
            setEditingPurchase(null);
            fetchPurchases();
          }}
        />
      )}
    </div>
  );
}

function LodgingDetailsDialog({
  purchase,
  eventDetails,
  onClose,
}: {
  purchase: any;
  eventDetails: any;
  onClose: () => void;
}) {
  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split("T")[0].split("-").map(Number);
    return new Date(year, (month || 1) - 1, day || 1).toLocaleDateString("en-US", { weekday: "short",
      month: "long",
      day: "numeric",
      year: "numeric", timeZone: "America/Los_Angeles" });
  };

  const formatGateTime = (timeStr?: string | null) => {
    if (!timeStr) return null;
    const [hours, minutes] = timeStr.split(":").map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });
  };

  const lodgingName = purchase.zone?.zone_name || purchase.legacyDisplayName || "Lodging";
  const lodgingImage = purchase.zone_key ? LODGING_IMAGES[purchase.zone_key] : null;
  const eventDate = formatDate(eventDetails?.event_date);
  const gateTime = formatGateTime(eventDetails?.event_time);
  const checkInInstructions = eventDetails?.check_in_instructions || "Check your email for full arrival instructions before the event. If you need help before arrival, contact hello@example.org.";

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg" style={{ backgroundColor: COLORS.white }}>
        <DialogHeader>
          <DialogTitle style={{ ...typography.subhead, color: COLORS.charcoal }}>
            Lodging details
          </DialogTitle>
          <DialogDescription style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
            Your reservation details for {lodgingName}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg p-4" style={{ backgroundColor: `${COLORS.charcoal}04`, border: `1px solid ${COLORS.charcoal}10` }}>
            {lodgingImage && (
              <img src={lodgingImage} alt={lodgingName} className="w-full h-44 object-cover rounded-md mb-3" loading="lazy" />
            )}
            <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', fontWeight: 600 }}>{lodgingName}</p>
            <div className="mt-3">
              <p style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px', letterSpacing: '0.08em' }}>QUANTITY</p>
              <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px', marginTop: '4px' }}>{purchase.quantity}</p>
            </div>
            <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px', marginTop: '12px', fontStyle: 'italic' }}>
              When you check in with Example Meadow, you&apos;ll receive your specific site assignment.
            </p>
          </div>

          <div className="rounded-lg p-4" style={{ backgroundColor: `${COLORS.denim}08`, border: `1px solid ${COLORS.denim}18` }}>
            <div className="flex items-start gap-3">
              <Calendar className="h-4 w-4 mt-0.5" style={{ color: COLORS.denim }} />
              <div className="space-y-2">
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', fontWeight: 600 }}>Check-in information</p>
                {(eventDate || gateTime) && (
                  <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
                    {[eventDate, gateTime ? `Gates open ${gateTime}` : null].filter(Boolean).join(" · ")}
                  </p>
                )}
                <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>{checkInInstructions}</p>
                {(eventDetails?.venue_name || eventDetails?.venue_address) && (
                  <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px' }}>
                    {[eventDetails?.venue_name, eventDetails?.venue_address].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            </div>
          </div>

          {purchase.missingLegacyDetails && (
            <div className="rounded-lg p-4" style={{ backgroundColor: `${COLORS.mustard}10`, border: `1px solid ${COLORS.mustard}22` }}>
              <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px' }}>
                Exact zone or unit details aren&apos;t available for this legacy lodging purchase, but your reservation is still confirmed.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <MayButton variant="outline" onClick={onClose}>Close</MayButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UpdateDietaryRestrictionsDialog({
  purchase,
  verifiedEmail,
  onClose,
  onSuccess,
}: {
  purchase: any;
  verifiedEmail: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [hasDietaryRestrictions, setHasDietaryRestrictions] = useState(purchase.has_dietary_restrictions ? "yes" : "no");
  const [dietaryRestrictions, setDietaryRestrictions] = useState(purchase.dietary_restrictions || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedHasDietaryRestrictions = hasDietaryRestrictions === "yes";
    const normalizedDietaryRestrictions = dietaryRestrictions.trim();

    if (normalizedHasDietaryRestrictions && !normalizedDietaryRestrictions) {
      toast.error("Please share your dietary restrictions");
      return;
    }

    if (normalizedDietaryRestrictions.length > 1000) {
      toast.error("Dietary restrictions must be 1000 characters or fewer");
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("update-addon-dietary-restrictions", {
        body: {
          purchaseId: purchase.id,
          verifiedEmail,
          hasDietaryRestrictions: normalizedHasDietaryRestrictions,
          dietaryRestrictions: normalizedHasDietaryRestrictions ? normalizedDietaryRestrictions : "",
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Dietary restrictions updated");
      onSuccess();
    } catch (error: any) {
      console.error("Dietary restrictions update error:", error);
      toast.error(error.message || "Failed to update dietary restrictions");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent style={{ backgroundColor: COLORS.white }}>
        <DialogHeader>
          <DialogTitle style={{ ...typography.subhead, color: COLORS.charcoal }}>
            Update dietary restrictions
          </DialogTitle>
          <DialogDescription style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
            Update the dietary note for your Japanese picnic dinner add-on.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="p-3 rounded-lg" style={{ backgroundColor: `${COLORS.charcoal}05` }}>
            <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', fontWeight: 600 }}>
              {purchase.addon_inventory?.display_name || "Japanese picnic dinner"}
            </p>
            <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', marginTop: '4px' }}>
              Qty: {purchase.quantity}
            </p>
          </div>

          <div className="space-y-3">
            <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px' }}>
              Dietary restrictions?
            </p>
            <RadioGroup value={hasDietaryRestrictions} onValueChange={setHasDietaryRestrictions} className="flex gap-6">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="no" id="dietary-no" />
                <label htmlFor="dietary-no" style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px' }}>No</label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="yes" id="dietary-yes" />
                <label htmlFor="dietary-yes" style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px' }}>Yes</label>
              </div>
            </RadioGroup>
          </div>

          {hasDietaryRestrictions === "yes" && (
            <div className="space-y-2">
              <label style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px' }}>
                Dietary restrictions note
              </label>
              <Textarea
                value={dietaryRestrictions}
                onChange={(e) => setDietaryRestrictions(e.target.value)}
                placeholder="Vegetarian, gluten-free, allergies, or anything else we should know"
                rows={4}
                style={{ borderColor: `${COLORS.charcoal}20` }}
              />
              <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '11px' }}>
                This note will be saved to your dinner add-on receipt.
              </p>
            </div>
          )}

          <DialogFooter>
            <MayButton variant="outline" onClick={onClose}>Cancel</MayButton>
            <MayButton type="submit" disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving...</> : "Save changes"}
            </MayButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
