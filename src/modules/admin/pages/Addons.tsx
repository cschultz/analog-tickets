import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { useAdminEvent } from "@/hooks/useAdminEvent";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminButton, AdminInput, AdminTabs, AdminTabsList, AdminTabsTrigger, AdminBadge, AdminTable, AdminTableBody, AdminTableCell, AdminTableHead, AdminTableHeader, AdminTableRow } from "@/components/admin/AdminUI";
import { AdminCard } from "@/components/admin/AdminCard";
import { Package, Download, Search, Utensils } from "lucide-react";
import { format } from "date-fns";

interface AddonRow {
  id: string;
  registration_id: string;
  inventory_id: string;
  purchaser_email: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  payment_status: string;
  purchase_type: string;
  has_dietary_restrictions: boolean;
  dietary_restrictions: string | null;
  created_at: string;
  display_name: string;
  addon_type: string;
  registration_name?: string | null;
  order_number?: string | null;
  redeemed_units: number;
}

export default function AdminAddonsPage() {
  const { selectedEventId, selectedEvent, isLoading: eventLoading } = useAdminEvent();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const { data: addons = [], isLoading } = useAuthQuery({
    queryKey: ["admin-addons", selectedEventId],
    queryFn: async () => {
      if (!selectedEventId) return [] as AddonRow[];

      const { data, error } = await supabase
        .from("addon_purchases")
        .select(`
          id, registration_id, inventory_id, purchaser_email, quantity,
          unit_price, total_amount, payment_status, purchase_type,
          has_dietary_restrictions, dietary_restrictions, created_at,
          addon_inventory!inner(event_id, display_name, addon_type),
          registrations(name, order_number),
          addon_redemptions(id)
        `)
        .eq("addon_inventory.event_id", selectedEventId)
        .eq("purchase_type", "addon")
        .in("payment_status", ["paid", "comp"])
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data || []).map((p: any) => ({
        id: p.id,
        registration_id: p.registration_id,
        inventory_id: p.inventory_id,
        purchaser_email: p.purchaser_email,
        quantity: p.quantity,
        unit_price: p.unit_price,
        total_amount: p.total_amount,
        payment_status: p.payment_status,
        purchase_type: p.purchase_type,
        has_dietary_restrictions: p.has_dietary_restrictions,
        dietary_restrictions: p.dietary_restrictions,
        created_at: p.created_at,
        display_name: p.addon_inventory?.display_name || "Unknown",
        addon_type: p.addon_inventory?.addon_type || "unknown",
        registration_name: p.registrations?.name || null,
        order_number: p.registrations?.order_number || null,
        redeemed_units: Array.isArray(p.addon_redemptions) ? p.addon_redemptions.length : 0,
      })) as AddonRow[];
    },
    enabled: !!selectedEventId,
  });

  const categories = useMemo(() => {
    const map = new Map<string, { display: string; units: number; revenue: number; orders: number }>();
    addons.forEach((a) => {
      const key = a.addon_type;
      const cur = map.get(key) || { display: a.display_name, units: 0, revenue: 0, orders: 0 };
      cur.units += a.quantity;
      cur.revenue += a.total_amount;
      cur.orders += 1;
      map.set(key, cur);
    });
    return Array.from(map.entries()).map(([key, v]) => ({ key, ...v }));
  }, [addons]);

  const totals = useMemo(() => {
    const units = addons.reduce((s, a) => s + a.quantity, 0);
    const revenue = addons.reduce((s, a) => s + a.total_amount, 0);
    const redeemed = addons.reduce((s, a) => s + a.redeemed_units, 0);
    return { units, revenue, redeemed, orders: addons.length };
  }, [addons]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return addons.filter((a) => {
      if (activeCategory !== "all" && a.addon_type !== activeCategory) return false;
      if (!term) return true;
      return (
        a.purchaser_email.toLowerCase().includes(term) ||
        (a.registration_name || "").toLowerCase().includes(term) ||
        (a.order_number || "").toLowerCase().includes(term) ||
        a.display_name.toLowerCase().includes(term)
      );
    });
  }, [addons, search, activeCategory]);

  const exportCSV = () => {
    const rows = [
      ["Order #", "Name", "Email", "Add-on", "Category", "Qty", "Redeemed", "Unit ($)", "Total ($)", "Dietary", "Purchased"],
      ...filtered.map((a) => [
        a.order_number || "",
        a.registration_name || "",
        a.purchaser_email,
        a.display_name,
        a.addon_type,
        String(a.quantity),
        `${a.redeemed_units}/${a.quantity}`,
        (a.unit_price / 100).toFixed(2),
        (a.total_amount / 100).toFixed(2),
        a.has_dietary_restrictions ? (a.dietary_restrictions || "yes") : "",
        format(new Date(a.created_at), "yyyy-MM-dd HH:mm"),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `addons-${selectedEvent?.title || "event"}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={Package}
        title="Add-ons Report"
        subtitle="Dinners, camps, and other paid add-ons by category"
        actions={
          <AdminButton variant="adminOutline" size="sm" onClick={exportCSV} disabled={filtered.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </AdminButton>
        }
      />

      {eventLoading || isLoading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[hsl(var(--admin-primary))]" />
        </div>
      ) : !selectedEventId ? (
        <p className="text-[hsl(var(--admin-text-muted))]">Please select an event</p>
      ) : (
        <>
          {/* Summary tiles */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryTile label="Total Units Sold" value={totals.units.toLocaleString()} />
            <SummaryTile label="Total Revenue" value={`$${(totals.revenue / 100).toLocaleString()}`} />
            <SummaryTile label="Orders" value={totals.orders.toLocaleString()} />
            <SummaryTile label="Redeemed" value={`${totals.redeemed} / ${totals.units}`} />
          </div>

          {/* Per-category breakdown */}
          <AdminCard className="p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-[hsl(var(--admin-border))]">
              <h3 className="text-sm font-medium text-[hsl(var(--admin-text))]">By Category</h3>
            </div>
            <AdminTable>
              <AdminTableHeader>
                <AdminTableRow>
                  <AdminTableHead>Add-on</AdminTableHead>
                  <AdminTableHead>Type Key</AdminTableHead>
                  <AdminTableHead className="text-right">Orders</AdminTableHead>
                  <AdminTableHead className="text-right">Units</AdminTableHead>
                  <AdminTableHead className="text-right">Revenue</AdminTableHead>
                </AdminTableRow>
              </AdminTableHeader>
              <AdminTableBody>
                {categories.length === 0 ? (
                  <AdminTableRow>
                    <AdminTableCell colSpan={5} className="text-center text-[hsl(var(--admin-text-muted))] py-6">
                      No add-on purchases yet.
                    </AdminTableCell>
                  </AdminTableRow>
                ) : (
                  categories.map((c) => (
                    <AdminTableRow key={c.key}>
                      <AdminTableCell className="font-medium">{c.display}</AdminTableCell>
                      <AdminTableCell>
                        <code className="text-xs text-[hsl(var(--admin-text-muted))]">{c.key}</code>
                      </AdminTableCell>
                      <AdminTableCell className="text-right">{c.orders}</AdminTableCell>
                      <AdminTableCell className="text-right">{c.units}</AdminTableCell>
                      <AdminTableCell className="text-right">${(c.revenue / 100).toLocaleString()}</AdminTableCell>
                    </AdminTableRow>
                  ))
                )}
              </AdminTableBody>
            </AdminTable>
          </AdminCard>

          {/* Filters + purchaser detail */}
          <AdminCard className="p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
              <AdminTabs value={activeCategory} onValueChange={setActiveCategory}>
                <AdminTabsList>
                  <AdminTabsTrigger value="all">All</AdminTabsTrigger>
                  {categories.map((c) => (
                    <AdminTabsTrigger key={c.key} value={c.key}>
                      {c.display} <span className="ml-1 text-[hsl(var(--admin-text-muted))]">({c.units})</span>
                    </AdminTabsTrigger>
                  ))}
                </AdminTabsList>
              </AdminTabs>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                <AdminInput
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, email, order #"
                  className="pl-9"
                />
              </div>
            </div>

            <AdminTable>
              <AdminTableHeader>
                <AdminTableRow>
                  <AdminTableHead>Purchaser</AdminTableHead>
                  <AdminTableHead>Add-on</AdminTableHead>
                  <AdminTableHead className="text-right">Qty</AdminTableHead>
                  <AdminTableHead className="text-right">Redeemed</AdminTableHead>
                  <AdminTableHead className="text-right">Total</AdminTableHead>
                  <AdminTableHead>Dietary</AdminTableHead>
                  <AdminTableHead>Order</AdminTableHead>
                  <AdminTableHead>Date</AdminTableHead>
                </AdminTableRow>
              </AdminTableHeader>
              <AdminTableBody>
                {filtered.length === 0 ? (
                  <AdminTableRow>
                    <AdminTableCell colSpan={8} className="text-center text-[hsl(var(--admin-text-muted))] py-8">
                      No matching add-on purchases.
                    </AdminTableCell>
                  </AdminTableRow>
                ) : (
                  filtered.map((a) => (
                    <AdminTableRow key={a.id}>
                      <AdminTableCell>
                        <Link
                          to={`/n/${encodeURIComponent(a.purchaser_email)}`}
                          className="hover:underline"
                        >
                          <div className="font-medium">{a.registration_name || a.purchaser_email}</div>
                          <div className="text-xs text-[hsl(var(--admin-text-muted))]">{a.purchaser_email}</div>
                        </Link>
                      </AdminTableCell>
                      <AdminTableCell>{a.display_name}</AdminTableCell>
                      <AdminTableCell className="text-right">{a.quantity}</AdminTableCell>
                      <AdminTableCell className="text-right">
                        <AdminBadge intent={a.redeemed_units >= a.quantity ? "success" : a.redeemed_units > 0 ? "warning" : "neutral"} size="sm">
                          {a.redeemed_units}/{a.quantity}
                        </AdminBadge>
                      </AdminTableCell>
                      <AdminTableCell className="text-right">${(a.total_amount / 100).toFixed(0)}</AdminTableCell>
                      <AdminTableCell>
                        {a.has_dietary_restrictions ? (
                          <span className="inline-flex items-center gap-1 text-xs text-[hsl(var(--admin-warning))]">
                            <Utensils className="h-3 w-3" />
                            {a.dietary_restrictions ? a.dietary_restrictions.slice(0, 40) : "Yes"}
                            {a.dietary_restrictions && a.dietary_restrictions.length > 40 ? "…" : ""}
                          </span>
                        ) : (
                          <span className="text-xs text-[hsl(var(--admin-text-muted))]">—</span>
                        )}
                      </AdminTableCell>
                      <AdminTableCell>
                        <code className="text-xs">{a.order_number || "—"}</code>
                      </AdminTableCell>
                      <AdminTableCell className="text-xs text-[hsl(var(--admin-text-muted))]">
                        {format(new Date(a.created_at), "MMM d, yyyy")}
                      </AdminTableCell>
                    </AdminTableRow>
                  ))
                )}
              </AdminTableBody>
            </AdminTable>
          </AdminCard>
        </>
      )}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <AdminCard className="p-4">
      <div className="text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-[hsl(var(--admin-text))]">{value}</div>
    </AdminCard>
  );
}
