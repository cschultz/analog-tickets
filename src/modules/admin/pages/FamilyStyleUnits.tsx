import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import {
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminCardTitle,
  AdminCardDescription,
  AdminButton,
  AdminInput,
  AdminTextarea,
  AdminLabel,
  AdminBadge,
  AdminTable,
  AdminTableBody,
  AdminTableCell,
  AdminTableHead,
  AdminTableHeader,
  AdminTableRow,
  AdminTableEmpty,
  AdminDialog,
  AdminDialogContent,
  AdminDialogDescription,
  AdminDialogFooter,
  AdminDialogHeader,
  AdminDialogTitle,
  AdminSelect,
  AdminSelectItem,
  AdminSwitch,
  AdminSheet,
  AdminSheetContent,
  AdminSheetHeader,
  AdminSheetTitle,
  AdminSheetDescription,
} from "@/components/admin";
import { AdminConfirmDialog } from "@/components/admin/AdminConfirmDialog";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CompAssignmentDrawer } from "@/components/admin/lodging";
import { Home, Plus, Edit2, Trash2, Tent, House, Users, BedDouble, Search, ChevronDown, ArrowLeftRight, Map as MapIcon, ExternalLink, Loader2, AlertTriangle, RefreshCw, CheckCircle, UserPlus, Lock, HelpCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { getLodgingEventId } from "@/platform/config/eventIds";

type InventoryStatus = "available" | "held" | "reserved" | "assigned" | "locked" | "pending_offer";

interface AccommodationUnit {
  id: string;
  unit_name: string;
  product_type: "tent" | "cabin";
  zone_key: string;
  is_family_style: boolean;
  beds_total: number;
  bed_configuration: string;
  sleeps_max: number;
  has_loft: boolean;
  inventory_status: InventoryStatus;
  night_price: number;
  notes: string | null;
  stripe_price_id: string | null;
  class_from_wildhaven: string | null;
  created_at: string;
  updated_at: string;
}

interface AccommodationZone {
  zone_key: string;
  zone_name: string;
  night_price: number;
}

const INVENTORY_STATUSES: { value: InventoryStatus; label: string; intent: "success" | "warning" | "danger" | "info" | "neutral"; description: string; detail: string }[] = [
  { value: "available", label: "Available", intent: "success", description: "In inventory, can be booked", detail: "This unit is live and bookable online. Guests can select and purchase it during checkout." },
  { value: "held", label: "Held", intent: "warning", description: "Admin hold — not for sale", detail: "Pulled from online inventory. Not visible to guests. Use this to hold back units for production, bands, sponsors, or any reason you don't want it sold publicly." },
  { value: "reserved", label: "Reserved", intent: "info", description: "System-assigned after booking", detail: "A guest purchased lodging and the system automatically placed them in this unit. You can still move them to a different unit before locking." },
  { value: "assigned", label: "Assigned", intent: "neutral", description: "Admin manually placed guest", detail: "An admin manually moved a guest into this unit (or placed a comp/staff guest). The guest has NOT been notified of their unit yet. You can still move them." },
  { value: "locked", label: "Locked", intent: "danger", description: "Final placement — do not move", detail: "This is the final unit assignment. Moving a locked guest requires extra confirmation. Use this when placements are finalized and you're ready to notify guests." },
  { value: "pending_offer", label: "Pending Offer", intent: "warning", description: "Checkout in progress", detail: "A guest is currently in the checkout flow and this unit is temporarily held for them. If checkout isn't completed within 35 minutes, the lock is automatically released." },
];

const statusIntentMap: Record<InventoryStatus, "success" | "warning" | "danger" | "info" | "neutral"> = {
  available: "success",
  held: "warning",
  reserved: "info",
  assigned: "neutral",
  locked: "danger",
  pending_offer: "warning",
};

const AdminFamilyStyleUnits = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [productTypeFilter, setProductTypeFilter] = useState<string>("all");
  const [zoneFilter, setZoneFilter] = useState<string>("all");
  const [familyStyleFilter, setFamilyStyleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [unitToDelete, setUnitToDelete] = useState<AccommodationUnit | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  
  // Reassignment drawer state
  const [reassignDrawerOpen, setReassignDrawerOpen] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<AccommodationUnit | null>(null);
  const [newUnitId, setNewUnitId] = useState<string>("");
  const [isReassigning, setIsReassigning] = useState(false);
  const [isRunningCleanup, setIsRunningCleanup] = useState(false);
  const [isBulkLocking, setIsBulkLocking] = useState(false);
  const [bulkLockConfirmOpen, setBulkLockConfirmOpen] = useState(false);
  
  // Comp assignment drawer state
  const [compDrawerOpen, setCompDrawerOpen] = useState(false);
  const [preselectedCompUnitId, setPreselectedCompUnitId] = useState<string | undefined>(undefined);
  const [editingBookingId, setEditingBookingId] = useState<string | undefined>(undefined);

  // Locked unit confirmation state
  const [lockedConfirmOpen, setLockedConfirmOpen] = useState(false);
  const [pendingLockedAction, setPendingLockedAction] = useState<(() => void) | null>(null);
  const [lockedConfirmMessage, setLockedConfirmMessage] = useState("");

  // Open comp drawer for a specific orphaned unit
  const openCompDrawerForUnit = (unitId: string) => {
    setEditingBookingId(undefined);
    setPreselectedCompUnitId(unitId);
    setCompDrawerOpen(true);
  };

  // Open comp drawer in edit mode for an existing booking
  const openEditAssigneeDrawer = (bookingId: string) => {
    setPreselectedCompUnitId(undefined);
    setEditingBookingId(bookingId);
    setCompDrawerOpen(true);
  };

  // Reset preselected unit when drawer closes
  const handleCompDrawerChange = (open: boolean) => {
    setCompDrawerOpen(open);
    if (!open) {
      setPreselectedCompUnitId(undefined);
      setEditingBookingId(undefined);
    }
  };

  const [formData, setFormData] = useState({
    unit_name: "",
    product_type: "tent" as "tent" | "cabin",
    zone_key: "",
    is_family_style: false,
    beds_total: 2,
    bed_configuration: "",
    sleeps_max: 2,
    has_loft: false,
    inventory_status: "available" as InventoryStatus,
    night_price: 0,
    notes: "",
    stripe_price_id: "",
    class_from_wildhaven: "",
  });

  const queryClient = useQueryClient();

  // Fetch zones for the dropdown
  const { data: zones } = useAuthQuery({
    queryKey: ["accommodation-zones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accommodation_zones")
        .select("zone_key, zone_name, night_price")
        .order("zone_name");
      if (error) {
        console.error("Error fetching zones:", error);
        throw error;
      }
      return data as AccommodationZone[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch all units
  const { data: units, isLoading } = useAuthQuery({
    queryKey: ["accommodation-units-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accommodation_units")
        .select("*")
        .order("unit_name");
      if (error) {
        console.error("Error fetching units:", error);
        throw error;
      }
      return data as AccommodationUnit[];
    },
    staleTime: 30 * 1000,
  });

  // Fetch lodging bookings to see who is assigned to each unit + risk detection + notifications
  const { data: bookingAssignments } = useAuthQuery({
    queryKey: ["lodging-booking-assignments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lodging_bookings")
        .select(`
          id,
          assigned_unit_id,
          email,
          zone_key,
          registration_id,
          payment_status,
          assignment_status,
          created_at,
          guest_notified,
          notified_at,
          assignee_type,
          assignee_name,
          assignee_company,
          registrations!lodging_bookings_registration_id_fkey(name),
          accommodation_units!lodging_bookings_assigned_unit_id_fkey(
            unit_name,
            product_type
          )
        `)
        .in("payment_status", ["completed", "paid", "pending", "comp"]);
      if (error) {
        console.error("Error fetching booking assignments:", error);
        throw error;
      }
      return data as Array<{
        id: string;
        assigned_unit_id: string | null;
        email: string;
        zone_key: string;
        registration_id: string;
        payment_status: string;
        assignment_status: string;
        created_at: string;
        guest_notified: boolean;
        notified_at: string | null;
        assignee_type: string;
        assignee_name: string | null;
        assignee_company: string | null;
        registrations: { name: string } | null;
        accommodation_units: { unit_name: string; product_type: string } | null;
      }>;
    },
    staleTime: 30 * 1000,
  });

  // Create a map of unit_id -> guest info for quick lookup (paid OR comp bookings with assigned units)
  const unitAssignmentMap = new Map<string, { bookingId: string; guestName: string; email: string; assigneeType: string; company: string | null }>();
  bookingAssignments?.forEach((booking) => {
    if (booking.assigned_unit_id && ["paid", "completed", "comp"].includes(booking.payment_status)) {
      unitAssignmentMap.set(booking.assigned_unit_id, {
        bookingId: booking.id,
        guestName: booking.assignee_name || booking.registrations?.name || booking.email,
        email: booking.email,
        assigneeType: booking.assignee_type || "guest",
        company: booking.assignee_company || null,
      });
    }
  });

  // Risk detection: Find potential issues
  const riskAlerts: { type: "warning" | "error"; title: string; description: string; count?: number; actionLabel?: string; onAction?: () => void; recommendation?: string; unitNames?: string }[] = [];
  
  // 1. Paid bookings without assigned units (guests paid but no unit reserved)
  const paidWithoutUnit = bookingAssignments?.filter(
    b => (b.payment_status === "paid" || b.payment_status === "completed") && 
         !b.assigned_unit_id && 
         b.assignment_status === "pending"
  ) || [];
  if (paidWithoutUnit.length > 0) {
    riskAlerts.push({
      type: "error",
      title: "Paid Bookings Need Unit Assignment",
      description: `${paidWithoutUnit.length} guest(s) have paid but no unit has been reserved for them.`,
      count: paidWithoutUnit.length,
    });
  }

  // 2. Units stuck in pending_offer (checkout started but not completed)
  const pendingOfferUnits = units?.filter(u => u.inventory_status === "pending_offer") || [];
  const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const stalePendingUnits = pendingOfferUnits.filter(u => u.updated_at < thirtyMinsAgo);
  if (stalePendingUnits.length > 0) {
    riskAlerts.push({
      type: "warning",
      title: "Stale Checkout Locks",
      description: `${stalePendingUnits.length} unit(s) locked for abandoned checkouts. Run cleanup to release them.`,
      count: stalePendingUnits.length,
    });
  }

  // 3. Units marked assigned but no paid booking references them
  const assignedUnits = units?.filter(u => u.inventory_status === "assigned") || [];
  const orphanedAssigned = assignedUnits.filter(u => !unitAssignmentMap.has(u.id));
  const orphanedUnitIds = new Set(orphanedAssigned.map(u => u.id));
  if (orphanedAssigned.length > 0) {
    riskAlerts.push({
      type: "warning",
      title: "Orphaned Assigned Units",
      description: `${orphanedAssigned.length} unit(s) marked as assigned but have no associated paid booking.`,
      count: orphanedAssigned.length,
      actionLabel: "Show Orphaned Units",
      onAction: () => setStatusFilter("assigned"),
      recommendation: "Change these units to 'Available' or 'Held' to correct inventory.",
      unitNames: orphanedAssigned.map(u => u.unit_name).join(", "),
    });
  }

  // Cleanup function
  const runCleanup = async () => {
    setIsRunningCleanup(true);
    try {
      const response = await supabase.functions.invoke("cleanup-abandoned-lodging");
      if (response.error) throw response.error;
      toast.success(`Cleanup complete: Released ${response.data?.cleaned?.staleUnits || 0} stale locks`);
      queryClient.invalidateQueries({ queryKey: ["accommodation-units-all"] });
      queryClient.invalidateQueries({ queryKey: ["lodging-booking-assignments"] });
    } catch (error: any) {
      console.error("Cleanup error:", error);
      toast.error(error.message || "Cleanup failed");
    } finally {
      setIsRunningCleanup(false);
    }
  };

  const createMutation = useMutation({
    mutationFn: async (data: Omit<AccommodationUnit, "id" | "created_at" | "updated_at">) => {
      const { error } = await supabase.from("accommodation_units").insert([data as any]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Unit created");
      queryClient.invalidateQueries({ queryKey: ["accommodation-units-all"] });
      closeDialog();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create unit");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AccommodationUnit> }) => {
      const { error } = await supabase
        .from("accommodation_units")
        .update(data as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Unit updated");
      queryClient.invalidateQueries({ queryKey: ["accommodation-units-all"] });
      closeDialog();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update unit");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("accommodation_units")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Unit deleted");
      queryClient.invalidateQueries({ queryKey: ["accommodation-units-all"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete unit");
    },
  });

  const handleReassignUnit = async () => {
    if (!selectedUnit || !newUnitId) {
      toast.error("Please select a new unit");
      return;
    }

    // Guard: if the unit is locked, require extra confirmation
    if (selectedUnit.inventory_status === "locked") {
      setLockedConfirmMessage(`Unit ${selectedUnit.unit_name} is LOCKED (final placement). Are you sure you want to reassign this guest?`);
      setPendingLockedAction(() => () => executeReassignment());
      setLockedConfirmOpen(true);
      return;
    }

    await executeReassignment();
  };

  const executeReassignment = async () => {
    if (!selectedUnit || !newUnitId) return;

    const assignment = unitAssignmentMap.get(selectedUnit.id);
    if (!assignment) {
      toast.error("No booking found for this unit");
      return;
    }

    setIsReassigning(true);
    try {
      // Update the booking to point to the new unit
      const { error: bookingError } = await supabase
        .from("lodging_bookings")
        .update({ assigned_unit_id: newUnitId })
        .eq("id", assignment.bookingId);

      if (bookingError) throw bookingError;

      // Update old unit status to available
      const { error: oldUnitError } = await supabase
        .from("accommodation_units")
        .update({ inventory_status: "available" })
        .eq("id", selectedUnit.id);

      if (oldUnitError) throw oldUnitError;

      // Update new unit status to assigned
      const { error: newUnitError } = await supabase
        .from("accommodation_units")
        .update({ inventory_status: "assigned" })
        .eq("id", newUnitId);

      if (newUnitError) throw newUnitError;

      // Log reassignment to activity_logs for audit trail
      const newUnit = units?.find(u => u.id === newUnitId);
      await supabase.from("activity_logs").insert({
        entity_type: "lodging_unit",
        entity_id: assignment.bookingId,
        entity_name: assignment.guestName,
        action: "reassignment",
        old_value: `Unit ${selectedUnit.unit_name}`,
        new_value: `Unit ${newUnit?.unit_name || newUnitId}`,
        event_id: getLodgingEventId(),
      });

      toast.success(`${assignment.guestName} reassigned to new unit`);
      queryClient.invalidateQueries({ queryKey: ["accommodation-units-all"] });
      queryClient.invalidateQueries({ queryKey: ["lodging-booking-assignments"] });
      setReassignDrawerOpen(false);
      setSelectedUnit(null);
      setNewUnitId("");
    } catch (error: any) {
      console.error("Reassignment error:", error);
      toast.error(error.message || "Failed to reassign unit");
    } finally {
      setIsReassigning(false);
    }
  };

  const openReassignDrawer = (unit: AccommodationUnit) => {
    setSelectedUnit(unit);
    setNewUnitId("");
    setReassignDrawerOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      unit_name: "",
      product_type: "tent",
      zone_key: zones?.[0]?.zone_key || "",
      is_family_style: false,
      beds_total: 2,
      bed_configuration: "",
      sleeps_max: 2,
      has_loft: false,
      inventory_status: "available",
      night_price: 0,
      notes: "",
      stripe_price_id: "",
      class_from_wildhaven: "",
    });
  };

  const handleEdit = (unit: AccommodationUnit) => {
    setEditingId(unit.id);
    setFormData({
      unit_name: unit.unit_name,
      product_type: unit.product_type,
      zone_key: unit.zone_key,
      is_family_style: unit.is_family_style,
      beds_total: unit.beds_total,
      bed_configuration: unit.bed_configuration,
      sleeps_max: unit.sleeps_max,
      has_loft: unit.has_loft,
      inventory_status: unit.inventory_status,
      night_price: unit.night_price / 100,
      notes: unit.notes || "",
      stripe_price_id: unit.stripe_price_id || "",
      class_from_wildhaven: unit.class_from_wildhaven || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.unit_name || !formData.zone_key || !formData.bed_configuration) {
      toast.error("Please fill in all required fields");
      return;
    }

    const submitData = {
      unit_name: formData.unit_name,
      product_type: formData.product_type,
      zone_key: formData.zone_key,
      is_family_style: formData.is_family_style,
      beds_total: formData.beds_total,
      bed_configuration: formData.bed_configuration,
      sleeps_max: formData.sleeps_max,
      has_loft: formData.has_loft,
      inventory_status: formData.inventory_status,
      night_price: Math.round(formData.night_price * 100),
      notes: formData.notes || null,
      stripe_price_id: formData.stripe_price_id || null,
      class_from_wildhaven: formData.class_from_wildhaven || null,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: submitData });
    } else {
      createMutation.mutate(submitData as any);
    }
  };

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  const getZoneName = (zoneKey: string) => {
    return zones?.find((z) => z.zone_key === zoneKey)?.zone_name || zoneKey;
  };

  const getDisplayPrice = (unit: AccommodationUnit) => {
    // If unit has its own price (family-style units), use that
    if (unit.night_price > 0) {
      return { price: unit.night_price, isUnitPrice: true };
    }
    // Otherwise, fall back to zone price
    const zonePrice = zones?.find((z) => z.zone_key === unit.zone_key)?.night_price || 0;
    return { price: zonePrice, isUnitPrice: false };
  };

  // Natural sort function for unit names (e.g., "Tent 2" before "Tent 10")
  const naturalSort = (a: AccommodationUnit, b: AccommodationUnit) => {
    return a.unit_name.localeCompare(b.unit_name, undefined, { numeric: true, sensitivity: 'base' });
  };

  // Filter and sort units
  const filteredUnits = units?.filter((unit) => {
    if (productTypeFilter !== "all" && unit.product_type !== productTypeFilter) return false;
    if (zoneFilter !== "all" && unit.zone_key !== zoneFilter) return false;
    if (familyStyleFilter === "family" && !unit.is_family_style) return false;
    if (familyStyleFilter === "standard" && unit.is_family_style) return false;
    if (statusFilter !== "all" && unit.inventory_status !== statusFilter) return false;
    if (searchQuery && !unit.unit_name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  }).sort(naturalSort);

  // Summary counts
  const availableCount = units?.filter((u) => u.inventory_status === "available").length || 0;
  const reservedCount = units?.filter((u) => u.inventory_status === "reserved").length || 0;
  const assignedCount = units?.filter((u) => u.inventory_status === "assigned").length || 0;
  const heldCount = units?.filter((u) => u.inventory_status === "held").length || 0;
  const lockedCount = units?.filter((u) => u.inventory_status === "locked").length || 0;
  const familyCount = units?.filter((u) => u.is_family_style).length || 0;

  // Bulk lock: get all assigned/reserved units
  const lockableUnits = units?.filter(
    (u) => (u.inventory_status === "assigned" || u.inventory_status === "reserved") && unitAssignmentMap.has(u.id)
  ) || [];



  const handleBulkLock = async () => {
    setIsBulkLocking(true);
    try {
      const unitIds = lockableUnits.map(u => u.id);
      const { error } = await supabase
        .from("accommodation_units")
        .update({ inventory_status: "locked" } as any)
        .in("id", unitIds);
      if (error) throw error;
      toast.success(`${unitIds.length} units locked as final placements`);
      queryClient.invalidateQueries({ queryKey: ["accommodation-units-all"] });
    } catch (error: any) {
      toast.error(error.message || "Failed to bulk lock");
    } finally {
      setIsBulkLocking(false);
      setBulkLockConfirmOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={Home}
        title="Unit Inventory"
        subtitle="Manage individual lodging units — internal source of truth"
        actions={
          <AdminButton
            variant="adminOutline"
            size="sm"
            onClick={() => window.open("/images/wildhaven-map.png", "_blank")}
          >
            <MapIcon className="h-4 w-4 mr-2" />
            View Site Map
            <ExternalLink className="h-3 w-3 ml-1" />
          </AdminButton>
        }
      />

      {/* Risk Alerts */}
      {riskAlerts.length > 0 && (
        <div className="space-y-2">
          {riskAlerts.map((alert, idx) => (
            <div
              key={idx}
              className={`rounded-lg border p-4 flex items-start gap-3 ${
                alert.type === "error"
                  ? "bg-[hsl(var(--admin-error)/0.1)] border-[hsl(var(--admin-error)/0.3)]"
                  : "bg-[hsl(var(--admin-warning)/0.1)] border-[hsl(var(--admin-warning)/0.3)]"
              }`}
            >
              <AlertTriangle
                className={`h-5 w-5 shrink-0 mt-0.5 ${
                  alert.type === "error" ? "text-[hsl(var(--admin-error))]" : "text-[hsl(var(--admin-warning))]"
                }`}
              />
              <div className="flex-1 min-w-0">
                <p className={`font-medium text-sm ${
                  alert.type === "error" ? "text-[hsl(var(--admin-error))]" : "text-[hsl(var(--admin-warning))]"
                }`}>
                  {alert.title}
                </p>
                <p className="text-sm text-[hsl(var(--admin-text-muted))] mt-0.5">
                  {alert.description}
                </p>
                {alert.recommendation && (
                  <p className="text-sm text-[hsl(var(--admin-foreground))] mt-1.5 font-medium">
                    <strong>Recommendation:</strong> {alert.recommendation}
                  </p>
                )}
                {alert.unitNames && (
                  <p className="text-xs text-[hsl(var(--admin-text-muted))] mt-1">
                    <strong>Units:</strong> {alert.unitNames}
                  </p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                {alert.onAction && (
                  <AdminButton
                    variant="adminOutline"
                    size="sm"
                    onClick={alert.onAction}
                  >
                    {alert.actionLabel}
                  </AdminButton>
                )}
                {alert.title.includes("Stale") && (
                  <AdminButton
                    variant="adminOutline"
                    size="sm"
                    onClick={runCleanup}
                    disabled={isRunningCleanup}
                  >
                    {isRunningCleanup ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-1" />
                    )}
                    Run Cleanup
                  </AdminButton>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {riskAlerts.length === 0 && units && units.length > 0 && (
        <div className="rounded-lg border border-[hsl(var(--admin-success)/0.3)] bg-[hsl(var(--admin-success)/0.05)] p-3 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-[hsl(var(--admin-success))]" />
          <span className="text-sm text-[hsl(var(--admin-success))]">All systems healthy — no booking risks detected</span>
        </div>
      )}


      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <AdminCard className="bg-[hsl(var(--admin-surface))]">
          <AdminCardContent className="py-4">
            <p className="text-xs text-[hsl(var(--admin-text-muted))] uppercase tracking-wider">Total Units</p>
            <p className="text-2xl font-semibold text-[hsl(var(--admin-foreground))]">{units?.length || 0}</p>
          </AdminCardContent>
        </AdminCard>
        <AdminCard className="bg-[hsl(var(--admin-surface))]">
          <AdminCardContent className="py-4">
            <p className="text-xs text-[hsl(var(--admin-success))] uppercase tracking-wider">Available</p>
            <p className="text-2xl font-semibold text-[hsl(var(--admin-success))]">{availableCount}</p>
          </AdminCardContent>
        </AdminCard>
        <AdminCard className="bg-[hsl(var(--admin-surface))]">
          <AdminCardContent className="py-4">
            <p className="text-xs text-[hsl(var(--admin-info))] uppercase tracking-wider">Reserved</p>
            <p className="text-2xl font-semibold text-[hsl(var(--admin-info))]">{reservedCount}</p>
          </AdminCardContent>
        </AdminCard>
        <AdminCard className="bg-[hsl(var(--admin-surface))]">
          <AdminCardContent className="py-4">
            <p className="text-xs text-[hsl(var(--admin-text-muted))] uppercase tracking-wider">Assigned</p>
            <p className="text-2xl font-semibold text-[hsl(var(--admin-foreground))]">{assignedCount}</p>
          </AdminCardContent>
        </AdminCard>
        <AdminCard className="bg-[hsl(var(--admin-surface))]">
          <AdminCardContent className="py-4">
            <p className="text-xs text-[hsl(var(--admin-warning))] uppercase tracking-wider">Held</p>
            <p className="text-2xl font-semibold text-[hsl(var(--admin-warning))]">{heldCount}</p>
          </AdminCardContent>
        </AdminCard>
        <AdminCard className="bg-[hsl(var(--admin-surface))]">
          <AdminCardContent className="py-4">
            <p className="text-xs text-[hsl(var(--admin-error))] uppercase tracking-wider">Locked</p>
            <p className="text-2xl font-semibold text-[hsl(var(--admin-error))]">{lockedCount}</p>
          </AdminCardContent>
        </AdminCard>
      </div>

      {/* Status Legend */}
      <Collapsible>
        <CollapsibleTrigger asChild>
          <AdminButton variant="ghost" className="gap-2 text-[hsl(var(--admin-text-muted))] hover:text-[hsl(var(--admin-foreground))] px-1">
            <HelpCircle className="h-4 w-4" />
            <span className="text-xs">What do these statuses mean?</span>
            <ChevronDown className="h-3 w-3" />
          </AdminButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <AdminCard className="mt-2">
            <AdminCardContent className="py-4">
              <div className="grid gap-3">
                {INVENTORY_STATUSES.map((status) => (
                  <div key={status.value} className="flex gap-3 items-start">
                    <AdminBadge intent={status.intent} className="shrink-0 mt-0.5 min-w-[100px] justify-center">
                      {status.label}
                    </AdminBadge>
                    <div>
                      <p className="text-sm font-medium text-[hsl(var(--admin-foreground))]">{status.description}</p>
                      <p className="text-xs text-[hsl(var(--admin-text-muted))] mt-0.5">{status.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 rounded-lg bg-[hsl(var(--admin-surface))] border border-[hsl(var(--admin-border))]">
                <p className="text-xs text-[hsl(var(--admin-text-muted))]">
                  <strong className="text-[hsl(var(--admin-foreground))]">Workflow:</strong>{" "}
                  Available → Reserved (system auto-assigns after purchase) → Assigned (admin adjusts placement) → Locked (final — ready to notify guest)
                </p>
              </div>
            </AdminCardContent>
          </AdminCard>
        </CollapsibleContent>
      </Collapsible>

      <AdminCard>
        <AdminCardHeader icon={Home}>
            <div className="flex justify-between items-center w-full">
              <div>
                <AdminCardTitle>All Units</AdminCardTitle>
                <AdminCardDescription>
                  {familyCount} family-style units configured for guest-facing sales
                </AdminCardDescription>
              </div>
              <div className="flex gap-2">
                {lockableUnits.length > 0 && (
                  <AdminButton
                    variant="adminOutline"
                    onClick={() => setBulkLockConfirmOpen(true)}
                    disabled={isBulkLocking}
                  >
                    <Lock className="h-4 w-4 mr-2" />
                    Lock All ({lockableUnits.length})
                  </AdminButton>
                )}
                <AdminButton
                  variant="adminOutline"
                  onClick={() => setCompDrawerOpen(true)}
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Manual Assign
                </AdminButton>
                <AdminButton
                  onClick={() => {
                    resetForm();
                    setDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Unit
                </AdminButton>
              </div>
            </div>
        </AdminCardHeader>
        <AdminCardContent>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-6">
            <div className="w-48">
              <AdminLabel className="text-xs mb-1 block">Search</AdminLabel>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--admin-text-muted))]" />
                <AdminInput
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search units..."
                  className="pl-9"
                />
              </div>
            </div>
            <div className="w-36">
              <AdminLabel className="text-xs mb-1 block">Type</AdminLabel>
              <AdminSelect value={productTypeFilter} onValueChange={setProductTypeFilter}>
                <AdminSelectItem value="all">All Types</AdminSelectItem>
                <AdminSelectItem value="tent">Tents</AdminSelectItem>
                <AdminSelectItem value="cabin">Cabins</AdminSelectItem>
              </AdminSelect>
            </div>
            <div className="w-44">
              <AdminLabel className="text-xs mb-1 block">Zone</AdminLabel>
              <AdminSelect value={zoneFilter} onValueChange={setZoneFilter}>
                <AdminSelectItem value="all">All Zones</AdminSelectItem>
                {zones?.map((zone) => (
                  <AdminSelectItem key={zone.zone_key} value={zone.zone_key}>
                    {zone.zone_name}
                  </AdminSelectItem>
                ))}
              </AdminSelect>
            </div>
            <div className="w-36">
              <AdminLabel className="text-xs mb-1 block">Style</AdminLabel>
              <AdminSelect value={familyStyleFilter} onValueChange={setFamilyStyleFilter}>
                <AdminSelectItem value="all">All Styles</AdminSelectItem>
                <AdminSelectItem value="family">Family-Style</AdminSelectItem>
                <AdminSelectItem value="standard">Standard</AdminSelectItem>
              </AdminSelect>
            </div>
            <div className="w-40">
              <AdminLabel className="text-xs mb-1 block">Status</AdminLabel>
              <AdminSelect value={statusFilter} onValueChange={setStatusFilter}>
                <AdminSelectItem value="all">All Statuses</AdminSelectItem>
                {INVENTORY_STATUSES.map((status) => (
                  <AdminSelectItem key={status.value} value={status.value}>
                    {status.label}
                  </AdminSelectItem>
                ))}
              </AdminSelect>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-[hsl(var(--admin-text-muted))]">Loading units...</div>
          ) : !filteredUnits?.length ? (
            <AdminTable>
              <AdminTableBody>
                <AdminTableEmpty
                  title="No units found"
                  description={units?.length ? "Try adjusting your filters" : "No accommodation units configured yet."}
                />
              </AdminTableBody>
            </AdminTable>
          ) : (
            <AdminTable>
              <AdminTableHeader>
                <AdminTableRow>
                  <AdminTableHead>Unit</AdminTableHead>
                  <AdminTableHead>Type</AdminTableHead>
                  <AdminTableHead>Zone</AdminTableHead>
                  <AdminTableHead>Assigned To</AdminTableHead>
                  <AdminTableHead>Bed Config</AdminTableHead>
                  <AdminTableHead className="text-center">Sleeps</AdminTableHead>
                  <AdminTableHead className="text-right">Price</AdminTableHead>
                  <AdminTableHead className="text-center">Status</AdminTableHead>
                  <AdminTableHead className="text-right">Actions</AdminTableHead>
                </AdminTableRow>
              </AdminTableHeader>
              <AdminTableBody>
                {filteredUnits.map((unit) => {
                  const isOrphaned = orphanedUnitIds.has(unit.id);
                  return (
                  <AdminTableRow 
                    key={unit.id} 
                    className={`${unit.inventory_status !== "available" ? "opacity-60" : ""} ${isOrphaned ? "bg-[hsl(var(--admin-warning)/0.1)]" : ""}`}
                  >
                    <AdminTableCell>
                      <div className="flex items-center gap-2">
                        {unit.inventory_status === "locked" ? (
                          <Lock className="h-4 w-4 text-[hsl(var(--admin-error))]" />
                        ) : isOrphaned ? (
                          <span title="Orphaned unit - no booking attached">
                            <AlertTriangle className="h-4 w-4 text-[hsl(var(--admin-warning))]" />
                          </span>
                        ) : unit.product_type === "tent" ? (
                          <Tent className="h-4 w-4 text-[hsl(var(--admin-accent))]" />
                        ) : (
                          <House className="h-4 w-4 text-amber-400" />
                        )}
                        <div>
                          <span className="font-medium">{unit.unit_name}</span>
                          <div className="flex gap-1 mt-0.5">
                            {unit.is_family_style && (
                              <AdminBadge intent="info" className="text-[10px] px-1 py-0">Family</AdminBadge>
                            )}
                            {unit.has_loft && (
                              <AdminBadge intent="neutral" className="text-[10px] px-1 py-0">Loft</AdminBadge>
                            )}
                          </div>
                        </div>
                      </div>
                    </AdminTableCell>
                    <AdminTableCell className="capitalize">{unit.product_type}</AdminTableCell>
                    <AdminTableCell>
                      <div>
                        <span>{getZoneName(unit.zone_key)}</span>
                        {unit.class_from_wildhaven && (
                          <span className="block text-[10px] text-[hsl(var(--admin-text-muted))]">
                            {unit.class_from_wildhaven}
                          </span>
                        )}
                      </div>
                    </AdminTableCell>
                    <AdminTableCell>
                      {(() => {
                        const assignment = unitAssignmentMap.get(unit.id);
                        if (!assignment) {
                          return <span className="text-[hsl(var(--admin-text-muted))] text-sm">—</span>;
                        }
                        return (
                          <div 
                            className="cursor-pointer hover:bg-[hsl(var(--admin-surface-hover))] px-2 py-1 -mx-2 rounded transition-colors"
                            onClick={() => openReassignDrawer(unit)}
                            title="Click to reassign"
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-sm">{assignment.guestName}</span>
                              {assignment.assigneeType !== "guest" && (
                                <AdminBadge intent="info" className="text-[9px] px-1 py-0">
                                  {assignment.assigneeType}
                                </AdminBadge>
                              )}
                            </div>
                            <span className="block text-[10px] text-[hsl(var(--admin-text-muted))]">
                              {assignment.email}
                            </span>
                          </div>
                        );
                      })()}
                    </AdminTableCell>
                    <AdminTableCell>
                      <div className="flex items-center gap-1">
                        <BedDouble className="h-3 w-3" />
                        {unit.bed_configuration}
                      </div>
                    </AdminTableCell>
                    <AdminTableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Users className="h-3 w-3" />
                        {unit.sleeps_max}
                      </div>
                    </AdminTableCell>
                    <AdminTableCell className="text-right">
                      {(() => {
                        const { price, isUnitPrice } = getDisplayPrice(unit);
                        return (
                          <div>
                            <span className={isUnitPrice ? "font-medium" : ""}>
                              {formatPrice(price)}
                            </span>
                            {!isUnitPrice && (
                              <span className="block text-[10px] text-[hsl(var(--admin-text-muted))]">
                                from zone
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </AdminTableCell>
                    <AdminTableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <div className="inline-flex items-center gap-1 group cursor-pointer">
                            <AdminBadge intent={statusIntentMap[unit.inventory_status] || "neutral"}>
                              {INVENTORY_STATUSES.find(s => s.value === unit.inventory_status)?.label || unit.inventory_status}
                            </AdminBadge>
                            <ChevronDown className="h-3 w-3 text-[hsl(var(--admin-text-muted))] opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-56">
                          <DropdownMenuLabel className="text-xs text-[hsl(var(--admin-text-muted))]">
                            Change Status
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {INVENTORY_STATUSES.map((status) => {
                            // For reserved/assigned: open drawer if no existing booking
                            const requiresDrawer = (status.value === "reserved" || status.value === "assigned") 
                              && !unitAssignmentMap.has(unit.id);
                            
                            return (
                              <DropdownMenuItem
                                key={status.value}
                                disabled={status.value === unit.inventory_status}
                                onClick={() => {
                                  // Guard: changing FROM locked requires confirmation
                                  if (unit.inventory_status === "locked" && status.value !== "locked") {
                                    setLockedConfirmMessage(`Unit ${unit.unit_name} is LOCKED (final placement). Are you sure you want to change its status to ${status.label}?`);
                                    setPendingLockedAction(() => () => {
                                      if (requiresDrawer) {
                                        openCompDrawerForUnit(unit.id);
                                      } else {
                                        updateMutation.mutate({ id: unit.id, data: { inventory_status: status.value } });
                                      }
                                    });
                                    setLockedConfirmOpen(true);
                                    return;
                                  }
                                  if (requiresDrawer) {
                                    openCompDrawerForUnit(unit.id);
                                  } else {
                                    updateMutation.mutate({ 
                                      id: unit.id, 
                                      data: { inventory_status: status.value } 
                                    });
                                  }
                                }}
                                className="flex flex-col items-start gap-0.5"
                              >
                                <span className="font-medium">
                                  {status.label}
                                  {requiresDrawer && " →"}
                                </span>
                                <span className="text-[10px] text-[hsl(var(--admin-text-muted))]">
                                  {requiresDrawer ? "Opens assignment form" : status.description}
                                </span>
                              </DropdownMenuItem>
                            );
                          })}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </AdminTableCell>
                    <AdminTableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {unitAssignmentMap.has(unit.id) && (
                          <>
                            <AdminButton 
                              size="sm" 
                              variant="adminOutline" 
                              onClick={() => {
                                const a = unitAssignmentMap.get(unit.id);
                                if (a) openEditAssigneeDrawer(a.bookingId);
                              }}
                              title="Edit guest name / email"
                            >
                              <UserPlus className="h-4 w-4" />
                            </AdminButton>
                            <AdminButton 
                              size="sm" 
                              variant="adminOutline" 
                              onClick={() => openReassignDrawer(unit)}
                              title="Reassign guest to different unit"
                            >
                              <ArrowLeftRight className="h-4 w-4" />
                            </AdminButton>
                          </>
                        )}
                        {/* For orphaned units, show a dropdown with fix options */}
                        {isOrphaned ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <AdminButton size="sm" variant="adminOutline" title="Fix orphaned unit">
                                <Edit2 className="h-4 w-4" />
                              </AdminButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuLabel className="text-xs text-[hsl(var(--admin-text-muted))]">
                                Fix Orphaned Unit
                              </DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => openCompDrawerForUnit(unit.id)}>
                                <UserPlus className="h-4 w-4 mr-2" />
                                <div>
                                  <span className="font-medium">Manual Assign</span>
                                  <span className="block text-[10px] text-[hsl(var(--admin-text-muted))]">Assign to staff, band, or comp</span>
                                </div>
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => updateMutation.mutate({ id: unit.id, data: { inventory_status: "available" } })}
                              >
                                <CheckCircle className="h-4 w-4 mr-2" />
                                <div>
                                  <span className="font-medium">Set Available</span>
                                  <span className="block text-[10px] text-[hsl(var(--admin-text-muted))]">Return to inventory pool</span>
                                </div>
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => updateMutation.mutate({ id: unit.id, data: { inventory_status: "held" } })}
                              >
                                <AlertTriangle className="h-4 w-4 mr-2" />
                                <div>
                                  <span className="font-medium">Set Held</span>
                                  <span className="block text-[10px] text-[hsl(var(--admin-text-muted))]">Admin hold, not for sale</span>
                                </div>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleEdit(unit)}>
                                <Edit2 className="h-4 w-4 mr-2" />
                                Edit Unit Details
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <AdminButton size="sm" variant="adminOutline" onClick={() => handleEdit(unit)}>
                            <Edit2 className="h-4 w-4" />
                          </AdminButton>
                        )}
                        <AdminButton
                          size="sm"
                          variant="adminOutline"
                          onClick={() => {
                            if (unit.inventory_status === "assigned" || unit.inventory_status === "reserved" || unit.inventory_status === "locked") {
                              toast.error("Cannot delete a reserved, assigned, or locked unit");
                              return;
                            }
                            setUnitToDelete(unit);
                            setDeleteConfirmText("");
                            setDeleteDialogOpen(true);
                          }}
                          disabled={unit.inventory_status === "assigned" || unit.inventory_status === "reserved" || unit.inventory_status === "locked"}
                          title="Delete unit"
                        >
                          <Trash2 className="h-4 w-4" />
                        </AdminButton>
                      </div>
                    </AdminTableCell>
                  </AdminTableRow>
                  );
                })}
              </AdminTableBody>
            </AdminTable>
          )}
        </AdminCardContent>
      </AdminCard>

      {/* Add/Edit Dialog */}
      <AdminDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AdminDialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0">
          <AdminDialogHeader className="px-6 pt-6 pb-4 border-b border-[hsl(var(--admin-border))] shrink-0">
            <AdminDialogTitle>
              {editingId ? "Edit Unit" : "Add Unit"}
            </AdminDialogTitle>
            <AdminDialogDescription>
              Configure an individual tent or cabin. Internal fields (unit number, class, notes) are never shown to guests.
            </AdminDialogDescription>
          </AdminDialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <AdminLabel>Unit Name *</AdminLabel>
                <AdminInput
                  value={formData.unit_name}
                  onChange={(e) => setFormData({ ...formData, unit_name: e.target.value })}
                  placeholder="e.g., Tent F1"
                />
              </div>
              <div>
                <AdminLabel>Product Type *</AdminLabel>
                <AdminSelect
                  value={formData.product_type}
                  onValueChange={(v) => setFormData({ ...formData, product_type: v as "tent" | "cabin" })}
                >
                  <AdminSelectItem value="tent">Tent</AdminSelectItem>
                  <AdminSelectItem value="cabin">Cabin</AdminSelectItem>
                </AdminSelect>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <AdminLabel>Zone *</AdminLabel>
                <AdminSelect
                  value={formData.zone_key}
                  onValueChange={(v) => setFormData({ ...formData, zone_key: v })}
                  placeholder="Select zone"
                >
                  {zones?.map((zone) => (
                    <AdminSelectItem key={zone.zone_key} value={zone.zone_key}>
                      {zone.zone_name}
                    </AdminSelectItem>
                  ))}
                </AdminSelect>
              </div>
              <div>
                <AdminLabel>Class from Example Meadow</AdminLabel>
                <AdminSelect
                  value={formData.class_from_wildhaven || "_none_"}
                  onValueChange={(v) => setFormData({ ...formData, class_from_wildhaven: v === "_none_" ? "" : v })}
                  placeholder="Select class..."
                >
                  <AdminSelectItem value="_none_">None</AdminSelectItem>
                  <AdminSelectItem value="Premium">Premium</AdminSelectItem>
                  <AdminSelectItem value="Riverside">Riverside</AdminSelectItem>
                  <AdminSelectItem value="Standard">Standard</AdminSelectItem>
                </AdminSelect>
              </div>
            </div>

            <div>
              <AdminLabel>Bed Configuration *</AdminLabel>
              <AdminInput
                value={formData.bed_configuration}
                onChange={(e) => setFormData({ ...formData, bed_configuration: e.target.value })}
                placeholder="e.g., 1 Queen + 2 Bunks"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <AdminLabel>Total Beds</AdminLabel>
                <AdminInput
                  type="number"
                  min={1}
                  value={formData.beds_total}
                  onChange={(e) => setFormData({ ...formData, beds_total: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div>
                <AdminLabel>Sleeps Max</AdminLabel>
                <AdminInput
                  type="number"
                  min={1}
                  value={formData.sleeps_max}
                  onChange={(e) => setFormData({ ...formData, sleeps_max: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div>
                <AdminLabel>Price per Night ($)</AdminLabel>
                <AdminInput
                  type="number"
                  min={0}
                  step={0.01}
                  value={formData.night_price}
                  onChange={(e) => setFormData({ ...formData, night_price: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <AdminLabel>Has Loft?</AdminLabel>
                <AdminSelect
                  value={formData.has_loft ? "yes" : "no"}
                  onValueChange={(v) => setFormData({ ...formData, has_loft: v === "yes" })}
                >
                  <AdminSelectItem value="no">No</AdminSelectItem>
                  <AdminSelectItem value="yes">Yes</AdminSelectItem>
                </AdminSelect>
              </div>
              <div>
                <AdminLabel>Inventory Status</AdminLabel>
                <AdminSelect
                  value={formData.inventory_status}
                  onValueChange={(v) => {
                    const editingUnit = units?.find(u => u.id === editingId);
                    if (editingUnit?.inventory_status === "locked" && v !== "locked") {
                      setLockedConfirmMessage(`Unit ${editingUnit.unit_name} is LOCKED. Changing its status will remove the final placement protection.`);
                      setPendingLockedAction(() => () => setFormData(prev => ({ ...prev, inventory_status: v as InventoryStatus })));
                      setLockedConfirmOpen(true);
                    } else {
                      setFormData({ ...formData, inventory_status: v as InventoryStatus });
                    }
                  }}
                >
                  {INVENTORY_STATUSES.map((status) => (
                    <AdminSelectItem key={status.value} value={status.value}>
                      {status.label}
                    </AdminSelectItem>
                  ))}
                </AdminSelect>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-[hsl(var(--admin-surface))] rounded-lg border border-[hsl(var(--admin-border))]">
              <div>
                <AdminLabel className="mb-0">Family-Style Lodging</AdminLabel>
                <p className="text-xs text-[hsl(var(--admin-text-muted))]">
                  Show on guest-facing accommodations page
                </p>
              </div>
              <AdminSwitch
                checked={formData.is_family_style}
                onCheckedChange={(checked) => setFormData({ ...formData, is_family_style: checked })}
              />
            </div>

            <div>
              <AdminLabel>Stripe Price ID (optional)</AdminLabel>
              <AdminInput
                value={formData.stripe_price_id}
                onChange={(e) => setFormData({ ...formData, stripe_price_id: e.target.value })}
                placeholder="price_xxx"
              />
            </div>

            <div>
              <AdminLabel>Internal Notes</AdminLabel>
              <AdminTextarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Internal notes about this unit (never shown to guests)..."
                rows={3}
              />
            </div>
          </div>

          <AdminDialogFooter className="px-6 py-4 border-t border-[hsl(var(--admin-border))] shrink-0">
            <AdminButton variant="adminOutline" onClick={closeDialog}>
              Cancel
            </AdminButton>
            <AdminButton
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editingId ? "Update Unit" : "Create Unit"}
            </AdminButton>
          </AdminDialogFooter>
        </AdminDialogContent>
      </AdminDialog>

      {/* Delete Confirmation Dialog */}
      <AdminDialog open={deleteDialogOpen} onOpenChange={(open) => {
        setDeleteDialogOpen(open);
        if (!open) {
          setUnitToDelete(null);
          setDeleteConfirmText("");
        }
      }}>
        <AdminDialogContent className="max-w-md">
          <AdminDialogHeader>
            <AdminDialogTitle className="text-[hsl(var(--admin-error))]">
              Delete Unit Permanently
            </AdminDialogTitle>
            <AdminDialogDescription>
              This action cannot be undone. This will permanently delete unit{" "}
              <strong className="text-[hsl(var(--admin-foreground))]">
                {unitToDelete?.unit_name}
              </strong>{" "}
              from the inventory.
            </AdminDialogDescription>
          </AdminDialogHeader>

          <div className="py-4 space-y-4">
            <div className="p-3 bg-[hsl(var(--admin-error)/0.1)] border border-[hsl(var(--admin-error)/0.3)] rounded-lg">
              <p className="text-sm text-[hsl(var(--admin-error))]">
                ⚠️ Consider using "Held" status instead to remove from inventory without deleting.
              </p>
            </div>
            
            <div>
              <AdminLabel>
                Type <strong>DELETE</strong> to confirm
              </AdminLabel>
              <AdminInput
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type DELETE to confirm"
                className="mt-1"
              />
            </div>
          </div>

          <AdminDialogFooter>
            <AdminButton 
              variant="adminOutline" 
              onClick={() => {
                setDeleteDialogOpen(false);
                setUnitToDelete(null);
                setDeleteConfirmText("");
              }}
            >
              Cancel
            </AdminButton>
            <AdminButton
              variant="adminDestructive"
              onClick={() => {
                if (unitToDelete) {
                  deleteMutation.mutate(unitToDelete.id);
                  setDeleteDialogOpen(false);
                  setUnitToDelete(null);
                  setDeleteConfirmText("");
                }
              }}
              disabled={deleteConfirmText !== "DELETE" || deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Permanently"}
            </AdminButton>
          </AdminDialogFooter>
        </AdminDialogContent>
      </AdminDialog>

      {/* Reassignment Drawer */}
      <AdminSheet open={reassignDrawerOpen} onOpenChange={setReassignDrawerOpen}>
        <AdminSheetContent>
          <AdminSheetHeader>
            <AdminSheetTitle>Reassign Unit</AdminSheetTitle>
            <AdminSheetDescription>
              Move this guest to a different tent or cabin
            </AdminSheetDescription>
          </AdminSheetHeader>

          {selectedUnit && (
            <div className="space-y-6 py-6">
              {/* Current Assignment */}
              <div className="p-4 bg-[hsl(var(--admin-surface))] rounded-lg">
                <AdminLabel className="text-xs uppercase tracking-wider text-[hsl(var(--admin-text-muted))]">
                  Current Unit
                </AdminLabel>
                <p className="font-medium text-lg mt-1">{selectedUnit.unit_name}</p>
                <p className="text-sm text-[hsl(var(--admin-text-muted))]">
                  {getZoneName(selectedUnit.zone_key)} • {selectedUnit.product_type === "tent" ? "Tent" : "Cabin"}
                </p>
              </div>

              {/* Guest Info */}
              {unitAssignmentMap.get(selectedUnit.id) && (
                <div className="p-4 border border-[hsl(var(--admin-border))] rounded-lg">
                  <AdminLabel className="text-xs uppercase tracking-wider text-[hsl(var(--admin-text-muted))]">
                    Guest
                  </AdminLabel>
                  <p className="font-medium mt-1">{unitAssignmentMap.get(selectedUnit.id)?.guestName}</p>
                  <p className="text-sm text-[hsl(var(--admin-text-muted))]">
                    {unitAssignmentMap.get(selectedUnit.id)?.email}
                  </p>
                </div>
              )}

              {/* New Unit Selection */}
              <div className="space-y-2">
                <AdminLabel>New Unit</AdminLabel>
                <AdminSelect
                  value={newUnitId}
                  onValueChange={setNewUnitId}
                  placeholder="Select new unit..."
                >
                  {units
                    ?.filter((u) => 
                      u.id !== selectedUnit.id && 
                      u.inventory_status === "available"
                    )
                    .sort((a, b) => a.unit_name.localeCompare(b.unit_name, undefined, { numeric: true }))
                    .map((u) => (
                      <AdminSelectItem key={u.id} value={u.id}>
                        {u.unit_name} — {getZoneName(u.zone_key)} ({u.product_type})
                      </AdminSelectItem>
                    ))}
                </AdminSelect>
                <p className="text-xs text-[hsl(var(--admin-text-muted))]">
                  Only showing available units. The old unit will become available after reassignment.
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <AdminButton
                  variant="adminOutline"
                  className="flex-1"
                  onClick={() => {
                    setReassignDrawerOpen(false);
                    setSelectedUnit(null);
                    setNewUnitId("");
                  }}
                >
                  Cancel
                </AdminButton>
                <AdminButton
                  className="flex-1"
                  onClick={handleReassignUnit}
                  disabled={!newUnitId || isReassigning}
                >
                  {isReassigning ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Reassigning...
                    </>
                  ) : (
                    <>
                      <ArrowLeftRight className="h-4 w-4 mr-2" />
                      Confirm Reassignment
                    </>
                  )}
                </AdminButton>
              </div>
            </div>
          )}
        </AdminSheetContent>
      </AdminSheet>

      {/* Comp Assignment Drawer */}
      <CompAssignmentDrawer
        open={compDrawerOpen}
        onOpenChange={handleCompDrawerChange}
        availableUnits={[
          // Include available units
          ...(units?.filter(u => u.inventory_status === "available") || []),
          // Also include orphaned assigned units (they can be reassigned via comp)
          ...(preselectedCompUnitId ? units?.filter(u => u.id === preselectedCompUnitId) || [] : [])
        ].filter((u, i, arr) => arr.findIndex(x => x.id === u.id) === i)} // Dedupe
        zones={zones || []}
        eventId={getLodgingEventId()}
        preselectedUnitId={preselectedCompUnitId}
        editingBookingId={editingBookingId}
      />

      {/* Bulk lock confirmation dialog */}
      <AdminConfirmDialog
        open={bulkLockConfirmOpen}
        onOpenChange={setBulkLockConfirmOpen}
        title="Lock All Assigned Units"
        description={`This will lock ${lockableUnits.length} units as final placements. Locked units require extra confirmation to reassign.`}
        actionLabel={isBulkLocking ? "Locking..." : `Lock ${lockableUnits.length} Units`}
        actionType="warning"
        consequences={[
          "All reserved and assigned units with guests will be locked",
          "Locked units cannot be moved without explicit override",
        ]}
        onConfirm={handleBulkLock}
        isLoading={isBulkLocking}
      />

      {/* Locked unit confirmation dialog */}
      <AdminConfirmDialog
        open={lockedConfirmOpen}
        onOpenChange={(open) => {
          setLockedConfirmOpen(open);
          if (!open) setPendingLockedAction(null);
        }}
        title="Unit is Locked"
        description={lockedConfirmMessage}
        actionLabel="Yes, Override Lock"
        actionType="danger"
        consequences={[
          "This unit was marked as final placement",
          "Changing it may disrupt confirmed arrangements",
        ]}
        onConfirm={() => {
          setLockedConfirmOpen(false);
          pendingLockedAction?.();
          setPendingLockedAction(null);
        }}
      />
    </div>
  );
};

export default AdminFamilyStyleUnits;
