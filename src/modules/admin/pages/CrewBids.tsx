import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { useQueryClient } from "@tanstack/react-query";
import {
  AdminCard, AdminCardContent, AdminStatCard,
} from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  AdminTable, AdminTableBody, AdminTableCell, AdminTableHead,
  AdminTableHeader, AdminTableRow, AdminButton, AdminBadge, AdminInput,
} from "@/components/admin/AdminUI";
import { AdminLabel, AdminTextarea } from "@/components/admin/AdminFormPrimitives";
import { AdminDialog, AdminDialogContent, AdminDialogDescription, AdminDialogFooter, AdminDialogHeader, AdminDialogTitle } from "@/components/admin/AdminDialog";
import { AdminConfirmDialog } from "@/components/admin/AdminConfirmDialog";
import { AdminTabs, AdminTabsContent, AdminTabsList, AdminTabsTrigger } from "@/components/admin";
import { AdminSelect, AdminSelectItem } from "@/components/admin/AdminSelect";
import { toast } from "sonner";
import { Users, DollarSign, Clock, CheckCircle, XCircle, Loader2, Search, Mail, ArrowRight, RefreshCw } from "lucide-react";
import { format } from "date-fns";

const TICKET_LABELS: Record<string, string> = {
  "2day_ga": "2-Day GA",
  "saturday_ga": "Saturday GA",
  "friday_ga": "Friday GA",
};

const STATUS_INTENTS: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  pending: "warning",
  accepted: "success",
  declined: "danger",
  paid: "success",
  unpaid: "neutral",
};

interface CrewBid {
  id: string;
  captain_name: string;
  email: string;
  phone: string | null;
  crew_size: number;
  ticket_type: string;
  bid_price: number;
  status: string;
  accepted_price: number | null;
  payment_status: string;
  created_at: string;
}

interface CommunityRequest {
  id: string;
  organizer_name: string;
  email: string;
  phone: string | null;
  organization_name: string;
  group_size: number;
  description: string;
  status: string;
  created_at: string;
}

const CrewBids = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [acceptDialog, setAcceptDialog] = useState<CrewBid | null>(null);
  const [acceptPrice, setAcceptPrice] = useState("");
  const [declineConfirm, setDeclineConfirm] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [crStatusLoading, setCrStatusLoading] = useState<string | null>(null);
  const [replyDialog, setReplyDialog] = useState<CommunityRequest | null>(null);
  const [replyMessage, setReplyMessage] = useState("");

  const { data: bids = [], isLoading: bidsLoading } = useAuthQuery<CrewBid[]>({
    queryKey: ["crew-bids"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("crew_bids")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: communityRequests = [], isLoading: crLoading } = useAuthQuery<CommunityRequest[]>({
    queryKey: ["community-requests"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("community_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filteredBids = (bids as CrewBid[]).filter((b) =>
    !search || b.captain_name.toLowerCase().includes(search.toLowerCase()) ||
    b.email.toLowerCase().includes(search.toLowerCase())
  );

  const filteredCR = (communityRequests as CommunityRequest[]).filter((r) =>
    !search || r.organizer_name.toLowerCase().includes(search.toLowerCase()) ||
    r.email.toLowerCase().includes(search.toLowerCase()) ||
    r.organization_name.toLowerCase().includes(search.toLowerCase())
  );

  const bidsArr = bids as CrewBid[];
  const pendingBids = bidsArr.filter((b) => b.status === "pending");
  const acceptedBids = bidsArr.filter((b) => b.status === "accepted");
  const totalCrewMembers = bidsArr.reduce((acc, b) => acc + b.crew_size, 0);
  const totalRevenuePotential = acceptedBids.reduce((acc, b) => acc + (b.accepted_price || b.bid_price) * b.crew_size, 0);

  const handleAccept = async () => {
    if (!acceptDialog || !acceptPrice) return;
    setActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("accept-crew-bid", {
        body: { bid_id: acceptDialog.id, action: "accept", accepted_price: parseInt(acceptPrice) },
      });
      if (error) throw error;
      toast.success(`Bid accepted! Email sent to ${acceptDialog.captain_name}.`);
      queryClient.invalidateQueries({ queryKey: ["crew-bids"] });
      setAcceptDialog(null);
      setAcceptPrice("");
    } catch (err: any) {
      toast.error(err.message || "Failed to accept bid");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDecline = async (bidId: string) => {
    setActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke("accept-crew-bid", {
        body: { bid_id: bidId, action: "decline" },
      });
      if (error) throw error;
      toast.success("Bid declined.");
      queryClient.invalidateQueries({ queryKey: ["crew-bids"] });
      setDeclineConfirm(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to decline bid");
    } finally {
      setActionLoading(false);
    }
  };

  const handleResend = async (bid: CrewBid) => {
    setActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke("accept-crew-bid", {
        body: { bid_id: bid.id, action: "resend" },
      });
      if (error) throw error;
      toast.success(`Checkout link extended 48hrs & resent to ${bid.captain_name}.`);
      queryClient.invalidateQueries({ queryKey: ["crew-bids"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to resend");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCRStatusChange = async (id: string, status: string) => {
    setCrStatusLoading(id);
    try {
      const { error } = await (supabase as any)
        .from("community_requests")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      toast.success(`Status updated to ${status}`);
      queryClient.invalidateQueries({ queryKey: ["community-requests"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to update status");
    } finally {
      setCrStatusLoading(null);
    }
  };

  const handleReply = async () => {
    if (!replyDialog || !replyMessage.trim()) return;
    setActionLoading(true);
    try {
      await supabase.functions.invoke("send-crew-confirmation", {
        body: {
          type: "community_reply",
          data: {
            organizer_name: replyDialog.organizer_name,
            email: replyDialog.email,
            message: replyMessage,
          },
        },
      });
      await (supabase as any)
        .from("community_requests")
        .update({ status: "responded", updated_at: new Date().toISOString() })
        .eq("id", replyDialog.id);
      toast.success(`Reply sent to ${replyDialog.organizer_name}`);
      queryClient.invalidateQueries({ queryKey: ["community-requests"] });
      setReplyDialog(null);
      setReplyMessage("");
    } catch (err: any) {
      toast.error(err.message || "Failed to send reply");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={Users}
        title="Crew Bids"
        subtitle="Manage Bring Your Crew campaign submissions"
        actions={
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--admin-text-muted))]" />
            <AdminInput
              placeholder="Search bids..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <AdminStatCard
          label="Total Bids"
          value={bidsArr.length}
          icon={Users}
        />
        <AdminStatCard
          label="Pending"
          value={pendingBids.length}
          icon={Clock}
        />
        <AdminStatCard
          label="Total Crew Members"
          value={totalCrewMembers}
          icon={Users}
        />
        <AdminStatCard
          label="Revenue (Accepted)"
          value={`$${totalRevenuePotential.toLocaleString()}`}
          icon={DollarSign}
        />
      </div>

      <AdminTabs defaultValue="bids">
        <AdminTabsList>
          <AdminTabsTrigger value="bids">Crew Bids ({bidsArr.length})</AdminTabsTrigger>
          <AdminTabsTrigger value="community">Community Requests ({(communityRequests as CommunityRequest[]).length})</AdminTabsTrigger>
        </AdminTabsList>

        <AdminTabsContent value="bids">
          <AdminCard>
            <AdminCardContent className="p-0">
              {bidsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--admin-text-muted))]" />
                </div>
              ) : filteredBids.length === 0 ? (
                <div className="text-center py-12 text-[hsl(var(--admin-text-muted))]">No crew bids found</div>
              ) : (
                <AdminTable>
                  <AdminTableHeader>
                    <AdminTableRow>
                      <AdminTableHead>Captain</AdminTableHead>
                      <AdminTableHead>Crew</AdminTableHead>
                      <AdminTableHead>Ticket</AdminTableHead>
                      <AdminTableHead>Bid</AdminTableHead>
                      <AdminTableHead>Total</AdminTableHead>
                      <AdminTableHead>Status</AdminTableHead>
                      <AdminTableHead>Payment</AdminTableHead>
                      <AdminTableHead>Submitted</AdminTableHead>
                      <AdminTableHead>Actions</AdminTableHead>
                    </AdminTableRow>
                  </AdminTableHeader>
                  <AdminTableBody>
                    {filteredBids.map((bid) => (
                      <AdminTableRow key={bid.id}>
                        <AdminTableCell>
                          <div>
                            <div className="font-medium">{bid.captain_name}</div>
                            <div className="text-xs text-[hsl(var(--admin-text-muted))]">{bid.email}</div>
                            {bid.phone && <div className="text-xs text-[hsl(var(--admin-text-muted))]">{bid.phone}</div>}
                          </div>
                        </AdminTableCell>
                        <AdminTableCell>{bid.crew_size}</AdminTableCell>
                        <AdminTableCell>{TICKET_LABELS[bid.ticket_type] || bid.ticket_type}</AdminTableCell>
                        <AdminTableCell>${bid.bid_price}</AdminTableCell>
                        <AdminTableCell className="font-medium">
                          ${((bid.accepted_price || bid.bid_price) * bid.crew_size).toLocaleString()}
                        </AdminTableCell>
                        <AdminTableCell>
                          <AdminBadge intent={STATUS_INTENTS[bid.status] || "neutral"}>
                            {bid.status}
                          </AdminBadge>
                        </AdminTableCell>
                        <AdminTableCell>
                          <AdminBadge intent={bid.payment_status === "paid" ? "success" : "neutral"}>
                            {bid.payment_status}
                          </AdminBadge>
                        </AdminTableCell>
                        <AdminTableCell className="text-xs">
                          {format(new Date(bid.created_at), "MMM d, h:mm a")}
                        </AdminTableCell>
                        <AdminTableCell>
                          {bid.status === "pending" && (
                            <div className="flex gap-1">
                              <AdminButton
                                variant="default"
                                size="sm"
                                onClick={() => {
                                  setAcceptDialog(bid);
                                  setAcceptPrice(bid.bid_price.toString());
                                }}
                              >
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Accept
                              </AdminButton>
                              <AdminButton
                                variant="outline"
                                size="sm"
                                onClick={() => setDeclineConfirm(bid.id)}
                              >
                                <XCircle className="w-3 h-3 mr-1" />
                                Decline
                              </AdminButton>
                            </div>
                          )}
                          {(bid.status === "accepted" || bid.status === "expired") && bid.payment_status !== "paid" && (
                            <AdminButton
                              variant="outline"
                              size="sm"
                              onClick={() => handleResend(bid)}
                              disabled={actionLoading}
                            >
                              <RefreshCw className="w-3 h-3 mr-1" />
                              Resend & Extend 48h
                            </AdminButton>
                          )}
                        </AdminTableCell>
                      </AdminTableRow>
                    ))}
                  </AdminTableBody>
                </AdminTable>
              )}
            </AdminCardContent>
          </AdminCard>
        </AdminTabsContent>

        <AdminTabsContent value="community">
          <AdminCard>
            <AdminCardContent className="p-0">
              {crLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--admin-text-muted))]" />
                </div>
              ) : filteredCR.length === 0 ? (
                <div className="text-center py-12 text-[hsl(var(--admin-text-muted))]">No community requests found</div>
              ) : (
                <AdminTable>
                  <AdminTableHeader>
                    <AdminTableRow>
                     <AdminTableHead>Organizer</AdminTableHead>
                      <AdminTableHead>Organization</AdminTableHead>
                      <AdminTableHead>Group Size</AdminTableHead>
                      <AdminTableHead>Description</AdminTableHead>
                      <AdminTableHead>Status</AdminTableHead>
                      <AdminTableHead>Submitted</AdminTableHead>
                      <AdminTableHead>Actions</AdminTableHead>
                    </AdminTableRow>
                  </AdminTableHeader>
                  <AdminTableBody>
                    {filteredCR.map((req) => (
                      <AdminTableRow key={req.id}>
                        <AdminTableCell>
                          <div>
                            <div className="font-medium">{req.organizer_name}</div>
                            <div className="text-xs text-[hsl(var(--admin-text-muted))]">{req.email}</div>
                            {req.phone && <div className="text-xs text-[hsl(var(--admin-text-muted))]">{req.phone}</div>}
                          </div>
                        </AdminTableCell>
                        <AdminTableCell>{req.organization_name}</AdminTableCell>
                        <AdminTableCell>{req.group_size}</AdminTableCell>
                        <AdminTableCell className="max-w-xs truncate">{req.description}</AdminTableCell>
                        <AdminTableCell>
                          <AdminSelect
                            value={req.status}
                            onValueChange={(val) => handleCRStatusChange(req.id, val)}
                            disabled={crStatusLoading === req.id}
                          >
                            <AdminSelectItem value="pending">Pending</AdminSelectItem>
                            <AdminSelectItem value="reviewing">Reviewing</AdminSelectItem>
                            <AdminSelectItem value="responded">Responded</AdminSelectItem>
                            <AdminSelectItem value="approved">Approved</AdminSelectItem>
                            <AdminSelectItem value="declined">Declined</AdminSelectItem>
                          </AdminSelect>
                        </AdminTableCell>
                        <AdminTableCell className="text-xs">
                          {format(new Date(req.created_at), "MMM d, h:mm a")}
                        </AdminTableCell>
                        <AdminTableCell>
                          <AdminButton
                            variant="outline"
                            size="sm"
                            onClick={() => setReplyDialog(req)}
                          >
                            <Mail className="w-3 h-3 mr-1" />
                            Reply
                          </AdminButton>
                        </AdminTableCell>
                      </AdminTableRow>
                    ))}
                  </AdminTableBody>
                </AdminTable>
              )}
            </AdminCardContent>
          </AdminCard>
        </AdminTabsContent>
      </AdminTabs>

      {/* Accept Dialog */}
      <AdminDialog open={!!acceptDialog} onOpenChange={() => setAcceptDialog(null)}>
        <AdminDialogContent>
          <AdminDialogHeader>
            <AdminDialogTitle>Accept Crew Bid</AdminDialogTitle>
            <AdminDialogDescription>
              Set the accepted price per ticket for {acceptDialog?.captain_name}'s crew of {acceptDialog?.crew_size}.
            </AdminDialogDescription>
          </AdminDialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <AdminLabel>Original Bid: ${acceptDialog?.bid_price}/ticket</AdminLabel>
            </div>
            <div>
              <AdminLabel>Accepted Price (per ticket)</AdminLabel>
              <AdminInput
                type="number"
                value={acceptPrice}
                onChange={(e) => setAcceptPrice(e.target.value)}
                min={1}
              />
            </div>
            {acceptPrice && acceptDialog && (
              <div className="p-3 rounded-lg bg-[hsl(var(--admin-hover))]">
                <div className="text-sm text-[hsl(var(--admin-text-secondary))]">
                  Total: {acceptDialog.crew_size} × ${acceptPrice} = <strong>${(acceptDialog.crew_size * parseInt(acceptPrice || "0")).toLocaleString()}</strong>
                </div>
              </div>
            )}
          </div>
          <AdminDialogFooter>
            <AdminButton variant="outline" onClick={() => setAcceptDialog(null)}>Cancel</AdminButton>
            <AdminButton onClick={handleAccept} disabled={actionLoading || !acceptPrice}>
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle className="w-4 h-4 mr-1" />}
              Accept & Send Email
            </AdminButton>
          </AdminDialogFooter>
        </AdminDialogContent>
      </AdminDialog>

      {/* Community Reply Dialog */}
      <AdminDialog open={!!replyDialog} onOpenChange={() => { setReplyDialog(null); setReplyMessage(""); }}>
        <AdminDialogContent>
          <AdminDialogHeader>
            <AdminDialogTitle>Reply to {replyDialog?.organizer_name}</AdminDialogTitle>
            <AdminDialogDescription>
              Send a reply to {replyDialog?.email} regarding their community request for {replyDialog?.organization_name} ({replyDialog?.group_size} people).
            </AdminDialogDescription>
          </AdminDialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 rounded-lg bg-[hsl(var(--admin-hover))]">
              <div className="text-xs text-[hsl(var(--admin-text-muted))] mb-1">Their request:</div>
              <div className="text-sm">{replyDialog?.description}</div>
            </div>
            <div>
              <AdminLabel>Your Reply</AdminLabel>
              <AdminTextarea
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                placeholder="Write your response..."
                rows={5}
              />
            </div>
          </div>
          <AdminDialogFooter>
            <AdminButton variant="outline" onClick={() => { setReplyDialog(null); setReplyMessage(""); }}>Cancel</AdminButton>
            <AdminButton onClick={handleReply} disabled={actionLoading || !replyMessage.trim()}>
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Mail className="w-4 h-4 mr-1" />}
              Send Reply
            </AdminButton>
          </AdminDialogFooter>
        </AdminDialogContent>
      </AdminDialog>

      {/* Decline Confirm */}
      <AdminConfirmDialog
        open={!!declineConfirm}
        onOpenChange={() => setDeclineConfirm(null)}
        title="Decline Crew Bid"
        description="Are you sure you want to decline this crew bid? This cannot be undone."
        actionLabel="Decline"
        onConfirm={() => declineConfirm && handleDecline(declineConfirm)}
        isLoading={actionLoading}
        actionType="destructive"
      />
    </div>
  );
};

export default CrewBids;
