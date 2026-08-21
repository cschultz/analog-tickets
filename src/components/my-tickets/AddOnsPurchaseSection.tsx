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
import { invokeCheckout, showCheckoutErrorToast } from "@/lib/checkoutInvoke";
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
  ticketTypeIncludesFriday,
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
import { redirectToExternal } from "@/lib/safeRedirect";

// ===== ADD-ONS PURCHASE =====
export function AddOnsPurchaseSection({ userTicketTypes, userEmail, registrations, onRefresh }: { userTicketTypes: string[]; userEmail: string; registrations: any[]; onRefresh?: () => Promise<void> | void }) {
  const { reportError } = useCheckoutErrorReporting();
  const isMobile = useIsMobile();
  const isFamilyTicketRegistration = (ticketType: string | null | undefined) => ticketType === "child_free" || (ticketType || "").startsWith("youth_");
  const getFamilyYouthOptionsForTicketType = (ticketType: string | null | undefined) => {
    if (!ticketType) return [] as Array<{ value: string; label: string; price: number }>;
    const normalized = ticketType.toLowerCase();

    if (normalized === "tier_1_ga_friday" || normalized === "ga_friday" || normalized === "friday_ga" || normalized === "early_bird_ga_friday") {
      return [] as Array<{ value: string; label: string; price: number }>;
    }

    if (normalized === "tier_1_ga_saturday" || normalized === "ga_saturday" || normalized === "saturday_ga" || normalized === "early_bird_ga_saturday") {
      return [{ value: "youth_saturday", label: "Youth — Saturday", price: 6000 }];
    }

    return [
      { value: "youth_2day", label: "Youth — 2 Day", price: 10000 },
      { value: "youth_saturday", label: "Youth — Saturday", price: 6000 },
    ];
  };
  const [lodgingOptions, setLodgingOptions] = useState<AccommodationZone[]>([]);
  const [familyUnits, setFamilyUnits] = useState<AccommodationUnit[]>([]);
  const [upgradeInventory, setUpgradeInventory] = useState<Array<{ ticket_type: string; total_quantity: number; sold_quantity: number; reserved_for_offers: number; is_active: boolean }>>([]);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [selectedFamilyUnit, setSelectedFamilyUnit] = useState<string | null>(null);
  const [lodgingQty, setLodgingQty] = useState(1);
  const [addons, setAddons] = useState<AddonItem[]>([]);
  const [selectedAddons, setSelectedAddons] = useState<SelectedAddon[]>([]);
  const [activeDietaryAddonId, setActiveDietaryAddonId] = useState<string | null>(null);
  const [dietaryStepError, setDietaryStepError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkingOutLodging, setCheckingOutLodging] = useState(false);
  const [familyChildCount, setFamilyChildCount] = useState(0);
  const [familyYouthCount, setFamilyYouthCount] = useState(0);
  const [familyYouthTicketType, setFamilyYouthTicketType] = useState<string | null>(null);
  const [checkingOutFamilyTickets, setCheckingOutFamilyTickets] = useState(false);
  const [familyTicketsExpanded, setFamilyTicketsExpanded] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showEligibilityAutoExpandNote, setShowEligibilityAutoExpandNote] = useState(false);
  const primaryRegistration = [...registrations]
    .sort((a, b) => {
      const aOptions = getFamilyYouthOptionsForTicketType(a?.ticket_type).length;
      const bOptions = getFamilyYouthOptionsForTicketType(b?.ticket_type).length;
      const aFamily = isFamilyTicketRegistration(a?.ticket_type) ? 1 : 0;
      const bFamily = isFamilyTicketRegistration(b?.ticket_type) ? 1 : 0;

      if (aFamily !== bFamily) return aFamily - bFamily;
      if (aOptions !== bOptions) return bOptions - aOptions;

      const aCreated = new Date(a?.created_at || 0).getTime();
      const bCreated = new Date(b?.created_at || 0).getTime();
      return bCreated - aCreated;
    })[0];
  const eventId = primaryRegistration?.event_id ?? "default";
  const accordionPreferenceKey = `myTickets:addOnsAccordion:${eventId}:${userEmail.toLowerCase()}`;
  const eligibilitySignature = createEligibilitySignature(lodgingOptions.map((item) => item.zone_key), addons.map((item) => item.id));
  const { data: visualAssets } = useLodgingVisualAssets();
  const assetsByType = getAssetsByProductType(visualAssets);
  const primaryTicketType = primaryRegistration?.ticket_type || null;
  const primaryTicketQuantity = primaryRegistration?.quantity || 1;
  // Sum quantities across ALL registrations for the same event so add-ons
  // can be ordered for every attendee in this account, not just the single
  // "primary" registration.
  const sameEventRegistrations = primaryRegistration?.event_id
    ? registrations.filter((r) => r?.event_id === primaryRegistration.event_id)
    : [];
  const totalEventTicketQuantity = sameEventRegistrations.length
    ? sameEventRegistrations.reduce((sum, r) => sum + (r?.quantity || 1), 0)
    : primaryTicketQuantity;
  // Friday dinner cap = number of tickets in this account that include
  // Friday access. Single-day Friday + party_only count, multi-day (2-day,
  // 3-day, patrons) count, Saturday-only does NOT.
  const fridayTicketCount = sameEventRegistrations.length
    ? sameEventRegistrations.reduce(
        (sum, r) => sum + (ticketTypeIncludesFriday(r?.ticket_type) ? (r?.quantity || 1) : 0),
        0,
      )
    : ticketTypeIncludesFriday(primaryTicketType)
      ? primaryTicketQuantity
      : 0;
  const addonEligibilityContext = {
    ticketType: primaryRegistration?.ticket_type || "",
    quantity: Math.max(totalEventTicketQuantity, primaryTicketQuantity),
    childCount: primaryRegistration?.metadata?.child_count || 0,
    youthCount: primaryRegistration?.metadata?.youth_count || 0,
    fridayTicketCount,
  };
  const { maxLodgingQty, hasQualifyingTickets, canBookLodging } = getLodgingEligibility(primaryTicketType, primaryTicketQuantity);
  const { selectedZoneData, selectedFamilyUnitData, hasFamilyUnit, hasZone, lodgingTotal } = getLodgingSelectionState({ zones: lodgingOptions, familyUnits, selectedZone, selectedFamilyUnit, lodgingQty });
  const lodgingUpgradeDestinations = getEligibleMyTicketsUpgradeDestinations(primaryTicketType);
  const purchasableUpgradeDestinations = lodgingUpgradeDestinations.filter((destination) => {
    const inventory = upgradeInventory.find((item) => item.ticket_type === destination);
    if (!inventory || !inventory.is_active) return false;
    return (inventory.total_quantity - inventory.sold_quantity - inventory.reserved_for_offers) > 0;
  });
  const canUpgradeToVipForLodging = purchasableUpgradeDestinations.includes("tier_1_vip_3day");
  const availableAddonCount = addons.filter((addon) => {
    const availability = getAddonAvailability(addon, addonEligibilityContext);
    return availability.isEligible || availability.isIncluded;
  }).length;
  const addonUpgradeSummary = purchasableUpgradeDestinations.map((destination) => formatTicketType(destination)).join(" or ");
  const isUpgradeableForMoreOptions = purchasableUpgradeDestinations.length > 0;
  const familyYouthOptions = getFamilyYouthOptionsForTicketType(primaryTicketType);
  const totalFamilySelections = familyChildCount + familyYouthCount;
  const selectedYouthOption = familyYouthOptions.find((option) => option.value === familyYouthTicketType) ?? null;

  useEffect(() => {
    if (familyYouthOptions.length === 0) {
      if (familyYouthCount !== 0) setFamilyYouthCount(0);
      if (familyYouthTicketType !== null) setFamilyYouthTicketType(null);
      return;
    }

    if (familyYouthTicketType && !familyYouthOptions.some((option) => option.value === familyYouthTicketType)) {
      setFamilyYouthTicketType(familyYouthOptions[0].value);
    }
  }, [familyYouthCount, familyYouthOptions, familyYouthTicketType]);

  useEffect(() => { fetchAvailableAddons(); }, [userTicketTypes]);

  useEffect(() => {
    if (loading || typeof window === "undefined") return;
    const savedPreference = window.localStorage.getItem(accordionPreferenceKey);
    const parsedPreference = savedPreference ? (() => {
      try { return JSON.parse(savedPreference) as { eligibilitySignature?: string; expanded?: boolean }; } catch { window.localStorage.removeItem(accordionPreferenceKey); return null; }
    })() : null;
    const nextAccordionState = resolveAccordionState({
      loading,
      cartCount: selectedAddons.length,
      lodgingIds: lodgingOptions.map((item) => item.zone_key),
      addonIds: addons.map((item) => item.id),
      savedPreference: parsedPreference,
    });
    if (!nextAccordionState) return;
    setShowEligibilityAutoExpandNote(nextAccordionState.showEligibilityAutoExpandNote);
    setIsExpanded(nextAccordionState.expanded);
    if (nextAccordionState.shouldPersist) {
      window.localStorage.setItem(accordionPreferenceKey, JSON.stringify({ eligibilitySignature: nextAccordionState.eligibilitySignature, expanded: nextAccordionState.expanded }));
    }
  }, [accordionPreferenceKey, addons, eligibilitySignature, loading, lodgingOptions, selectedAddons.length]);

  const persistAccordionPreference = (expanded: boolean) => {
    setIsExpanded(expanded);
    setShowEligibilityAutoExpandNote(false);
    if (typeof window === "undefined") return;
    window.localStorage.setItem(accordionPreferenceKey, JSON.stringify({ eligibilitySignature, expanded }));
  };

  const fetchAvailableAddons = async () => {
    try {
      if (!primaryRegistration?.event_id) { setLoading(false); return; }
      const [lodgingRes, addonRes, familyUnitsRes, ticketInventoryRes] = await Promise.all([
        supabase.from("accommodation_zones").select(ACCOMMODATION_ZONE_SELECT).eq("is_publicly_available", true).order("night_price", { ascending: true }),
        supabase.from("addon_inventory").select("*").eq("event_id", primaryRegistration.event_id).eq("is_active", true).eq("is_publicly_available", true),
        supabase.from("accommodation_units").select(ACCOMMODATION_FAMILY_UNIT_SELECT).eq("is_family_style", true).eq("inventory_status", "available").order("night_price", { ascending: true }),
        supabase.from("ticket_inventory").select("ticket_type, total_quantity, sold_quantity, reserved_for_offers, is_active").eq("event_id", primaryRegistration.event_id).eq("is_active", true),
      ]);
      const eligibleLodging = isQualifyingLodgingTicketType(userTicketTypes.join(" ")) ? (lodgingRes.data || []) as AccommodationZone[] : [];
      const displayAddons = getDisplayAddonsForTicket((addonRes.data || []) as AddonItem[], addonEligibilityContext);
      setLodgingOptions(eligibleLodging);
      setFamilyUnits((familyUnitsRes.data || []) as AccommodationUnit[]);
      setUpgradeInventory((ticketInventoryRes.data || []) as Array<{ ticket_type: string; total_quantity: number; sold_quantity: number; reserved_for_offers: number; is_active: boolean }>);
      setAddons(displayAddons);
    } catch (error) {
      console.error("Error fetching add-ons:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLodgingCheckout = async () => {
    if (!primaryRegistration?.id) return;
    if (!hasFamilyUnit && !hasZone) {
      toast.error("Please select an accommodation");
      return;
    }
    if (hasZone && selectedZoneData.inventory_available < lodgingQty) {
      toast.error(`Only ${selectedZoneData.inventory_available} units available for ${selectedZoneData.zone_name}`);
      return;
    }

    setCheckingOutLodging(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-self-service-lodging", {
        body: {
          email: userEmail,
          lodgingZoneKey: hasFamilyUnit ? (selectedFamilyUnitData?.zone_key || selectedZone) : selectedZone,
          lodgingQuantity: hasFamilyUnit ? 1 : lodgingQty,
          registrationId: primaryRegistration.id,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message || data.error);
      if (data?.url) redirectToExternal(data.url);
    } catch (error: any) {
      console.error("Lodging checkout error:", error);
      toast.error(error.message || "Failed to start lodging checkout");
    } finally {
      setCheckingOutLodging(false);
    }
  };

  const formatPrice = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  const getSelectionMax = (addon: AddonItem) => getMaxForAddon(addon, addonEligibilityContext);
  const getAddonExplainer = (addon: AddonItem, soldOut: boolean) => {
    if (addon.addon_type === "wine_camp") {
      if (soldOut) {
        return "Wine Camp is limited by ticket type and remaining capacity. If it isn’t selectable, this release is currently spoken for.";
      }

      return "Wine Camp is available with qualifying weekend tickets, and only appears while that inventory is still available.";
    }

    if (addon.addon_type === "kids_camp") {
      if (soldOut) {
        return "Kids Camp has limited spots. It requires an eligible family booking and disappears once those spots are filled.";
      }

      return "Kids Camp requires an eligible booking with at least one child or youth attendee, and it stays visible only while spots remain.";
    }

    if (addon.addon_type === DINNER_ADDON_TYPE) {
      if (soldOut) {
        return "The Friday-night dinner is sold out — every seat in the kitchen has been claimed.";
      }

      if (fridayTicketCount <= 0) {
        return "The Friday-night dinner unlocks for Friday attendees. Add a Friday, 2-day, or 3-day ticket to your account.";
      }

      return `You can reserve up to ${fridayTicketCount} Friday-night dinner${fridayTicketCount === 1 ? "" : "s"} — one seat per Friday-eligible ticket on your account.`;
    }

    return null;
  };
  const addonTotal = selectedAddons.reduce((sum, addon) => sum + addon.unitPrice * addon.quantity, 0);
  const visibleCartAddons = selectedAddons.filter((addon) => addon.addonType !== DINNER_ADDON_TYPE || typeof addon.hasDietaryRestrictions === "boolean");
  const visibleCartAddonCount = visibleCartAddons.length;
  const activeDietaryAddon = activeDietaryAddonId
    ? selectedAddons.find((addon) => addon.inventoryId === activeDietaryAddonId) ?? null
    : null;

  const openDietaryStep = (inventoryId: string) => {
    setDietaryStepError(null);
    setActiveDietaryAddonId(inventoryId);
  };

  const closeDietaryStep = () => {
    setDietaryStepError(null);
    setActiveDietaryAddonId(null);
  };

  const continueDietaryStep = () => {
    if (!activeDietaryAddon) return;

    try {
      const validatedAddon = validateSelectedAddonDietary(activeDietaryAddon);
      if (validatedAddon.addonType === DINNER_ADDON_TYPE) {
        trackCustomEvent("japanese_picnic_dietary_step_completed", {
          addon_id: validatedAddon.inventoryId,
          addon_name: validatedAddon.displayName,
          quantity: validatedAddon.quantity,
          has_dietary_restrictions: validatedAddon.hasDietaryRestrictions,
          dietary_note_length: validatedAddon.dietaryRestrictions?.length ?? 0,
          ticket_type: primaryTicketType ?? "unknown",
          event_id: eventId,
        });
      }
      closeDietaryStep();
    } catch (error: any) {
      const message = error?.issues?.[0]?.message || error?.message || "Please complete the dietary step before continuing to cart";
      setDietaryStepError(message);
      toast.error(message);
    }
  };

  const toggleAddon = (addon: AddonItem) => {
    const availability = getAddonAvailability(addon, addonEligibilityContext);
    if (!availability.isEligible || availability.isIncluded) return;
    const existing = selectedAddons.find((item) => item.inventoryId === addon.id);
    if (existing) {
      if (activeDietaryAddonId === addon.id) closeDietaryStep();
      setSelectedAddons((current) => current.filter((item) => item.inventoryId !== addon.id));
      return;
    }
    const ticketCap = getSelectionMax(addon);
    const inventoryRemaining = addon.total_quantity - addon.sold_quantity;
    const max = Math.min(ticketCap, inventoryRemaining);
    if (max <= 0) {
      if (addon.addon_type === DINNER_ADDON_TYPE && inventoryRemaining > 0 && ticketCap <= 0) {
        toast.error(
          fridayTicketCount <= 0
            ? "Friday-night dinner is only available with a Friday, 2-day, or 3-day ticket."
            : "You've reached your Friday-night dinner limit (1 per Friday-eligible ticket).",
        );
      } else if (inventoryRemaining <= 0) {
        toast.error(`${addon.display_name} is sold out.`);
      }
      return;
    }
    const nextSelectedAddon: SelectedAddon = {
      inventoryId: addon.id,
      addonType: addon.addon_type,
      displayName: addon.display_name,
      unitPrice: addon.price,
      quantity: max,
      hasDietaryRestrictions: false,
      dietaryRestrictions: "",
    };
    setSelectedAddons((current) => [...current, nextSelectedAddon]);
    if (addon.addon_type === DINNER_ADDON_TYPE) {
      trackCustomEvent("japanese_picnic_addon_selected", {
        addon_id: addon.id,
        addon_name: addon.display_name,
        quantity: max,
        price: addon.price / 100,
        currency: "USD",
        ticket_type: primaryTicketType ?? "unknown",
        event_id: eventId,
      });
      // Dietary preferences are now optional and accessed via the inline
      // "+ Add dietary notes" link in the cart — no forced modal step.
    }
  };

  const updateAddonQuantity = (inventoryId: string, delta: number) => {
    setSelectedAddons((current) => current.map((addon) => {
      if (addon.inventoryId !== inventoryId) return addon;
      const inventory = addons.find((item) => item.id === inventoryId);
      if (!inventory) return addon;
      const ticketCap = getSelectionMax(inventory);
      const inventoryRemaining = inventory.total_quantity - inventory.sold_quantity;
      const max = Math.min(ticketCap, inventoryRemaining);
      const nextQty = Math.max(1, Math.min(addon.quantity + delta, max));
      if (delta > 0 && nextQty === addon.quantity && addon.quantity >= max) {
        if (inventory.addon_type === DINNER_ADDON_TYPE && ticketCap <= inventoryRemaining) {
          toast.error(
            `Friday-night dinner caps at ${ticketCap} on this account — one seat per Friday-eligible ticket.`,
          );
        } else {
          toast.error(`Only ${inventoryRemaining} ${inventory.display_name} left.`);
        }
      }
      return { ...addon, quantity: nextQty };
    }));
  };

  const updateAddonDetails = (inventoryId: string, updates: Partial<SelectedAddon>) => {
    setDietaryStepError(null);
    setSelectedAddons((current) => current.map((addon) => addon.inventoryId === inventoryId ? { ...addon, ...updates, dietaryRestrictions: updates.hasDietaryRestrictions === false ? "" : (updates.dietaryRestrictions ?? addon.dietaryRestrictions ?? "") } : addon));
  };

  const handleCheckout = async () => {
    if (selectedAddons.length === 0 || !primaryRegistration?.id) return;
    let normalizedAddons: SelectedAddon[] = [];
    try {
      normalizedAddons = normalizeSelectedAddonsForCheckout(selectedAddons);
    } catch (error: any) {
      toast.error(error?.issues?.[0]?.message || error?.message || "Please share your dietary restrictions");
      return;
    }

    const japanesePicnicAddon = normalizedAddons.find((addon) => addon.addonType === DINNER_ADDON_TYPE);
    if (japanesePicnicAddon) {
      trackCustomEvent("japanese_picnic_checkout_entry", {
        addon_id: japanesePicnicAddon.inventoryId,
        addon_name: japanesePicnicAddon.displayName,
        quantity: japanesePicnicAddon.quantity,
        value: (japanesePicnicAddon.unitPrice * japanesePicnicAddon.quantity) / 100,
        currency: "USD",
        has_dietary_restrictions: japanesePicnicAddon.hasDietaryRestrictions,
        dietary_note_length: japanesePicnicAddon.dietaryRestrictions?.length ?? 0,
        total_addons_in_checkout: normalizedAddons.length,
        ticket_type: primaryTicketType ?? "unknown",
        event_id: eventId,
      });
    }

    setCheckingOut(true);
    try {
      const { data, error } = await invokeCheckout<{ url?: string }>("create-addon-checkout", {
        registrationId: primaryRegistration.id,
        customerEmail: userEmail,
        items: normalizedAddons.map((addon) => ({ type: "addon", id: addon.inventoryId, quantity: addon.quantity, addonType: addon.addonType, displayName: addon.displayName, unitPrice: addon.unitPrice, hasDietaryRestrictions: !!addon.hasDietaryRestrictions, dietaryRestrictions: addon.hasDietaryRestrictions ? addon.dietaryRestrictions ?? "" : "" })),
      });
      if (error) {
        console.error("Addon checkout error:", error.rawMessage);
        reportError({ error_type: 'addon', error_message: error.rawMessage, user_email: userEmail });
        showCheckoutErrorToast(error, () => {
          // Re-trigger the same handler on retry
          void handleCheckout();
        });
        return;
      }
      if (data?.url) redirectToExternal(data.url);
    } finally {
      setCheckingOut(false);
    }
  };

  const handleFamilyTicketsCheckout = async () => {
    if (!primaryRegistration?.id) return;
    if (familyChildCount + familyYouthCount <= 0) {
      toast.error("Select at least one child or youth ticket");
      return;
    }
    if (familyYouthCount > 0 && !familyYouthTicketType) {
      toast.error("Choose which youth ticket you need");
      return;
    }

    setCheckingOutFamilyTickets(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-self-serve-kids-checkout", {
        body: {
          registrationId: primaryRegistration.id,
          email: userEmail,
          childCount: familyChildCount,
          youthTicketType: familyYouthTicketType,
          youthCount: familyYouthCount,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.url) {
        redirectToExternal(data.url);
        return;
      }

      toast.success(data?.message || "Family tickets added to your booking.");
      setFamilyChildCount(0);
      setFamilyYouthCount(0);
      setFamilyYouthTicketType(null);
      await onRefresh?.();
    } catch (error: any) {
      console.error("Family tickets checkout error:", error);
      toast.error(error.message || "Failed to add family tickets");
    } finally {
      setCheckingOutFamilyTickets(false);
    }
  };

  if (loading) {
    return (
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ backgroundColor: COLORS.white, borderColor: `${COLORS.charcoal}15` }}
        aria-hidden="true"
      >
        <div
          className="px-6 py-5 flex items-start justify-between gap-4"
          style={{ backgroundColor: `${COLORS.clay}08` }}
        >
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <Skeleton className="h-10 w-10 rounded-full shrink-0" />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
              <Skeleton className="h-4 w-full max-w-[26rem]" />
              <Skeleton className="h-4 w-3/4 max-w-[20rem]" />
            </div>
          </div>
          <Skeleton className="h-5 w-5 shrink-0" />
        </div>

        <div className="p-6 space-y-6">
          <div
            className="rounded-2xl p-6 md:p-7 space-y-3"
            style={{ border: `1px solid ${COLORS.clay}25`, backgroundColor: `${COLORS.clay}08` }}
          >
            <Skeleton className="h-6 w-36 rounded-full" />
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-full max-w-[34rem]" />
            <Skeleton className="h-4 w-5/6 max-w-[30rem]" />
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-3 gap-3">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 2 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-2xl border overflow-hidden"
                  style={{ backgroundColor: COLORS.white, borderColor: `${COLORS.charcoal}15` }}
                >
                  <Skeleton className="h-40 w-full rounded-none" />
                  <div className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-5 w-2/3" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-4/5" />
                      </div>
                      <Skeleton className="h-6 w-16 shrink-0" />
                    </div>
                    <div className="flex items-center justify-between pt-3">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-8 w-20 rounded-lg" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (lodgingOptions.length === 0 && addons.length === 0) return null;

  const hasEligibleLodging = lodgingOptions.length > 0;
  const totalOptions = (hasEligibleLodging ? 1 : 0) + addons.length;
  const hasSelectedAddons = visibleCartAddonCount > 0;

  // Helpers for merchandising
  const getAddonImage = (item: any): string | null => {
    const name = (item.display_name || "").toLowerCase();
    const type = (item.addon_type || "").toLowerCase();
    if (name.includes("dinner") || name.includes("picnic") || type.includes("dinner")) return dinnerImg;
    if (name.includes("kids") || type.includes("kids")) return kidsCampImg;
    if (name.includes("wine") || type.includes("wine")) return wineCampImg;
    return null;
  };
  const getAddonIcon = (item: any) => {
    const name = (item.display_name || "").toLowerCase();
    const type = (item.addon_type || "").toLowerCase();
    if (name.includes("dinner") || name.includes("meal") || name.includes("picnic") || type.includes("dinner") || type.includes("meal")) return "🍽️";
    if (name.includes("breakfast") || name.includes("brunch")) return "🥐";
    if (name.includes("wine") || name.includes("tasting")) return "🍷";
    if (name.includes("yoga") || name.includes("sound") || name.includes("bath")) return "🧘";
    if (name.includes("parking") || name.includes("car")) return "🚗";
    if (name.includes("shuttle") || name.includes("transport")) return "🚐";
    if (name.includes("merch") || name.includes("shirt") || name.includes("hat")) return "👕";
    return "✨";
  };
  const getLodgingIcon = (item: any) => {
    const name = (item.display_name || "").toLowerCase();
    if (name.includes("tent") || name.includes("camp")) return "⛺";
    if (name.includes("rv") || name.includes("van") || name.includes("sprinter")) return "🚐";
    if (name.includes("cabin") || name.includes("lodge")) return "🛏️";
    return "🏕️";
  };

  const renderMerchCard = (item: any, type: "lodging" | "addon") => {
    const available = item.total_quantity - item.sold_quantity;
    const inCart = type === "addon"
      ? selectedAddons.find((selected) => selected.inventoryId === item.id)
      : null;
    const lowStock = available > 0 && available <= 10;
    const icon = type === "lodging" ? getLodgingIcon(item) : getAddonIcon(item);
    const image = type === "addon" ? getAddonImage(item) : null;

    return (
      <div
        key={item.id}
        className="group relative rounded-2xl border overflow-hidden flex flex-col transition-all hover:-translate-y-0.5"
        style={{
          backgroundColor: COLORS.white,
          borderColor: inCart ? COLORS.clay : `${COLORS.charcoal}15`,
          boxShadow: inCart
            ? `0 8px 24px -12px ${COLORS.clay}40`
            : `0 1px 2px ${COLORS.charcoal}08`,
        }}
      >
        {/* Visual banner — image when available, fallback to icon */}
        <div
          className="relative h-40 flex items-center justify-center overflow-hidden"
          style={{
            background: image ? COLORS.charcoal : `linear-gradient(135deg, ${COLORS.clay}18 0%, ${COLORS.mustard}14 60%, ${COLORS.denim}10 100%)`,
          }}
        >
          {image ? (
            <img
              src={image}
              alt={item.display_name}
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <span className="text-5xl select-none transition-transform group-hover:scale-110" aria-hidden>
              {icon}
            </span>
          )}
          {/* Scarcity / status badge */}
          {available <= 0 ? (
            <span
              className="absolute top-3 right-3 px-2 py-1 rounded-full"
              style={{ backgroundColor: COLORS.charcoal, color: COLORS.white, ...typography.caption, fontSize: '9px' }}
            >
              SOLD OUT
            </span>
          ) : lowStock ? (
            <span
              className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-1 rounded-full"
              style={{ backgroundColor: COLORS.clay, color: COLORS.white, ...typography.caption, fontSize: '9px' }}
            >
              <Sparkles className="h-2.5 w-2.5" />ONLY {available} LEFT
            </span>
          ) : null}
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col flex-1">
          <div className="flex items-start justify-between gap-3 mb-2">
            <h4 style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '17px', lineHeight: 1.25 }}>
              {item.display_name}
            </h4>
            <div className="text-right shrink-0">
              <div style={{ ...typography.headline, color: COLORS.charcoal, fontSize: '22px', lineHeight: 1 }}>
                {formatPrice(item.price)}
              </div>
            </div>
          </div>

          {item.description && (
            <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px', lineHeight: 1.5 }} className="mb-4 flex-1">
              {item.description}
            </p>
          )}

          <div className="flex items-center justify-between gap-3 pt-3" style={{ borderTop: `1px solid ${COLORS.charcoal}08` }}>
            <span style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px' }}>
              {available > 0 ? `${available} available` : "Sold out"}
            </span>
            {inCart ? (
              <span
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full"
                style={{ backgroundColor: `${COLORS.clay}15`, color: COLORS.clay, ...typography.caption, fontSize: '10px' }}
              >
                <CheckCircle2 className="h-3 w-3" />In Cart ({inCart.quantity})
              </span>
            ) : (
              <MayButton variant="clay" size="sm" disabled={available <= 0 || type !== "addon"} onClick={() => type === "addon" && toggleAddon(item)}>
                <Plus className="h-3.5 w-3.5" />Add
              </MayButton>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <details
      className="rounded-2xl border overflow-hidden group"
      open={isExpanded}
      onToggle={(event) => persistAccordionPreference((event.currentTarget as HTMLDetailsElement).open)}
      style={{ backgroundColor: COLORS.white, borderColor: `${COLORS.charcoal}15` }}
    >
      <summary
        className="cursor-pointer list-none px-6 py-5 flex items-center justify-between gap-4"
        onClick={() => setShowEligibilityAutoExpandNote(false)}
        style={{ backgroundColor: `${COLORS.clay}08` }}
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${COLORS.clay}14` }}>
            {hasEligibleLodging ? <Home className="h-5 w-5" style={{ color: COLORS.clay }} /> : <Sparkles className="h-5 w-5" style={{ color: COLORS.clay }} />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h3 style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '18px' }}>
                Stay & Add-Ons
              </h3>
              {hasEligibleLodging && (
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: `${COLORS.denim}12`, color: COLORS.denim, ...typography.caption, fontSize: '9px' }}
                >
                  LODGING ELIGIBLE
                </span>
              )}
            </div>
            <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px', lineHeight: 1.5 }}>
              {hasEligibleLodging
                ? `You can reserve lodging and add extras for this booking. ${totalOptions} option${totalOptions === 1 ? '' : 's'} available.`
                : `Add dinners or experiences to this booking. ${totalOptions} option${totalOptions === 1 ? '' : 's'} available.`}
            </p>
            {showEligibilityAutoExpandNote && isExpanded && (
              <p style={{ ...typography.caption, color: COLORS.clay, fontSize: '10px', letterSpacing: '0.06em', marginTop: '8px' }}>
                Opened automatically because this ticket has eligible lodging or add-ons.
              </p>
            )}
          </div>
        </div>
        <ChevronDown className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180" style={{ color: COLORS.boulder }} />
      </summary>

      <div className="p-6 space-y-6">
        <div
          className="relative rounded-2xl overflow-hidden p-4 md:p-5"
          style={{
            background: `linear-gradient(135deg, ${COLORS.clay}12 0%, ${COLORS.mustard}08 50%, ${COLORS.denim}08 100%)`,
            border: `1px solid ${COLORS.clay}22`,
          }}
        >
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div className="min-w-0 max-w-3xl">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: COLORS.white, color: COLORS.clay, ...typography.caption, fontSize: '10px', border: `1px solid ${COLORS.clay}30` }}
                >
                  <Sparkles className="h-3 w-3" />WEEKEND EXTRAS
                </span>
                <span style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px', letterSpacing: '0.06em' }}>
                  LIMITED INVENTORY
                </span>
              </div>
              <h2 style={{ ...typography.headline, color: COLORS.charcoal, fontSize: 'clamp(18px, 3vw, 24px)', lineHeight: 1.08 }}>
                Enhance Your Weekend
              </h2>
              <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px', marginTop: '6px', maxWidth: '62ch', lineHeight: 1.5 }}>
                Reserve dinner, secure lodging, or add an experience to this booking.
              </p>
              {!hasEligibleLodging && canUpgradeToVipForLodging && (
                <div
                  className="mt-3 rounded-xl px-3.5 py-3"
                  style={{ backgroundColor: `${COLORS.white}E6`, border: `1px solid ${COLORS.denim}20`, maxWidth: '62ch' }}
                >
                  <div className="flex items-start gap-2.5">
                    <Home className="h-4 w-4 mt-0.5 shrink-0" style={{ color: COLORS.denim }} />
                    <div>
                      <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '12px', fontWeight: 600 }}>
                        On-site lodging unlocks with a VIP weekend ticket.
                      </p>
                      <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', marginTop: '3px', lineHeight: 1.45 }}>
                        Use the upgrade buttons in your ticket wallet above to move into VIP, then come back here to book your stay.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {addons.length === 0 && (
                <div
                  className="mt-3 rounded-xl p-4"
                  style={{ backgroundColor: COLORS.white, border: `1px solid ${COLORS.charcoal}12` }}
                >
                  <div className="flex items-start gap-3">
                    <Sparkles className="h-4 w-4 mt-0.5 shrink-0" style={{ color: COLORS.denim }} />
                    <div className="min-w-0">
                      <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px', fontWeight: 600 }}>
                        Nothing is unlocked in add-ons right now.
                      </p>
                      <div className="mt-2 space-y-2">
                        <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px', lineHeight: 1.55 }}>
                          <span style={{ color: COLORS.charcoal, fontWeight: 600 }}>What&apos;s missing:</span> we don&apos;t currently have any active dinner, Wine Camp, or Kids Camp inventory available for this ticket on this event.
                        </p>
                        {isUpgradeableForMoreOptions && (
                          <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px', lineHeight: 1.55 }}>
                            <span style={{ color: COLORS.charcoal, fontWeight: 600 }}>How to see more options:</span> use the <span style={{ color: COLORS.denim, fontWeight: 600 }}>Upgrade options</span> buttons on your ticket card above to move into {addonUpgradeSummary}. Higher tiers unlock more weekend options as inventory goes live.
                          </p>
                        )}
                        {!isUpgradeableForMoreOptions && (
                          <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px', lineHeight: 1.55 }}>
                            If you expected Wine Camp or Kids Camp here, we should verify that those experiences are active for this event and eligible for your current ticket.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Cart moved below Dinners & Experiences */}
        <div className="space-y-4">
          <div className="flex items-baseline justify-between mb-3 gap-3">
            <div>
              <h3 style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '18px', fontStyle: 'italic' }}>Kids & Youth Tickets</h3>
              <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px', marginTop: '4px', lineHeight: 1.55 }}>
                Add family tickets to this booking without starting a new order.
              </p>
            </div>
            <span style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px' }}>
              linked to this order
            </span>
          </div>

          <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: COLORS.white, borderColor: `${COLORS.charcoal}15` }}>
            <button
              type="button"
              onClick={() => setFamilyTicketsExpanded((expanded) => !expanded)}
              className="w-full p-5 md:p-6 text-left"
              style={{ backgroundColor: `${COLORS.mustard}06` }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                      style={{ backgroundColor: COLORS.white, color: COLORS.charcoal, ...typography.caption, fontSize: '10px', border: `1px solid ${COLORS.charcoal}12` }}
                    >
                      <Users className="h-3.5 w-3.5" />FAMILY BOOKING
                    </span>
                    <span style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px', letterSpacing: '0.06em' }}>
                      {totalFamilySelections > 0 ? `${familyChildCount} child · ${familyYouthCount} youth selected` : 'Collapsed'}
                    </span>
                  </div>
                  <p style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '18px' }}>
                    Add child or youth tickets
                  </p>
                  <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px', marginTop: '6px', lineHeight: 1.55 }}>
                    Children 0–12 are free. Youth 13–17 can be added at the matching ticket price.
                  </p>
                </div>
                {familyTicketsExpanded ? <ChevronUp className="h-5 w-5 shrink-0" style={{ color: COLORS.boulder }} /> : <ChevronDown className="h-5 w-5 shrink-0" style={{ color: COLORS.boulder }} />}
              </div>
            </button>

            {familyTicketsExpanded && (
              <div className="px-5 pb-5 md:px-6 md:pb-6 space-y-5" style={{ borderTop: `1px solid ${COLORS.charcoal}10` }}>
                <div className="pt-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div className="max-w-2xl">
                    <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '14px', lineHeight: 1.6 }}>
                      Free child tickets are added instantly to this wallet. Paid youth tickets open secure checkout and appear here after payment completes.
                    </p>
                  </div>
                  <MayButton variant="clay" size="lg" onClick={handleFamilyTicketsCheckout} className="shrink-0" disabled={checkingOutFamilyTickets || totalFamilySelections <= 0 || (familyYouthCount > 0 && !familyYouthTicketType)}>
                    {checkingOutFamilyTickets ? <><Loader2 className="h-4 w-4 animate-spin" />Processing...</> : <>Add Family Tickets<ArrowRight className="h-4 w-4" /></>}
                  </MayButton>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border p-5" style={{ backgroundColor: `${COLORS.charcoal}03`, borderColor: `${COLORS.charcoal}10` }}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', fontWeight: 600 }}>Child tickets</p>
                        <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', marginTop: '4px', lineHeight: 1.5 }}>
                          Ages 0–12 · free admission · added directly to this wallet
                        </p>
                      </div>
                      <span style={{ ...typography.subhead, color: COLORS.forest, fontSize: '14px' }}>FREE</span>
                    </div>
                    <div className="mt-4 flex items-center gap-3">
                      <button onClick={() => setFamilyChildCount((count) => Math.max(0, count - 1))} disabled={familyChildCount <= 0} className="h-9 w-9 rounded-full flex items-center justify-center border disabled:opacity-30" style={{ borderColor: `${COLORS.charcoal}18`, color: COLORS.charcoal }}>
                        <Minus className="h-4 w-4" />
                      </button>
                      <div className="min-w-[56px] text-center">
                        <p style={{ ...typography.headline, color: COLORS.charcoal, fontSize: '24px', lineHeight: 1 }}>{familyChildCount}</p>
                      </div>
                      <button onClick={() => setFamilyChildCount((count) => Math.min(6, count + 1))} disabled={familyChildCount >= 6} className="h-9 w-9 rounded-full flex items-center justify-center border disabled:opacity-30" style={{ borderColor: `${COLORS.charcoal}18`, color: COLORS.charcoal }}>
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border p-5" style={{ backgroundColor: `${COLORS.charcoal}03`, borderColor: `${COLORS.charcoal}10` }}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', fontWeight: 600 }}>Youth tickets</p>
                        <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', marginTop: '4px', lineHeight: 1.5 }}>
                          Ages 13–17 · paid ticket · select the youth pass that matches the adult ticket
                        </p>
                      </div>
                      <span style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '14px' }}>
                        {selectedYouthOption ? formatPrice(selectedYouthOption.price) : familyYouthOptions.length > 0 ? 'Choose pass' : 'Not available'}
                      </span>
                    </div>
                    <div className="mt-4 flex items-center gap-3">
                      <button onClick={() => setFamilyYouthCount((count) => Math.max(0, count - 1))} disabled={familyYouthCount <= 0 || familyYouthOptions.length === 0} className="h-9 w-9 rounded-full flex items-center justify-center border disabled:opacity-30" style={{ borderColor: `${COLORS.charcoal}18`, color: COLORS.charcoal }}>
                        <Minus className="h-4 w-4" />
                      </button>
                      <div className="min-w-[56px] text-center">
                        <p style={{ ...typography.headline, color: COLORS.charcoal, fontSize: '24px', lineHeight: 1 }}>{familyYouthCount}</p>
                      </div>
                      <button onClick={() => setFamilyYouthCount((count) => Math.min(6, count + 1))} disabled={familyYouthCount >= 6 || familyYouthOptions.length === 0} className="h-9 w-9 rounded-full flex items-center justify-center border disabled:opacity-30" style={{ borderColor: `${COLORS.charcoal}18`, color: COLORS.charcoal }}>
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    {familyYouthOptions.length > 0 ? (
                      <div className="mt-4 space-y-2">
                        {familyYouthOptions.map((option) => {
                          const selected = familyYouthTicketType === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setFamilyYouthTicketType(option.value)}
                              className="w-full rounded-xl border px-4 py-3 text-left transition-opacity hover:opacity-80"
                              style={{
                                backgroundColor: selected ? `${COLORS.denim}08` : COLORS.white,
                                borderColor: selected ? COLORS.denim : `${COLORS.charcoal}12`,
                              }}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px', fontWeight: 600 }}>{option.label}</p>
                                  <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', marginTop: '2px' }}>
                                    {option.value === 'youth_saturday' ? 'Best for Saturday-only family attendance' : 'Best for full weekend family attendance'}
                                  </p>
                                </div>
                                <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px', fontWeight: 600 }}>{formatPrice(option.price)}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', marginTop: '12px', lineHeight: 1.5 }}>
                        Youth tickets can be added to Saturday, 2-Day, VIP, Crew, and Patron bookings. This order is currently tied to {primaryTicketType ? formatTicketType(primaryTicketType) : 'a booking that does not support youth add-ons'}.
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border p-4" style={{ backgroundColor: `${COLORS.mustard}08`, borderColor: `${COLORS.mustard}20` }}>
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px', fontWeight: 600 }}>
                        {totalFamilySelections > 0 ? `${totalFamilySelections} family ticket${totalFamilySelections === 1 ? '' : 's'} ready to add` : 'Choose how many child or youth tickets to add'}
                      </p>
                      <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', marginTop: '4px', lineHeight: 1.5 }}>
                        {familyYouthCount > 0 && selectedYouthOption
                          ? `${familyChildCount} child · ${familyYouthCount} youth (${selectedYouthOption.label})`
                          : `${familyChildCount} child · ${familyYouthCount} youth`}
                      </p>
                    </div>
                    <div className="text-left md:text-right">
                      <p style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px' }}>ESTIMATED TOTAL</p>
                      <p style={{ ...typography.headline, color: COLORS.charcoal, fontSize: '22px' }}>
                        {formatPrice((selectedYouthOption?.price || 0) * familyYouthCount)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {lodgingOptions.length > 0 && (
          <details
            className="rounded-2xl border overflow-hidden group"
            style={{ backgroundColor: COLORS.white, borderColor: `${COLORS.charcoal}15` }}
          >
            <summary
              className="cursor-pointer list-none px-5 py-4 flex items-center justify-between gap-4"
              style={{ backgroundColor: `${COLORS.denim}06` }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Home className="h-4 w-4 shrink-0" style={{ color: COLORS.denim }} />
                <div className="min-w-0">
                  <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', fontWeight: 600 }}>
                    Lodging unlocked — {lodgingOptions.length} {lodgingOptions.length === 1 ? 'zone' : 'zones'} available
                  </p>
                  <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', marginTop: '2px' }}>
                    Tap to browse cabins, tents, and family units
                  </p>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" style={{ color: COLORS.boulder }} />
            </summary>
            <div className="border-t" style={{ borderColor: `${COLORS.charcoal}10` }}>
              <div className="p-6 md:p-7" style={{ backgroundColor: `${COLORS.denim}06` }}>
                <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                  <div className="max-w-2xl">
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full mb-3"
                      style={{ backgroundColor: COLORS.white, color: COLORS.denim, ...typography.caption, fontSize: '10px', border: `1px solid ${COLORS.denim}20` }}
                    >
                      <Home className="h-3.5 w-3.5" />ZONE + UNIT SELECTION
                    </span>
                    <h4 style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '20px' }}>
                      Reserve lodging from the same live inventory as checkout
                    </h4>
                    <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '14px', marginTop: '8px', lineHeight: 1.6 }}>
                      Choose a zone or family-style unit here, with the same pricing, availability, and eligibility rules used everywhere else.
                    </p>
                  </div>
                  <MayButton variant="clay" size="lg" onClick={handleLodgingCheckout} className="shrink-0" disabled={checkingOutLodging || (!hasZone && !hasFamilyUnit)}>
                    {checkingOutLodging ? <><Loader2 className="h-4 w-4 animate-spin" />Processing...</> : <>Reserve Lodging<ArrowRight className="h-4 w-4" /></>}
                  </MayButton>
                </div>
              </div>
              <div className="p-6 space-y-6">
                <LodgingSelector
                  zones={lodgingOptions}
                  familyUnits={familyUnits}
                  selectedZone={selectedZone}
                  selectedFamilyUnit={selectedFamilyUnit}
                  lodgingQty={lodgingQty}
                  maxLodgingQty={maxLodgingQty}
                  canBookLodging={!!canBookLodging}
                  hasQualifyingTickets={hasQualifyingTickets}
                  ticketName={formatTicketType(primaryTicketType || "")}
                  ticketQuantity={primaryTicketQuantity}
                  assetsByType={assetsByType}
                  onBlockedSelection={() => toast.error(!hasQualifyingTickets ? "Lodging requires VIP or Crew 3-day tickets" : "This lodging option is unavailable")}
                  onSelectZone={(zoneKey) => {
                    setSelectedZone(zoneKey);
                    setSelectedFamilyUnit(null);
                  }}
                  onSelectFamilyUnit={(unitId) => {
                    setSelectedFamilyUnit(unitId);
                    setSelectedZone(null);
                  }}
                  onChangeQuantity={setLodgingQty}
                  showRequirementWarning={true}
                />

                {(hasZone || hasFamilyUnit) && (
                  <div className="rounded-xl border p-5" style={{ backgroundColor: `${COLORS.charcoal}04`, borderColor: `${COLORS.charcoal}10` }}>
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '16px' }}>
                          {hasFamilyUnit
                            ? `Family-Style ${selectedFamilyUnitData?.product_type === "tent" ? "Tent" : "Cabin"}`
                            : selectedZoneData?.zone_name}
                        </p>
                        <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', marginTop: '4px' }}>
                          {hasFamilyUnit
                            ? selectedFamilyUnitData?.bed_configuration
                            : `${lodgingQty} × ${(selectedZoneData!.night_price / 100).toLocaleString()}/night × 2 nights`}
                        </p>
                      </div>
                      <div className="text-left md:text-right">
                        <p style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px' }}>LODING TOTAL</p>
                        <p style={{ ...typography.headline, color: COLORS.charcoal, fontSize: '22px' }}>${lodgingTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </details>
        )}

        {addons.length > 0 && (
          <div className={hasSelectedAddons ? "lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6 lg:items-start" : ""}>
          <div>
            <div className="flex items-baseline justify-between mb-3">
              <h3 style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '18px', fontStyle: 'italic' }}>Dinners & Experiences</h3>
              <span style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px' }}>
                {availableAddonCount} available
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
              {addons.map((addon) => {
                const selected = selectedAddons.find((item) => item.inventoryId === addon.id);
                const remaining = addon.total_quantity - addon.sold_quantity;
                const soldOut = remaining <= 0;
                const availability = getAddonAvailability(addon, addonEligibilityContext);
                const wineCampState = addon.addon_type === 'wine_camp'
                  ? getWineCampCardState({
                      userTicketTypes,
                      primaryTicketType: primaryRegistration?.ticket_type,
                      availability,
                      soldOut,
                      upgradeAvailable: isUpgradeableForMoreOptions,
                    })
                  : null;
                const isIncluded = wineCampState?.isIncluded ?? availability.isIncluded;
                // Hide add-ons already covered by the user's ticket — reduces noise on the wallet.
                if (isIncluded) return null;
                const isUnavailable = wineCampState?.isUnavailable ?? (!availability.isEligible && !isIncluded);
                const isDisabled = soldOut || isUnavailable;
                const addonExplainer = getAddonExplainer(addon, soldOut);
                const statusLabel = soldOut ? 'Sold out' : isUnavailable ? 'Unavailable' : selected ? `In cart · ${selected.quantity}` : null;
                const statusColor = soldOut ? COLORS.clay : isUnavailable ? COLORS.boulder : selected ? COLORS.clay : COLORS.denim;
                const img = addon.addon_type === 'friday_dinner' ? dinnerImg : addon.addon_type === 'kids_camp' ? kidsCampImg : wineCampImg;
                const showWineCampPanel = addon.addon_type === 'wine_camp' && (isUnavailable || soldOut);
                return (
                  <div
                    key={addon.id}
                    className="rounded-2xl border overflow-hidden flex flex-col transition-all"
                    style={{
                      backgroundColor: isUnavailable ? `${COLORS.charcoal}03` : selected ? `${COLORS.clay}05` : COLORS.white,
                      borderColor: selected ? COLORS.clay : `${COLORS.charcoal}15`,
                      opacity: isDisabled ? 0.78 : 1,
                      boxShadow: selected ? `0 6px 20px -10px ${COLORS.clay}40` : `0 1px 2px ${COLORS.charcoal}06`,
                    }}
                  >
                    <div className="relative h-28 overflow-hidden" style={{ backgroundColor: COLORS.charcoal }}>
                      <img src={img} alt={addon.display_name} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                      {statusLabel && (
                        <span
                          className="absolute top-2 right-2 inline-flex items-center rounded-full px-2 py-0.5"
                          style={{ backgroundColor: statusColor, color: COLORS.white, ...typography.caption, fontSize: '9px', letterSpacing: '0.08em' }}
                        >
                          {statusLabel}
                        </span>
                      )}
                    </div>
                    <div className="p-4 flex flex-col flex-1 gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <h4 style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '15px', lineHeight: 1.25 }} className="min-w-0">
                          {addon.display_name}
                        </h4>
                        <span style={{ ...typography.headline, color: isUnavailable ? COLORS.boulder : COLORS.charcoal, fontSize: '15px', lineHeight: 1, whiteSpace: 'nowrap' }}>
                          {isUnavailable ? '—' : `${formatPrice(addon.price)}`}
                        </span>
                      </div>
                      {addon.description && (
                        <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', lineHeight: 1.45 }} className="line-clamp-2">
                          {addon.description}
                        </p>
                      )}
                      {isUnavailable && availability.unavailableReason && addon.addon_type !== 'wine_camp' && (
                        <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '11px', lineHeight: 1.5 }}>{availability.unavailableReason}</p>
                      )}
                      {addonExplainer && (
                        <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '11px', lineHeight: 1.5 }}>
                          <span style={{ color: COLORS.charcoal, fontWeight: 600 }}>Why don&apos;t I see this?</span> {addonExplainer}
                        </p>
                      )}
                      {showWineCampPanel && (
                        <WineCampCardState
                          userTicketTypes={userTicketTypes}
                          primaryTicketType={primaryRegistration?.ticket_type}
                          availability={availability}
                          soldOut={soldOut}
                          upgradeAvailable={isUpgradeableForMoreOptions}
                          onUpgrade={() => {
                            document.getElementById('ticket-wallet')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }}
                        />
                      )}
                      {!showWineCampPanel && !isIncluded && (
                        <div className="mt-auto pt-3" style={{ borderTop: `1px solid ${COLORS.charcoal}08` }}>
                          {selected ? (
                            <div className="flex items-center gap-2">
                              <div className="inline-flex items-center gap-1 rounded-full border" style={{ borderColor: `${COLORS.charcoal}20` }}>
                                <button onClick={() => updateAddonQuantity(addon.id, -1)} className="h-7 w-7 rounded-full flex items-center justify-center" aria-label="Decrease"><Minus className="h-3 w-3" /></button>
                                <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px', fontWeight: 600, minWidth: '18px', textAlign: 'center' }}>{selected.quantity}</span>
                                <button onClick={() => updateAddonQuantity(addon.id, 1)} className="h-7 w-7 rounded-full flex items-center justify-center" aria-label="Increase"><Plus className="h-3 w-3" /></button>
                              </div>
                              <span style={{ ...typography.body, color: COLORS.boulder, fontSize: '11px' }}>
                                {formatPrice(selected.unitPrice * selected.quantity)}
                              </span>
                              <button onClick={() => toggleAddon(addon)} className="ml-auto" style={{ ...typography.caption, color: COLORS.clay, fontSize: '10px' }}>Remove</button>
                            </div>
                          ) : (
                            <MayButton variant="clay" size="sm" disabled={isDisabled} onClick={() => toggleAddon(addon)} className="w-full justify-center">
                              <Plus className="h-3.5 w-3.5" />{isUnavailable ? 'Unavailable' : soldOut ? 'Sold out' : 'Add'}
                            </MayButton>
                          )}
                          {selected && addon.addon_type === DINNER_ADDON_TYPE && (
                            <p
                              className="mt-2"
                              style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px', letterSpacing: '0.04em' }}
                            >
                              Dietary notes optional — manage in cart below
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        {hasSelectedAddons && (
          <div className="rounded-2xl border-2 overflow-hidden lg:sticky lg:top-6" style={{ backgroundColor: COLORS.white, borderColor: COLORS.clay, boxShadow: `0 12px 32px -16px ${COLORS.clay}50` }}>
            <div className="px-6 py-4 flex items-center justify-between" style={{ backgroundColor: `${COLORS.clay}08`, borderBottom: `1px solid ${COLORS.clay}20` }}>
              <h3 className="flex items-center gap-2" style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '16px' }}>
                <ShoppingCart className="h-5 w-5" style={{ color: COLORS.clay }} />Your Cart
              </h3>
              <span style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px' }}>
                {visibleCartAddonCount} {visibleCartAddonCount === 1 ? 'item' : 'items'}
              </span>
            </div>
            <div className="p-6 space-y-3">
              {(() => {
                const dinnerAddon = addons.find((a) => a.addon_type === DINNER_ADDON_TYPE);
                const dinnerInCart = selectedAddons
                  .filter((a) => a.addonType === DINNER_ADDON_TYPE)
                  .reduce((sum, a) => sum + (a.quantity || 0), 0);
                if (!dinnerAddon || dinnerInCart === 0) return null;
                const inventoryRemaining = Math.max(0, (dinnerAddon.total_quantity || 0) - (dinnerAddon.sold_quantity || 0));
                const ticketCap = fridayTicketCount;
                const inventoryBinding = inventoryRemaining <= ticketCap;
                const effectiveLimit = Math.min(inventoryRemaining, ticketCap);
                const atLimit = dinnerInCart >= effectiveLimit;
                if (!atLimit) return null;
                const headline = inventoryBinding
                  ? inventoryRemaining === 0
                    ? "You've reserved the last seats at the table"
                    : "You've filled every available seat in the kitchen"
                  : ticketCap === 0
                    ? "Add a Friday-eligible ticket to unlock the dinner"
                    : `You've reserved a seat for each of your Friday tickets`;
                const body = inventoryBinding
                  ? inventoryRemaining === 0
                    ? "The kitchen is fully booked. Your seats are saved — continue to checkout to confirm them."
                    : `That's all ${inventoryRemaining} remaining seat${inventoryRemaining === 1 ? "" : "s"} at the table. Your spots are held while you finish checkout.`
                  : ticketCap === 0
                    ? "The Friday-night dinner is reserved for guests with a Friday, 2-day, or 3-day ticket. Add one to your account and the seats will open up."
                    : `One seat per Friday-eligible ticket keeps the table intimate. Add another Friday, 2-day, or 3-day ticket to bring more guests.`;
                return (
                  <div
                    role="status"
                    className="rounded-lg p-3 flex items-start gap-2.5"
                    style={{
                      backgroundColor: `${COLORS.clay}08`,
                      border: `1px solid ${COLORS.clay}20`,
                    }}
                  >
                    <Check className="h-4 w-4 mt-0.5 shrink-0" style={{ color: COLORS.clay }} aria-hidden="true" />
                    <div className="space-y-0.5 min-w-0">
                      <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: "12px", fontWeight: 600 }}>
                        {headline}
                      </p>
                      <p style={{ ...typography.body, color: COLORS.boulder, fontSize: "11px", lineHeight: 1.5 }}>
                        {body}
                      </p>
                    </div>
                  </div>
                );
              })()}
              {visibleCartAddons.map((item) => (
                <div key={item.inventoryId} className="space-y-3 rounded-xl border p-4" style={{ borderColor: `${COLORS.charcoal}10`, backgroundColor: `${COLORS.charcoal}02` }}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1">
                      <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', fontWeight: 600 }}>{item.displayName}</p>
                      <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px' }}>{formatPrice(item.unitPrice)} each</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateAddonQuantity(item.inventoryId, -1)}
                        disabled={item.quantity <= 1}
                        className="h-7 w-7 rounded-full flex items-center justify-center border disabled:opacity-30"
                        style={{ borderColor: `${COLORS.denim}30`, color: COLORS.denim }}
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-6 text-center" style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px' }}>{item.quantity}</span>
                      <button
                        onClick={() => updateAddonQuantity(item.inventoryId, 1)}
                        className="h-7 w-7 rounded-full flex items-center justify-center border disabled:opacity-30"
                        style={{ borderColor: `${COLORS.denim}30`, color: COLORS.denim }}
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                      <button onClick={() => setSelectedAddons((current) => current.filter((addon) => addon.inventoryId !== item.inventoryId))} className="h-7 w-7 flex items-center justify-center opacity-40 hover:opacity-100">
                        <X className="h-3 w-3" style={{ color: COLORS.charcoal }} />
                      </button>
                    </div>
                  </div>

                  {item.addonType === DINNER_ADDON_TYPE && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', lineHeight: 1.5 }}>
                        {item.hasDietaryRestrictions
                          ? <><span style={{ color: COLORS.charcoal, fontWeight: 600 }}>Dietary notes:</span> {item.dietaryRestrictions || "Added"}</>
                          : <>Dietary notes <span style={{ color: COLORS.boulder }}>(optional)</span></>}
                      </p>
                      <button
                        type="button"
                        onClick={() => openDietaryStep(item.inventoryId)}
                        style={{ ...typography.caption, color: COLORS.denim, fontSize: '11px', letterSpacing: '0.04em' }}
                      >
                        {item.hasDietaryRestrictions ? "Edit →" : "+ Add dietary notes"}
                      </button>
                    </div>
                  )}
                </div>
              ))}
              <div className="pt-3 flex items-center justify-between" style={{ borderTop: `1px solid ${COLORS.charcoal}10` }}>
                <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', fontWeight: 600 }}>Total</span>
                <span style={{ ...typography.headline, color: COLORS.charcoal, fontSize: '20px' }}>{formatPrice(addonTotal)}</span>
              </div>
              <MayButton variant="clay" size="lg" className="w-full" onClick={handleCheckout} disabled={checkingOut}>
                {checkingOut ? <><Loader2 className="h-4 w-4 animate-spin" />Processing...</> : <>Continue to checkout · {formatPrice(addonTotal)}<ArrowRight className="h-4 w-4" /></>}
              </MayButton>
            </div>
          </div>
        )}
          </div>
        )}

        {hasSelectedAddons && (
          <>
            {/* Spacer keeps the fixed sticky bar from covering the inline cart's checkout button on mobile/tablet */}
            <div className="h-24 lg:hidden" aria-hidden="true" />
            <div className="fixed inset-x-0 bottom-0 z-40 border-t p-4 lg:hidden" style={{ backgroundColor: `${COLORS.white}f5`, borderColor: `${COLORS.charcoal}10`, backdropFilter: 'blur(14px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
              <div className="mx-auto flex max-w-md items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px', letterSpacing: '0.08em' }}>ADD-ONS CART</p>
                  <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', fontWeight: 600 }}>
                    {visibleCartAddonCount} item{visibleCartAddonCount === 1 ? '' : 's'} · {formatPrice(addonTotal)}
                  </p>
                </div>
                <MayButton variant="clay" size="sm" className="shrink-0 min-w-[132px]" onClick={handleCheckout} disabled={checkingOut}>
                  {checkingOut ? <><Loader2 className="h-4 w-4 animate-spin" />Processing...</> : <>Checkout<ArrowRight className="h-4 w-4" /></>}
                </MayButton>
              </div>
            </div>
          </>
        )}

        {activeDietaryAddon && (
          <Dialog open={true} onOpenChange={(open) => !open && closeDietaryStep()}>
            <DialogContent className="sm:max-w-lg" style={{ backgroundColor: COLORS.white }}>
              <DialogHeader>
                <DialogTitle style={{ ...typography.subhead, color: COLORS.charcoal }}>Dietary notes (optional)</DialogTitle>
                <DialogDescription style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
                  Skip this if there's nothing to flag — the kitchen will assume no restrictions. Add notes only if you have allergies, intolerances, or special requests.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="rounded-lg p-4" style={{ backgroundColor: `${COLORS.charcoal}05` }}>
                  <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', fontWeight: 600 }}>{activeDietaryAddon.displayName}</p>
                  <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', marginTop: '4px' }}>Qty: {activeDietaryAddon.quantity}</p>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px', fontWeight: 600 }}>Do you have any dietary restrictions?</p>
                    <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', lineHeight: 1.5 }}>
                      Default is <span style={{ color: COLORS.charcoal, fontWeight: 600 }}>No</span> — we'll submit your dinner with no special requests unless you tell us otherwise.
                    </p>
                  </div>
                  <RadioGroup
                    value={activeDietaryAddon.hasDietaryRestrictions ? 'yes' : 'no'}
                    onValueChange={(value) => updateAddonDetails(activeDietaryAddon.inventoryId, {
                      hasDietaryRestrictions: value === 'yes',
                      dietaryRestrictions: value === 'yes' ? activeDietaryAddon.dietaryRestrictions ?? '' : '',
                    })}
                    className="flex gap-6"
                  >
                    <div className="flex items-center gap-2"><RadioGroupItem value="no" id={`${activeDietaryAddon.inventoryId}-dietary-step-no`} /><span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px' }}>No</span></div>
                    <div className="flex items-center gap-2"><RadioGroupItem value="yes" id={`${activeDietaryAddon.inventoryId}-dietary-step-yes`} /><span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px' }}>Yes</span></div>
                  </RadioGroup>
                </div>

                {activeDietaryAddon.hasDietaryRestrictions && (
                  <div className="space-y-2">
                    <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px', fontWeight: 600 }}>Dietary restrictions note</p>
                    <Textarea
                      value={activeDietaryAddon.dietaryRestrictions ?? ''}
                      onChange={(e) => updateAddonDetails(activeDietaryAddon.inventoryId, { dietaryRestrictions: e.target.value.slice(0, 1000) })}
                      placeholder="Vegetarian, gluten-free, allergies, or anything else we should know"
                      className="min-h-[120px] resize-y"
                      style={{ borderColor: `${COLORS.charcoal}18` }}
                      maxLength={1000}
                    />
                    <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '11px' }}>
                      This will be saved with your add-on in checkout.
                    </p>
                  </div>
                )}

                {dietaryStepError && (
                  <div className="rounded-lg border p-3" style={{ borderColor: `${COLORS.clay}25`, backgroundColor: `${COLORS.clay}08` }}>
                    <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '12px', lineHeight: 1.5 }}>
                      {dietaryStepError}
                    </p>
                  </div>
                )}

                <DialogFooter>
                  <MayButton variant="outline" onClick={closeDietaryStep}>Cancel</MayButton>
                  <MayButton variant="clay" onClick={continueDietaryStep}>Save</MayButton>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </details>
  );
}
