import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import {
  AdminCard, AdminCardContent, AdminCardHeader,
  AdminButton, AdminBadge, AdminInput,
  AdminTable, AdminTableBody, AdminTableCell, AdminTableHead, AdminTableHeader, AdminTableRow,
  AdminEmptyState, AdminConfirmDialog,
} from "@/components/admin";
import { AdminTextarea } from "@/components/admin/AdminFormPrimitives";
import { AdminSelect, AdminSelectItem } from "@/components/admin/AdminSelect";
import { AdminSheet, AdminSheetContent, AdminSheetHeader, AdminSheetTitle, AdminSheetDescription } from "@/components/admin/AdminSheet";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Search, Download, Trash2, Eye, Users, Hammer, Heart, Gift, RefreshCw,
  CheckCircle, Clock, XCircle, Music, Store, Handshake, Phone, Instagram,
  Mail, ArrowRight, Archive, ArchiveRestore, UserPlus, Megaphone,
} from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { EmailPreviewModal } from "@/components/admin/EmailPreviewModal";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getPrimaryEventId } from "@/platform/config/eventIds";

// ─── Types ───────────────────────────────────────────────────────

interface VolunteerInterest {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  referral_source: string | null;
  preferred_contact: string | null;
  volunteer_type: string | null;
  instagram_url: string | null;
  participation_type: string | null;
  contribution_types: string[];
  volunteer_days: string[];
  street_team_activities: string[];
  message: string | null;
  created_at: string;
  status: string;
  contacted_at: string | null;
  contacted_by: string | null;
  admin_notes: string | null;
  archived_at: string | null;
  archived_to_pipeline: string | null;
}

// ─── Label maps ──────────────────────────────────────────────────

const volunteerDayLabels: Record<string, string> = {
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const streetTeamActivityLabels: Record<string, string> = {
  posters: "Put up posters",
  flyers: "Pass out flyers",
};

const participationLabels: Record<string, { label: string; icon: React.ReactNode }> = {
  volunteer: { label: "Volunteer", icon: <Heart className="w-3 h-3" /> },
  band_musician: { label: "Band/Musician", icon: <Music className="w-3 h-3" /> },
  artisan_vendor: { label: "Artisan/Vendor", icon: <Store className="w-3 h-3" /> },
  partner: { label: "Partner", icon: <Handshake className="w-3 h-3" /> },
  donate: { label: "Donate", icon: <Heart className="w-3 h-3" /> },
};

const volunteerTypeLabels: Record<string, string> = {
  festival: "Festival",
  street_team: "Street Team",
  both: "Both",
};

const referralLabels: Record<string, string> = {
  friend: "Friend/Family",
  social_media: "Social Media",
  attended_before: "Previous Event",
  search: "Online Search",
  flyer_poster: "Flyer/Poster",
  other: "Other",
};

const preferredContactLabels: Record<string, string> = {
  email: "Email",
  phone: "Phone",
  text: "Text",
};

const contributionLabels: Record<string, { label: string; icon: React.ReactNode }> = {
  volunteer: { label: "Volunteer", icon: <Users className="w-3 h-3" /> },
  build: { label: "Build", icon: <Hammer className="w-3 h-3" /> },
  donate: { label: "Donate", icon: <Heart className="w-3 h-3" /> },
  creative: { label: "Creative", icon: <Gift className="w-3 h-3" /> },
};

const statusConfig: Record<string, { label: string; icon: React.ReactNode; intent: "success" | "warning" | "danger" | "info" | "neutral" }> = {
  new: { label: "New", icon: <Clock className="w-3 h-3" />, intent: "warning" },
  contacted: { label: "Contacted", icon: <CheckCircle className="w-3 h-3" />, intent: "success" },
  not_interested: { label: "Not Interested", icon: <XCircle className="w-3 h-3" />, intent: "neutral" },
  archived: { label: "Moved to Pipeline", icon: <Archive className="w-3 h-3" />, intent: "info" },
};

// ─── Constants ───────────────────────────────────────────────────

const EVENT_ID = getPrimaryEventId();

const PIPELINE_OPTIONS = [
  { value: "volunteer", label: "Volunteer Pipeline", icon: Users, table: "volunteers" as const, url: "/admin/production-volunteers", primary: true },
  { value: "street_team", label: "Street Team", icon: Megaphone, table: "street_team" as const, url: "/admin/street-team", primary: false },
  { value: "artist", label: "Artists", icon: Music, table: "artists" as const, url: "/admin/artists", primary: false },
  { value: "vendor", label: "Vendors", icon: Store, table: "vendors" as const, url: "/admin/vendors", primary: false },
  { value: "artisan", label: "Artisans", icon: Hammer, table: "artisans" as const, url: "/admin/artisans", primary: false },
  { value: "partner", label: "Partners", icon: Handshake, table: "partners" as const, url: "/admin/partners", primary: false },
] as const;

// ─── Component ───────────────────────────────────────────────────

const VolunteerInterests = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Highlight support from notification click-through
  const highlightId = searchParams.get("highlight");
  const highlightedRowRef = useRef<HTMLTableRowElement>(null);
  const [highlightActive, setHighlightActive] = useState(false);

  // State
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterParticipationType, setFilterParticipationType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [selectedInterest, setSelectedInterest] = useState<VolunteerInterest | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [movingTo, setMovingTo] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VolunteerInterest | null>(null);
  const [moveConfirm, setMoveConfirm] = useState<{ interest: VolunteerInterest; pipeline: typeof PIPELINE_OPTIONS[number] } | null>(null);

  // ─── Queries ─────────────────────────────────────────────────

  const { data: interests, isLoading, refetch } = useAuthQuery({
    queryKey: ["volunteer-interests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("volunteer_interests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as VolunteerInterest[];
    },
    staleTime: 60 * 1000,
  });

  // ─── Highlight scroll effect ─────────────────────────────────
  useEffect(() => {
    if (highlightId && interests && interests.length > 0) {
      // Small delay to let DOM render
      const timer = setTimeout(() => {
        if (highlightedRowRef.current) {
          highlightedRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
          setHighlightActive(true);
          // Remove highlight param after animation
          setTimeout(() => {
            setHighlightActive(false);
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.delete("highlight");
              return next;
            }, { replace: true });
          }, 3000);
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [highlightId, interests]);

  // ─── Mutations ───────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("volunteer_interests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["volunteer-interests"] });
      toast.success("Submission deleted");
      setDeleteTarget(null);
      if (selectedInterest && deleteTarget && selectedInterest.id === deleteTarget.id) {
        setSelectedInterest(null);
      }
    },
    onError: () => toast.error("Failed to delete submission"),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes?: string }) => {
      const updateData: Record<string, unknown> = { status };
      if (status === "contacted") {
        updateData.contacted_at = new Date().toISOString();
        updateData.contacted_by = user?.id;
      }
      if (notes !== undefined) updateData.admin_notes = notes;
      const { error } = await supabase.from("volunteer_interests").update(updateData).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["volunteer-interests"] });
      toast.success("Status updated");
    },
    onError: () => toast.error("Failed to update status"),
  });

  const moveToPipelineMutation = useMutation({
    mutationFn: async ({ interest, pipeline }: { interest: VolunteerInterest; pipeline: typeof PIPELINE_OPTIONS[number] }) => {
      const notePrefix = `Moved from Volunteer Interests | City: ${interest.city || "N/A"}`;
      const igNote = interest.instagram_url ? ` | Instagram: ${interest.instagram_url}` : "";
      const fullNotes = `${notePrefix}${interest.message ? ` | Message: ${interest.message}` : ""}${igNote}`;

      // Common insert fields — only columns shared by ALL pipeline tables
      const commonFields = {
        name: interest.name,
        email: interest.email,
        phone: interest.phone,
        event_id: EVENT_ID,
        pipeline_status: "lead" as const,
        notes: fullNotes,
      };

      if (pipeline.value === "volunteer") {
        // Duplicate check
        const { data: existing } = await supabase
          .from("volunteers")
          .select("id")
          .eq("email", interest.email)
          .maybeSingle();
        if (existing) throw new Error("Already exists in the Volunteer pipeline");

        const { error } = await supabase.from("volunteers").insert(commonFields);
        if (error) throw error;
      } else if (pipeline.value === "artist") {
        const { error } = await supabase.from("artists").insert({
          name: interest.name,
          event_id: EVENT_ID,
          pipeline_status: "lead",
          notes: fullNotes,
          instagram_url: interest.instagram_url,
        });
        if (error) throw error;
      } else if (pipeline.value === "vendor") {
        const { error } = await supabase.from("vendors").insert({
          ...commonFields,
          instagram_url: interest.instagram_url,
        });
        if (error) throw error;
      } else if (pipeline.value === "artisan") {
        const { error } = await supabase.from("artisans").insert({
          ...commonFields,
          instagram_url: interest.instagram_url,
        });
        if (error) throw error;
      } else if (pipeline.value === "partner") {
        const { error } = await supabase.from("partners").insert(commonFields);
        if (error) throw error;
      } else if (pipeline.value === "street_team") {
        const { data: existing } = await supabase
          .from("street_team")
          .select("id")
          .eq("email", interest.email)
          .maybeSingle();
        if (existing) throw new Error("Already exists in the Street Team pipeline");

        const { error } = await supabase.from("street_team").insert({
          ...commonFields,
          instagram_url: interest.instagram_url,
          city: interest.city,
        });
        if (error) throw error;
      }

      // Archive the interest record
      const { error: archiveError } = await supabase
        .from("volunteer_interests")
        .update({
          status: "archived",
          archived_at: new Date().toISOString(),
          archived_to_pipeline: pipeline.label,
          contacted_at: new Date().toISOString(),
          contacted_by: user?.id,
        })
        .eq("id", interest.id);
      if (archiveError) throw archiveError;
    },
    onSuccess: (_, { pipeline }) => {
      queryClient.invalidateQueries({ queryKey: ["volunteer-interests"] });
      toast.success(`Moved to ${pipeline.label}`, {
        action: { label: "View Pipeline", onClick: () => navigate(pipeline.url) },
      });
      setSelectedInterest(null);
      setMovingTo(null);
      setMoveConfirm(null);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to move to pipeline");
      setMovingTo(null);
      setMoveConfirm(null);
    },
  });

  // ─── Filtering ───────────────────────────────────────────────

  const filteredInterests = useMemo(() => {
    return interests?.filter((interest) => {
      if (!showArchived && interest.status === "archived") return false;

      const matchesSearch =
        interest.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        interest.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (interest.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);

      const matchesFilter = filterType === "all" || interest.contribution_types.includes(filterType);
      const matchesParticipation = filterParticipationType === "all" || interest.participation_type === filterParticipationType;
      const matchesStatus = filterStatus === "all" || interest.status === filterStatus;

      return matchesSearch && matchesFilter && matchesParticipation && matchesStatus;
    });
  }, [interests, searchTerm, filterType, filterParticipationType, filterStatus, showArchived]);

  // ─── Stats ───────────────────────────────────────────────────

  const stats = useMemo(() => {
    const active = interests?.filter(i => i.status !== "archived") || [];
    return {
      total: active.length,
      new: active.filter(i => i.status === "new").length,
      contacted: active.filter(i => i.status === "contacted").length,
      volunteers: active.filter(i => i.participation_type === "volunteer").length,
      archived: interests?.filter(i => i.status === "archived").length || 0,
    };
  }, [interests]);

  // ─── Handlers ────────────────────────────────────────────────

  const handleOpenDetail = (interest: VolunteerInterest) => {
    setSelectedInterest(interest);
    setAdminNotes(interest.admin_notes || "");
  };

  const handleSaveNotes = () => {
    if (!selectedInterest) return;
    updateStatusMutation.mutate({
      id: selectedInterest.id,
      status: selectedInterest.status,
      notes: adminNotes,
    });
  };

  const handleMarkContacted = () => {
    if (!selectedInterest) return;
    updateStatusMutation.mutate({
      id: selectedInterest.id,
      status: "contacted",
      notes: adminNotes,
    });
    setSelectedInterest({ ...selectedInterest, status: "contacted" });
  };

  const handleExport = () => {
    if (!filteredInterests?.length) {
      toast.error("No data to export");
      return;
    }

    const csvContent = [
      ["Name", "Email", "Phone", "City", "Participation Type", "Volunteer Type", "Referral Source", "Preferred Contact", "Volunteer Days", "Street Team Activities", "Status", "Message", "Admin Notes", "Submitted At", "Contacted At"].join(","),
      ...filteredInterests.map((interest) =>
        [
          `"${interest.name}"`,
          `"${interest.email}"`,
          `"${interest.phone || ""}"`,
          `"${interest.city || ""}"`,
          `"${participationLabels[interest.participation_type || ""]?.label || interest.participation_type || ""}"`,
          `"${volunteerTypeLabels[interest.volunteer_type || ""] || interest.volunteer_type || ""}"`,
          `"${referralLabels[interest.referral_source || ""] || interest.referral_source || ""}"`,
          `"${preferredContactLabels[interest.preferred_contact || ""] || interest.preferred_contact || ""}"`,
          `"${interest.volunteer_days?.join("; ") || ""}"`,
          `"${interest.street_team_activities?.join("; ") || ""}"`,
          `"${statusConfig[interest.status]?.label || interest.status}"`,
          `"${(interest.message || "").replace(/"/g, '""')}"`,
          `"${(interest.admin_notes || "").replace(/"/g, '""')}"`,
          `"${format(new Date(interest.created_at), "yyyy-MM-dd HH:mm")}"`,
          `"${interest.contacted_at ? format(new Date(interest.contacted_at), "yyyy-MM-dd HH:mm") : ""}"`,
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `volunteer-interests-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    toast.success("Exported to CSV");
  };

  const handleConfirmMove = (interest: VolunteerInterest, pipeline: typeof PIPELINE_OPTIONS[number]) => {
    setMoveConfirm({ interest, pipeline });
  };

  const executeMove = () => {
    if (!moveConfirm) return;
    setMovingTo(moveConfirm.pipeline.value);
    moveToPipelineMutation.mutate(moveConfirm);
  };

  // ─── Render ──────────────────────────────────────────────────

  const isActiveStatus = (status: string) => status !== "archived" && status !== "not_interested";

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Volunteer Interests"
        subtitle="Triage incoming interest form submissions → move qualified volunteers to the pipeline"
        icon={Heart}
      />

      {/* Compact Stats Strip — scrollable on mobile */}
      <div className="overflow-x-auto scrollbar-none -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
        <div className="flex items-center gap-4 sm:gap-6 px-3 sm:px-4 py-2.5 sm:py-3 rounded-md border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-card))] min-w-max">
          <div className="flex items-center gap-1.5">
            <span className="text-base sm:text-lg font-bold text-[hsl(var(--admin-text))]">{stats.total}</span>
            <span className="text-[10px] sm:text-xs text-[hsl(var(--admin-text-muted))]">Active</span>
          </div>
          <div className="w-px h-4 sm:h-5 bg-[hsl(var(--admin-border))]" />
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[hsl(var(--admin-warning))]" />
            <span className="text-xs sm:text-sm font-semibold text-[hsl(var(--admin-text))]">{stats.new}</span>
            <span className="text-[10px] sm:text-xs text-[hsl(var(--admin-text-muted))]">Review</span>
          </div>
          <div className="w-px h-4 sm:h-5 bg-[hsl(var(--admin-border))]" />
          <div className="flex items-center gap-1">
            <CheckCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[hsl(var(--admin-success))]" />
            <span className="text-xs sm:text-sm font-semibold text-[hsl(var(--admin-text))]">{stats.contacted}</span>
            <span className="text-[10px] sm:text-xs text-[hsl(var(--admin-text-muted))]">Contacted</span>
          </div>
          <div className="w-px h-4 sm:h-5 bg-[hsl(var(--admin-border))]" />
          <div className="flex items-center gap-1">
            <Heart className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[hsl(var(--admin-success))]" />
            <span className="text-xs sm:text-sm font-semibold text-[hsl(var(--admin-text))]">{stats.volunteers}</span>
            <span className="text-[10px] sm:text-xs text-[hsl(var(--admin-text-muted))]">Vol</span>
          </div>
          <div className="w-px h-4 sm:h-5 bg-[hsl(var(--admin-border))]" />
          <div className="flex items-center gap-1">
            <Archive className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[hsl(var(--admin-text-muted))]" />
            <span className="text-xs sm:text-sm font-semibold text-[hsl(var(--admin-text))]">{stats.archived}</span>
            <span className="text-[10px] sm:text-xs text-[hsl(var(--admin-text-muted))]">Moved</span>
          </div>
        </div>
      </div>

      {/* Filters and Actions */}
      <AdminCard>
        <AdminCardHeader>
          <div className="space-y-2 sm:space-y-0 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
            {/* Row 1 on mobile: Search + action icons */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:flex-none sm:w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--admin-text-muted))]" />
                <AdminInput
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-8 text-sm"
                />
              </div>
              <div className="flex items-center gap-1 sm:hidden">
                <AdminButton
                  variant={showArchived ? "admin" : "adminOutline"}
                  size="icon"
                  onClick={() => setShowArchived(!showArchived)}
                  className="h-8 w-8"
                >
                  {showArchived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                </AdminButton>
                <AdminButton variant="adminOutline" size="icon" onClick={() => refetch()} className="h-8 w-8">
                  <RefreshCw className="w-3.5 h-3.5" />
                </AdminButton>
                <AdminButton variant="adminOutline" size="icon" onClick={handleExport} className="h-8 w-8">
                  <Download className="w-3.5 h-3.5" />
                </AdminButton>
              </div>
            </div>
            {/* Row 2 on mobile: Filters scroll horizontally */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none" style={{ scrollbarWidth: 'none' }}>
              <AdminSelect value={filterStatus} onValueChange={setFilterStatus}>
                <AdminSelectItem value="all">All Status</AdminSelectItem>
                <AdminSelectItem value="new">New</AdminSelectItem>
                <AdminSelectItem value="contacted">Contacted</AdminSelectItem>
                <AdminSelectItem value="not_interested">Not Interested</AdminSelectItem>
                <AdminSelectItem value="archived">Moved to Pipeline</AdminSelectItem>
              </AdminSelect>
              <AdminSelect value={filterParticipationType} onValueChange={setFilterParticipationType}>
                <AdminSelectItem value="all">All Participation</AdminSelectItem>
                <AdminSelectItem value="volunteer">Volunteer</AdminSelectItem>
                <AdminSelectItem value="band_musician">Band/Musician</AdminSelectItem>
                <AdminSelectItem value="artisan_vendor">Artisan/Vendor</AdminSelectItem>
                <AdminSelectItem value="partner">Partner</AdminSelectItem>
                <AdminSelectItem value="donate">Donate</AdminSelectItem>
              </AdminSelect>
              <AdminSelect value={filterType} onValueChange={setFilterType}>
                <AdminSelectItem value="all">All Interests</AdminSelectItem>
                <AdminSelectItem value="volunteer">Volunteer</AdminSelectItem>
                <AdminSelectItem value="build">Build Weekend</AdminSelectItem>
                <AdminSelectItem value="donate">Donate</AdminSelectItem>
                <AdminSelectItem value="creative">Creative</AdminSelectItem>
              </AdminSelect>
              {filteredInterests && (
                <span className="text-[10px] text-[hsl(var(--admin-text-muted))] whitespace-nowrap shrink-0">
                  {filteredInterests.length}/{interests?.length || 0}
                </span>
              )}
            </div>
            {/* Desktop-only action buttons (inline) */}
            <div className="hidden sm:flex items-center gap-1.5 ml-auto">
              <AdminButton
                variant={showArchived ? "admin" : "adminOutline"}
                size="sm"
                onClick={() => setShowArchived(!showArchived)}
                className="h-8"
              >
                {showArchived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                <span className="ml-1.5 text-xs">{showArchived ? "Active" : `Archived (${stats.archived})`}</span>
              </AdminButton>
              <AdminButton variant="adminOutline" size="sm" onClick={() => refetch()} className="h-8">
                <RefreshCw className="w-3.5 h-3.5" />
              </AdminButton>
              <AdminButton variant="adminOutline" size="sm" onClick={handleExport} className="h-8">
                <Download className="w-3.5 h-3.5" />
              </AdminButton>
            </div>
          </div>
        </AdminCardHeader>
        <AdminCardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[hsl(var(--admin-text-muted))]" />
            </div>
          ) : !filteredInterests?.length ? (
            <AdminEmptyState
              title={showArchived ? "No archived submissions" : "No submissions to review"}
              description={
                showArchived
                  ? "No volunteer interest submissions have been moved to a pipeline yet."
                  : searchTerm || filterStatus !== "all" || filterParticipationType !== "all" || filterType !== "all"
                    ? "Try adjusting your filters to see more results."
                    : "New submissions from the Get Involved form will appear here."
              }
              icon={showArchived ? <Archive className="w-10 h-10" /> : <Heart className="w-10 h-10" />}
            />
          ) : (
            <>
              <div className="rounded-md border border-[hsl(var(--admin-border))]">
                <AdminTable>
                  <AdminTableHeader>
                    <AdminTableRow>
                      <AdminTableHead>Name</AdminTableHead>
                      <AdminTableHead className="hidden sm:table-cell">Contact</AdminTableHead>
                      <AdminTableHead className="hidden md:table-cell">City</AdminTableHead>
                      <AdminTableHead className="hidden sm:table-cell">Type</AdminTableHead>
                      <AdminTableHead className="hidden lg:table-cell">Vol. Type</AdminTableHead>
                      <AdminTableHead>Status</AdminTableHead>
                      <AdminTableHead className="hidden md:table-cell">Submitted</AdminTableHead>
                      <AdminTableHead className="w-[80px] sm:w-[100px]">Actions</AdminTableHead>
                    </AdminTableRow>
                  </AdminTableHeader>
                  <AdminTableBody>
                    {filteredInterests.map((interest) => {
                      const status = statusConfig[interest.status] || statusConfig.new;
                      const participationType = participationLabels[interest.participation_type || ""];
                      const volunteerType = volunteerTypeLabels[interest.volunteer_type || ""];
                      const canMove = isActiveStatus(interest.status);
                      const isHighlighted = highlightId === interest.id;
                      return (
                        <AdminTableRow
                          key={interest.id}
                          ref={isHighlighted ? highlightedRowRef : undefined}
                          className={`cursor-pointer hover:bg-[hsl(var(--admin-hover))] transition-all duration-500 ${
                            isHighlighted && highlightActive
                              ? "ring-2 ring-[hsl(var(--admin-accent))] bg-[hsl(var(--admin-accent)/0.08)]"
                              : ""
                          }`}
                          onClick={() => handleOpenDetail(interest)}
                        >
                          <AdminTableCell className="font-medium text-[hsl(var(--admin-text))]">
                            <div>
                              <span className="block">{interest.name}</span>
                              {/* Show email under name on mobile since Contact column is hidden */}
                              <span className="block sm:hidden text-xs text-[hsl(var(--admin-text-muted))] truncate max-w-[160px]">
                                {interest.email}
                              </span>
                            </div>
                          </AdminTableCell>
                          <AdminTableCell className="hidden sm:table-cell">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-sm text-[hsl(var(--admin-text))] truncate max-w-[200px]">{interest.email}</span>
                              {interest.phone && (
                                <span className="text-xs text-[hsl(var(--admin-text-muted))]">{interest.phone}</span>
                              )}
                            </div>
                          </AdminTableCell>
                          <AdminTableCell className="hidden md:table-cell">
                            {interest.city ? (
                              <span className="text-sm text-[hsl(var(--admin-text))]">{interest.city}</span>
                            ) : (
                              <span className="text-[hsl(var(--admin-text-muted))] text-xs">—</span>
                            )}
                          </AdminTableCell>
                          <AdminTableCell className="hidden sm:table-cell">
                            {participationType ? (
                              <AdminBadge intent="neutral">
                                {participationType.icon}
                                <span className="ml-1">{participationType.label}</span>
                              </AdminBadge>
                            ) : (
                              <span className="text-[hsl(var(--admin-text-muted))] text-sm">—</span>
                            )}
                          </AdminTableCell>
                          <AdminTableCell className="hidden lg:table-cell">
                            {volunteerType ? (
                              <AdminBadge intent="neutral">{volunteerType}</AdminBadge>
                            ) : (
                              <span className="text-[hsl(var(--admin-text-muted))] text-xs">—</span>
                            )}
                          </AdminTableCell>
                          <AdminTableCell>
                            <AdminBadge intent={status.intent}>
                              {status.icon}
                              <span className="ml-1">{status.label}</span>
                            </AdminBadge>
                          </AdminTableCell>
                          <AdminTableCell className="hidden md:table-cell text-sm text-[hsl(var(--admin-text-muted))]">
                            {format(new Date(interest.created_at), "MMM d")}
                          </AdminTableCell>
                          <AdminTableCell>
                            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                              {/* Quick move to volunteer pipeline */}
                              {canMove && interest.participation_type === "volunteer" && (
                                <AdminButton
                                  variant="adminGhost"
                                  size="icon"
                                  title="Move to Volunteer Pipeline"
                                  onClick={() => handleConfirmMove(interest, PIPELINE_OPTIONS[0])}
                                >
                                  <UserPlus className="w-4 h-4 text-[hsl(var(--admin-success))]" />
                                </AdminButton>
                              )}
                              <AdminButton
                                variant="adminGhost"
                                size="icon"
                                title="View Details"
                                onClick={() => handleOpenDetail(interest)}
                              >
                                <Eye className="w-4 h-4" />
                              </AdminButton>
                              <AdminButton
                                variant="adminGhost"
                                size="icon"
                                title="Delete"
                                onClick={() => setDeleteTarget(interest)}
                              >
                                <Trash2 className="w-4 h-4 text-[hsl(var(--admin-error))]" />
                              </AdminButton>
                            </div>
                          </AdminTableCell>
                        </AdminTableRow>
                      );
                    })}
                  </AdminTableBody>
                </AdminTable>
              </div>
            </>
          )}
        </AdminCardContent>
      </AdminCard>

      {/* ─── Detail Drawer ──────────────────────────────────────── */}
      <AdminSheet open={!!selectedInterest} onOpenChange={() => setSelectedInterest(null)}>
        <AdminSheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto pb-safe">
          {selectedInterest && (
            <>
              <AdminSheetHeader className="pb-4 border-b border-[hsl(var(--admin-border))]">
                <div className="flex items-start justify-between">
                  <div>
                    <AdminSheetTitle className="text-lg text-[hsl(var(--admin-text))]">
                      {selectedInterest.name}
                    </AdminSheetTitle>
                    <AdminSheetDescription className="text-[hsl(var(--admin-text-muted))]">
                      Submitted {format(new Date(selectedInterest.created_at), "MMMM d, yyyy 'at' h:mm a")}
                    </AdminSheetDescription>
                  </div>
                  <AdminBadge intent={statusConfig[selectedInterest.status]?.intent || "neutral"}>
                    {statusConfig[selectedInterest.status]?.icon}
                    <span className="ml-1">{statusConfig[selectedInterest.status]?.label}</span>
                  </AdminBadge>
                </div>
              </AdminSheetHeader>

              {/* Quick Actions */}
              <div className="flex flex-wrap gap-2 py-4 border-b border-[hsl(var(--admin-border))]">
                <AdminButton
                  variant="admin"
                  size="sm"
                  onClick={() => {
                    window.location.href = `mailto:${selectedInterest.email}?subject=Your Cosmico Volunteer Interest`;
                  }}
                >
                  <Mail className="w-4 h-4 mr-1.5" />
                  Send Email
                </AdminButton>
                {isActiveStatus(selectedInterest.status) && selectedInterest.status !== "contacted" && (
                  <AdminButton variant="adminOutline" size="sm" onClick={handleMarkContacted}>
                    <CheckCircle className="w-4 h-4 mr-1.5" />
                    Mark Contacted
                  </AdminButton>
                )}
                {selectedInterest.participation_type && (
                  <EmailPreviewModal
                    type="volunteer_confirmation"
                    name={selectedInterest.name}
                    email={selectedInterest.email}
                    participationType={selectedInterest.participation_type}
                    trigger={
                      <AdminButton variant="adminGhost" size="sm">
                        <Eye className="w-4 h-4 mr-1.5" />
                        Preview Email
                      </AdminButton>
                    }
                  />
                )}
              </div>

              <div className="space-y-6 py-4">
                {/* Contact Information */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-[hsl(var(--admin-text-muted))]">Contact Information</p>
                  <div className="flex flex-col gap-1.5">
                    <span className="flex items-center gap-2 text-sm text-[hsl(var(--admin-text))]">
                      <Mail className="w-3 h-3 text-[hsl(var(--admin-text-muted))]" />
                      {selectedInterest.email}
                    </span>
                    {selectedInterest.phone && (
                      <span className="flex items-center gap-2 text-sm text-[hsl(var(--admin-text))]">
                        <Phone className="w-3 h-3 text-[hsl(var(--admin-text-muted))]" />
                        {selectedInterest.phone}
                      </span>
                    )}
                    {selectedInterest.instagram_url && (
                      <a
                        href={selectedInterest.instagram_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-[hsl(var(--admin-accent))] hover:underline"
                      >
                        <Instagram className="w-3 h-3" />
                        Instagram
                      </a>
                    )}
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-4">
                  {selectedInterest.city && (
                    <div>
                      <p className="text-xs font-medium text-[hsl(var(--admin-text-muted))] mb-1">City / Location</p>
                      <p className="text-sm text-[hsl(var(--admin-text))]">{selectedInterest.city}</p>
                    </div>
                  )}
                  {selectedInterest.preferred_contact && (
                    <div>
                      <p className="text-xs font-medium text-[hsl(var(--admin-text-muted))] mb-1">Preferred Contact</p>
                      <p className="text-sm text-[hsl(var(--admin-text))]">
                        {preferredContactLabels[selectedInterest.preferred_contact] || selectedInterest.preferred_contact}
                      </p>
                    </div>
                  )}
                  {selectedInterest.referral_source && (
                    <div>
                      <p className="text-xs font-medium text-[hsl(var(--admin-text-muted))] mb-1">How They Heard About Us</p>
                      <p className="text-sm text-[hsl(var(--admin-text))]">
                        {referralLabels[selectedInterest.referral_source] || selectedInterest.referral_source}
                      </p>
                    </div>
                  )}
                </div>

                {/* Type Badges */}
                <div className="flex flex-wrap gap-4">
                  {selectedInterest.participation_type && (
                    <div>
                      <p className="text-xs font-medium text-[hsl(var(--admin-text-muted))] mb-1">Participation Type</p>
                      <AdminBadge intent="neutral">
                        {participationLabels[selectedInterest.participation_type]?.icon}
                        <span className="ml-1">{participationLabels[selectedInterest.participation_type]?.label}</span>
                      </AdminBadge>
                    </div>
                  )}
                  {selectedInterest.volunteer_type && (
                    <div>
                      <p className="text-xs font-medium text-[hsl(var(--admin-text-muted))] mb-1">Volunteer Type</p>
                      <AdminBadge intent="neutral">
                        {volunteerTypeLabels[selectedInterest.volunteer_type]}
                      </AdminBadge>
                    </div>
                  )}
                </div>

                {/* Contribution Interests */}
                {selectedInterest.contribution_types?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-[hsl(var(--admin-text-muted))] mb-2">Interests</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedInterest.contribution_types.map((type) => {
                        const config = contributionLabels[type];
                        return (
                          <AdminBadge key={type} intent="neutral">
                            {config?.icon}
                            <span className="ml-1">{config?.label || type}</span>
                          </AdminBadge>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Available Days */}
                {selectedInterest.volunteer_days?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-[hsl(var(--admin-text-muted))] mb-2">Available Days</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedInterest.volunteer_days.map((day) => (
                        <AdminBadge key={day} intent="success">
                          {volunteerDayLabels[day] || day}
                        </AdminBadge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Street Team Activities */}
                {selectedInterest.street_team_activities?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-[hsl(var(--admin-text-muted))] mb-2">Street Team Activities</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedInterest.street_team_activities.map((activity) => (
                        <AdminBadge key={activity} intent="warning">
                          {streetTeamActivityLabels[activity] || activity}
                        </AdminBadge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Their Message */}
                {selectedInterest.message && (
                  <div>
                    <p className="text-xs font-medium text-[hsl(var(--admin-text-muted))] mb-1">Their Message</p>
                    <p className="text-sm bg-[hsl(var(--admin-hover))] p-3 rounded-md whitespace-pre-wrap text-[hsl(var(--admin-text))]">
                      {selectedInterest.message}
                    </p>
                  </div>
                )}

                {/* Admin Notes */}
                <div>
                  <p className="text-xs font-medium text-[hsl(var(--admin-text-muted))] mb-1">Admin Notes</p>
                  <AdminTextarea
                    placeholder="Add notes about follow-up, response, etc..."
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    rows={3}
                  />
                  {adminNotes !== (selectedInterest.admin_notes || "") && (
                    <AdminButton size="sm" variant="adminOutline" className="mt-2" onClick={handleSaveNotes}>
                      Save Notes
                    </AdminButton>
                  )}
                </div>

                {/* Move to Pipeline */}
                <div className="pt-4 border-t border-[hsl(var(--admin-border))]">
                  <p className="text-xs font-medium text-[hsl(var(--admin-text-muted))] mb-3 flex items-center gap-1.5">
                    <ArrowRight className="w-3.5 h-3.5" />
                    Move to Pipeline
                  </p>
                  {selectedInterest.status === "archived" ? (
                    <div className="flex items-center gap-3 p-3 rounded-md bg-[hsl(var(--admin-hover))] border border-[hsl(var(--admin-border))]">
                      <Archive className="w-5 h-5 text-[hsl(var(--admin-info))] shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-[hsl(var(--admin-text))]">
                          Moved to {selectedInterest.archived_to_pipeline}
                        </p>
                        {selectedInterest.archived_at && (
                          <p className="text-xs text-[hsl(var(--admin-text-muted))]">
                            {format(new Date(selectedInterest.archived_at), "MMM d, yyyy 'at' h:mm a")}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* Primary: Volunteer Pipeline */}
                      <AdminButton
                        variant="admin"
                        size="sm"
                        className="w-full justify-center"
                        disabled={!!movingTo}
                        isLoading={movingTo === "volunteer"}
                        onClick={() => handleConfirmMove(selectedInterest, PIPELINE_OPTIONS[0])}
                      >
                        {movingTo !== "volunteer" && <Users className="w-4 h-4 mr-1.5" />}
                        Move to Volunteer Pipeline
                      </AdminButton>
                      {/* Other pipelines */}
                      <div className="grid grid-cols-2 gap-2">
                        {PIPELINE_OPTIONS.filter(p => !p.primary).map((pipeline) => {
                          const Icon = pipeline.icon;
                          const isMoving = movingTo === pipeline.value;
                          return (
                            <AdminButton
                              key={pipeline.value}
                              variant="adminOutline"
                              size="sm"
                              disabled={!!movingTo}
                              isLoading={isMoving}
                              onClick={() => handleConfirmMove(selectedInterest, pipeline)}
                            >
                              {!isMoving && <Icon className="w-3.5 h-3.5 mr-1.5" />}
                              {pipeline.label}
                            </AdminButton>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* More Actions */}
                <div className="pt-4 border-t border-[hsl(var(--admin-border))]">
                  <AdminButton
                    variant="adminGhost"
                    size="sm"
                    className="w-full text-[hsl(var(--admin-error))] hover:text-[hsl(var(--admin-error))] hover:bg-[hsl(var(--admin-error))]/10"
                    onClick={() => setDeleteTarget(selectedInterest)}
                  >
                    <Trash2 className="w-4 h-4 mr-1.5" />
                    Delete Submission
                  </AdminButton>
                </div>
              </div>
            </>
          )}
        </AdminSheetContent>
      </AdminSheet>

      {/* ─── Confirm Dialogs ────────────────────────────────────── */}
      <AdminConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="Delete Submission"
        description={`Are you sure you want to permanently delete ${deleteTarget?.name}'s submission? This cannot be undone.`}
        actionLabel="Delete"
        actionType="destructive"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        isLoading={deleteMutation.isPending}
        icon="delete"
      />

      <AdminConfirmDialog
        open={!!moveConfirm}
        onOpenChange={() => setMoveConfirm(null)}
        title={`Move to ${moveConfirm?.pipeline.label}`}
        description={`This will create a new lead record for "${moveConfirm?.interest.name}" in the ${moveConfirm?.pipeline.label} and archive this submission. They'll be available for bulk emails and all pipeline management tools.`}
        actionLabel={`Move to ${moveConfirm?.pipeline.label || "Pipeline"}`}
        actionType="warning"
        onConfirm={executeMove}
        isLoading={moveToPipelineMutation.isPending}
        icon="warning"
      />
    </div>
  );
};

export default VolunteerInterests;
