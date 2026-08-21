import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminBadge } from "@/components/admin";
import { format } from "date-fns";
import { CreditCard, ArrowUpCircle, Receipt, Gift, Home, Package } from "lucide-react";
import { formatTicketType } from "@/lib/utils";

interface CompUpgradeAudit {
  old_value: {
    ticket_type?: string;
    total_amount?: number;
  } | null;
  new_value: {
    ticket_type?: string;
    total_amount?: number;
  } | null;
  created_at: string;
}

interface UpgradeOffer {
  id: string;
  total_amount: number;
  unit_upgrade_price: number;
  ticket_ids: string[];
  status: string;
  upgrade_from: string;
  upgrade_to: string;
  created_at: string;
  paid_at: string | null;
}

interface LodgingRow {
  id: string;
  zone_key: string;
  quantity: number;
  total_amount: number;
  payment_status: string;
  created_at: string;
}

interface AddonRow {
  id: string;
  quantity: number;
  total_amount: number;
  payment_status: string;
  purchase_type: string;
  created_at: string;
  inventory: { display_name: string | null; addon_type: string | null } | null;
}

interface PaymentHistoryProps {
  registrationId: string;
  originalAmount: number;
  originalTicketType: string;
  purchaseDate: string;
  /** Total comp/admin-applied discount included in originalAmount (cents). */
  compUpgradeAmount?: number;
}

export function PaymentHistory({
  registrationId,
  originalAmount,
  originalTicketType,
  purchaseDate,
  compUpgradeAmount = 0,
}: PaymentHistoryProps) {
  const [upgrades, setUpgrades] = useState<UpgradeOffer[]>([]);
  const [compAudit, setCompAudit] = useState<CompUpgradeAudit | null>(null);
  const [lodging, setLodging] = useState<LodgingRow[]>([]);
  const [addons, setAddons] = useState<AddonRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchUpgrades();
  }, [registrationId]);

  const fetchUpgrades = async () => {
    const [upgradeResult, compAuditResult, lodgingResult, addonResult] = await Promise.all([
      supabase
        .from("upgrade_offers")
        .select("*")
        .eq("registration_id", registrationId)
        .eq("status", "completed")
        .order("paid_at", { ascending: true }),
      supabase
        .from("admin_audit_logs")
        .select("old_value, new_value, created_at")
        .eq("entity_id", registrationId)
        .eq("action", "change_ticket_type_comp")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("lodging_bookings")
        .select("id, zone_key, quantity, total_amount, payment_status, created_at")
        .eq("registration_id", registrationId)
        .in("payment_status", ["paid", "completed", "comp"])
        .order("created_at", { ascending: true }),
      supabase
        .from("addon_purchases")
        .select("id, quantity, total_amount, payment_status, purchase_type, created_at, inventory:addon_inventory(display_name, addon_type)")
        .eq("registration_id", registrationId)
        .in("payment_status", ["paid", "comp"])
        .order("created_at", { ascending: true }),
    ]);

    if (!upgradeResult.error && upgradeResult.data) {
      setUpgrades(upgradeResult.data);
    }
    if (!compAuditResult.error && compAuditResult.data) {
      setCompAudit(compAuditResult.data as CompUpgradeAudit);
    }
    if (!lodgingResult.error && lodgingResult.data) {
      setLodging(lodgingResult.data as LodgingRow[]);
    }
    if (!addonResult.error && addonResult.data) {
      setAddons(addonResult.data as any);
    }
    setIsLoading(false);
  };

  const upgradeTotal = upgrades.reduce((sum, u) => sum + u.total_amount, 0);
  // Anything purchased within ~5 minutes of the original registration was bundled
  // into registration.total_amount at checkout — don't double-count it in Net Paid.
  const purchaseTs = new Date(purchaseDate).getTime();
  const isBundled = (createdAt: string) =>
    Math.abs(new Date(createdAt).getTime() - purchaseTs) < 5 * 60 * 1000;
  const lodgingBundled = lodging.filter(l => isBundled(l.created_at)).reduce((s, l) => s + (l.total_amount || 0), 0);
  const lodgingExtra = lodging.filter(l => !isBundled(l.created_at)).reduce((s, l) => s + (l.total_amount || 0), 0);
  const addonBundled = addons.filter(a => isBundled(a.created_at)).reduce((s, a) => s + (a.total_amount || 0), 0);
  const addonExtra = addons.filter(a => !isBundled(a.created_at)).reduce((s, a) => s + (a.total_amount || 0), 0);
  const lodgingTotal = lodgingBundled + lodgingExtra;
  const addonTotal = addonBundled + addonExtra;
  // What the customer actually paid out of pocket on the original purchase (sticker minus admin comp).
  const originalPurchaseTicketType = compAudit?.old_value?.ticket_type || originalTicketType;
  const currentTicketType = compAudit?.new_value?.ticket_type || originalTicketType;
  const originalPaid = Math.max(0, compAudit?.old_value?.total_amount ?? (originalAmount - compUpgradeAmount));
  // Net actually charged = original paid (already includes bundled add-ons/lodging) + later upgrades + later add-ons/lodging.
  const netCharged = originalPaid + upgradeTotal + lodgingExtra + addonExtra;
  // Sticker = full retail value of everything they're holding.
  const stickerTotal = originalAmount + upgradeTotal + lodgingExtra + addonExtra;

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-2">
        <div className="h-16 bg-muted rounded"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Receipt className="h-4 w-4" />
          Payment History
        </h3>
        <div className="text-right text-sm">
          <div>
            <span className="text-muted-foreground">Net Paid: </span>
            <span className="font-bold text-[hsl(var(--admin-success))]">${(netCharged / 100).toFixed(2)}</span>
          </div>
          {compUpgradeAmount > 0 && (
            <div className="text-xs text-muted-foreground">
              Paid ${(originalPaid / 100).toFixed(2)} + Comp ${(compUpgradeAmount / 100).toFixed(2)} = Sticker ${(stickerTotal / 100).toFixed(2)}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {/* Original Purchase — what they actually paid */}
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
          <div className="flex items-center gap-3">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Original Purchase</p>
              <p className="text-xs text-muted-foreground">
                {formatTicketType(originalPurchaseTicketType)} • {format(new Date(purchaseDate), "MMM d, yyyy")}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold">${(originalPaid / 100).toFixed(2)}</p>
            <AdminBadge intent="success" size="sm">Paid</AdminBadge>
          </div>
        </div>

        {/* Comp / Admin Upgrade (no charge) */}
        {compUpgradeAmount > 0 && (
          <div className="flex items-center justify-between p-3 rounded-lg border border-dashed bg-[hsl(var(--admin-warning)/0.08)]">
            <div className="flex items-center gap-3">
              <Gift className="h-4 w-4 text-[hsl(var(--admin-warning))]" />
              <div>
                <p className="text-sm font-medium">Admin Comp Upgrade</p>
                <p className="text-xs text-muted-foreground">
                  {formatTicketType(originalPurchaseTicketType)} → {formatTicketType(currentTicketType)} • granted at no charge
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-[hsl(var(--admin-warning))]">
                +${(compUpgradeAmount / 100).toFixed(2)}
              </p>
              <AdminBadge intent="warning" size="sm">Comp</AdminBadge>
            </div>
          </div>
        )}

        {/* New Sticker Total after comp */}
        {compUpgradeAmount > 0 && (
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-3">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">New Ticket Total</p>
                <p className="text-xs text-muted-foreground">
                  Original paid + comp value
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold">${(originalAmount / 100).toFixed(2)}</p>
              <AdminBadge intent="neutral" size="sm">Sticker</AdminBadge>
            </div>
          </div>
        )}

        {/* Upgrade Payments */}
        {upgrades.map((upgrade) => (
          <div key={upgrade.id} className="flex items-center justify-between p-3 rounded-lg border border-[hsl(var(--admin-warning)/0.3)] bg-[hsl(var(--admin-warning)/0.08)]">
            <div className="flex items-center gap-3">
              <ArrowUpCircle className="h-4 w-4 text-[hsl(var(--admin-warning))]" />
              <div>
                <p className="text-sm font-medium">Ticket Upgrade</p>
                <p className="text-xs text-muted-foreground">
                  {formatTicketType(upgrade.upgrade_from)} → {formatTicketType(upgrade.upgrade_to)} • {upgrade.ticket_ids.length} ticket{upgrade.ticket_ids.length !== 1 ? 's' : ''}
                  {upgrade.paid_at && ` • ${format(new Date(upgrade.paid_at), "MMM d, yyyy")}`}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold">${(upgrade.total_amount / 100).toFixed(2)}</p>
              <AdminBadge intent="success" size="sm">Paid</AdminBadge>
            </div>
          </div>
        ))}

        {/* Lodging Payments */}
        {lodging.map((l) => {
          const isComp = l.payment_status === "comp";
          const bundled = isBundled(l.created_at);
          return (
            <div key={l.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-3">
                <Home className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Lodging</p>
                  <p className="text-xs text-muted-foreground">
                    {formatTicketType(l.zone_key)} • {l.quantity} unit{l.quantity !== 1 ? "s" : ""} • {format(new Date(l.created_at), "MMM d, yyyy")}
                    {bundled && " • included in original purchase"}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">${(l.total_amount / 100).toFixed(2)}</p>
                <AdminBadge intent={isComp ? "warning" : bundled ? "neutral" : "success"} size="sm">
                  {isComp ? "Comp" : bundled ? "Included" : "Paid"}
                </AdminBadge>
              </div>
            </div>
          );
        })}

        {/* Add-on Payments */}
        {addons.map((a) => {
          const isComp = a.payment_status === "comp";
          const bundled = isBundled(a.created_at);
          const name = a.inventory?.display_name || formatTicketType(a.inventory?.addon_type || a.purchase_type);
          return (
            <div key={a.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-3">
                <Package className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Add-on: {name}</p>
                  <p className="text-xs text-muted-foreground">
                    Qty {a.quantity} • {format(new Date(a.created_at), "MMM d, yyyy")}
                    {bundled && " • included in original purchase"}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">${(a.total_amount / 100).toFixed(2)}</p>
                <AdminBadge intent={isComp ? "warning" : bundled ? "neutral" : "success"} size="sm">
                  {isComp ? "Comp" : bundled ? "Included" : "Paid"}
                </AdminBadge>
              </div>
            </div>
          );
        })}

        {upgrades.length === 0 && compUpgradeAmount === 0 && lodging.length === 0 && addons.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">No additional payments</p>
        )}
      </div>
    </div>
  );
}
