import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tag, Plus, Copy, Trash2, Eye, Activity, BarChart3 } from "lucide-react";
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
  AdminLabel,
  AdminTextarea,
  AdminSwitch,
  AdminSelect,
  AdminSelectItem,
  AdminDialog,
  AdminDialogContent,
  AdminDialogHeader,
  AdminDialogTitle,
  AdminDialogBody,
  AdminDialogFooter,
  AdminStatCard,
  AdminFormField,
} from "@/components/admin";

interface PromoCode {
  id: string;
  code: string;
  description: string | null;
  discount_type: string;
  discount_value: number;
  max_uses: number | null;
  current_uses: number;
  is_single_use: boolean;
  is_active: boolean;
  valid_from: string | null;
  valid_until: string | null;
  allowed_ticket_types: string[] | null;
  min_order_amount: number | null;
  created_at: string;
  source: string | null;
}

interface SourceStats {
  source: string;
  total: number;
  redeemed: number;
  expired_unused: number;
  active_unused: number;
  conversion_rate: number;
}

export default function PromoCodesPage() {
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [formCode, setFormCode] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDiscountType, setFormDiscountType] = useState("percentage");
  const [formDiscountValue, setFormDiscountValue] = useState("");
  const [formMaxUses, setFormMaxUses] = useState("");
  const [formIsSingleUse, setFormIsSingleUse] = useState(false);
  const [formValidUntil, setFormValidUntil] = useState("");

  const fetchCodes = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("promo_codes")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) setCodes(data as PromoCode[]);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchCodes();
  }, []);

  const resetForm = () => {
    setFormCode("");
    setFormDescription("");
    setFormDiscountType("percentage");
    setFormDiscountValue("");
    setFormMaxUses("");
    setFormIsSingleUse(false);
    setFormValidUntil("");
  };

  const handleCreate = async () => {
    if (!formCode.trim() || !formDiscountValue) {
      toast.error("Code and discount value are required");
      return;
    }

    setIsCreating(true);
    const { error } = await supabase.from("promo_codes").insert({
      code: formCode.trim().toUpperCase(),
      description: formDescription || null,
      discount_type: formDiscountType,
      discount_value: parseFloat(formDiscountValue),
      max_uses: formMaxUses ? parseInt(formMaxUses) : null,
      is_single_use: formIsSingleUse,
      valid_until: formValidUntil || null,
    });

    if (error) {
      toast.error(error.message.includes("unique") ? "This code already exists" : "Failed to create promo code");
    } else {
      toast.success("Promo code created");
      setShowCreate(false);
      resetForm();
      fetchCodes();
    }
    setIsCreating(false);
  };

  const toggleActive = async (id: string, currentActive: boolean) => {
    const { error } = await supabase
      .from("promo_codes")
      .update({ is_active: !currentActive })
      .eq("id", id);

    if (!error) {
      setCodes(prev => prev.map(c => c.id === id ? { ...c, is_active: !currentActive } : c));
      toast.success(!currentActive ? "Code activated" : "Code deactivated");
    }
  };

  const deleteCode = async (id: string) => {
    const { error } = await supabase.from("promo_codes").delete().eq("id", id);
    if (!error) {
      setCodes(prev => prev.filter(c => c.id !== id));
      toast.success("Promo code deleted");
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success(`Copied: ${code}`);
  };

  const totalCodes = codes.length;
  const activeCodes = codes.filter(c => c.is_active).length;
  const totalUses = codes.reduce((sum, c) => sum + c.current_uses, 0);

  // Source-based redemption analytics
  const sourceStats: SourceStats[] = (() => {
    const now = new Date();
    const map = new Map<string, SourceStats>();
    for (const c of codes) {
      const src = c.source || "manual";
      const entry = map.get(src) || { source: src, total: 0, redeemed: 0, expired_unused: 0, active_unused: 0, conversion_rate: 0 };
      entry.total += 1;
      if (c.current_uses > 0) {
        entry.redeemed += 1;
      } else {
        const expired = c.valid_until && new Date(c.valid_until) < now;
        if (expired) entry.expired_unused += 1;
        else if (c.is_active) entry.active_unused += 1;
      }
      map.set(src, entry);
    }
    return Array.from(map.values())
      .map(s => ({ ...s, conversion_rate: s.total > 0 ? Math.round((s.redeemed / s.total) * 100) : 0 }))
      .sort((a, b) => b.total - a.total);
  })();

  const totalRedeemed = sourceStats.reduce((sum, s) => sum + s.redeemed, 0);
  const totalExpiredUnused = sourceStats.reduce((sum, s) => sum + s.expired_unused, 0);
  const overallConversionRate = totalCodes > 0 ? Math.round((totalRedeemed / totalCodes) * 100) : 0;

  const formatSourceLabel = (src: string) => {
    const labels: Record<string, string> = {
      exit_intent_popup: "Exit Intent Popup",
      high_intent_popup: "High Intent Popup",
      winery_partner: "Winery Partner",
      manual: "Manually Created",
      reengagement: "Re-engagement",
    };
    return labels[src] || src.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Promo Codes"
        subtitle="Create and manage discount codes for ticket sales"
        icon={Tag}
        actions={
          <div className="flex items-center gap-2">
            <Link to="/admin/promo-codes/insights">
              <AdminButton variant="adminOutline">
                <BarChart3 className="h-4 w-4 mr-1" />
                Insights
              </AdminButton>
            </Link>
            <Link to="/admin/promo-codes/status">
              <AdminButton variant="adminOutline">
                <Activity className="h-4 w-4 mr-1" />
                Status View
              </AdminButton>
            </Link>
            <AdminButton variant="admin" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" />
              New Code
            </AdminButton>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <AdminStatCard title="Total Codes" value={totalCodes} />
        <AdminStatCard title="Active" value={activeCodes} />
        <AdminStatCard title="Redeemed" value={totalRedeemed} />
        <AdminStatCard title="Conversion Rate" value={`${overallConversionRate}%`} />
      </div>

      {/* Redemption by Source */}
      {sourceStats.length > 0 && (
        <div className="rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[hsl(var(--admin-text-primary))] uppercase tracking-wider">
              Redemption Performance by Source
            </h3>
            {totalExpiredUnused > 0 && (
              <AdminBadge intent="warning">{totalExpiredUnused} expired unused</AdminBadge>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {sourceStats.map((s) => (
              <div
                key={s.source}
                className="p-4 rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-background))]"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-[hsl(var(--admin-text-primary))]">
                    {formatSourceLabel(s.source)}
                  </span>
                  <AdminBadge intent={s.conversion_rate >= 20 ? "success" : s.conversion_rate >= 10 ? "info" : "neutral"}>
                    {s.conversion_rate}%
                  </AdminBadge>
                </div>
                <div className="text-xs text-[hsl(var(--admin-text-muted))] space-y-0.5">
                  <div className="flex justify-between">
                    <span>Sent / created</span>
                    <span className="font-mono text-[hsl(var(--admin-text-primary))]">{s.total}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Redeemed</span>
                    <span className="font-mono text-[hsl(var(--admin-success))]">{s.redeemed}</span>
                  </div>
                  {s.expired_unused > 0 && (
                    <div className="flex justify-between">
                      <span>Expired unused</span>
                      <span className="font-mono text-[hsl(var(--admin-warning))]">{s.expired_unused}</span>
                    </div>
                  )}
                  {s.active_unused > 0 && (
                    <div className="flex justify-between">
                      <span>Active unused</span>
                      <span className="font-mono">{s.active_unused}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <AdminTable>
        <AdminTableHeader>
          <AdminTableRow>
            <AdminTableHead>Code</AdminTableHead>
            <AdminTableHead>Discount</AdminTableHead>
            <AdminTableHead>Uses</AdminTableHead>
            <AdminTableHead>Type</AdminTableHead>
            <AdminTableHead>Status</AdminTableHead>
            <AdminTableHead>Expires</AdminTableHead>
            <AdminTableHead className="text-right">Actions</AdminTableHead>
          </AdminTableRow>
        </AdminTableHeader>
        <AdminTableBody>
          {isLoading ? (
            <AdminTableLoading rows={3} cols={7} />
          ) : codes.length === 0 ? (
            <AdminTableEmpty title="No promo codes yet" description="Create your first promo code to get started." />
          ) : (
            codes.map((code) => (
              <AdminTableRow key={code.id}>
                <AdminTableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-[hsl(var(--admin-text-primary))]">
                      {code.code}
                    </span>
                    <AdminButton variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyCode(code.code)}>
                      <Copy className="h-3 w-3" />
                    </AdminButton>
                  </div>
                  {code.description && (
                    <span className="text-xs text-[hsl(var(--admin-text-muted))]">{code.description}</span>
                  )}
                </AdminTableCell>
                <AdminTableCell>
                  <span className="font-semibold">
                    {code.discount_type === "percentage"
                      ? `${code.discount_value}%`
                      : `$${code.discount_value}`}
                  </span>
                  <span className="text-xs text-[hsl(var(--admin-text-muted))] ml-1">off</span>
                </AdminTableCell>
                <AdminTableCell>
                  {code.current_uses}{code.max_uses ? ` / ${code.max_uses}` : ""}
                </AdminTableCell>
                <AdminTableCell>
                  <AdminBadge intent={code.is_single_use ? "info" : "neutral"}>
                    {code.is_single_use ? "Single-use" : "Multi-use"}
                  </AdminBadge>
                </AdminTableCell>
                <AdminTableCell>
                  <AdminBadge intent={code.is_active ? "success" : "neutral"}>
                    {code.is_active ? "Active" : "Inactive"}
                  </AdminBadge>
                </AdminTableCell>
                <AdminTableCell>
                  {code.valid_until
                    ? new Date(code.valid_until).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" })
                    : "—"}
                </AdminTableCell>
                <AdminTableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <AdminButton
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => toggleActive(code.id, code.is_active)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </AdminButton>
                    <AdminButton
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-[hsl(var(--admin-error))]"
                      onClick={() => deleteCode(code.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </AdminButton>
                  </div>
                </AdminTableCell>
              </AdminTableRow>
            ))
          )}
        </AdminTableBody>
      </AdminTable>

      {/* Create Dialog */}
      <AdminDialog open={showCreate} onOpenChange={setShowCreate}>
        <AdminDialogContent>
          <AdminDialogHeader>
            <AdminDialogTitle>Create Promo Code</AdminDialogTitle>
          </AdminDialogHeader>
          <AdminDialogBody className="space-y-4">
            <AdminFormField label="Code" required>
              <AdminInput
                placeholder="e.g. WINERY20 or FRIEND50"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                className="font-mono"
              />
            </AdminFormField>

            <AdminFormField label="Description">
              <AdminInput
                placeholder="e.g. 20% off for Example Valley Valley Winery guests"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </AdminFormField>

            <div className="grid grid-cols-2 gap-4">
              <AdminFormField label="Discount Type" required>
                <AdminSelect value={formDiscountType} onValueChange={setFormDiscountType}>
                  <AdminSelectItem value="percentage">Percentage (%)</AdminSelectItem>
                  <AdminSelectItem value="fixed_amount">Fixed Amount ($)</AdminSelectItem>
                </AdminSelect>
              </AdminFormField>

              <AdminFormField label={formDiscountType === "percentage" ? "Percentage Off" : "Dollar Amount"} required>
                <AdminInput
                  type="number"
                  placeholder={formDiscountType === "percentage" ? "20" : "50"}
                  value={formDiscountValue}
                  onChange={(e) => setFormDiscountValue(e.target.value)}
                />
              </AdminFormField>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <AdminFormField label="Max Total Uses" hint="Leave blank for unlimited">
                <AdminInput
                  type="number"
                  placeholder="Unlimited"
                  value={formMaxUses}
                  onChange={(e) => setFormMaxUses(e.target.value)}
                />
              </AdminFormField>

              <AdminFormField label="Expires">
                <AdminInput
                  type="date"
                  value={formValidUntil}
                  onChange={(e) => setFormValidUntil(e.target.value)}
                />
              </AdminFormField>
            </div>

            <div className="flex items-center gap-3">
              <AdminSwitch checked={formIsSingleUse} onCheckedChange={setFormIsSingleUse} />
              <div>
                <AdminLabel className="block">Single-use per email</AdminLabel>
                <span className="text-xs text-[hsl(var(--admin-text-muted))]">
                  Each email can only use this code once (great for individual promos)
                </span>
              </div>
            </div>
          </AdminDialogBody>
          <AdminDialogFooter>
            <AdminButton variant="adminOutline" onClick={() => { setShowCreate(false); resetForm(); }}>
              Cancel
            </AdminButton>
            <AdminButton variant="admin" onClick={handleCreate} isLoading={isCreating}>
              Create Code
            </AdminButton>
          </AdminDialogFooter>
        </AdminDialogContent>
      </AdminDialog>
    </div>
  );
}
