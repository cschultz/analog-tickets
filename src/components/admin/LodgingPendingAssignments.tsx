import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminButton, AdminBadge } from "@/components/admin/AdminUI";
import {
  AdminTable,
  AdminTableBody,
  AdminTableCell,
  AdminTableHead,
  AdminTableHeader,
  AdminTableRow,
  AdminSelect,
  AdminSelectItem,
} from "@/components/admin";
import { AdminCard, AdminCardHeader, AdminCardTitle, AdminCardDescription, AdminCardContent } from "@/components/admin/AdminCard";
import { Check, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface PendingBooking {
  id: string;
  registration_id: string;
  zone_key: string;
  quantity: number;
  total_amount: number;
  payment_status: string;
  assignment_status: string;
  assigned_unit_id: string | null;
  created_at: string;
  registrations: {
    name: string;
    email: string;
  };
  accommodation_zones: {
    zone_name: string;
  };
}

interface AvailableUnit {
  id: string;
  unit_name: string;
  product_type: string;
  zone_key: string;
  bed_configuration: string;
  sleeps_max: number;
}

function PendingBookingRow({ 
  booking, 
  units, 
  onAssign, 
  savingId 
}: { 
  booking: PendingBooking; 
  units: AvailableUnit[]; 
  onAssign: (bookingId: string, unitId: string, previousUnitId?: string | null) => void;
  savingId: string | null;
}) {
  const [selectedUnit, setSelectedUnit] = useState<string>(booking.assigned_unit_id || "");
  const [showAllZones, setShowAllZones] = useState(false);
  
  // Filter units - show same zone by default, or all zones if toggled
  const availableUnits = showAllZones 
    ? units 
    : units.filter(u => u.zone_key === booking.zone_key);
  const currentUnit = units.find(u => u.id === booking.assigned_unit_id);
  const hasExistingAssignment = !!booking.assigned_unit_id;
  const originalZone = booking.zone_key;

  return (
    <AdminTableRow>
      <AdminTableCell>
        <div>
          <p className="font-medium">{booking.registrations?.name}</p>
          <p className="text-sm text-[hsl(var(--admin-text-muted))]">
            {booking.registrations?.email}
          </p>
        </div>
      </AdminTableCell>
      <AdminTableCell>
        <AdminBadge intent="neutral">
          {booking.accommodation_zones?.zone_name}
        </AdminBadge>
      </AdminTableCell>
      <AdminTableCell>{booking.quantity}</AdminTableCell>
      <AdminTableCell>
        {format(new Date(booking.created_at), "MMM d, yyyy")}
      </AdminTableCell>
      <AdminTableCell>
        <div className="space-y-2">
          {hasExistingAssignment && currentUnit && (
            <div className="text-xs text-[hsl(var(--admin-text-muted))]">
              Current: <span className="font-medium text-[hsl(var(--admin-foreground))]">#{currentUnit.unit_name}</span>
            </div>
          )}
          {availableUnits.length > 0 || hasExistingAssignment ? (
            <>
              <AdminSelect
                value={selectedUnit}
                onValueChange={setSelectedUnit}
                placeholder={hasExistingAssignment ? "Reassign to..." : "Select unit..."}
                className="w-56"
              >
                {availableUnits
                  .sort((a, b) => a.unit_name.localeCompare(b.unit_name, undefined, { numeric: true }))
                  .map((unit) => {
                    const isOtherZone = unit.zone_key !== originalZone;
                    return (
                      <AdminSelectItem key={unit.id} value={unit.id}>
                        #{unit.unit_name} - {unit.product_type} ({unit.bed_configuration})
                        {isOtherZone && " ⬆️"}
                      </AdminSelectItem>
                    );
                  })}
              </AdminSelect>
              <label className="flex items-center gap-1.5 text-xs text-[hsl(var(--admin-text-muted))] cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAllZones}
                  onChange={(e) => setShowAllZones(e.target.checked)}
                  className="rounded border-[hsl(var(--admin-border))]"
                />
                Show all zones (upgrade/downgrade)
              </label>
            </>
          ) : (
            <span className="text-sm text-[hsl(var(--admin-text-muted))]">
              No units available
            </span>
          )}
        </div>
      </AdminTableCell>
      <AdminTableCell>
        <AdminButton
          variant="admin"
          size="sm"
          disabled={!selectedUnit || selectedUnit === booking.assigned_unit_id || savingId === booking.id}
          onClick={() => onAssign(booking.id, selectedUnit, booking.assigned_unit_id)}
        >
          {savingId === booking.id ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : hasExistingAssignment && selectedUnit !== booking.assigned_unit_id ? (
            <>
              <RefreshCw className="h-4 w-4 mr-1" />
              Reassign
            </>
          ) : (
            <>
              <Check className="h-4 w-4 mr-1" />
              Assign
            </>
          )}
        </AdminButton>
      </AdminTableCell>
    </AdminTableRow>
  );
}

export function LodgingPendingAssignments() {
  const [bookings, setBookings] = useState<PendingBooking[]>([]);
  const [units, setUnits] = useState<AvailableUnit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch bookings that need assignment OR already assigned (for reassignment)
      const { data: bookingData, error: bookingError } = await supabase
        .from("lodging_bookings")
        .select(`
          id, registration_id, zone_key, quantity, total_amount, 
          payment_status, assignment_status, assigned_unit_id, created_at,
          registrations(name, email),
          accommodation_zones(zone_name)
        `)
        .eq("payment_status", "paid")
        .in("assignment_status", ["pending", "assigned"])
        .order("created_at", { ascending: true });

      if (bookingError) throw bookingError;
      setBookings((bookingData as unknown as PendingBooking[]) || []);

      // Fetch available AND reserved units (reserved can be reassigned)
      // Include all units (both standard and family-style) to allow flexible admin reassignment
      const { data: unitData, error: unitError } = await supabase
        .from("accommodation_units")
        .select("id, unit_name, product_type, zone_key, bed_configuration, sleeps_max, is_family_style")
        .in("inventory_status", ["available", "reserved", "assigned"])
        .order("unit_name");

      if (unitError) throw unitError;
      setUnits(unitData || []);
    } catch (error: any) {
      console.error("Error fetching pending assignments:", error);
      toast.error("Failed to load pending assignments");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAssignUnit = async (bookingId: string, unitId: string, previousUnitId?: string | null) => {
    setSavingId(bookingId);
    try {
      // Get the new unit's zone_key for potential zone upgrade/downgrade
      const newUnit = units.find(u => u.id === unitId);
      if (!newUnit) {
        throw new Error("Selected unit not found");
      }

      // CRITICAL: Check if this unit is already assigned to another booking
      const { data: existingAssignment, error: checkError } = await supabase
        .from("lodging_bookings")
        .select("id, email, registrations(name)")
        .eq("assigned_unit_id", unitId)
        .neq("id", bookingId) // Exclude current booking
        .in("payment_status", ["paid", "completed", "comp"])
        .maybeSingle();

      if (checkError) {
        console.error("Error checking existing assignment:", checkError);
      }

      if (existingAssignment) {
        const assignedTo = (existingAssignment.registrations as any)?.name || existingAssignment.email;
        toast.error(`Unit already assigned to ${assignedTo}. Reassign that booking first.`);
        setSavingId(null);
        return;
      }

      // If there was a previously assigned unit, release it back to available
      if (previousUnitId) {
        const { error: releaseError } = await supabase
          .from("accommodation_units")
          .update({ inventory_status: "available" })
          .eq("id", previousUnitId);

        if (releaseError) {
          console.error("Failed to release previous unit:", releaseError);
        }
      }

      // Update the booking with the assigned unit (and zone if changed)
      const { error: bookingError } = await supabase
        .from("lodging_bookings")
        .update({
          assigned_unit_id: unitId,
          zone_key: newUnit.zone_key, // Update zone in case of upgrade/downgrade
          assignment_status: "assigned",
          assigned_at: new Date().toISOString(),
        })
        .eq("id", bookingId);

      if (bookingError) throw bookingError;

      // Mark the new unit as reserved (admin has assigned but guest not notified)
      const { error: unitError } = await supabase
        .from("accommodation_units")
        .update({ inventory_status: "reserved" })
        .eq("id", unitId);

      if (unitError) {
        console.error("Failed to mark unit as reserved:", unitError);
      }

      toast.success(previousUnitId ? "Unit reassigned successfully" : "Unit assigned successfully");
      fetchData(); // Refresh the list
    } catch (error: any) {
      console.error("Error assigning unit:", error);
      toast.error(error.message || "Failed to assign unit");
    } finally {
      setSavingId(null);
    }
  };

  if (isLoading) {
    return (
      <AdminCard>
        <AdminCardContent className="py-8 text-center text-[hsl(var(--admin-text-muted))]">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
          Loading pending assignments...
        </AdminCardContent>
      </AdminCard>
    );
  }

  return (
    <AdminCard>
      <AdminCardHeader>
        <div className="flex items-center justify-between">
          <div>
            <AdminCardTitle className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-[hsl(var(--admin-warning))]" />
              Pending Unit Assignments
            </AdminCardTitle>
            <AdminCardDescription>
              Assign specific tents or cabins to zone-based bookings
            </AdminCardDescription>
          </div>
          <AdminButton
            variant="adminOutline"
            size="sm"
            onClick={fetchData}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </AdminButton>
        </div>
      </AdminCardHeader>
      <AdminCardContent className="p-0">
        {bookings.length === 0 ? (
          <div className="py-12 text-center text-[hsl(var(--admin-text-muted))]">
            <Check className="h-8 w-8 mx-auto mb-2 text-[hsl(var(--admin-success))]" />
            <p>All lodging bookings have been assigned!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <AdminTable>
              <AdminTableHeader>
                <AdminTableRow>
                  <AdminTableHead>Guest</AdminTableHead>
                  <AdminTableHead>Zone</AdminTableHead>
                  <AdminTableHead>Qty</AdminTableHead>
                  <AdminTableHead>Purchased</AdminTableHead>
                  <AdminTableHead>Assign Unit</AdminTableHead>
                  <AdminTableHead className="w-24"></AdminTableHead>
                </AdminTableRow>
              </AdminTableHeader>
              <AdminTableBody>
                {bookings.map((booking) => (
                  <PendingBookingRow
                    key={booking.id}
                    booking={booking}
                    units={units}
                    onAssign={handleAssignUnit}
                    savingId={savingId}
                  />
                ))}
              </AdminTableBody>
            </AdminTable>
          </div>
        )}
      </AdminCardContent>
    </AdminCard>
  );
}
