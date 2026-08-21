import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard, AdminCardContent, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
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
  AdminTabs,
  AdminTabsList,
  AdminTabsTrigger,
  AdminTabsContent,
  AdminSearchInput,
} from "@/components/admin";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Mail, Link as LinkIcon, RefreshCw, Copy, Ban } from "lucide-react";

interface AbandonedRow {
  id: string;
  email: string | null;
  name: string | null;
  ticket_type: string | null;
  payment_status: string;
  recovery_email_sent_at: string | null;
  updated_at: string;
  created_at: string;
  total_amount: number | null;
}

type Filter = "expired" | "pending" | "failed" | "all";

export default function AbandonedRecovery() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("expired");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-abandoned-recovery", filter],
    queryFn: async () => {
      let q = supabase
        .from("registrations")
        .select("id, email, name, ticket_type, payment_status, recovery_email_sent_at, updated_at, created_at, total_amount")
        .order("updated_at", { ascending: false })
        .limit(200);
      if (filter !== "all") q = q.eq("payment_status", filter);
      else q = q.in("payment_status", ["expired", "pending", "failed"]);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as AbandonedRow[];
    },
  });

  const { data: unsubs = [] } = useQuery({
    queryKey: ["recovery-unsubs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("recovery_email_unsubscribes")
        .select("email");
      return (data || []).map((u) => u.email.toLowerCase());
    },
  });
  const unsubSet = useMemo(() => new Set(unsubs), [unsubs]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      [r.email, r.name, r.ticket_type, r.id].some((v) => v?.toLowerCase().includes(term)),
    );
  }, [rows, search]);

  const stats = useMemo(() => ({
    total: rows.length,
    sent: rows.filter((r) => r.recovery_email_sent_at).length,
    notSent: rows.filter((r) => !r.recovery_email_sent_at && r.payment_status === "expired").length,
  }), [rows]);

  const resendMutation = useMutation({
    mutationFn: async (id: string) => {
      // Clear the timestamp so the function will re-send
      await supabase.from("registrations").update({ recovery_email_sent_at: null }).eq("id", id);
      const { data, error } = await supabase.functions.invoke("send-abandoned-ticket-email", {
        body: { registrationIds: [id], force: true },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Recovery email sent");
      queryClient.invalidateQueries({ queryKey: ["admin-abandoned-recovery"] });
    },
    onError: (e: any) => toast.error(`Send failed: ${e?.message || "unknown error"}`),
    onSettled: () => setBusyId(null),
  });

  const copyResumeLink = async (id: string) => {
    setBusyId(id);
    try {
      const { data, error } = await supabase.functions.invoke("send-abandoned-ticket-email", {
        body: { registrationIds: [id], dryRun: true },
      });
      if (error) throw error;
      const result = (data as any)?.results?.[0];
      const link = result?.resumeUrl;
      if (!link) throw new Error("No resume link returned (registration may not be eligible)");
      await navigator.clipboard.writeText(link);
      toast.success("Resume link copied to clipboard");
    } catch (e: any) {
      toast.error(`Could not generate link: ${e?.message || "unknown error"}`);
    } finally {
      setBusyId(null);
    }
  };

  const unsubscribeEmail = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase
        .from("recovery_email_unsubscribes")
        .upsert(
          { email: email.toLowerCase(), scope: "abandoned_checkout", source: "admin" },
          { onConflict: "email" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Email opted out of recovery messages");
      queryClient.invalidateQueries({ queryKey: ["recovery-unsubs"] });
    },
    onError: (e: any) => toast.error(`Unsubscribe failed: ${e?.message || "unknown"}`),
  });

  const renderStatusBadge = (r: AbandonedRow) => {
    if (r.payment_status === "expired") return <AdminBadge intent="warning">Expired</AdminBadge>;
    if (r.payment_status === "failed") return <AdminBadge intent="danger">Failed</AdminBadge>;
    if (r.payment_status === "pending") return <AdminBadge intent="info">Pending</AdminBadge>;
    return <AdminBadge intent="neutral">{r.payment_status}</AdminBadge>;
  };

  const renderRecoveryStatus = (r: AbandonedRow) => {
    if (r.email && unsubSet.has(r.email.toLowerCase())) {
      return <AdminBadge intent="neutral">Unsubscribed</AdminBadge>;
    }
    if (r.recovery_email_sent_at) {
      return (
        <span className="text-xs text-[hsl(var(--admin-muted-foreground))]">
          Sent {formatDistanceToNow(new Date(r.recovery_email_sent_at), { addSuffix: true })}
        </span>
      );
    }
    return <AdminBadge intent="warning">Not sent</AdminBadge>;
  };

  return (
    <div className="admin-theme p-6 space-y-6">
      <AdminPageHeader
        title="Abandoned Checkout Recovery"
        subtitle="Manage in-flight, expired, and failed ticket checkouts. Resend recovery emails or grab a resume link to share manually."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <AdminCard>
          <AdminCardHeader><AdminCardTitle className="text-sm">Total in view</AdminCardTitle></AdminCardHeader>
          <AdminCardContent><div className="text-2xl font-semibold">{stats.total}</div></AdminCardContent>
        </AdminCard>
        <AdminCard>
          <AdminCardHeader><AdminCardTitle className="text-sm">Recovery emails sent</AdminCardTitle></AdminCardHeader>
          <AdminCardContent><div className="text-2xl font-semibold">{stats.sent}</div></AdminCardContent>
        </AdminCard>
        <AdminCard>
          <AdminCardHeader><AdminCardTitle className="text-sm">Expired, not yet emailed</AdminCardTitle></AdminCardHeader>
          <AdminCardContent><div className="text-2xl font-semibold">{stats.notSent}</div></AdminCardContent>
        </AdminCard>
      </div>

      <AdminCard>
        <AdminCardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <AdminTabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
              <AdminTabsList>
                <AdminTabsTrigger value="expired">Expired</AdminTabsTrigger>
                <AdminTabsTrigger value="pending">Pending</AdminTabsTrigger>
                <AdminTabsTrigger value="failed">Failed</AdminTabsTrigger>
                <AdminTabsTrigger value="all">All</AdminTabsTrigger>
              </AdminTabsList>
              <AdminTabsContent value={filter} />
            </AdminTabs>
            <AdminSearchInput
              placeholder="Search email, name, ticket type"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="md:w-80"
            />
          </div>
        </AdminCardHeader>
        <AdminCardContent>
          <AdminTable>
            <AdminTableHeader>
              <AdminTableRow>
                <AdminTableHead>Customer</AdminTableHead>
                <AdminTableHead>Ticket</AdminTableHead>
                <AdminTableHead>Status</AdminTableHead>
                <AdminTableHead>Recovery</AdminTableHead>
                <AdminTableHead>Updated</AdminTableHead>
                <AdminTableHead className="text-right">Actions</AdminTableHead>
              </AdminTableRow>
            </AdminTableHeader>
            <AdminTableBody>
              {isLoading ? (
                <AdminTableLoading rows={6} cols={6} />
              ) : filtered.length === 0 ? (
                <AdminTableRow>
                  <AdminTableCell colSpan={6}>
                    <AdminTableEmpty title="Nothing here" description="No abandoned checkouts match these filters." />
                  </AdminTableCell>
                </AdminTableRow>
              ) : (
                filtered.map((r) => {
                  const isUnsub = !!(r.email && unsubSet.has(r.email.toLowerCase()));
                  return (
                    <AdminTableRow key={r.id}>
                      <AdminTableCell>
                        <div className="font-medium">{r.name || "—"}</div>
                        <div className="text-xs text-[hsl(var(--admin-muted-foreground))]">{r.email || "no email"}</div>
                      </AdminTableCell>
                      <AdminTableCell>
                        <div className="text-sm">{r.ticket_type || "—"}</div>
                        {r.total_amount != null && (
                          <div className="text-xs text-[hsl(var(--admin-muted-foreground))]">
                            ${(r.total_amount / 100).toFixed(2)}
                          </div>
                        )}
                      </AdminTableCell>
                      <AdminTableCell>{renderStatusBadge(r)}</AdminTableCell>
                      <AdminTableCell>{renderRecoveryStatus(r)}</AdminTableCell>
                      <AdminTableCell>
                        <span className="text-xs text-[hsl(var(--admin-muted-foreground))]">
                          {formatDistanceToNow(new Date(r.updated_at), { addSuffix: true })}
                        </span>
                      </AdminTableCell>
                      <AdminTableCell className="text-right">
                        <div className="inline-flex gap-2">
                          <AdminButton
                            size="sm"
                            variant="outline"
                            disabled={busyId === r.id || !r.email}
                            onClick={() => copyResumeLink(r.id)}
                          >
                            {busyId === r.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                            <span className="ml-1">Resume link</span>
                          </AdminButton>
                          <AdminButton
                            size="sm"
                            disabled={!r.email || isUnsub || resendMutation.isPending && busyId === r.id}
                            onClick={() => { setBusyId(r.id); resendMutation.mutate(r.id); }}
                          >
                            <Mail className="h-3.5 w-3.5" />
                            <span className="ml-1">{r.recovery_email_sent_at ? "Resend" : "Send"}</span>
                          </AdminButton>
                          {!isUnsub && r.email && (
                            <AdminButton
                              size="sm"
                              variant="ghost"
                              onClick={() => unsubscribeEmail.mutate(r.email!)}
                              title="Opt this email out of all future recovery messages"
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </AdminButton>
                          )}
                        </div>
                      </AdminTableCell>
                    </AdminTableRow>
                  );
                })
              )}
            </AdminTableBody>
          </AdminTable>
        </AdminCardContent>
      </AdminCard>
    </div>
  );
}
