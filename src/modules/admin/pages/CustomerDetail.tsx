import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { AdminButton, AdminBadge, PersonAvatar, StatusPill, TagChip } from "@/components/admin";
import { Mail, Ticket, DollarSign, Calendar, TrendingUp, CheckCircle, Send, User, CalendarDays, Utensils, CreditCard, ArrowUpCircle, Home, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { formatTicketType } from "@/lib/utils";
import { IndividualEmailComposer } from "@/components/IndividualEmailComposer";
import { RecordPage, PropertyGrid, PropertyItem, RelatedRecords, ActivityTimeline } from "@/components/admin/RecordPage";
import { toast } from "sonner";
interface Registration {
  id: string;
  name: string;
  email: string;
  ticket_type: string;
  total_amount: number;
  quantity: number;
  payment_status: string;
  checked_in: boolean;
  checked_in_at: string | null;
  dietary_notes: string | null;
  plus_one_name: string | null;
  created_at: string;
  event_id: string;
}

interface Event {
  id: string;
  title: string;
  event_date: string;
}

interface UpgradeOffer {
  id: string;
  registration_id: string;
  total_amount: number;
  status: string;
  upgrade_from: string;
  upgrade_to: string;
  paid_at: string | null;
}

interface LodgingBooking {
  id: string;
  email: string;
  zone_key: string;
  quantity: number;
  total_amount: number;
  payment_status: string;
  created_at: string;
  registration_id: string | null;
}

interface AddonPurchase {
  id: string;
  registration_id: string;
  purchaser_email: string;
  quantity: number;
  total_amount: number;
  payment_status: string;
  created_at: string;
  display_name: string;
  addon_type: string;
  has_dietary_restrictions: boolean;
  dietary_restrictions: string | null;
}

interface CustomerProfile {
  email: string;
  names: string[];
  totalSpent: number;
  totalTickets: number;
  totalUpgrades: number;
  eventsAttended: string[];
  firstPurchase: Date;
  lastPurchase: Date;
  averageOrderValue: number;
  ticketTypes: Record<string, number>;
  checkInRate: number;
  dietaryNotes: string[];
  registrations: (Registration & { eventTitle: string })[];
  upgrades: UpgradeOffer[];
  lodgingBookings: LodgingBooking[];
  totalLodging: number;
  addons: AddonPurchase[];
  totalAddons: number;
}

export default function CustomerDetailPage() {
  const { email } = useParams<{ email: string }>();
  const navigate = useNavigate();
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [sendingLodgingInvite, setSendingLodgingInvite] = useState(false);
  const decodedEmail = email ? decodeURIComponent(email) : "";

  // Auth-gated query for registrations
  const { data: registrations = [], isLoading: regLoading } = useAuthQuery({
    queryKey: ["customer-registrations", decodedEmail],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registrations")
        .select("*")
        .ilike("email", decodedEmail)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Registration[];
    },
    enabled: !!decodedEmail,
    staleTime: 60 * 1000,
  });

  // Auth-gated query for events
  const { data: events = [] } = useAuthQuery({
    queryKey: ["customer-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_details")
        .select("id, title, event_date");
      if (error) throw error;
      return data as Event[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Auth-gated query for upgrades (depends on registrations)
  const registrationIds = useMemo(() => registrations.map(r => r.id), [registrations]);
  
  const { data: upgrades = [] } = useAuthQuery({
    queryKey: ["customer-upgrades", registrationIds],
    queryFn: async () => {
      if (registrationIds.length === 0) return [];
      const { data, error } = await supabase
        .from("upgrade_offers")
        .select("*")
        .in("registration_id", registrationIds)
        .eq("status", "paid");
      if (error) throw error;
      return data as UpgradeOffer[];
    },
    enabled: registrationIds.length > 0,
    staleTime: 60 * 1000,
  });

  // Auth-gated query for lodging bookings
  const { data: lodgingBookings = [] } = useAuthQuery({
    queryKey: ["customer-lodging", decodedEmail],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lodging_bookings")
        .select("*")
        .ilike("email", decodedEmail)
        .eq("payment_status", "paid")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as LodgingBooking[];
    },
    enabled: !!decodedEmail,
    staleTime: 60 * 1000,
  });

  // Add-on purchases for this customer
  const { data: addonPurchases = [] } = useAuthQuery({
    queryKey: ["customer-addons", decodedEmail],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("addon_purchases")
        .select(`
          id, registration_id, purchaser_email, quantity, total_amount,
          payment_status, created_at, has_dietary_restrictions, dietary_restrictions,
          addon_inventory(display_name, addon_type)
        `)
        .ilike("purchaser_email", decodedEmail)
        .eq("purchase_type", "addon")
        .in("payment_status", ["paid", "comp"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((p: any) => ({
        id: p.id,
        registration_id: p.registration_id,
        purchaser_email: p.purchaser_email,
        quantity: p.quantity,
        total_amount: p.total_amount,
        payment_status: p.payment_status,
        created_at: p.created_at,
        has_dietary_restrictions: p.has_dietary_restrictions,
        dietary_restrictions: p.dietary_restrictions,
        display_name: p.addon_inventory?.display_name || "Add-on",
        addon_type: p.addon_inventory?.addon_type || "unknown",
      })) as AddonPurchase[];
    },
    enabled: !!decodedEmail,
    staleTime: 60 * 1000,
  });

  const loading = regLoading;

  const eventMap = useMemo(() => {
    const map: Record<string, Event> = {};
    events.forEach(e => map[e.id] = e);
    return map;
  }, [events]);

  const customerProfile = useMemo<CustomerProfile | null>(() => {
    if (registrations.length === 0 && lodgingBookings.length === 0 && addonPurchases.length === 0) return null;

    const profile: CustomerProfile = {
      email: decodedEmail,
      names: [],
      totalSpent: 0,
      totalTickets: 0,
      totalUpgrades: 0,
      totalLodging: 0,
      eventsAttended: [],
      firstPurchase: new Date(registrations[registrations.length - 1]?.created_at || new Date()),
      lastPurchase: new Date(registrations[0]?.created_at || new Date()),
      averageOrderValue: 0,
      ticketTypes: {},
      checkInRate: 0,
      dietaryNotes: [],
      registrations: [],
      upgrades: [],
      lodgingBookings: [],
      addons: [],
      totalAddons: 0,
    };

    registrations.forEach(reg => {
      if (!profile.names.includes(reg.name)) {
        profile.names.push(reg.name);
      }

      if (reg.payment_status === "paid") {
        profile.totalSpent += reg.total_amount;
        profile.totalTickets += reg.quantity;
      }

      const eventTitle = eventMap[reg.event_id]?.title || "Unknown Event";
      if (!profile.eventsAttended.includes(eventTitle)) {
        profile.eventsAttended.push(eventTitle);
      }

      const regDate = new Date(reg.created_at);
      if (regDate < profile.firstPurchase) profile.firstPurchase = regDate;
      if (regDate > profile.lastPurchase) profile.lastPurchase = regDate;

      profile.ticketTypes[reg.ticket_type] = (profile.ticketTypes[reg.ticket_type] || 0) + reg.quantity;

      if (reg.dietary_notes && !profile.dietaryNotes.includes(reg.dietary_notes)) {
        profile.dietaryNotes.push(reg.dietary_notes);
      }

      profile.registrations.push({ ...reg, eventTitle });
    });

    upgrades.forEach(upgrade => {
      profile.upgrades.push(upgrade);
      profile.totalUpgrades += upgrade.total_amount;
      profile.totalSpent += upgrade.total_amount;
    });

    // Process lodging bookings
    lodgingBookings.forEach(booking => {
      profile.lodgingBookings.push(booking);
      profile.totalLodging += booking.total_amount;
      profile.totalSpent += booking.total_amount;

      const bookingDate = new Date(booking.created_at);
      if (bookingDate < profile.firstPurchase) profile.firstPurchase = bookingDate;
      if (bookingDate > profile.lastPurchase) profile.lastPurchase = bookingDate;
    });

    // Process add-on purchases
    addonPurchases.forEach(addon => {
      profile.addons.push(addon);
      profile.totalAddons += addon.total_amount;
      profile.totalSpent += addon.total_amount;

      const d = new Date(addon.created_at);
      if (d < profile.firstPurchase) profile.firstPurchase = d;
      if (d > profile.lastPurchase) profile.lastPurchase = d;
    });

    const paidRegistrations = profile.registrations.filter(r => r.payment_status === "paid");
    const orderCount = paidRegistrations.length + profile.upgrades.length + profile.lodgingBookings.length + profile.addons.length;
    profile.averageOrderValue = orderCount > 0 ? profile.totalSpent / orderCount : 0;
    
    const checkedIn = paidRegistrations.filter(r => r.checked_in).length;
    profile.checkInRate = paidRegistrations.length > 0 ? (checkedIn / paidRegistrations.length) * 100 : 0;

    return profile;
  }, [registrations, events, upgrades, lodgingBookings, addonPurchases, eventMap, decodedEmail]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[hsl(var(--admin-accent))]"></div>
      </div>
    );
  }

  if (!customerProfile) {
    return (
      <div className="space-y-6">
        <AdminButton variant="ghost" onClick={() => navigate("/admin/customers")} className="gap-2">
          Back to Customers
        </AdminButton>
        <div className="p-8 text-center border border-[hsl(var(--admin-border))] rounded-lg bg-[hsl(var(--admin-surface))]">
          <p className="text-[hsl(var(--admin-text-secondary))]">Customer not found</p>
        </div>
      </div>
    );
  }

  // Check if customer is eligible for lodging invite (has VIP/Crew, no lodging yet)
  const eligibleVipCrewTypes = [
    "tier_1_vip_3day", "tier_1_krewe_3day", "vip_3day", "krewe_3day",
    "early_bird_vip_3day", "early_bird_krewe_3day", "vip_3_day", "krewe_3_day"
  ];
  const hasEligibleTicket = customerProfile.registrations.some(
    reg => reg.payment_status === "paid" && eligibleVipCrewTypes.includes(reg.ticket_type)
  );
  const hasLodging = customerProfile.lodgingBookings.length > 0;
  const canSendLodgingInvite = hasEligibleTicket && !hasLodging;

  // Get the registration ID of the VIP/Crew ticket for linking
  const eligibleRegistration = customerProfile.registrations.find(
    reg => reg.payment_status === "paid" && eligibleVipCrewTypes.includes(reg.ticket_type)
  );

  const handleSendLodgingInvite = async () => {
    if (!customerProfile) return;
    
    setSendingLodgingInvite(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-direct-lodging-invite", {
        body: {
          email: customerProfile.email,
          name: customerProfile.names[0] || undefined,
          registration_id: eligibleRegistration?.id || undefined,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`Lodging invite sent to ${customerProfile.email}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to send lodging invite");
    } finally {
      setSendingLodgingInvite(false);
    }
  };

  // Build activity timeline from registrations, upgrades, and lodging
  const activityItems = [
    ...customerProfile.registrations.map(reg => ({
      id: reg.id,
      type: "created" as const,
      title: `Purchased ${reg.quantity}x ${formatTicketType(reg.ticket_type)}`,
      description: `${reg.eventTitle} • $${(reg.total_amount / 100).toFixed(0)}`,
      timestamp: new Date(reg.created_at),
      icon: <Ticket className="h-4 w-4" />,
    })),
    ...customerProfile.upgrades.map(upgrade => ({
      id: upgrade.id,
      type: "updated" as const,
      title: `Upgraded ticket`,
      description: `${upgrade.upgrade_from.replace(/_/g, " ")} → ${upgrade.upgrade_to.replace(/_/g, " ")}`,
      timestamp: new Date(upgrade.paid_at || new Date()),
      icon: <ArrowUpCircle className="h-4 w-4" />,
    })),
    ...customerProfile.lodgingBookings.map(booking => ({
      id: booking.id,
      type: "created" as const,
      title: `Booked ${booking.quantity}x ${booking.zone_key.replace(/_/g, " ")}`,
      description: `Lodging • $${(booking.total_amount / 100).toFixed(0)}`,
      timestamp: new Date(booking.created_at),
      icon: <Home className="h-4 w-4" />,
    })),
    ...customerProfile.addons.map(addon => ({
      id: addon.id,
      type: "created" as const,
      title: `Add-on: ${addon.quantity}x ${addon.display_name}`,
      description: `${addon.addon_type} • $${(addon.total_amount / 100).toFixed(0)}`,
      timestamp: new Date(addon.created_at),
      icon: <Utensils className="h-4 w-4" />,
    })),
  ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  // Sidebar content
  const sidebarContent = (
    <div className="space-y-6">
      {/* Quick stats */}
      <div className="p-4 rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))]">
        <h4 className="text-sm font-medium text-[hsl(var(--admin-text))] mb-4">Quick Stats</h4>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[hsl(var(--admin-text-secondary))]">
              <DollarSign className="h-4 w-4" />
              <span className="text-sm">Lifetime Value</span>
            </div>
            <span className="font-semibold text-[hsl(var(--admin-text))]">
              ${(customerProfile.totalSpent / 100).toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[hsl(var(--admin-text-secondary))]">
              <Ticket className="h-4 w-4" />
              <span className="text-sm">Total Tickets</span>
            </div>
            <span className="font-semibold text-[hsl(var(--admin-text))]">
              {customerProfile.totalTickets}
            </span>
          </div>
          {customerProfile.totalLodging > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[hsl(var(--admin-text-secondary))]">
                <Home className="h-4 w-4" />
                <span className="text-sm">Lodging</span>
              </div>
              <span className="font-semibold text-[hsl(var(--admin-text))]">
                ${(customerProfile.totalLodging / 100).toLocaleString()}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[hsl(var(--admin-text-secondary))]">
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm">Avg Order Value</span>
            </div>
            <span className="font-semibold text-[hsl(var(--admin-text))]">
              ${(customerProfile.averageOrderValue / 100).toFixed(0)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[hsl(var(--admin-text-secondary))]">
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm">Check-In Rate</span>
            </div>
            <span className="font-semibold text-[hsl(var(--admin-text))]">
              {customerProfile.checkInRate.toFixed(0)}%
            </span>
          </div>
        </div>
      </div>

      {/* Dietary Notes */}
      {customerProfile.dietaryNotes.length > 0 && (
        <div className="p-4 rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))]">
          <h4 className="text-sm font-medium text-[hsl(var(--admin-text))] mb-3 flex items-center gap-2">
            <Utensils className="h-4 w-4" />
            Dietary Notes
          </h4>
          <ul className="space-y-1.5">
            {customerProfile.dietaryNotes.map((note, i) => (
              <li key={i} className="text-sm text-[hsl(var(--admin-text-secondary))]">• {note}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  return (
    <>
      <RecordPage
        title={customerProfile.names.join(" / ")}
        subtitle={customerProfile.email}
        backPath="/admin/customers"
        backLabel="Customers"
        headerActions={
          <div className="flex items-center gap-2">
            <AdminButton variant="admin" onClick={() => setEmailDialogOpen(true)}>
              <Send className="h-4 w-4 mr-2" />
              Send Email
            </AdminButton>
            {canSendLodgingInvite && (
              <AdminButton 
                variant="adminOutline" 
                onClick={handleSendLodgingInvite}
                disabled={sendingLodgingInvite}
              >
                {sendingLodgingInvite ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Home className="h-4 w-4 mr-2" />
                )}
                {sendingLodgingInvite ? "Sending..." : "Send Lodging Invite"}
              </AdminButton>
            )}
          </div>
        }
        properties={
          <PropertyGrid columns={3}>
            <PropertyItem label="First Purchase">
              <span className="text-sm">{format(customerProfile.firstPurchase, "MMM d, yyyy")}</span>
            </PropertyItem>
            <PropertyItem label="Last Purchase">
              <span className="text-sm">{format(customerProfile.lastPurchase, "MMM d, yyyy")}</span>
            </PropertyItem>
            <PropertyItem label="Events">
              <div className="flex flex-wrap gap-1.5">
                {customerProfile.eventsAttended.map((event, i) => (
                  <TagChip key={i} label={event} color="blue" />
                ))}
              </div>
            </PropertyItem>
            <PropertyItem label="Ticket Types">
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(customerProfile.ticketTypes).map(([type, count]) => (
                  <TagChip key={type} label={`${formatTicketType(type)}: ${count}`} />
                ))}
              </div>
            </PropertyItem>
          </PropertyGrid>
        }
        tabs={[
          {
            id: "orders",
            label: "Orders",
            count: customerProfile.registrations.length + customerProfile.upgrades.length + customerProfile.lodgingBookings.length + customerProfile.addons.length,
            content: (
              <div className="space-y-4">
                {/* Registrations */}
                <div className="space-y-3">
                  {customerProfile.registrations.map((reg) => (
                    <div 
                      key={reg.id} 
                      className="flex items-center justify-between p-4 rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] hover:border-[hsl(var(--admin-border-hover))] transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-lg bg-[hsl(var(--admin-accent-subtle))] flex items-center justify-center">
                          <Ticket className="h-5 w-5 text-[hsl(var(--admin-accent))]" />
                        </div>
                        <div>
                          <div className="font-medium text-[hsl(var(--admin-text))]">{reg.eventTitle}</div>
                          <div className="text-sm text-[hsl(var(--admin-text-secondary))] mt-0.5">
                            {reg.quantity}x {formatTicketType(reg.ticket_type)} • {format(new Date(reg.created_at), "MMM d, yyyy")}
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex items-center gap-3">
                        <div>
                          <div className="font-semibold text-[hsl(var(--admin-text))]">
                            ${(reg.total_amount / 100).toFixed(0)}
                          </div>
                        </div>
                        <StatusPill status={reg.payment_status as any} size="sm" />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Upgrades */}
                {customerProfile.upgrades.length > 0 && (
                  <>
                    <h4 className="text-sm font-medium text-[hsl(var(--admin-text-secondary))] mt-6 mb-3">Upgrades</h4>
                    <div className="space-y-3">
                      {customerProfile.upgrades.map((upgrade) => (
                        <div 
                          key={upgrade.id} 
                          className="flex items-center justify-between p-4 rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))]"
                        >
                          <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-lg bg-[hsl(var(--admin-success))]/10 flex items-center justify-center">
                              <ArrowUpCircle className="h-5 w-5 text-[hsl(var(--admin-success))]" />
                            </div>
                            <div>
                              <div className="font-medium text-[hsl(var(--admin-text))]">
                                {formatTicketType(upgrade.upgrade_from)} → {formatTicketType(upgrade.upgrade_to)}
                              </div>
                              <div className="text-sm text-[hsl(var(--admin-text-secondary))] mt-0.5">
                                {upgrade.paid_at ? format(new Date(upgrade.paid_at), "MMM d, yyyy") : "Pending"}
                              </div>
                            </div>
                          </div>
                          <div className="font-semibold text-[hsl(var(--admin-text))]">
                            ${(upgrade.total_amount / 100).toFixed(0)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Lodging Bookings */}
                {customerProfile.lodgingBookings.length > 0 && (
                  <>
                    <h4 className="text-sm font-medium text-[hsl(var(--admin-text-secondary))] mt-6 mb-3">Lodging</h4>
                    <div className="space-y-3">
                      {customerProfile.lodgingBookings.map((booking) => (
                        <div 
                          key={booking.id} 
                          className="flex items-center justify-between p-4 rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))]"
                        >
                          <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-lg bg-[hsl(var(--admin-accent-subtle))] flex items-center justify-center">
                              <Home className="h-5 w-5 text-[hsl(var(--admin-accent))]" />
                            </div>
                            <div>
                              <div className="font-medium text-[hsl(var(--admin-text))]">
                                {booking.zone_key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                              </div>
                              <div className="text-sm text-[hsl(var(--admin-text-secondary))] mt-0.5">
                                {booking.quantity}x • {format(new Date(booking.created_at), "MMM d, yyyy")}
                              </div>
                            </div>
                          </div>
                          <div className="font-semibold text-[hsl(var(--admin-text))]">
                            ${(booking.total_amount / 100).toFixed(0)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Add-ons */}
                {customerProfile.addons.length > 0 && (
                  <>
                    <h4 className="text-sm font-medium text-[hsl(var(--admin-text-secondary))] mt-6 mb-3">Add-ons</h4>
                    <div className="space-y-3">
                      {customerProfile.addons.map((addon) => (
                        <div 
                          key={addon.id} 
                          className="flex items-center justify-between p-4 rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))]"
                        >
                          <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-lg bg-[hsl(var(--admin-accent-subtle))] flex items-center justify-center">
                              <Utensils className="h-5 w-5 text-[hsl(var(--admin-accent))]" />
                            </div>
                            <div>
                              <div className="font-medium text-[hsl(var(--admin-text))]">
                                {addon.quantity}x {addon.display_name}
                              </div>
                              <div className="text-sm text-[hsl(var(--admin-text-secondary))] mt-0.5">
                                {addon.addon_type} • {format(new Date(addon.created_at), "MMM d, yyyy")}
                                {addon.has_dietary_restrictions && addon.dietary_restrictions ? ` • Dietary: ${addon.dietary_restrictions}` : ""}
                              </div>
                            </div>
                          </div>
                          <div className="font-semibold text-[hsl(var(--admin-text))]">
                            ${(addon.total_amount / 100).toFixed(0)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ),
          },
          {
            id: "activity",
            label: "Activity",
            count: activityItems.length,
            content: (
              <ActivityTimeline items={activityItems} />
            ),
          },
        ]}
        sidebar={sidebarContent}
      />

      {/* Individual Email Composer */}
      <IndividualEmailComposer
        recipientEmail={customerProfile.email}
        recipientName={customerProfile.names[0] || "Customer"}
        registrationId={customerProfile.registrations[0]?.id || ""}
        isOpen={emailDialogOpen}
        onClose={() => setEmailDialogOpen(false)}
      />
    </>
  );
}