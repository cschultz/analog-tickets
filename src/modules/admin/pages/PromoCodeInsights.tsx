import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, ArrowLeft, Search } from "lucide-react";
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
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminCardTitle,
} from "@/components/admin";

interface PromoRow {
  id: string;
  code: string;
  description: string | null;
  is_active: boolean;
  valid_from: string | null;
  valid_until: string | null;
  current_uses: number;
  max_uses: number | null;
  is_single_use: boolean;
  source: string | null;
  discount_type: string;
  discount_value: number;
  allowed_ticket_types: string[] | null;
  recipient_name: string | null;
}

type ExpiryBucket = "expired" | "lt_24h" | "lt_7d" | "lt_30d" | "future" | "no_expiry";

function bucketExpiry(iso: string | null, now: Date): ExpiryBucket {
  if (!iso) return "no_expiry";
  const ms = new Date(iso).getTime() - now.getTime();
  if (ms <= 0) return "expired";
  const hrs = ms / 36e5;
  if (hrs < 24) return "lt_24h";
  if (hrs < 24 * 7) return "lt_7d";
  if (hrs < 24 * 30) return "lt_30d";
  return "future";
}

function expiryLabel(b: ExpiryBucket): string {
  return {
    expired: "Expired",
    lt_24h: "< 24h",
    lt_7d: "< 7 days",
    lt_30d: "< 30 days",
    future: "30+ days",
    no_expiry: "No expiry",
  }[b];
}

function expiryIntent(b: ExpiryBucket): "danger" | "warning" | "info" | "success" | "neutral" {
  if (b === "expired") return "danger";
  if (b === "lt_24h") return "warning";
  if (b === "lt_7d") return "info";
  if (b === "no_expiry") return "neutral";
  return "success";
}

function formatDiscount(c: PromoRow): string {
  return c.discount_type === "percentage" ? `${Number(c.discount_value)}%` : `$${Number(c.discount_value)}`;
}

function redemptionRate(c: PromoRow): number | null {
  const cap = c.max_uses ?? (c.is_single_use ? 1 : null);
  if (!cap) return null;
  return Math.min(100, Math.round((c.current_uses / cap) * 100));
}

function ratePill(rate: number | null): { label: string; intent: "success" | "info" | "warning" | "neutral" } {
  if (rate === null) return { label: "Unlimited", intent: "neutral" };
  if (rate >= 100) return { label: "100%", intent: "success" };
  if (rate >= 50) return { label: `${rate}%`, intent: "info" };
  if (rate > 0) return { label: `${rate}%`, intent: "warning" };
  return { label: "0%", intent: "neutral" };
}

const TICKET_TYPE_LABELS: Record<string, string> = {
  ga_2day: "GA 2-Day",
  vip_3day: "VIP 3-Day",
  saturday: "Saturday",
  friday: "Friday",
  youth_2day: "Youth 2-Day",
  youth_saturday: "Youth Sat",
};

function formatTicketRestrictions(types: string[] | null): { label: string; isAll: boolean } {
  if (!types || types.length === 0) return { label: "All ticket types", isAll: true };
  const labels = types.map((t) => TICKET_TYPE_LABELS[t] ?? t);
  return { label: labels.join(", "), isAll: false };
}

export default function PromoCodeInsightsPage() {
  const [codes, setCodes] = useState<PromoRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [expiryFilter, setExpiryFilter] = useState<string>("all");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const fetchCodes = async () => {
      setIsLoading(true);
      const { data } = await supabase
        .from("promo_codes")
        .select(
          "id, code, description, is_active, valid_from, valid_until, current_uses, max_uses, is_single_use, source, discount_type, discount_value, allowed_ticket_types, recipient_name"
        )
        .order("current_uses", { ascending: false });
      if (data) setCodes(data as PromoRow[]);
      setIsLoading(false);
    };
    fetchCodes();
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Group by campaign (source field)
  const campaignGroups = useMemo(() => {
    const groups = new Map<string, PromoRow[]>();
    for (const c of codes) {
      const key = c.source || "manual";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    }
    return Array.from(groups.entries())
      .map(([campaign, rows]) => {
        const totalUses = rows.reduce((s, r) => s + r.current_uses, 0);
        const totalCap = rows.reduce((s, r) => {
          const cap = r.max_uses ?? (r.is_single_use ? 1 : 0);
          return s + cap;
        }, 0);
        const active = rows.filter((r) => r.is_active && (!r.valid_until || new Date(r.valid_until) > now)).length;
        const rate = totalCap > 0 ? Math.round((totalUses / totalCap) * 100) : null;
        return { campaign, count: rows.length, active, totalUses, totalCap, rate };
      })
      .sort((a, b) => b.totalUses - a.totalUses);
  }, [codes, now]);

  const campaignOptions = useMemo(
    () => Array.from(new Set(codes.map((c) => c.source || "manual"))).sort(),
    [codes]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return codes.filter((c) => {
      const campaign = c.source || "manual";
      if (campaignFilter !== "all" && campaign !== campaignFilter) return false;
      if (expiryFilter !== "all" && bucketExpiry(c.valid_until, now) !== expiryFilter) return false;
      if (!q) return true;
      return (
        c.code.toLowerCase().includes(q) ||
        (c.description?.toLowerCase().includes(q) ?? false) ||
        (c.recipient_name?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [codes, search, campaignFilter, expiryFilter, now]);

  const headlineStats = useMemo(() => {
    const total = codes.length;
    const totalUses = codes.reduce((s, r) => s + r.current_uses, 0);
    const totalCap = codes.reduce(
      (s, r) => s + (r.max_uses ?? (r.is_single_use ? 1 : 0)),
      0
    );
    const overallRate = totalCap > 0 ? Math.round((totalUses / totalCap) * 100) : null;
    const restricted = codes.filter((c) => c.allowed_ticket_types && c.allowed_ticket_types.length > 0).length;
    return { total, totalUses, overallRate, restricted };
  }, [codes]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Promo Code Insights"
        subtitle="Campaigns, expiry windows, ticket restrictions, and redemption performance"
        icon={BarChart3}
        actions={
          <Link to="/admin/n">
            <AdminButton variant="adminOutline">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Manage Codes
            </AdminButton>
          </Link>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <AdminStatCard title="Total Codes" value={headlineStats.total} />
        <AdminStatCard title="Total Redemptions" value={headlineStats.totalUses} />
        <AdminStatCard
          title="Overall Redemption Rate"
          value={headlineStats.overallRate === null ? "—" : `${headlineStats.overallRate}%`}
        />
        <AdminStatCard title="Ticket-Restricted" value={headlineStats.restricted} />
      </div>

      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle>By Campaign / Source</AdminCardTitle>
        </AdminCardHeader>
        <AdminCardContent>
          <AdminTable>
            <AdminTableHeader>
              <AdminTableRow>
                <AdminTableHead>Campaign</AdminTableHead>
                <AdminTableHead>Codes</AdminTableHead>
                <AdminTableHead>Active</AdminTableHead>
                <AdminTableHead>Redemptions</AdminTableHead>
                <AdminTableHead>Capacity</AdminTableHead>
                <AdminTableHead>Rate</AdminTableHead>
              </AdminTableRow>
            </AdminTableHeader>
            <AdminTableBody>
              {isLoading ? (
                <AdminTableLoading rows={4} cols={6} />
              ) : campaignGroups.length === 0 ? (
                <AdminTableEmpty colSpan={6} title="No campaigns yet" />
              ) : (
                campaignGroups.map((g) => {
                  const pill = ratePill(g.rate);
                  return (
                    <AdminTableRow key={g.campaign}>
                      <AdminTableCell>
                        <span className="capitalize text-sm font-medium text-[hsl(var(--admin-text-primary))]">
                          {g.campaign.replace(/_/g, " ")}
                        </span>
                      </AdminTableCell>
                      <AdminTableCell>{g.count}</AdminTableCell>
                      <AdminTableCell>{g.active}</AdminTableCell>
                      <AdminTableCell>{g.totalUses}</AdminTableCell>
                      <AdminTableCell>{g.totalCap || "—"}</AdminTableCell>
                      <AdminTableCell>
                        <AdminBadge intent={pill.intent}>{pill.label}</AdminBadge>
                      </AdminTableCell>
                    </AdminTableRow>
                  );
                })
              )}
            </AdminTableBody>
          </AdminTable>
        </AdminCardContent>
      </AdminCard>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--admin-text-secondary))]" />
          <AdminInput
            placeholder="Search code, description, recipient…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="sm:w-48">
          <AdminSelect value={campaignFilter} onValueChange={setCampaignFilter}>
            <AdminSelectItem value="all">All campaigns</AdminSelectItem>
            {campaignOptions.map((c) => (
              <AdminSelectItem key={c} value={c}>
                {c.replace(/_/g, " ")}
              </AdminSelectItem>
            ))}
          </AdminSelect>
        </div>
        <div className="sm:w-48">
          <AdminSelect value={expiryFilter} onValueChange={setExpiryFilter}>
            <AdminSelectItem value="all">All expiry</AdminSelectItem>
            <AdminSelectItem value="expired">Expired</AdminSelectItem>
            <AdminSelectItem value="lt_24h">&lt; 24h</AdminSelectItem>
            <AdminSelectItem value="lt_7d">&lt; 7 days</AdminSelectItem>
            <AdminSelectItem value="lt_30d">&lt; 30 days</AdminSelectItem>
            <AdminSelectItem value="future">30+ days</AdminSelectItem>
            <AdminSelectItem value="no_expiry">No expiry</AdminSelectItem>
          </AdminSelect>
        </div>
      </div>

      <AdminTable>
        <AdminTableHeader>
          <AdminTableRow>
            <AdminTableHead>Code</AdminTableHead>
            <AdminTableHead>Campaign</AdminTableHead>
            <AdminTableHead>Discount</AdminTableHead>
            <AdminTableHead>Ticket Restrictions</AdminTableHead>
            <AdminTableHead>Expiry</AdminTableHead>
            <AdminTableHead>Uses</AdminTableHead>
            <AdminTableHead>Redemption</AdminTableHead>
          </AdminTableRow>
        </AdminTableHeader>
        <AdminTableBody>
          {isLoading ? (
            <AdminTableLoading rows={6} cols={7} />
          ) : filtered.length === 0 ? (
            <AdminTableEmpty colSpan={7} title="No codes match your filters" />
          ) : (
            filtered.map((c) => {
              const bucket = bucketExpiry(c.valid_until, now);
              const rate = redemptionRate(c);
              const pill = ratePill(rate);
              const tickets = formatTicketRestrictions(c.allowed_ticket_types);
              const cap = c.max_uses ?? (c.is_single_use ? 1 : null);
              return (
                <AdminTableRow key={c.id}>
                  <AdminTableCell>
                    <div className="font-mono font-semibold text-[hsl(var(--admin-text-primary))]">
                      {c.code}
                    </div>
                    {c.description && (
                      <div className="text-xs text-[hsl(var(--admin-text-secondary))] mt-0.5 line-clamp-1">
                        {c.description}
                      </div>
                    )}
                  </AdminTableCell>
                  <AdminTableCell>
                    <span className="text-xs capitalize text-[hsl(var(--admin-text-secondary))]">
                      {(c.source || "manual").replace(/_/g, " ")}
                    </span>
                  </AdminTableCell>
                  <AdminTableCell>
                    <span className="text-sm text-[hsl(var(--admin-text-primary))]">
                      {formatDiscount(c)}
                    </span>
                  </AdminTableCell>
                  <AdminTableCell>
                    <span
                      className={`text-xs ${
                        tickets.isAll
                          ? "text-[hsl(var(--admin-text-secondary))]"
                          : "text-[hsl(var(--admin-text-primary))]"
                      }`}
                    >
                      {tickets.label}
                    </span>
                  </AdminTableCell>
                  <AdminTableCell>
                    <AdminBadge intent={expiryIntent(bucket)}>{expiryLabel(bucket)}</AdminBadge>
                  </AdminTableCell>
                  <AdminTableCell>
                    <span className="text-sm text-[hsl(var(--admin-text-primary))]">
                      {c.current_uses}
                      {cap !== null ? ` / ${cap}` : ""}
                    </span>
                  </AdminTableCell>
                  <AdminTableCell>
                    <AdminBadge intent={pill.intent}>{pill.label}</AdminBadge>
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
