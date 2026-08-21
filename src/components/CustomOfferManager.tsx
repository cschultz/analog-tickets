import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AdminButton,
  AdminInput,
  AdminLabel,
  AdminTextarea,
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminCardTitle,
  AdminSelect,
  AdminSelectItem,
  AdminBadge,
  AdminTabs,
  AdminTabsContent,
  AdminTabsList,
  AdminTabsTrigger,
  AdminDialog,
  AdminDialogContent,
  AdminDialogDescription,
  AdminDialogFooter,
  AdminDialogHeader,
  AdminDialogTitle,
  AdminConfirmDialog,
} from "@/components/admin";
import { EmailPreviewModal } from "@/components/admin/EmailPreviewModal";
import { toast } from "sonner";
import { Loader2, Plus, Minus, Send, Package, Clock, CheckCircle2, XCircle, RefreshCw, Trash2, ExternalLink, CalendarIcon, RotateCcw, Mail, Home, Copy, Link } from "lucide-react";
import { format, addDays } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface OfferItem {
  item_type: "ticket" | "lodging" | "addon";
  ticket_type?: string;
  lodging_inventory_id?: string;
  accommodation_unit_id?: string;
  addon_inventory_id?: string;
  zone_key?: string;
  quantity: number;
  unit_price: number;
  name?: string;
}

interface CustomOfferItem {
  id: string;
  item_type: string;
  ticket_type?: string;
  zone_key?: string;
  lodging_inventory_id?: string;
  accommodation_unit_id?: string;
  quantity: number;
  unit_price: number;
}

interface CustomOffer {
  id: string;
  recipient_email: string;
  recipient_name: string | null;
  custom_message: string | null;
  discount_type: string;
  discount_value: number;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  status: string;
  offer_token: string;
  expires_at: string;
  created_at: string;
  accepted_at?: string | null;
  registration_id?: string | null;
  event_details?: { title: string };
  custom_offer_items?: CustomOfferItem[];
  // New fields for lodging offers
  offer_type?: string;
  max_redemptions?: number;
  redemptions_used?: number;
  allowed_ticket_types?: string[];
  requires_existing_ticket?: boolean;
  notes?: string;
}

export default function CustomOfferManager({ eventId }: { eventId: string }) {
  const [activeTab, setActiveTab] = useState("create");
  const [loading, setLoading] = useState(false);
  const [offers, setOffers] = useState<CustomOffer[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(true);

  // Form state
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [discountType, setDiscountType] = useState<"none" | "percentage" | "fixed">("none");
  const [discountValue, setDiscountValue] = useState(0);
  const [expirationDate, setExpirationDate] = useState<Date>(addDays(new Date(), 7));
  const [items, setItems] = useState<OfferItem[]>([]);
  
  // New lodging offer fields
  const [offerType, setOfferType] = useState<"standard" | "lodging_only" | "ticket_plus_lodging">("standard");
  const [maxRedemptions, setMaxRedemptions] = useState(1);
  const [requiresExistingTicket, setRequiresExistingTicket] = useState(false);
  const [offerNotes, setOfferNotes] = useState("");
  
  // Resend offer state
  const [resendDialogOpen, setResendDialogOpen] = useState(false);
  const [resendingOffer, setResendingOffer] = useState<CustomOffer | null>(null);
  const [resendExpirationDate, setResendExpirationDate] = useState<Date>(addDays(new Date(), 7));
  const [resending, setResending] = useState(false);

  // Details modal state (for accepted offers + add-ons)
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsOffer, setDetailsOffer] = useState<CustomOffer | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsRegistration, setDetailsRegistration] = useState<any | null>(null);
  const [detailsAddons, setDetailsAddons] = useState<any[]>([]);

  // Manage tab status filter
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "accepted" | "approved" | "expired" | "cancelled">("all");

  // Confirmation dialog state for status actions
  const [confirmAction, setConfirmAction] = useState<{
    offer: CustomOffer;
    type: "approve" | "cancel-pending" | "cancel-accepted";
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Inventory data
  const [ticketInventory, setTicketInventory] = useState<any[]>([]);
  const [lodgingInventory, setLodgingInventory] = useState<any[]>([]);
  const [specificLodgingUnits, setSpecificLodgingUnits] = useState<any[]>([]);
  const [addonInventory, setAddonInventory] = useState<any[]>([]);

  // Get ticket price from inventory
  const getTicketPrice = (ticketType: string): number => {
    const ticket = ticketInventory.find(t => t.ticket_type === ticketType);
    return ticket?.price || 0;
  };

  // Format ticket type for display
  const formatTicketType = (ticket: any): string => {
    if (ticket.display_name) return ticket.display_name;
    return ticket.ticket_type.split("_").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  };

  useEffect(() => {
    fetchInventory();
    fetchOffers();
  }, [eventId]);

  const fetchInventory = async () => {
    // Source of truth for ticket pricing/labels = ticket_types (live).
    // We still join with ticket_inventory to surface remaining availability.
    const [typesRes, invRes, zonesRes, addonRes, unitsRes] = await Promise.all([
      supabase
        .from("ticket_types")
        .select("key, label, price, is_active, sort_order, event_id")
        .eq("is_active", true)
        .or(`event_id.eq.${eventId},event_id.is.null`)
        .order("sort_order", { ascending: true }),
      supabase
        .from("ticket_inventory")
        .select("ticket_type, total_quantity, sold_quantity")
        .eq("event_id", eventId),
      supabase
        .from("accommodation_zones")
        .select("*")
        .eq("is_publicly_available", true)
        .order("night_price", { ascending: true }),
      supabase
        .from("addon_inventory")
        .select("*")
        .eq("event_id", eventId)
        .eq("is_active", true),
      supabase
        .from("accommodation_units")
        .select("id, unit_name, product_type, zone_key, bed_configuration, sleeps_max, has_loft, night_price, inventory_status, is_family_style"),
    ]);

    // Tally unit statuses per zone for richer inventory display
    const heldByZone = new Map<string, number>();
    const reservedByZone = new Map<string, number>();
    ((unitsRes as any)?.data || []).forEach((u: any) => {
      if (u.inventory_status === "held") heldByZone.set(u.zone_key, (heldByZone.get(u.zone_key) || 0) + 1);
      if (u.inventory_status === "reserved") reservedByZone.set(u.zone_key, (reservedByZone.get(u.zone_key) || 0) + 1);
    });

    // Merge: shape each entry like the legacy ticket_inventory row so downstream code is unchanged.
    const invByType = new Map<string, { total_quantity: number; sold_quantity: number }>();
    (invRes.data || []).forEach((row: any) => {
      invByType.set(row.ticket_type, {
        total_quantity: row.total_quantity ?? 0,
        sold_quantity: row.sold_quantity ?? 0,
      });
    });

    const merged = (typesRes.data || []).map((t: any) => {
      const inv = invByType.get(t.key);
      return {
        id: t.key,
        ticket_type: t.key,
        display_name: t.label,
        price: t.price ?? 0,
        total_quantity: inv?.total_quantity ?? 0,
        sold_quantity: inv?.sold_quantity ?? 0,
      };
    });

    setTicketInventory(merged);
    setLodgingInventory((zonesRes.data || []).map((z: any) => ({
      ...z,
      held_count: heldByZone.get(z.zone_key) || 0,
      reserved_count: reservedByZone.get(z.zone_key) || 0,
    })));
    setSpecificLodgingUnits(((unitsRes as any)?.data || []).filter((u: any) => u.is_family_style && u.inventory_status === "available"));
    setAddonInventory(addonRes.data || []);
  };

  const fetchOffers = async () => {
    setLoadingOffers(true);
    const { data, error } = await supabase
      .from("custom_offers")
      .select("*, event_details(title), custom_offer_items(*)")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });

    if (!error) {
      setOffers(data || []);
    }
    setLoadingOffers(false);
  };

  const addTicketItem = (ticketType: string) => {
    const existing = items.find((i) => i.item_type === "ticket" && i.ticket_type === ticketType);
    if (existing) {
      setItems(
        items.map((i) =>
          i.item_type === "ticket" && i.ticket_type === ticketType
            ? { ...i, quantity: i.quantity + 1 }
            : i
        )
      );
    } else {
      const ticket = ticketInventory.find(t => t.ticket_type === ticketType);
      setItems([
        ...items,
        {
          item_type: "ticket",
          ticket_type: ticketType,
          quantity: 1,
          unit_price: getTicketPrice(ticketType),
          name: formatTicketType(ticket || { ticket_type: ticketType }),
        },
      ]);
    }
  };

  const addLodgingItem = (zone: any) => {
    const existing = items.find((i) => i.zone_key === zone.zone_key);
    if (existing) {
      setItems(
        items.map((i) =>
          i.zone_key === zone.zone_key ? { ...i, quantity: i.quantity + 1 } : i
        )
      );
    } else {
      setItems([
        ...items,
        {
          item_type: "lodging",
          zone_key: zone.zone_key,
          quantity: 1,
          unit_price: zone.night_price * 2,
          name: zone.zone_name,
        },
      ]);
    }
  };

  const addSpecificLodgingUnit = (unit: any) => {
    const existing = items.find((i) => i.accommodation_unit_id === unit.id);
    if (existing) return;

    const zone = lodgingInventory.find((z: any) => z.zone_key === unit.zone_key);
    const unitLabel = `${unit.product_type === "cabin" ? "Cabin" : "Tent"} ${unit.unit_name}`;

    setItems([
      ...items,
      {
        item_type: "lodging",
        accommodation_unit_id: unit.id,
        zone_key: unit.zone_key,
        quantity: 1,
        unit_price: unit.night_price * 2,
        name: `${unitLabel} — ${unit.bed_configuration}${zone?.zone_name ? ` (${zone.zone_name})` : ""}`,
      },
    ]);
  };

  const addAddonItem = (addon: any) => {
    const existing = items.find((i) => i.addon_inventory_id === addon.id);
    if (existing) {
      setItems(
        items.map((i) =>
          i.addon_inventory_id === addon.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      );
    } else {
      setItems([
        ...items,
        {
          item_type: "addon",
          addon_inventory_id: addon.id,
          quantity: 1,
          unit_price: addon.price,
          name: addon.display_name,
        },
      ]);
    }
  };

  const updateItemQuantity = (index: number, delta: number) => {
    setItems(
      items
        .map((item, i) => {
          if (i !== index) return item;
          const nextQuantity = Math.max(0, item.quantity + delta);
          return { ...item, quantity: item.accommodation_unit_id ? Math.min(1, nextQuantity) : nextQuantity };
        })
        .filter((item) => item.quantity > 0)
    );
  };

  const calculateTotals = () => {
    const subtotal = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
    let discountAmount = 0;
    if (discountType === "percentage" && discountValue > 0) {
      discountAmount = Math.round(subtotal * (discountValue / 100));
    } else if (discountType === "fixed" && discountValue > 0) {
      discountAmount = discountValue * 100; // Convert to cents
    }
    const total = Math.max(0, subtotal - discountAmount);
    return { subtotal, discountAmount, total };
  };

  const handleCreateOffer = async () => {
    if (!recipientEmail.trim()) {
      toast.error("Recipient email is required");
      return;
    }
    if (items.length === 0) {
      toast.error("Add at least one item to the offer");
      return;
    }
    const unboundLodging = items.find(
      (i) =>
        i.item_type === "lodging" &&
        !i.accommodation_unit_id &&
        !i.zone_key &&
        !i.lodging_inventory_id,
    );
    if (unboundLodging) {
      toast.error(
        `"${unboundLodging.name || "Lodging"}" has no tent/cabin or zone selected. Pick one before sending.`,
      );
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-custom-offer", {
        body: {
          event_id: eventId,
          recipient_email: recipientEmail.trim(),
          recipient_name: recipientName.trim() || null,
          custom_message: customMessage.trim() || null,
          discount_type: discountType,
          discount_value: discountType === "fixed" ? discountValue * 100 : discountValue,
          expires_at: expirationDate.toISOString(),
          // New lodging offer fields
          offer_type: offerType,
          max_redemptions: maxRedemptions,
          requires_existing_ticket: requiresExistingTicket,
          notes: offerNotes.trim() || null,
          items: items.map((item) => ({
            item_type: item.item_type,
            ticket_type: item.ticket_type,
            lodging_inventory_id: item.lodging_inventory_id,
            accommodation_unit_id: item.accommodation_unit_id,
            addon_inventory_id: item.addon_inventory_id,
            zone_key: item.zone_key,
            quantity: item.quantity,
            unit_price: item.unit_price,
          })),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Custom offer created and sent!");
      
      // Reset form
      setRecipientEmail("");
      setRecipientName("");
      setCustomMessage("");
      setDiscountType("none");
      setDiscountValue(0);
      setExpirationDate(addDays(new Date(), 7));
      setItems([]);
      setOfferType("standard");
      setMaxRedemptions(1);
      setRequiresExistingTicket(false);
      setOfferNotes("");
      
      // Refresh offers and inventory
      fetchOffers();
      fetchInventory();
      setActiveTab("manage");
    } catch (error: any) {
      toast.error(error.message || "Failed to create offer");
    } finally {
      setLoading(false);
    }
  };

  const logOfferAuditAction = async (
    offer: CustomOffer,
    action: string,
    oldStatus: string,
    newStatus: string,
    extraMetadata: Record<string, unknown> = {}
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.rpc("log_admin_action", {
        p_admin_user_id: user?.id ?? null,
        p_admin_email: user?.email ?? null,
        p_action: action,
        p_entity_type: "custom_offer",
        p_entity_id: offer.id,
        p_entity_name: offer.recipient_name || offer.recipient_email,
        p_old_value: { status: oldStatus } as any,
        p_new_value: { status: newStatus } as any,
        p_metadata: {
          recipient_email: offer.recipient_email,
          total_amount: offer.total_amount,
          registration_id: offer.registration_id ?? null,
          ...extraMetadata,
        } as any,
      });
    } catch (e) {
      console.warn("Failed to write admin audit log", e);
    }
  };

  const handleCancelOffer = async (offerId: string) => {
    try {
      // Get offer items first
      const { data: offer } = await supabase
        .from("custom_offers")
        .select("*, custom_offer_items(*)")
        .eq("id", offerId)
        .single();

      if (!offer) throw new Error("Offer not found");

      // Release inventory for each item
      for (const item of offer.custom_offer_items || []) {
        if (item.item_type === "ticket" && item.ticket_type) {
          const { data: inventory } = await supabase
            .from("ticket_inventory")
            .select("sold_quantity")
            .eq("ticket_type", item.ticket_type)
            .eq("event_id", eventId)
            .single();

          if (inventory) {
            await supabase
              .from("ticket_inventory")
              .update({ sold_quantity: Math.max(0, inventory.sold_quantity - item.quantity) })
              .eq("ticket_type", item.ticket_type)
              .eq("event_id", eventId);
          }
        }

        if (item.item_type === "lodging" && (item as any).zone_key) {
          // Release zone inventory
          const zoneKey = (item as any).zone_key;
          await supabase.rpc("increment_zone_inventory", { 
            p_zone_key: zoneKey, 
            p_quantity: item.quantity 
          });
        } else if (item.item_type === "lodging" && item.lodging_inventory_id) {
          // Legacy: lodging_inventory based
          const { data: lodging } = await supabase
            .from("lodging_inventory")
            .select("sold_quantity")
            .eq("id", item.lodging_inventory_id)
            .single();

          if (lodging) {
            await supabase
              .from("lodging_inventory")
              .update({ sold_quantity: Math.max(0, lodging.sold_quantity - item.quantity) })
              .eq("id", item.lodging_inventory_id);
          }
        }

        if (item.item_type === "addon" && item.addon_inventory_id) {
          const { data: addon } = await supabase
            .from("addon_inventory")
            .select("sold_quantity")
            .eq("id", item.addon_inventory_id)
            .single();

          if (addon) {
            await supabase
              .from("addon_inventory")
              .update({ sold_quantity: Math.max(0, addon.sold_quantity - item.quantity) })
              .eq("id", item.addon_inventory_id);
          }
        }
      }

      // Update offer status
      const previousStatus = (offer as any).status as string;
      await supabase
        .from("custom_offers")
        .update({ status: "cancelled" })
        .eq("id", offerId);

      await logOfferAuditAction(
        offer as unknown as CustomOffer,
        "cancel_offer",
        previousStatus,
        "cancelled",
        { released_inventory: true }
      );

      toast.success("Offer cancelled and inventory released");
      fetchOffers();
      fetchInventory();
    } catch (error: any) {
      toast.error(error.message || "Failed to cancel offer");
    }
  };

  const handleApproveAcceptedOffer = async (offer: CustomOffer) => {
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("custom_offers")
        .update({ status: "approved" })
        .eq("id", offer.id);
      if (error) throw error;

      await logOfferAuditAction(offer, "approve_offer", offer.status, "approved");

      toast.success("Offer approved");
      setConfirmAction(null);
      fetchOffers();
    } catch (error: any) {
      toast.error(error.message || "Failed to approve offer");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelAcceptedOffer = async (offer: CustomOffer) => {
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("custom_offers")
        .update({ status: "cancelled" })
        .eq("id", offer.id);
      if (error) throw error;

      await logOfferAuditAction(
        offer,
        "cancel_accepted_offer",
        offer.status,
        "cancelled",
        { note: "Status flipped on accepted offer; inventory NOT auto-released (registration may exist)." }
      );

      toast.success("Accepted offer marked cancelled");
      setConfirmAction(null);
      fetchOffers();
    } catch (error: any) {
      toast.error(error.message || "Failed to cancel offer");
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenResendDialog = (offer: CustomOffer) => {
    setResendingOffer(offer);
    setResendExpirationDate(addDays(new Date(), 7));
    setResendDialogOpen(true);
  };

  const handleResendOffer = async () => {
    if (!resendingOffer) return;
    
    setResending(true);
    try {
      const { data, error } = await supabase.functions.invoke("resend-custom-offer", {
        body: {
          offer_id: resendingOffer.id,
          new_expires_at: resendExpirationDate.toISOString(),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Offer resent with extended expiration!");
      setResendDialogOpen(false);
      setResendingOffer(null);
      fetchOffers();
    } catch (error: any) {
      toast.error(error.message || "Failed to resend offer");
    } finally {
      setResending(false);
    }
  };

  const { subtotal, discountAmount, total } = calculateTotals();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <AdminBadge intent="warning"><Clock className="h-3 w-3 mr-1" />Pending</AdminBadge>;
      case "accepted":
        return <AdminBadge intent="success"><CheckCircle2 className="h-3 w-3 mr-1" />Accepted</AdminBadge>;
      case "approved":
        return <AdminBadge intent="success"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</AdminBadge>;
      case "expired":
        return <AdminBadge intent="neutral"><XCircle className="h-3 w-3 mr-1" />Expired</AdminBadge>;
      case "cancelled":
        return <AdminBadge intent="danger"><XCircle className="h-3 w-3 mr-1" />Cancelled</AdminBadge>;
      default:
        return <AdminBadge intent="neutral">{status}</AdminBadge>;
    }
  };

  // Helper to get item display name for email preview
  const getItemDisplayName = (item: CustomOfferItem): string => {
    if (item.ticket_type) {
      const ticket = ticketInventory.find(t => t.ticket_type === item.ticket_type);
      return formatTicketType(ticket || { ticket_type: item.ticket_type });
    }
    return item.item_type;
  };

  // Prepare offer items for email preview
  const getOfferItemsForPreview = (offer: CustomOffer) => {
    return (offer.custom_offer_items || []).map(item => ({
      name: getItemDisplayName(item),
      quantity: item.quantity,
      unitPrice: item.unit_price
    }));
  };

  // Open the details modal — fetches the resulting registration and any add-ons
  const handleOpenDetails = async (offer: CustomOffer) => {
    setDetailsOffer(offer);
    setDetailsOpen(true);
    setDetailsRegistration(null);
    setDetailsAddons([]);

    if (!offer.registration_id) return;

    setDetailsLoading(true);
    try {
      const [regRes, addonRes] = await Promise.all([
        supabase
          .from("registrations")
          .select("id, name, email, ticket_type, quantity, total_amount, payment_status, order_number, created_at")
          .eq("id", offer.registration_id)
          .maybeSingle(),
        supabase
          .from("addon_purchases")
          .select("id, purchase_type, quantity, unit_price, total_amount, payment_status, created_at, addon_inventory(display_name)")
          .eq("registration_id", offer.registration_id)
          .order("created_at", { ascending: true }),
      ]);

      setDetailsRegistration(regRes.data || null);
      setDetailsAddons(addonRes.data || []);
    } catch (err: any) {
      toast.error("Failed to load offer details");
      console.error(err);
    } finally {
      setDetailsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminTabs value={activeTab} onValueChange={setActiveTab}>
        <AdminTabsList>
          <AdminTabsTrigger value="create">Create Offer</AdminTabsTrigger>
          <AdminTabsTrigger value="manage">Manage Offers ({offers.filter((o) => o.status === "pending").length} pending · {offers.filter((o) => o.status === "accepted").length} accepted)</AdminTabsTrigger>
        </AdminTabsList>

        <AdminTabsContent value="create" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Left column - Item selection */}
            <div className="space-y-4">
              <AdminCard>
                <AdminCardHeader>
                  <AdminCardTitle>Add Tickets</AdminCardTitle>
                </AdminCardHeader>
                <AdminCardContent className="space-y-2">
                  {ticketInventory.map((ticket) => {
                    const available = ticket.total_quantity - ticket.sold_quantity;
                    return (
                      <div key={ticket.id} className="flex items-center justify-between p-3 bg-[hsl(var(--admin-surface-hover))] rounded-lg">
                        <div>
                          <p className="font-medium">
                            {formatTicketType(ticket)}
                          </p>
                          <p className="text-sm text-[hsl(var(--admin-text-muted))]">
                            {ticket.price > 0 ? `$${(ticket.price / 100).toFixed(0)}` : "No price set"} · {available} available
                          </p>
                        </div>
                        <AdminButton
                          size="sm"
                          variant="adminOutline"
                          onClick={() => addTicketItem(ticket.ticket_type)}
                          disabled={available <= 0 || ticket.price === 0}
                        >
                          <Plus className="h-4 w-4" />
                        </AdminButton>
                      </div>
                    );
                  })}
                </AdminCardContent>
              </AdminCard>

              <AdminCard>
                <AdminCardHeader>
                  <AdminCardTitle>Add Lodging</AdminCardTitle>
                </AdminCardHeader>
                <AdminCardContent className="space-y-2">
                  {lodgingInventory.map((zone: any) => (
                    <div key={zone.zone_key} className="flex items-center justify-between p-3 bg-[hsl(var(--admin-surface-hover))] rounded-lg">
                      <div>
                        <p className="font-medium">{zone.zone_name}</p>
                        <p className="text-sm text-[hsl(var(--admin-text-muted))]">
                          ${(zone.night_price * 2 / 100).toFixed(0)} (2 nights) · {zone.inventory_available} available
                          {zone.held_count > 0 && <span> · {zone.held_count} on hold</span>}
                          {zone.reserved_count > 0 && <span> · {zone.reserved_count} reserved</span>}
                        </p>
                      </div>
                      <AdminButton
                        size="sm"
                        variant="adminOutline"
                        onClick={() => addLodgingItem(zone)}
                        disabled={zone.inventory_available <= 0}
                      >
                        <Plus className="h-4 w-4" />
                      </AdminButton>
                    </div>
                  ))}
                  {lodgingInventory.length === 0 && (
                    <p className="text-sm text-[hsl(var(--admin-text-muted))]">No lodging available</p>
                  )}
                  {specificLodgingUnits.length > 0 && (
                    <div className="pt-3 mt-3 border-t border-[hsl(var(--admin-border))] space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Specific rooms</p>
                      {specificLodgingUnits.map((unit: any) => {
                        const zone = lodgingInventory.find((z: any) => z.zone_key === unit.zone_key);
                        const alreadyAdded = items.some((i) => i.accommodation_unit_id === unit.id);
                        return (
                          <div key={unit.id} className="flex items-center justify-between p-3 bg-[hsl(var(--admin-surface-hover))] rounded-lg">
                            <div>
                              <p className="font-medium">{unit.product_type === "cabin" ? "Cabin" : "Tent"} {unit.unit_name} — {unit.bed_configuration}</p>
                              <p className="text-sm text-[hsl(var(--admin-text-muted))]">
                                ${(unit.night_price * 2 / 100).toFixed(0)} (2 nights) · {zone?.zone_name || unit.zone_key}
                              </p>
                            </div>
                            <AdminButton
                              size="sm"
                              variant="adminOutline"
                              onClick={() => addSpecificLodgingUnit(unit)}
                              disabled={alreadyAdded}
                            >
                              <Plus className="h-4 w-4" />
                            </AdminButton>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </AdminCardContent>
              </AdminCard>

              <AdminCard>
                <AdminCardHeader>
                  <AdminCardTitle>Add Add-ons</AdminCardTitle>
                </AdminCardHeader>
                <AdminCardContent className="space-y-2">
                  {addonInventory.map((addon) => {
                    const available = addon.total_quantity - addon.sold_quantity;
                    return (
                      <div key={addon.id} className="flex items-center justify-between p-3 bg-[hsl(var(--admin-surface-hover))] rounded-lg">
                        <div>
                          <p className="font-medium">{addon.display_name}</p>
                          <p className="text-sm text-[hsl(var(--admin-text-muted))]">
                            ${(addon.price / 100).toFixed(0)} · {available} available
                          </p>
                        </div>
                        <AdminButton
                          size="sm"
                          variant="adminOutline"
                          onClick={() => addAddonItem(addon)}
                          disabled={available <= 0}
                        >
                          <Plus className="h-4 w-4" />
                        </AdminButton>
                      </div>
                    );
                  })}
                  {addonInventory.length === 0 && (
                    <p className="text-sm text-[hsl(var(--admin-text-muted))]">No add-ons available</p>
                  )}
                </AdminCardContent>
              </AdminCard>
            </div>

            {/* Right column - Order summary and recipient */}
            <div className="space-y-4">
              <AdminCard>
                <AdminCardHeader>
                  <AdminCardTitle>Package Summary</AdminCardTitle>
                </AdminCardHeader>
                <AdminCardContent className="space-y-4">
                  {items.length === 0 ? (
                    <p className="text-sm text-[hsl(var(--admin-text-muted))] text-center py-4">
                      Add items from the left to build the package
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {items.map((item, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-[hsl(var(--admin-surface-hover))] rounded-lg">
                          <div>
                            <p className="font-medium">{item.name}</p>
                            <p className="text-sm text-[hsl(var(--admin-text-muted))]">
                              ${(item.unit_price / 100).toFixed(0)} × {item.quantity}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">${((item.unit_price * item.quantity) / 100).toFixed(0)}</span>
                            <div className="flex items-center gap-1">
                              <AdminButton size="icon" variant="adminGhost" className="h-8 w-8" onClick={() => updateItemQuantity(index, -1)}>
                                <Minus className="h-4 w-4" />
                              </AdminButton>
                              <span className="w-8 text-center">{item.quantity}</span>
                              <AdminButton size="icon" variant="adminGhost" className="h-8 w-8" onClick={() => updateItemQuantity(index, 1)}>
                                <Plus className="h-4 w-4" />
                              </AdminButton>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="border-t border-[hsl(var(--admin-border))] pt-4 space-y-2">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span>${(subtotal / 100).toFixed(2)}</span>
                    </div>
                    
                    <div className="flex gap-2">
                      <AdminSelect value={discountType} onValueChange={(v: any) => setDiscountType(v)}>
                        <AdminSelectItem value="none">No Discount</AdminSelectItem>
                        <AdminSelectItem value="percentage">% Off</AdminSelectItem>
                        <AdminSelectItem value="fixed">$ Off</AdminSelectItem>
                      </AdminSelect>
                      {discountType !== "none" && (
                        <AdminInput
                          type="number"
                          min={0}
                          max={discountType === "percentage" ? 100 : undefined}
                          value={discountValue}
                          onChange={(e) => setDiscountValue(Number(e.target.value))}
                          className="w-24"
                          placeholder={discountType === "percentage" ? "%" : "$"}
                        />
                      )}
                    </div>

                    {discountAmount > 0 && (
                      <div className="flex justify-between text-[hsl(var(--admin-success))]">
                        <span>Discount</span>
                        <span>-${(discountAmount / 100).toFixed(2)}</span>
                      </div>
                    )}

                    <div className="flex justify-between font-bold text-lg border-t border-[hsl(var(--admin-border))] pt-2">
                      <span>Total</span>
                      <span>${(total / 100).toFixed(2)}</span>
                    </div>
                  </div>
                </AdminCardContent>
              </AdminCard>

              {/* Offer Type Configuration */}
              <AdminCard>
                <AdminCardHeader>
                  <div className="flex items-center gap-2">
                    <Home className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                    <AdminCardTitle>Offer Type</AdminCardTitle>
                  </div>
                </AdminCardHeader>
                <AdminCardContent className="space-y-4">
                  <div className="space-y-2">
                    <AdminLabel>Type</AdminLabel>
                    <AdminSelect value={offerType} onValueChange={(v: any) => setOfferType(v)}>
                      <AdminSelectItem value="standard">Standard (Ticket Package)</AdminSelectItem>
                      <AdminSelectItem value="lodging_only">Lodging Only (Invite Access)</AdminSelectItem>
                      <AdminSelectItem value="ticket_plus_lodging">Ticket + Lodging Package</AdminSelectItem>
                    </AdminSelect>
                  </div>

                  {offerType !== "standard" && (
                    <>
                      <div className="p-3 rounded-lg border border-[hsl(var(--admin-warning)/0.3)] bg-[hsl(var(--admin-warning)/0.1)]">
                        <p className="text-xs text-[hsl(var(--admin-warning))]">
                          <strong>Lodging Offer:</strong> This unlocks lodging access globally for the recipient.
                        </p>
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <AdminLabel>Requires Existing Ticket</AdminLabel>
                          <p className="text-xs text-[hsl(var(--admin-text-muted))]">
                            Recipient must already have a ticket
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={requiresExistingTicket}
                          onChange={(e) => setRequiresExistingTicket(e.target.checked)}
                          className="h-4 w-4 rounded border-[hsl(var(--admin-border))]"
                        />
                      </div>

                      <div className="space-y-2">
                        <AdminLabel>Max Redemptions</AdminLabel>
                        <AdminInput
                          type="number"
                          min={1}
                          value={maxRedemptions}
                          onChange={(e) => setMaxRedemptions(parseInt(e.target.value) || 1)}
                        />
                        <p className="text-xs text-[hsl(var(--admin-text-muted))]">
                          How many times this offer can be used
                        </p>
                      </div>
                    </>
                  )}

                  <div className="space-y-2">
                    <AdminLabel>Internal Notes</AdminLabel>
                    <AdminTextarea
                      value={offerNotes}
                      onChange={(e) => setOfferNotes(e.target.value)}
                      placeholder="Notes about this offer (internal only)..."
                      rows={2}
                    />
                  </div>
                </AdminCardContent>
              </AdminCard>

              <AdminCard>
                <AdminCardHeader>
                  <AdminCardTitle>Recipient Details</AdminCardTitle>
                </AdminCardHeader>
                <AdminCardContent className="space-y-4">
                  <div className="space-y-2">
                    <AdminLabel htmlFor="email">Email *</AdminLabel>
                    <AdminInput
                      id="email"
                      type="email"
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      placeholder="guest@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <AdminLabel htmlFor="name">Name (optional)</AdminLabel>
                    <AdminInput
                      id="name"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      placeholder="Guest name"
                    />
                  </div>
                  <div className="space-y-2">
                    <AdminLabel htmlFor="message">Personal Message (optional)</AdminLabel>
                    <AdminTextarea
                      id="message"
                      value={customMessage}
                      onChange={(e) => setCustomMessage(e.target.value)}
                      placeholder="Great meeting you at the event!"
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <AdminLabel>Offer Expiration Date</AdminLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <AdminButton
                          variant="adminOutline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !expirationDate && "text-[hsl(var(--admin-text-muted))]"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {expirationDate ? format(expirationDate, "PPP") : "Select expiration date"}
                        </AdminButton>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={expirationDate}
                          onSelect={(date) => date && setExpirationDate(date)}
                          disabled={(date) => date < new Date()}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <p className="text-xs text-[hsl(var(--admin-text-muted))]">
                      Default: 7 days from today
                    </p>
                  </div>
                </AdminCardContent>
              </AdminCard>

              <AdminButton
                className="w-full"
                variant="admin"
                size="lg"
                onClick={handleCreateOffer}
                disabled={loading || items.length === 0 || !recipientEmail.trim()}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Offer...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Create & Send Offer
                  </>
                )}
              </AdminButton>
              <p className="text-xs text-[hsl(var(--admin-text-muted))] text-center">
                Offer expires in 7 days. Inventory will be reserved until then.
              </p>
            </div>
          </div>
        </AdminTabsContent>

        <AdminTabsContent value="manage">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="flex flex-wrap gap-2">
              {([
                { key: "all", label: "All" },
                { key: "pending", label: "Pending" },
                { key: "accepted", label: "Accepted" },
                { key: "expired", label: "Expired" },
                { key: "cancelled", label: "Cancelled" },
              ] as const).map((opt) => {
                const count = opt.key === "all" ? offers.length : offers.filter((o) => o.status === opt.key).length;
                return (
                  <AdminButton
                    key={opt.key}
                    size="sm"
                    variant={statusFilter === opt.key ? "admin" : "adminOutline"}
                    onClick={() => setStatusFilter(opt.key)}
                  >
                    {opt.label} ({count})
                  </AdminButton>
                );
              })}
            </div>
            <AdminButton variant="adminOutline" size="sm" onClick={fetchOffers}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </AdminButton>
          </div>

          {loadingOffers ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--admin-text-muted))]" />
            </div>
          ) : offers.length === 0 ? (
            <AdminCard>
              <AdminCardContent className="py-12 text-center">
                <Package className="h-12 w-12 mx-auto text-[hsl(var(--admin-text-muted))] mb-4" />
                <h3 className="font-semibold text-lg mb-2">No custom offers yet</h3>
                <p className="text-[hsl(var(--admin-text-muted))]">Create your first custom package offer above.</p>
              </AdminCardContent>
            </AdminCard>
          ) : (
            <div className="space-y-4">
              {offers
                .filter((o) => statusFilter === "all" || o.status === statusFilter)
                .map((offer) => (
                <AdminCard key={offer.id}>
                  <AdminCardContent className="p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          {getStatusBadge(offer.status)}
                          {offer.offer_type && offer.offer_type !== "standard" && (
                            <AdminBadge intent="info">
                              <Home className="h-3 w-3 mr-1" />
                              {offer.offer_type === "lodging_only" ? "Lodging Only" : "Ticket + Lodging"}
                            </AdminBadge>
                          )}
                          <span className="text-sm text-[hsl(var(--admin-text-muted))]">
                            Created {format(new Date(offer.created_at), "MMM d, yyyy")}
                          </span>
                        </div>
                        <h3 className="font-semibold">{offer.recipient_email}</h3>
                        {offer.recipient_name && (
                          <p className="text-sm text-[hsl(var(--admin-text-muted))]">{offer.recipient_name}</p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
                          <span>
                            <strong>${(offer.total_amount / 100).toFixed(0)}</strong>
                            {offer.discount_amount > 0 && (
                              <span className="text-[hsl(var(--admin-success))] ml-1">
                                (${(offer.discount_amount / 100).toFixed(0)} off)
                              </span>
                            )}
                          </span>
                          {offer.max_redemptions && offer.max_redemptions > 1 && (
                            <span className="text-[hsl(var(--admin-text-muted))]">
                              {offer.redemptions_used || 0}/{offer.max_redemptions} used
                            </span>
                          )}
                          {offer.status === "pending" && (
                            <span className="text-[hsl(var(--admin-warning))]">
                              Expires {format(new Date(offer.expires_at), "MMM d")}
                            </span>
                          )}
                          {offer.status === "expired" && (
                            <span className="text-[hsl(var(--admin-text-muted))]">
                              Expired {format(new Date(offer.expires_at), "MMM d")}
                            </span>
                          )}
                        </div>
                        {/* Offer URL with copy button */}
                        {offer.status === "pending" && (
                          <div className="mt-3 flex items-center gap-2">
                            <code className="text-xs bg-[hsl(var(--admin-surface-hover))] px-2 py-1 rounded flex-1 truncate">
                              {offer.offer_type === "lodging_only" 
                                ? `${window.location.origin}/offer/lodging?code=${offer.offer_token}`
                                : offer.offer_type === "ticket_plus_lodging"
                                ? `${window.location.origin}/offer/package?code=${offer.offer_token}`
                                : `${window.location.origin}/offer/${offer.offer_token}`
                              }
                            </code>
                            <AdminButton
                              size="sm"
                              variant="adminGhost"
                              onClick={(e) => {
                                e.stopPropagation();
                                const url = offer.offer_type === "lodging_only" 
                                  ? `${window.location.origin}/offer/lodging?code=${offer.offer_token}`
                                  : offer.offer_type === "ticket_plus_lodging"
                                  ? `${window.location.origin}/offer/package?code=${offer.offer_token}`
                                  : `${window.location.origin}/offer/${offer.offer_token}`;
                                navigator.clipboard.writeText(url);
                                toast.success("Offer URL copied!");
                              }}
                            >
                              <Copy className="h-3 w-3" />
                            </AdminButton>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <EmailPreviewModal
                          type="custom_offer"
                          name={offer.recipient_name || offer.recipient_email.split('@')[0]}
                          email={offer.recipient_email}
                          items={getOfferItemsForPreview(offer)}
                          subtotal={offer.subtotal}
                          discountAmount={offer.discount_amount}
                          totalAmount={offer.total_amount}
                          expiresAt={offer.expires_at}
                          customMessage={offer.custom_message || undefined}
                          trigger={
                            <AdminButton variant="adminGhost" size="icon" title="Preview Offer Email">
                              <Mail className="h-4 w-4" />
                            </AdminButton>
                          }
                        />
                        <AdminButton
                          size="sm"
                          variant="adminOutline"
                          onClick={() => handleOpenDetails(offer)}
                          title="View what was offered & accepted"
                        >
                          <Package className="h-4 w-4 mr-1" />
                          Details
                        </AdminButton>
                        {offer.status === "expired" && (
                          <AdminButton
                            size="sm"
                            variant="adminOutline"
                            onClick={() => handleOpenResendDialog(offer)}
                          >
                            <RotateCcw className="h-4 w-4 mr-1" />
                            Resend
                          </AdminButton>
                        )}
                        {offer.status === "pending" && (
                          <>
                            <AdminButton
                              size="sm"
                              variant="adminOutline"
                              onClick={() => handleOpenResendDialog(offer)}
                            >
                              <RotateCcw className="h-4 w-4 mr-1" />
                              Extend
                            </AdminButton>
                            <AdminButton
                              size="sm"
                              variant="adminOutline"
                              onClick={() => window.open(`/offer/${offer.offer_token}`, "_blank")}
                            >
                              <ExternalLink className="h-4 w-4 mr-1" />
                              View
                            </AdminButton>
                            <AdminButton
                              size="sm"
                              variant="adminDestructive"
                              onClick={() => setConfirmAction({ offer, type: "cancel-pending" })}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Cancel
                            </AdminButton>
                          </>
                        )}
                        {offer.status === "accepted" && (
                          <AdminButton
                            size="sm"
                            variant="adminDestructive"
                            onClick={() => setConfirmAction({ offer, type: "cancel-accepted" })}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Cancel
                          </AdminButton>
                        )}
                      </div>
                    </div>
                  </AdminCardContent>
                </AdminCard>
              ))}
            </div>
          )}
        </AdminTabsContent>
      </AdminTabs>

      {/* Resend Offer Dialog */}
      <AdminDialog open={resendDialogOpen} onOpenChange={setResendDialogOpen}>
        <AdminDialogContent>
          <AdminDialogHeader>
            <AdminDialogTitle>
              {resendingOffer?.status === "expired" ? "Resend Expired Offer" : "Extend Offer Expiration"}
            </AdminDialogTitle>
            <AdminDialogDescription>
              {resendingOffer?.status === "expired" 
                ? "Set a new expiration date and resend the offer email to the recipient."
                : "Update the expiration date and send a reminder email to the recipient."
              }
            </AdminDialogDescription>
          </AdminDialogHeader>
          
          {resendingOffer && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <AdminLabel className="text-sm text-[hsl(var(--admin-text-muted))]">Recipient</AdminLabel>
                <p className="font-medium">{resendingOffer.recipient_email}</p>
                {resendingOffer.recipient_name && (
                  <p className="text-sm text-[hsl(var(--admin-text-muted))]">{resendingOffer.recipient_name}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <AdminLabel className="text-sm text-[hsl(var(--admin-text-muted))]">Current Expiration</AdminLabel>
                <p className="font-medium">{format(new Date(resendingOffer.expires_at), "PPP")}</p>
              </div>
              
              <div className="space-y-2">
                <AdminLabel>New Expiration Date</AdminLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <AdminButton
                      variant="adminOutline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !resendExpirationDate && "text-[hsl(var(--admin-text-muted))]"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {resendExpirationDate ? format(resendExpirationDate, "PPP") : "Select date"}
                    </AdminButton>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={resendExpirationDate}
                      onSelect={(date) => date && setResendExpirationDate(date)}
                      disabled={(date) => date < new Date()}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}
          
          <AdminDialogFooter>
            <AdminButton variant="adminOutline" onClick={() => setResendDialogOpen(false)}>
              Cancel
            </AdminButton>
            <AdminButton variant="admin" onClick={handleResendOffer} disabled={resending}>
              {resending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  {resendingOffer?.status === "expired" ? "Resend Offer" : "Extend & Notify"}
                </>
              )}
            </AdminButton>
          </AdminDialogFooter>
        </AdminDialogContent>
      </AdminDialog>

      {/* Offer Details Dialog */}
      <AdminDialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <AdminDialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
          <AdminDialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-[hsl(var(--admin-border))]">
            <AdminDialogTitle>Offer Details</AdminDialogTitle>
            <AdminDialogDescription>
              {detailsOffer?.recipient_email}
              {detailsOffer?.recipient_name ? ` · ${detailsOffer.recipient_name}` : ""}
            </AdminDialogDescription>
          </AdminDialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {detailsOffer && (
              <>
                {/* Status & timestamps */}
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  {getStatusBadge(detailsOffer.status)}
                  <span className="text-[hsl(var(--admin-text-muted))]">
                    Created {format(new Date(detailsOffer.created_at), "MMM d, yyyy")}
                  </span>
                  {detailsOffer.accepted_at && (
                    <span className="text-[hsl(var(--admin-success))]">
                      Accepted {format(new Date(detailsOffer.accepted_at), "MMM d, yyyy 'at' p")}
                    </span>
                  )}
                </div>

                {/* What was offered */}
                <div>
                  <h4 className="font-semibold mb-2">What was offered</h4>
                  {(detailsOffer.custom_offer_items || []).length === 0 ? (
                    <p className="text-sm text-[hsl(var(--admin-text-muted))]">No line items recorded.</p>
                  ) : (
                    <div className="space-y-2">
                      {(detailsOffer.custom_offer_items || []).map((item) => (
                        <div
                          key={item.id}
                          className="flex justify-between items-start p-3 bg-[hsl(var(--admin-surface-hover))] rounded-lg text-sm"
                        >
                          <div>
                            <p className="font-medium">{getItemDisplayName(item)}</p>
                            <p className="text-xs text-[hsl(var(--admin-text-muted))] capitalize">
                              {item.item_type} · qty {item.quantity}
                            </p>
                          </div>
                          <p className="font-medium">
                            ${((item.unit_price * item.quantity) / 100).toFixed(2)}
                          </p>
                        </div>
                      ))}
                      <div className="flex justify-between text-sm pt-2 border-t border-[hsl(var(--admin-border))]">
                        <span className="text-[hsl(var(--admin-text-muted))]">Subtotal</span>
                        <span>${(detailsOffer.subtotal / 100).toFixed(2)}</span>
                      </div>
                      {detailsOffer.discount_amount > 0 && (
                        <div className="flex justify-between text-sm text-[hsl(var(--admin-success))]">
                          <span>Discount</span>
                          <span>-${(detailsOffer.discount_amount / 100).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-semibold">
                        <span>Offer total</span>
                        <span>${(detailsOffer.total_amount / 100).toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Resulting registration */}
                {detailsOffer.status === "accepted" && (
                  <div>
                    <h4 className="font-semibold mb-2">Registration</h4>
                    {detailsLoading ? (
                      <div className="flex items-center gap-2 text-sm text-[hsl(var(--admin-text-muted))]">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                      </div>
                    ) : !detailsOffer.registration_id ? (
                      <p className="text-sm text-[hsl(var(--admin-text-muted))]">
                        No linked registration on this offer.
                      </p>
                    ) : !detailsRegistration ? (
                      <p className="text-sm text-[hsl(var(--admin-warning))]">
                        Registration {detailsOffer.registration_id} not found.
                      </p>
                    ) : (
                      <div className="p-3 bg-[hsl(var(--admin-surface-hover))] rounded-lg text-sm space-y-1">
                        <div className="flex justify-between">
                          <span className="font-medium">{detailsRegistration.name}</span>
                          <span className="text-[hsl(var(--admin-text-muted))]">
                            {detailsRegistration.order_number || detailsRegistration.id.slice(0, 8)}
                          </span>
                        </div>
                        <p className="text-[hsl(var(--admin-text-muted))]">{detailsRegistration.email}</p>
                        <p>
                          {detailsRegistration.ticket_type} · qty {detailsRegistration.quantity} ·{" "}
                          <span className="capitalize">{detailsRegistration.payment_status}</span>
                        </p>
                        <p className="font-medium">
                          Total ${(detailsRegistration.total_amount / 100).toFixed(2)}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Add-ons attached to the registration */}
                {detailsOffer.status === "accepted" && detailsOffer.registration_id && (
                  <div>
                    <h4 className="font-semibold mb-2">
                      Add-ons {detailsAddons.length > 0 && `(${detailsAddons.length})`}
                    </h4>
                    {detailsLoading ? (
                      <div className="flex items-center gap-2 text-sm text-[hsl(var(--admin-text-muted))]">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                      </div>
                    ) : detailsAddons.length === 0 ? (
                      <p className="text-sm text-[hsl(var(--admin-text-muted))]">
                        No add-ons purchased on this registration.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {detailsAddons.map((a) => (
                          <div
                            key={a.id}
                            className="flex justify-between items-start p-3 bg-[hsl(var(--admin-surface-hover))] rounded-lg text-sm"
                          >
                            <div>
                              <p className="font-medium">
                                {a.addon_inventory?.display_name || a.purchase_type}
                              </p>
                              <p className="text-xs text-[hsl(var(--admin-text-muted))]">
                                qty {a.quantity} · ${(a.unit_price / 100).toFixed(2)} ea ·{" "}
                                <span className="capitalize">{a.payment_status}</span>
                              </p>
                            </div>
                            <p className="font-medium">${(a.total_amount / 100).toFixed(2)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <AdminDialogFooter className="shrink-0 px-6 py-4 border-t border-[hsl(var(--admin-border))]">
            {detailsOffer?.registration_id && (
              <AdminButton
                variant="adminOutline"
                onClick={() =>
                  window.open(`/admin/tickets?search=${detailsOffer.registration_id}`, "_blank")
                }
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open registration
              </AdminButton>
            )}
            <AdminButton variant="admin" onClick={() => setDetailsOpen(false)}>
              Close
            </AdminButton>
          </AdminDialogFooter>
        </AdminDialogContent>
      </AdminDialog>

      {/* Confirmation dialog for status actions */}
      <AdminConfirmDialog
        open={!!confirmAction}
        onOpenChange={(open) => { if (!open) setConfirmAction(null); }}
        title={
          confirmAction?.type === "approve"
            ? "Approve accepted offer?"
            : confirmAction?.type === "cancel-accepted"
            ? "Cancel accepted offer?"
            : "Cancel pending offer?"
        }
        description={
          confirmAction?.type === "approve"
            ? `Mark this offer for ${confirmAction.offer.recipient_name || confirmAction.offer.recipient_email} as approved. This is logged to the admin audit trail.`
            : confirmAction?.type === "cancel-accepted"
            ? `Flip status to cancelled for ${confirmAction.offer.recipient_name || confirmAction.offer.recipient_email}. The linked registration (if any) is NOT modified — handle refunds separately.`
            : `Cancel this offer and release reserved inventory.`
        }
        consequences={
          confirmAction?.type === "cancel-accepted"
            ? [
                "Inventory will NOT be auto-released",
                "Any existing registration remains active",
                "Action is logged to the admin audit trail",
              ]
            : confirmAction?.type === "cancel-pending"
            ? ["Reserved inventory will be released", "Recipient link stops working", "Action is logged to the admin audit trail"]
            : ["Action is logged to the admin audit trail"]
        }
        actionType={confirmAction?.type === "approve" ? "warning" : "destructive"}
        actionLabel={confirmAction?.type === "approve" ? "Approve" : "Confirm cancel"}
        icon={confirmAction?.type === "approve" ? "warning" : "ban"}
        isLoading={actionLoading}
        onConfirm={() => {
          if (!confirmAction) return;
          if (confirmAction.type === "approve") {
            handleApproveAcceptedOffer(confirmAction.offer);
          } else if (confirmAction.type === "cancel-accepted") {
            handleCancelAcceptedOffer(confirmAction.offer);
          } else {
            handleCancelOffer(confirmAction.offer.id);
            setConfirmAction(null);
          }
        }}
      />
    </div>
  );
}