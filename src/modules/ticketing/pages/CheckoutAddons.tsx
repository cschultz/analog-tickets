import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { COLORS, typography } from "@/styles/may-theme";
import { CheckoutProgress } from "@/components/checkout/CheckoutProgress";
import { ArrowLeft, Loader2, Plus, Minus, UtensilsCrossed, Wine, Check, Smile } from "lucide-react";
import analogLogo from "@/assets/analog-wordmark-black.webp";
import dinnerImg from "@/assets/may/dinner-long-table.jpg";
import kidsCampImg from "@/assets/may/kids-sprinkler.webp";
import wineCampImg from "@/assets/may/winecamp-gathering.webp";
import { useIsMobile } from "@/hooks/use-mobile";
import { Funnel } from "@/lib/analytics";
import { CHECKOUT_TICKET_STORAGE_KEY, type CheckoutTicketSelection, parseCheckoutTicketSelection } from "@/lib/checkoutTicket";
import { resolveBookingRouteFromSessionStorage } from "@/lib/bookingRouteGuard";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  type AddonItem,
  type SelectedAddon,
  DINNER_ADDON_TYPE,
  TICKET_INCLUDES,
  dietaryRestrictionsSchema,
  getMaxForAddon,
  getVisibleAddonsForTicket,
  isAddonIncludedForTicket,
  isAddonsEligibleTicketType,
  normalizeSelectedAddonsForCheckout,
} from "@/lib/addons";

const ADDON_STORAGE_KEY = "cosmico_checkout_addons";

export default function CheckoutAddons() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [ticketData, setTicketData] = useState<CheckoutTicketSelection | null>(null);
  const [addons, setAddons] = useState<AddonItem[]>([]);
  const [selectedAddons, setSelectedAddons] = useState<SelectedAddon[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const logAddonsEvent = useCallback((metadata?: Record<string, string | number | boolean>) => {
    if (!ticketData?.selectedOption) return;
    Funnel.addonsView({
      ticket_type: ticketData.selectedTicket,
      ticket_name: ticketData.ticketName,
      ticket_price: ticketData.ticketPrice,
      quantity: ticketData.quantity,
      ...metadata,
    });
  }, [ticketData]);

  useEffect(() => {
    const selection = parseCheckoutTicketSelection(sessionStorage.getItem(CHECKOUT_TICKET_STORAGE_KEY));
    if (!selection) {
      navigate(resolveBookingRouteFromSessionStorage("addons"), { replace: true });
      return;
    }
    setTicketData(selection);
  }, [navigate]);

  useEffect(() => {
    if (!ticketData) return;

    logAddonsEvent();

    const fetchAddons = async () => {
      const { data, error } = await supabase
        .from("addon_inventory")
        .select("*")
        .eq("is_active", true)
        .eq("is_publicly_available", true);

      if (!error && data) {
        const visible = getVisibleAddonsForTicket(data as AddonItem[], ticketData.ticketType);
        setAddons(visible as AddonItem[]);
      }
      setIsLoading(false);
    };

    fetchAddons();
  }, [ticketData, logAddonsEvent]);

  // Restore previously selected addons
  useEffect(() => {
    const saved = sessionStorage.getItem(ADDON_STORAGE_KEY);
    if (saved) {
      try {
        setSelectedAddons(JSON.parse(saved));
      } catch { /* ignore */ }
    }
  }, []);

  const maxQuantity = ticketData?.quantity || 1;

  const toggleAddon = (addon: AddonItem) => {
    const existing = selectedAddons.find((a) => a.inventoryId === addon.id);
    if (existing) {
      // Remove
      const nextAddons = selectedAddons.filter((a) => a.inventoryId !== addon.id);
      setSelectedAddons(nextAddons);
      logAddonsEvent({
        selected_addons: nextAddons.length,
        addon_action: "remove",
        addon_type: addon.addon_type,
      });
    } else {
      const max = getMaxForAddon(addon, {
        ticketType: ticketData?.ticketType || "",
        quantity: maxQuantity,
        childCount: ticketData?.childCount,
        youthCount: ticketData?.youthCount,
      });
      if (max <= 0) return; // No kids to add camp for
      const nextAddons = [
        ...selectedAddons,
        {
          inventoryId: addon.id,
          addonType: addon.addon_type,
          displayName: addon.display_name,
          unitPrice: addon.price,
          quantity: max,
          hasDietaryRestrictions: addon.addon_type === DINNER_ADDON_TYPE ? false : undefined,
          dietaryRestrictions: "",
        },
      ];
      setSelectedAddons(nextAddons);
      logAddonsEvent({
        selected_addons: nextAddons.length,
        addon_action: "add",
        addon_type: addon.addon_type,
        addon_quantity: max,
      });
    }
  };

  const updateQuantity = (inventoryId: string, delta: number) => {
    const nextAddons = selectedAddons.map((a) => {
        if (a.inventoryId !== inventoryId) return a;
        const available = addons.find((ad) => ad.id === inventoryId);
        const remaining = available ? available.total_quantity - available.sold_quantity : 999;
        const addonMax = available ? getMaxForAddon(available, {
          ticketType: ticketData?.ticketType || "",
          quantity: maxQuantity,
          childCount: ticketData?.childCount,
          youthCount: ticketData?.youthCount,
        }) : maxQuantity;
        const newQty = Math.max(1, Math.min(a.quantity + delta, addonMax, remaining));
        return { ...a, quantity: newQty };
      });
    setSelectedAddons(nextAddons);
    const changedAddon = nextAddons.find((a) => a.inventoryId === inventoryId);
    if (changedAddon) {
      logAddonsEvent({
        selected_addons: nextAddons.length,
        addon_action: delta > 0 ? "increase_qty" : "decrease_qty",
        addon_type: changedAddon.addonType,
        addon_quantity: changedAddon.quantity,
      });
    }
  };

  const updateAddonDetails = (inventoryId: string, updates: Partial<SelectedAddon>) => {
    setSelectedAddons((current) => current.map((addon) => {
      if (addon.inventoryId !== inventoryId) return addon;

      const nextAddon = { ...addon, ...updates };
      if (!nextAddon.hasDietaryRestrictions) {
        nextAddon.dietaryRestrictions = "";
      }

      return nextAddon;
    }));
  };

  const handleContinue = () => {
    let dietaryValidationFailed = false;

    const normalizedAddons = selectedAddons.map((addon) => {
      try {
        return normalizeSelectedAddonsForCheckout([addon])[0];
      } catch (error: any) {
        toast.error(error?.issues?.[0]?.message || error?.message || "Please share your dietary restrictions");
        dietaryValidationFailed = true;
        return addon;
      }
    });

    if (dietaryValidationFailed) return;

    if (selectedAddons.length > 0) {
      sessionStorage.setItem(ADDON_STORAGE_KEY, JSON.stringify(normalizedAddons));
    } else {
      sessionStorage.removeItem(ADDON_STORAGE_KEY);
    }
    Funnel.reviewView({
      ticket_type: ticketData?.selectedTicket || "unknown",
      selected_addons: selectedAddons.length,
      addon_total_dollars: addonTotal,
    });
    navigate("/checkout/review");
  };

  const handleSkip = () => {
    sessionStorage.removeItem(ADDON_STORAGE_KEY);
    Funnel.reviewView({
      ticket_type: ticketData?.selectedTicket || "unknown",
      selected_addons: 0,
      addon_total_dollars: 0,
      skipped_addons: true,
    });
    navigate("/checkout/review");
  };

  const addonTotal = selectedAddons.reduce((sum, a) => sum + (a.unitPrice / 100) * a.quantity, 0);
  const isEligible = ticketData ? isAddonsEligibleTicketType(ticketData.ticketType) : false;
  const mobileCtaLabel = selectedAddons.length > 0 ? "Review Order" : "Continue Without Add-ons";

  // If no eligible addons or ticket doesn't qualify, skip directly
  useEffect(() => {
    if (!isLoading && ticketData && (!isEligible || addons.length === 0)) {
      sessionStorage.removeItem(ADDON_STORAGE_KEY);
      navigate("/checkout/review", { replace: true });
    }
  }, [isLoading, ticketData, isEligible, addons.length, navigate]);

  if (!ticketData || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.dustySky }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: COLORS.boulder }} />
      </div>
    );
  }

  if (!isEligible || addons.length === 0) {
    return null;
  }

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
          <span style={{ ...typography.caption, color: COLORS.boulder, fontSize: "11px" }}>
            MAY 14–16, 2027
          </span>
        </div>
      </header>

      <main className={`pt-24 px-6 ${isMobile ? "pb-36" : "pb-20"}`}>
        <div className="max-w-lg mx-auto">
          {/* Back */}
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 mb-6 hover:opacity-70 transition-opacity"
            style={{
              ...typography.body,
              color: COLORS.boulder,
              fontSize: "13px",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <CheckoutProgress currentStep={3} />

          {/* Card */}
          <div
            className="rounded-xl border p-6 md:p-8 space-y-6"
            style={{
              backgroundColor: COLORS.white,
              borderColor: `${COLORS.charcoal}10`,
            }}
          >
            <div className="text-center space-y-1">
              <h1 style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: "22px" }}>
                Add to Your Weekend
              </h1>
              <p style={{ ...typography.body, color: COLORS.boulder, fontSize: "14px" }}>
                Limited experiences — available with your ticket
              </p>
            </div>

            {/* What's included with this ticket */}
            {ticketData && TICKET_INCLUDES[ticketData.ticketType]?.length > 0 && (
              <div
                className="rounded-lg p-4"
                style={{
                  backgroundColor: `${COLORS.forest}08`,
                  border: `1px solid ${COLORS.forest}20`,
                }}
              >
                <p
                  style={{
                    ...typography.caption,
                    color: COLORS.forest,
                    fontSize: "11px",
                    letterSpacing: "0.08em",
                    marginBottom: "10px",
                  }}
                >
                  INCLUDED WITH YOUR {ticketData.ticketName?.toUpperCase() || "TICKET"}
                </p>
                <ul className="space-y-1.5">
                  {TICKET_INCLUDES[ticketData.ticketType].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2"
                      style={{ ...typography.body, color: COLORS.charcoal, fontSize: "13px", lineHeight: 1.5 }}
                    >
                      <Check className="w-3.5 h-3.5 flex-shrink-0 mt-1" style={{ color: COLORS.forest }} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Addon cards */}
            <div className="space-y-4">
              {addons.map((addon) => {
                const selected = selectedAddons.find((a) => a.inventoryId === addon.id);
                const remaining = addon.total_quantity - addon.sold_quantity;
                const soldOut = remaining <= 0;
                const isIncluded = isAddonIncludedForTicket(addon.addon_type, ticketData?.ticketType);
                const isDinnerAddon = addon.addon_type === DINNER_ADDON_TYPE;

                return (
                  <div
                    key={addon.id}
                    className="rounded-lg border p-5 transition-all duration-200"
                    style={{
                      borderColor: isIncluded ? `${COLORS.forest}30` : selected ? COLORS.clay : `${COLORS.charcoal}12`,
                      backgroundColor: isIncluded ? `${COLORS.forest}06` : selected ? `${COLORS.clay}06` : `${COLORS.charcoal}03`,
                      opacity: soldOut && !isIncluded ? 0.5 : 1,
                    }}
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className="w-16 h-16 md:w-20 md:h-20 rounded-lg overflow-hidden flex-shrink-0 relative"
                        style={{ backgroundColor: `${COLORS.charcoal}08` }}
                      >
                        <img
                          src={
                            addon.addon_type === 'friday_dinner' ? dinnerImg :
                            addon.addon_type === 'kids_camp' ? kidsCampImg :
                            wineCampImg
                          }
                          alt={addon.display_name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        {isIncluded && (
                          <div
                            className="absolute inset-0 flex items-center justify-center"
                            style={{ backgroundColor: `${COLORS.forest}66` }}
                          >
                            <Check className="w-6 h-6" style={{ color: COLORS.white }} />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3
                              style={{
                                ...typography.subhead,
                                color: COLORS.charcoal,
                                fontSize: "15px",
                                marginBottom: "4px",
                              }}
                            >
                              {addon.display_name}
                            </h3>
                            {addon.description && (
                              <p
                                style={{
                                  ...typography.body,
                                  color: COLORS.boulder,
                                  fontSize: "13px",
                                  lineHeight: 1.5,
                                }}
                              >
                                {addon.description}
                              </p>
                            )}
                          </div>
                          {isIncluded ? (
                            <span
                              style={{
                                ...typography.caption,
                                color: COLORS.forest,
                                fontSize: "11px",
                                letterSpacing: "0.05em",
                                whiteSpace: "nowrap",
                                padding: "4px 10px",
                                borderRadius: "20px",
                                backgroundColor: `${COLORS.forest}10`,
                              }}
                            >
                              INCLUDED
                            </span>
                          ) : (
                            <span
                              style={{
                                ...typography.subhead,
                                color: COLORS.charcoal,
                                fontSize: "15px",
                                whiteSpace: "nowrap",
                              }}
                            >
                              ${(addon.price / 100).toFixed(0)}/person
                            </span>
                          )}
                        </div>

                        {isIncluded && (
                          <p
                            style={{
                              ...typography.body,
                              color: COLORS.forest,
                              fontSize: "13px",
                              marginTop: "8px",
                              fontStyle: "italic",
                              opacity: 0.85,
                            }}
                          >
                            Wine Camp is included with your {ticketData?.ticketName || "ticket"} — no add-on needed.
                          </p>
                        )}

                        {/* Scarcity signal */}
                        {!isIncluded && remaining <= 25 && remaining > 0 && (
                          <p
                            style={{
                              ...typography.caption,
                              color: COLORS.clay,
                              fontSize: "11px",
                              letterSpacing: "0.05em",
                              marginTop: "8px",
                            }}
                          >
                            {remaining} seats remaining
                          </p>
                        )}

                        {/* Action — only show for purchasable addons */}
                        {!isIncluded && (
                          <div className="mt-4 flex flex-col gap-4">
                            <div className="flex items-center gap-3">
                              {soldOut ? (
                                <span
                                  style={{
                                    ...typography.caption,
                                    color: COLORS.boulder,
                                    fontSize: "12px",
                                  }}
                                >
                                  Sold Out
                                </span>
                              ) : selected ? (
                                <>
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => updateQuantity(addon.id, -1)}
                                      className="w-7 h-7 rounded-full flex items-center justify-center transition-opacity hover:opacity-70"
                                      style={{
                                        border: `1px solid ${COLORS.charcoal}20`,
                                        background: "none",
                                        cursor: "pointer",
                                      }}
                                    >
                                      <Minus className="w-3 h-3" style={{ color: COLORS.charcoal }} />
                                    </button>
                                    <span
                                      style={{
                                        ...typography.body,
                                        color: COLORS.charcoal,
                                        fontSize: "14px",
                                        fontWeight: 600,
                                        minWidth: "20px",
                                        textAlign: "center",
                                      }}
                                    >
                                      {selected.quantity}
                                    </span>
                                    <button
                                      onClick={() => updateQuantity(addon.id, 1)}
                                      className="w-7 h-7 rounded-full flex items-center justify-center transition-opacity hover:opacity-70"
                                      style={{
                                        border: `1px solid ${COLORS.charcoal}20`,
                                        background: "none",
                                        cursor: "pointer",
                                      }}
                                      disabled={selected.quantity >= getMaxForAddon(addon, {
                                        ticketType: ticketData?.ticketType || "",
                                        quantity: maxQuantity,
                                        childCount: ticketData?.childCount,
                                        youthCount: ticketData?.youthCount,
                                      })}
                                    >
                                      <Plus className="w-3 h-3" style={{ color: COLORS.charcoal }} />
                                    </button>
                                  </div>
                                  <span
                                    style={{
                                      ...typography.body,
                                      color: COLORS.boulder,
                                      fontSize: "12px",
                                    }}
                                  >
                                    ${((addon.price / 100) * selected.quantity).toFixed(0)} total
                                  </span>
                                  <button
                                    onClick={() => toggleAddon(addon)}
                                    className="ml-auto text-xs hover:opacity-70 transition-opacity"
                                    style={{
                                      ...typography.caption,
                                      color: COLORS.clay,
                                      background: "none",
                                      border: "none",
                                      cursor: "pointer",
                                      fontSize: "11px",
                                    }}
                                  >
                                    Remove
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => toggleAddon(addon)}
                                  className="px-4 py-2 rounded-md transition-all hover:opacity-90"
                                  style={{
                                    ...typography.button,
                                    backgroundColor: COLORS.clay,
                                    color: COLORS.white,
                                    fontSize: "13px",
                                    border: "none",
                                    cursor: "pointer",
                                  }}
                                >
                                  <Plus className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                                  Add to order
                                </button>
                              )}
                            </div>

                            {selected && isDinnerAddon && (
                              <div
                                className="rounded-lg border p-4 space-y-4"
                                style={{
                                  backgroundColor: `${COLORS.charcoal}03`,
                                  borderColor: `${COLORS.charcoal}10`,
                                }}
                              >
                                <div className="space-y-2">
                                  <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: "13px", fontWeight: 600 }}>
                                    Dietary restrictions?
                                  </p>
                                  <RadioGroup
                                    value={selected.hasDietaryRestrictions ? "yes" : "no"}
                                    onValueChange={(value) => updateAddonDetails(addon.id, {
                                      hasDietaryRestrictions: value === "yes",
                                      dietaryRestrictions: value === "yes" ? selected.dietaryRestrictions ?? "" : "",
                                    })}
                                    className="flex flex-col gap-2 sm:flex-row sm:gap-4"
                                  >
                                    <div className="flex items-center gap-2">
                                      <RadioGroupItem value="no" id={`${addon.id}-dietary-no`} />
                                      <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: "13px" }}>No</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <RadioGroupItem value="yes" id={`${addon.id}-dietary-yes`} />
                                      <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: "13px" }}>Yes</span>
                                    </div>
                                  </RadioGroup>
                                </div>

                                {selected.hasDietaryRestrictions && (
                                  <div className="space-y-2">
                                    <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: "13px", fontWeight: 600 }}>
                                      Tell us about any dietary restrictions
                                    </p>
                                    <Textarea
                                      value={selected.dietaryRestrictions ?? ""}
                                      onChange={(e) => updateAddonDetails(addon.id, {
                                        dietaryRestrictions: e.target.value.slice(0, 1000),
                                      })}
                                      placeholder="Vegetarian, gluten-free, allergies, or anything else we should know"
                                      className="min-h-[110px] resize-y"
                                      style={{ borderColor: `${COLORS.charcoal}18` }}
                                      maxLength={1000}
                                      aria-label="Dietary restrictions"
                                    />
                                    <p style={{ ...typography.caption, color: COLORS.boulder, fontSize: "11px" }}>
                                      {1000 - (selected.dietaryRestrictions?.length ?? 0)} characters remaining
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary + Actions */}
            <div className="space-y-4 pt-2">
              {selectedAddons.length > 0 && (
                <div
                  className="flex justify-between items-center px-4 py-3 rounded-lg"
                  style={{ backgroundColor: `${COLORS.charcoal}04` }}
                >
                  <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: "14px" }}>
                    Add-on total
                  </span>
                  <span
                    style={{
                      ...typography.subhead,
                      color: COLORS.charcoal,
                      fontSize: "16px",
                    }}
                  >
                    +${addonTotal.toFixed(0)}
                  </span>
                </div>
              )}

              <button
                onClick={handleContinue}
                className="hidden md:block w-full py-4 transition-all hover:opacity-90"
                style={{
                  ...typography.button,
                  backgroundColor: COLORS.clay,
                  color: COLORS.white,
                  fontSize: "15px",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {selectedAddons.length > 0 ? "Continue to Review" : "Continue Without Add-ons"}
              </button>

              {selectedAddons.length > 0 && (
                <button
                  onClick={handleSkip}
                  className="hidden md:block w-full py-2 text-center transition-opacity hover:opacity-70"
                  style={{
                    ...typography.body,
                    color: COLORS.boulder,
                    fontSize: "13px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Skip add-ons
                </button>
              )}
            </div>
          </div>
        </div>
      </main>

      {isMobile && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 border-t"
          style={{
            backgroundColor: `${COLORS.white}f5`,
            borderColor: `${COLORS.charcoal}12`,
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            padding: '12px 16px',
            paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
          }}
        >
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px', letterSpacing: '0.08em' }}>
                  ADD-ONS
                </p>
                <p style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '18px' }}>
                  {selectedAddons.length > 0 ? `+$${addonTotal.toFixed(0)}` : '$0'}
                </p>
              </div>
              <p className="text-right" style={{ ...typography.body, color: COLORS.boulder, fontSize: '11px', lineHeight: 1.3 }}>
                {selectedAddons.length > 0
                  ? `${selectedAddons.length} selected`
                  : 'Everything else stays the same'}
              </p>
            </div>

            <button
              onClick={handleContinue}
              className="w-full py-3.5 transition-all hover:opacity-90"
              style={{
                ...typography.button,
                backgroundColor: COLORS.clay,
                color: COLORS.white,
                fontSize: '14px',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {mobileCtaLabel}
            </button>

            {selectedAddons.length > 0 && (
              <button
                onClick={handleSkip}
                className="w-full text-center transition-opacity hover:opacity-70"
                style={{
                  ...typography.body,
                  color: COLORS.boulder,
                  fontSize: '12px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Skip add-ons
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
