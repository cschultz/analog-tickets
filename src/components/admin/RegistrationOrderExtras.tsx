import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { format } from "date-fns";
import { Utensils, Home, Ticket, ExternalLink } from "lucide-react";

interface Props {
  registrationId: string;
  email: string;
  ticketAmountCents?: number;
  ticketLabel?: string;
  ticketPaid?: boolean;
  registrationCreatedAt?: string;
}

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const isPaid = (s: string) => s === "paid" || s === "comp" || s === "payment_plan";

// Items created within 5 minutes of the registration are part of the original checkout
// and their amounts are already included in registration.total_amount.
const BUNDLE_WINDOW_MS = 5 * 60 * 1000;
const isBundled = (createdAt: string, regCreatedAt?: string) => {
  if (!regCreatedAt) return false;
  const diff = Math.abs(new Date(createdAt).getTime() - new Date(regCreatedAt).getTime());
  return diff <= BUNDLE_WINDOW_MS;
};

export function RegistrationOrderExtras({
  registrationId,
  email,
  ticketAmountCents = 0,
  ticketLabel,
  ticketPaid = false,
  registrationCreatedAt,
}: Props) {
  const { data: addons = [] } = useAuthQuery({
    queryKey: ["reg-addons", registrationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("addon_purchases")
        .select(`id, quantity, total_amount, payment_status, created_at, has_dietary_restrictions, dietary_restrictions, addon_inventory(display_name, addon_type)`)
        .eq("registration_id", registrationId)
        .eq("purchase_type", "addon")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!registrationId,
    staleTime: 60_000,
  });

  const { data: lodging = [] } = useAuthQuery({
    queryKey: ["reg-lodging", registrationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lodging_bookings")
        .select("id, zone_key, quantity, total_amount, payment_status, created_at")
        .eq("registration_id", registrationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!registrationId,
    staleTime: 60_000,
  });

  const ticketTotal = ticketPaid ? ticketAmountCents : 0;
  const paidAddons = addons.filter((a: any) => isPaid(a.payment_status));
  const paidLodging = lodging.filter((b: any) => isPaid(b.payment_status));
  const addonsExtra = paidAddons.filter((a: any) => !isBundled(a.created_at, registrationCreatedAt));
  const lodgingExtra = paidLodging.filter((b: any) => !isBundled(b.created_at, registrationCreatedAt));
  const addonsBundled = paidAddons.filter((a: any) => isBundled(a.created_at, registrationCreatedAt));
  const lodgingBundled = paidLodging.filter((b: any) => isBundled(b.created_at, registrationCreatedAt));
  const addonsExtraTotal = addonsExtra.reduce((s: number, a: any) => s + (a.total_amount || 0), 0);
  const lodgingExtraTotal = lodgingExtra.reduce((s: number, b: any) => s + (b.total_amount || 0), 0);
  const addonsBundledTotal = addonsBundled.reduce((s: number, a: any) => s + (a.total_amount || 0), 0);
  const lodgingBundledTotal = lodgingBundled.reduce((s: number, b: any) => s + (b.total_amount || 0), 0);
  const grandTotal = ticketTotal + addonsExtraTotal + lodgingExtraTotal;

  return (
    <div className="border-t pt-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-[hsl(var(--admin-text))]">This Order</h4>
        <Link
          to={`/n/${encodeURIComponent(email)}`}
          className="inline-flex items-center gap-1 text-xs text-[hsl(var(--admin-accent))] hover:underline"
        >
          Full customer history <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {/* Order summary */}
      <div className="rounded-md border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-hover))] p-3 space-y-2">
        <div className="text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Order Summary (paid only)</div>

        {ticketLabel && (
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-[hsl(var(--admin-text))]">
              <Ticket className="h-3.5 w-3.5 text-[hsl(var(--admin-accent))]" />
              {ticketLabel}
              {!ticketPaid && (
                <span className="text-xs text-[hsl(var(--admin-text-muted))]">(unpaid)</span>
              )}
            </span>
            <span className={ticketPaid ? "font-medium" : "text-[hsl(var(--admin-text-muted))] line-through"}>
              {fmt(ticketAmountCents)}
            </span>
          </div>
        )}

        {lodgingBundledTotal > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-[hsl(var(--admin-text-muted))]">
              <Home className="h-3.5 w-3.5 text-[hsl(var(--admin-accent))]" />
              Lodging ({lodgingBundled.length}) <span className="text-xs">• included in ticket</span>
            </span>
            <span className="text-xs italic text-[hsl(var(--admin-text-muted))]">included</span>
          </div>
        )}

        {lodgingExtraTotal > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-[hsl(var(--admin-text))]">
              <Home className="h-3.5 w-3.5 text-[hsl(var(--admin-accent))]" />
              Lodging ({lodgingExtra.length})
            </span>
            <span className="font-medium">{fmt(lodgingExtraTotal)}</span>
          </div>
        )}

        {addonsBundledTotal > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-[hsl(var(--admin-text-muted))]">
              <Utensils className="h-3.5 w-3.5 text-[hsl(var(--admin-accent))]" />
              Add-ons ({addonsBundled.length}) <span className="text-xs">• included in ticket</span>
            </span>
            <span className="text-xs italic text-[hsl(var(--admin-text-muted))]">included</span>
          </div>
        )}

        {addonsExtraTotal > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-[hsl(var(--admin-text))]">
              <Utensils className="h-3.5 w-3.5 text-[hsl(var(--admin-accent))]" />
              Add-ons ({addonsExtra.length})
            </span>
            <span className="font-medium">{fmt(addonsExtraTotal)}</span>
          </div>
        )}

        <div className="border-t border-[hsl(var(--admin-border))] pt-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-[hsl(var(--admin-text))]">Total Paid</span>
          <span className="text-base font-bold text-[hsl(var(--admin-text))]">{fmt(grandTotal)}</span>
        </div>
      </div>

      {addons.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Add-ons</div>
          {addons.map((a: any) => {
            const paid = isPaid(a.payment_status);
            return (
              <div
                key={a.id}
                className={`flex items-center justify-between p-3 rounded-md border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] ${paid ? "" : "opacity-60"}`}
              >
                <div className="flex items-start gap-3">
                  <Utensils className="h-4 w-4 mt-0.5 text-[hsl(var(--admin-accent))]" />
                  <div>
                    <div className="text-sm font-medium text-[hsl(var(--admin-text))]">
                      {a.quantity}x {a.addon_inventory?.display_name || "Add-on"}
                    </div>
                    <div className="text-xs text-[hsl(var(--admin-text-muted))]">
                      {a.payment_status} • {format(new Date(a.created_at), "MMM d, yyyy")}
                      {a.has_dietary_restrictions && a.dietary_restrictions ? ` • Dietary: ${a.dietary_restrictions}` : ""}
                    </div>
                  </div>
                </div>
                <div className={`text-sm font-semibold ${paid ? "" : "line-through"}`}>{fmt(a.total_amount)}</div>
              </div>
            );
          })}
        </div>
      )}

      {lodging.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Lodging</div>
          {lodging.map((b: any) => {
            const paid = isPaid(b.payment_status);
            return (
              <div
                key={b.id}
                className={`flex items-center justify-between p-3 rounded-md border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] ${paid ? "" : "opacity-60"}`}
              >
                <div className="flex items-start gap-3">
                  <Home className="h-4 w-4 mt-0.5 text-[hsl(var(--admin-accent))]" />
                  <div>
                    <div className="text-sm font-medium text-[hsl(var(--admin-text))]">
                      {b.quantity}x {String(b.zone_key).replace(/_/g, " ")}
                    </div>
                    <div className="text-xs text-[hsl(var(--admin-text-muted))]">
                      {b.payment_status} • {format(new Date(b.created_at), "MMM d, yyyy")}
                    </div>
                  </div>
                </div>
                <div className={`text-sm font-semibold ${paid ? "" : "line-through"}`}>{fmt(b.total_amount)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
