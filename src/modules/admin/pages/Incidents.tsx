import { useEffect, useState, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, RefreshCw, Bell, BellOff } from "lucide-react";
import { AdminCard, AdminCardContent, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  AdminButton,
  AdminBadge,
  AdminTable,
  AdminTableHeader,
  AdminTableBody,
  AdminTableRow,
  AdminTableHead,
  AdminTableCell,
  AdminTableEmpty,
  AdminTableLoading,
  AdminInput,
} from "@/components/admin/AdminUI";

type Severity = "low" | "medium" | "high" | "critical";
type Status = "open" | "acknowledged" | "auto_resolved" | "resolved";

interface Incident {
  id: string;
  signature: string;
  function_name: string;
  source: string;
  message: string;
  sample_stack: string | null;
  severity: Severity;
  status: Status;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  last_sms_at: string | null;
  notes: string | null;
  auto_remediation_status: "pending" | "attempted" | "succeeded" | "failed" | "no_rule" | "skipped";
  auto_remediation_rule: string | null;
  auto_remediation_attempts: number;
  auto_remediation_last_at: string | null;
}

interface AlertConfig {
  admin_phone: string;
  sms_enabled: boolean;
  per_incident_cooldown_minutes: number;
  min_sms_severity: Severity;
}

const SEVERITY_INTENT: Record<Severity, "neutral" | "warning" | "danger"> = {
  low: "neutral",
  medium: "neutral",
  high: "warning",
  critical: "danger",
};

const STATUS_INTENT: Record<Status, "neutral" | "warning" | "danger" | "success"> = {
  open: "danger",
  acknowledged: "warning",
  auto_resolved: "success",
  resolved: "success",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const SMOKE_RE = /^\/test\d*$|smoke_v|chunk-abc123/i;
function isSmokeTest(i: Incident): boolean {
  return SMOKE_RE.test(i.function_name) || SMOKE_RE.test(i.message);
}

export default function Incidents() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [config, setConfig] = useState<AlertConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [hideSmoke, setHideSmoke] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    const [{ data: incData, error: incErr }, { data: cfgData }] = await Promise.all([
      supabase
        .from("edge_function_incidents" as any)
        .select("*")
        .order("last_seen_at", { ascending: false })
        .limit(200),
      supabase.from("incident_alert_config" as any).select("*").eq("id", 1).maybeSingle(),
    ]);
    if (incErr) toast.error(`Failed to load incidents: ${incErr.message}`);
    setIncidents((incData as any) ?? []);
    setConfig((cfgData as any) ?? null);
    setSelected(new Set());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const ch = supabase
      .channel("incidents-stream")
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "edge_function_incidents" },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const updateStatus = async (id: string, status: Status) => {
    const patch: any = { status };
    if (status === "acknowledged") patch.acknowledged_at = new Date().toISOString();
    if (status === "resolved") patch.resolved_at = new Date().toISOString();
    const { error } = await supabase.from("edge_function_incidents" as any).update(patch).eq("id", id);
    if (error) toast.error(error.message); else toast.success(`Marked ${status}`);
  };

  const bulkResolve = async () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const { error } = await supabase
      .from("edge_function_incidents" as any)
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .in("id", ids);
    if (error) toast.error(error.message);
    else { toast.success(`Resolved ${ids.length} incident${ids.length === 1 ? "" : "s"}`); setSelected(new Set()); }
  };

  const toggleSms = async () => {
    if (!config) return;
    const { error } = await supabase
      .from("incident_alert_config" as any)
      .update({ sms_enabled: !config.sms_enabled })
      .eq("id", 1);
    if (error) toast.error(error.message);
    else { toast.success(config.sms_enabled ? "SMS alerts muted" : "SMS alerts enabled"); load(); }
  };

  const updatePhone = async (phone: string) => {
    const { error } = await supabase
      .from("incident_alert_config" as any)
      .update({ admin_phone: phone.replace(/\D/g, "") })
      .eq("id", 1);
    if (error) toast.error(error.message); else { toast.success("Phone updated"); load(); }
  };

  const visible = (filter === "open"
    ? incidents.filter(i => i.status === "open" || i.status === "acknowledged")
    : incidents
  ).filter(i => hideSmoke ? !isSmokeTest(i) : true);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selected.size === visible.length) setSelected(new Set());
    else setSelected(new Set(visible.map(i => i.id)));
  };

  const openCount = incidents.filter(i => i.status === "open").length;
  const criticalCount = incidents.filter(i => i.severity === "critical" && i.status === "open").length;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="System Incidents"
        subtitle="Edge function & frontend errors, auto-deduped. Critical/high issues page the listed number."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <AdminCard>
          <AdminCardHeader><AdminCardTitle className="text-sm">Open</AdminCardTitle></AdminCardHeader>
          <AdminCardContent className="text-2xl font-semibold">{openCount}</AdminCardContent>
        </AdminCard>
        <AdminCard>
          <AdminCardHeader><AdminCardTitle className="text-sm">Critical (open)</AdminCardTitle></AdminCardHeader>
          <AdminCardContent className="text-2xl font-semibold text-[hsl(var(--admin-error))]">{criticalCount}</AdminCardContent>
        </AdminCard>
        <AdminCard>
          <AdminCardHeader><AdminCardTitle className="text-sm">SMS alerts</AdminCardTitle></AdminCardHeader>
          <AdminCardContent>
            <AdminButton size="sm" variant="outline" onClick={toggleSms}>
              {config?.sms_enabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
              <span className="ml-2">{config?.sms_enabled ? "On" : "Muted"}</span>
            </AdminButton>
          </AdminCardContent>
        </AdminCard>
        <AdminCard>
          <AdminCardHeader><AdminCardTitle className="text-sm">Alert phone</AdminCardTitle></AdminCardHeader>
          <AdminCardContent>
            {config && (
              <AdminInput
                defaultValue={config.admin_phone}
                onBlur={(e) => {
                  const v = e.currentTarget.value;
                  if (v && v.replace(/\D/g, "") !== config.admin_phone) updatePhone(v);
                }}
                placeholder="15551234567"
              />
            )}
          </AdminCardContent>
        </AdminCard>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2 flex-wrap">
          <AdminButton size="sm" variant={filter === "open" ? "default" : "outline"} onClick={() => setFilter("open")}>
            Active ({openCount})
          </AdminButton>
          <AdminButton size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
            All ({incidents.length})
          </AdminButton>
          <AdminButton size="sm" variant={hideSmoke ? "default" : "outline"} onClick={() => setHideSmoke(v => !v)}>
            {hideSmoke ? "Smoke tests hidden" : "Showing smoke tests"}
          </AdminButton>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <AdminButton size="sm" variant="default" onClick={bulkResolve}>
              Resolve {selected.size} selected
            </AdminButton>
          )}
          <AdminButton size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            <span className="ml-2">Refresh</span>
          </AdminButton>
        </div>
      </div>

      <AdminCard>
        <AdminCardContent className="p-0">
          <AdminTable>
            <AdminTableHeader>
              <AdminTableRow>
                <AdminTableHead className="w-8">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={visible.length > 0 && selected.size === visible.length}
                    onChange={toggleSelectAll}
                    className="cursor-pointer"
                  />
                </AdminTableHead>
                <AdminTableHead>Severity</AdminTableHead>
                <AdminTableHead>Function</AdminTableHead>
                <AdminTableHead>Message</AdminTableHead>
                <AdminTableHead>Count</AdminTableHead>
                <AdminTableHead>Last seen</AdminTableHead>
                <AdminTableHead>Status</AdminTableHead>
                <AdminTableHead>Auto-fix</AdminTableHead>
                <AdminTableHead>Actions</AdminTableHead>
              </AdminTableRow>
            </AdminTableHeader>
            <AdminTableBody>
              {loading ? (
                <AdminTableLoading rows={5} cols={9} />
              ) : visible.length === 0 ? (
                <AdminTableEmpty
                  colSpan={9}
                  icon={<CheckCircle2 className="h-6 w-6 text-[hsl(var(--admin-success))]" />}
                  title={filter === "open" ? "All clear — no active incidents" : "No incidents recorded"}
                />
              ) : (
                visible.map((i) => (
                  <Fragment key={i.id}>
                    <AdminTableRow onClick={() => setExpanded(expanded === i.id ? null : i.id)} className="cursor-pointer">
                      <AdminTableCell onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${i.function_name}`}
                          checked={selected.has(i.id)}
                          onChange={() => toggleSelect(i.id)}
                          className="cursor-pointer"
                        />
                      </AdminTableCell>
                      <AdminTableCell>
                        <AdminBadge intent={SEVERITY_INTENT[i.severity]}>{i.severity}</AdminBadge>
                      </AdminTableCell>
                      <AdminTableCell className="font-mono text-xs">{i.function_name}</AdminTableCell>
                      <AdminTableCell className="max-w-md truncate">{i.message}</AdminTableCell>
                      <AdminTableCell>{i.occurrence_count}</AdminTableCell>
                      <AdminTableCell className="text-xs">{timeAgo(i.last_seen_at)}</AdminTableCell>
                      <AdminTableCell>
                        <AdminBadge intent={STATUS_INTENT[i.status]}>{i.status}</AdminBadge>
                      </AdminTableCell>
                      <AdminTableCell>
                        {i.auto_remediation_status === "succeeded" ? (
                          <AdminBadge intent="success">auto-fixed</AdminBadge>
                        ) : i.auto_remediation_status === "no_rule" ? (
                          <AdminBadge intent="warning">no rule</AdminBadge>
                        ) : i.auto_remediation_status === "failed" ? (
                          <AdminBadge intent="danger">failed</AdminBadge>
                        ) : i.auto_remediation_status === "attempted" ? (
                            <AdminBadge intent="neutral">attempted</AdminBadge>
                        ) : (
                          <AdminBadge intent="neutral">—</AdminBadge>
                        )}
                      </AdminTableCell>
                      <AdminTableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1">
                          {i.status === "open" && (
                            <AdminButton size="sm" variant="outline" onClick={() => updateStatus(i.id, "acknowledged")}>Ack</AdminButton>
                          )}
                          {i.status !== "resolved" && (
                            <AdminButton size="sm" variant="outline" onClick={() => updateStatus(i.id, "resolved")}>Resolve</AdminButton>
                          )}
                        </div>
                      </AdminTableCell>
                    </AdminTableRow>
                    {expanded === i.id && (
                      <AdminTableRow>
                        <AdminTableCell colSpan={9} className="bg-[hsl(var(--admin-hover))]">
                          <div className="space-y-3 p-2 text-xs">
                            <div><strong>Signature:</strong> <code className="font-mono">{i.signature}</code></div>
                            <div><strong>Source:</strong> {i.source} &nbsp; <strong>First seen:</strong> {new Date(i.first_seen_at).toLocaleString()}</div>
                            {i.auto_remediation_rule && (
                              <div><strong>Remediation rule:</strong> <code className="font-mono">{i.auto_remediation_rule}</code> ({i.auto_remediation_status}, {i.auto_remediation_attempts} attempt{i.auto_remediation_attempts === 1 ? "" : "s"})</div>
                            )}
                            {i.last_sms_at && <div><strong>Last SMS sent:</strong> {new Date(i.last_sms_at).toLocaleString()}</div>}
                            {i.sample_stack && (
                              <details>
                                <summary className="cursor-pointer">Stack trace</summary>
                                <pre className="mt-2 overflow-x-auto p-2 bg-[hsl(var(--admin-background))] rounded font-mono text-[10px]">{i.sample_stack}</pre>
                              </details>
                            )}
                          </div>
                        </AdminTableCell>
                      </AdminTableRow>
                    )}
                  </Fragment>
                ))
              )}
            </AdminTableBody>
          </AdminTable>
        </AdminCardContent>
      </AdminCard>

      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> How this works
          </AdminCardTitle>
        </AdminCardHeader>
        <AdminCardContent className="text-xs space-y-2 text-[hsl(var(--admin-text-muted))]">
          <p>Errors in edge functions (via shared error handler) and the frontend (via global error monitor) are deduped by signature and recorded here. Repeats bump the count instead of creating new rows.</p>
          <p>An SMS goes to the listed phone for severity ≥ <strong>{config?.min_sms_severity ?? "high"}</strong>, at most once per incident per <strong>{config?.per_incident_cooldown_minutes ?? 60} min</strong>.</p>
          <p>Acknowledging an incident silences SMS for it. If it recurs after being resolved, it auto-reopens.</p>
        </AdminCardContent>
      </AdminCard>
    </div>
  );
}
