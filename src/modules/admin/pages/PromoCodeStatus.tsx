import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Activity, ArrowLeft, Search } from "lucide-react";
import {
  AdminPageHeader,
  AdminButton,
  AdminInput,
  AdminBadge,
  AdminTable,
  AdminTableHeader,
  AdminTableBody,
  AdminTableRow,
  AdminTableHead,
  AdminTableCell,
  AdminTableEmpty,
  AdminTableLoading,
  AdminStatCard,
  AdminSelect,
  AdminSelectItem,
} from "@/components/admin";

interface PromoRow {
  id: string;
  code: string;
  description: string | null;
  is_active: boolean;
  valid_until: string | null;
  valid_from: string | null;
  current_uses: number;
  max_uses: number | null;
  is_single_use: boolean;
  recipient_name: string | null;
  recipient_email: string | null;
  source: string | null;
  discount_type: string;
  discount_value: number;
}

type StatusKey = "active" | "expiring_soon" | "expired" | "redeemed" | "exhausted" | "inactive";

type BadgeIntent = "success" | "warning" | "danger" | "neutral" | "info";

interface ResolvedStatus {
  key: StatusKey;
  label: string;
  intent: BadgeIntent;
}

function resolveStatus(c: PromoRow, now: Date): ResolvedStatus {
  if (!c.is_active) return { key: "inactive", label: "Inactive", intent: "neutral" };
  const expiry = c.valid_until ? new Date(c.valid_until) : null;
  if (expiry && expiry < now) return { key: "expired", label: "Expired", intent: "danger" };
  if (c.max_uses !== null && c.current_uses >= c.max_uses) {
    return { key: "exhausted", label: "Fully Redeemed", intent: "neutral" };
  }
  if (c.is_single_use && c.current_uses > 0) {
    return { key: "redeemed", label: "Redeemed", intent: "info" };
  }
  if (expiry) {
    const hoursLeft = (expiry.getTime() - now.getTime()) / 36e5;
    if (hoursLeft <= 24) return { key: "expiring_soon", label: "Expiring Soon", intent: "warning" };
  }
  return { key: "active", label: "Active", intent: "success" };
}

function formatCountdown(target: string | null, now: Date): string {
  if (!target) return "No expiry";
  const ms = new Date(target).getTime() - now.getTime();
  if (ms <= 0) {
    const past = Math.abs(ms);
    const days = Math.floor(past / 86_400_000);
    if (days >= 1) return `Expired ${days}d ago`;
    const hrs = Math.floor(past / 36e5);
    if (hrs >= 1) return `Expired ${hrs}h ago`;
    return "Expired moments ago";
  }
  const days = Math.floor(ms / 86_400_000);
  if (days >= 2) return `${days}d left`;
  const hrs = Math.floor(ms / 36e5);
  if (hrs >= 1) return `${hrs}h left`;
  const mins = Math.max(1, Math.floor(ms / 60_000));
  return `${mins}m left`;
}

function formatExpiry(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit", timeZone: "America/Los_Angeles" });
}

function formatDiscount(c: PromoRow): string {
  if (c.discount_type === "percentage") return `${Number(c.discount_value)}% off`;
  return `$${Number(c.discount_value)} off`;
}

export default function PromoCodeStatusPage() {
  const [codes, setCodes] = useState<PromoRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const fetchCodes = async () => {
      setIsLoading(true);
      const { data } = await supabase
        .from("promo_codes")
        .select(
          "id, code, description, is_active, valid_until, valid_from, current_uses, max_uses, is_single_use, recipient_name, recipient_email, source, discount_type, discount_value"
        )
        .order("valid_until", { ascending: true, nullsFirst: false });
      if (data) setCodes(data as PromoRow[]);
      setIsLoading(false);
    };
    fetchCodes();
  }, []);

  // Live countdown tick (every 30s is plenty for hour/minute precision)
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const enriched = useMemo(
    () => codes.map((c) => ({ row: c, status: resolveStatus(c, now) })),
    [codes, now]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter(({ row, status }) => {
      if (statusFilter !== "all" && status.key !== statusFilter) return false;
      if (!q) return true;
      return (
        row.code.toLowerCase().includes(q) ||
        (row.recipient_name?.toLowerCase().includes(q) ?? false) ||
        (row.recipient_email?.toLowerCase().includes(q) ?? false) ||
        (row.description?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [enriched, search, statusFilter]);

  const stats = useMemo(() => {
    const total = enriched.length;
    const active = enriched.filter((e) => e.status.key === "active").length;
    const expiringSoon = enriched.filter((e) => e.status.key === "expiring_soon").length;
    const expired = enriched.filter((e) => e.status.key === "expired").length;
    return { total, active, expiringSoon, expired };
  }, [enriched]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Promo Code Status"
        subtitle="Real-time view of every code's active state, expiry, and linked partner"
        icon={Activity}
        actions={
          <Link to="/admin/promo-codes">
            <AdminButton variant="adminOutline">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Manage Codes
            </AdminButton>
          </Link>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <AdminStatCard title="Total Codes" value={stats.total} />
        <AdminStatCard title="Active" value={stats.active} />
        <AdminStatCard title="Expiring < 24h" value={stats.expiringSoon} />
        <AdminStatCard title="Expired" value={stats.expired} />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--admin-text-secondary))]" />
          <AdminInput
            placeholder="Search by code, partner name, or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="sm:w-56">
          <AdminSelect value={statusFilter} onValueChange={setStatusFilter}>
            <AdminSelectItem value="all">All statuses</AdminSelectItem>
            <AdminSelectItem value="active">Active</AdminSelectItem>
            <AdminSelectItem value="expiring_soon">Expiring &lt; 24h</AdminSelectItem>
            <AdminSelectItem value="redeemed">Redeemed</AdminSelectItem>
            <AdminSelectItem value="exhausted">Fully Redeemed</AdminSelectItem>
            <AdminSelectItem value="expired">Expired</AdminSelectItem>
            <AdminSelectItem value="inactive">Inactive</AdminSelectItem>
          </AdminSelect>
        </div>
      </div>

      <AdminTable>
        <AdminTableHeader>
          <AdminTableRow>
            <AdminTableHead>Code</AdminTableHead>
            <AdminTableHead>Status</AdminTableHead>
            <AdminTableHead>Partner / Recipient</AdminTableHead>
            <AdminTableHead>Discount</AdminTableHead>
            <AdminTableHead>Expires</AdminTableHead>
            <AdminTableHead>Time Left</AdminTableHead>
            <AdminTableHead>Uses</AdminTableHead>
          </AdminTableRow>
        </AdminTableHeader>
        <AdminTableBody>
          {isLoading ? (
            <AdminTableLoading rows={6} cols={7} />
          ) : filtered.length === 0 ? (
            <AdminTableEmpty colSpan={7} title="No promo codes match your filters" />
          ) : (
            filtered.map(({ row, status }) => {
              const partnerName = row.recipient_name?.trim();
              const partnerEmail = row.recipient_email?.trim();
              const sourceLabel = row.source ? row.source.replace(/_/g, " ") : null;
              return (
                <AdminTableRow key={row.id}>
                  <AdminTableCell>
                    <div className="font-mono font-semibold text-[hsl(var(--admin-text-primary))]">
                      {row.code}
                    </div>
                    {row.description && (
                      <div className="text-xs text-[hsl(var(--admin-text-secondary))] mt-0.5 line-clamp-1">
                        {row.description}
                      </div>
                    )}
                  </AdminTableCell>
                  <AdminTableCell>
                    <AdminBadge intent={status.intent} showDot>{status.label}</AdminBadge>
                  </AdminTableCell>
                  <AdminTableCell>
                    {partnerName || partnerEmail ? (
                      <div>
                        {partnerName && (
                          <div className="text-sm text-[hsl(var(--admin-text-primary))]">
                            {partnerName}
                          </div>
                        )}
                        {partnerEmail && (
                          <div className="text-xs text-[hsl(var(--admin-text-secondary))]">
                            {partnerEmail}
                          </div>
                        )}
                      </div>
                    ) : sourceLabel ? (
                      <span className="text-xs text-[hsl(var(--admin-text-secondary))] capitalize">
                        {sourceLabel}
                      </span>
                    ) : (
                      <span className="text-xs text-[hsl(var(--admin-text-secondary))]">—</span>
                    )}
                  </AdminTableCell>
                  <AdminTableCell>
                    <span className="text-sm text-[hsl(var(--admin-text-primary))]">
                      {formatDiscount(row)}
                    </span>
                  </AdminTableCell>
                  <AdminTableCell>
                    <span className="text-sm text-[hsl(var(--admin-text-secondary))]">
                      {formatExpiry(row.valid_until)}
                    </span>
                  </AdminTableCell>
                  <AdminTableCell>
                    <span className="text-sm text-[hsl(var(--admin-text-primary))]">
                      {formatCountdown(row.valid_until, now)}
                    </span>
                  </AdminTableCell>
                  <AdminTableCell>
                    <span className="text-sm text-[hsl(var(--admin-text-primary))]">
                      {row.current_uses}
                      {row.max_uses !== null ? ` / ${row.max_uses}` : row.is_single_use ? " / 1" : ""}
                    </span>
                  </AdminTableCell>
                </AdminTableRow>
              );
            })
          )}
        </AdminTableBody>
      </AdminTable>
    </div>
  );
}
