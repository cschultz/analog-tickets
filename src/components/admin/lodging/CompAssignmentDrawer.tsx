import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  AdminButton,
  AdminInput,
  AdminLabel,
  AdminSelect,
  AdminSelectItem,
  AdminSheet,
  AdminSheetContent,
  AdminSheetHeader,
  AdminSheetTitle,
  AdminSheetDescription,
} from "@/components/admin";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

interface AccommodationUnit {
  id: string;
  unit_name: string;
  product_type: "tent" | "cabin";
  zone_key: string;
  night_price: number;
}

interface AccommodationZone {
  zone_key: string;
  zone_name: string;
}

const ASSIGNEE_TYPES = [
  { value: "production", label: "Production / Staff" },
  { value: "band", label: "Band / Artist" },
  { value: "partner", label: "Partner / Sponsor" },
  { value: "comp", label: "Complimentary Guest" },
];

const UNIT_STATUS_OPTIONS = [
  { value: "reserved", label: "Reserved", description: "Hold unit, guest not yet notified" },
  { value: "assigned", label: "Assigned", description: "Unit assigned and guest can be notified" },
  { value: "locked", label: "Locked", description: "Final placement — do not move" },
];

interface CompAssignmentDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableUnits: AccommodationUnit[];
  zones: AccommodationZone[];
  eventId: string;
  preselectedUnitId?: string;
  /** When set, the drawer edits this existing lodging_booking instead of creating a new one. */
  editingBookingId?: string;
}

export function CompAssignmentDrawer({
  open,
  onOpenChange,
  availableUnits,
  zones,
  eventId,
  preselectedUnitId,
  editingBookingId,
}: CompAssignmentDrawerProps) {
  const queryClient = useQueryClient();
  const isEditing = !!editingBookingId;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    assignee_name: "",
    email: "",
    assignee_company: "",
    assignee_type: "production",
    unit_id: "",
    unit_status: "reserved" as "reserved" | "assigned",
    notes: "",
  });

  // Set preselected unit when prop changes
  useEffect(() => {
    if (preselectedUnitId && open) {
      setFormData(prev => ({ ...prev, unit_id: preselectedUnitId }));
    }
  }, [preselectedUnitId, open]);

  // Load existing booking data when editing
  useEffect(() => {
    if (!editingBookingId || !open) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("lodging_bookings")
        .select("email, assignee_name, assignee_company, assignee_type, assigned_unit_id, assignment_status, notes")
        .eq("id", editingBookingId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        toast.error("Failed to load assignment details");
        return;
      }
      const emailIsManual = (data.email || "").endsWith("@manual.local");
      setFormData({
        assignee_name: data.assignee_name || "",
        email: emailIsManual ? "" : (data.email || ""),
        assignee_company: data.assignee_company || "",
        assignee_type: data.assignee_type || "production",
        unit_id: data.assigned_unit_id || "",
        unit_status: (data.assignment_status === "assigned" ? "assigned" : "reserved") as "reserved" | "assigned",
        notes: data.notes || "",
      });
    })();
    return () => { cancelled = true; };
  }, [editingBookingId, open]);

  const resetForm = () => {
    setFormData({
      assignee_name: "",
      email: "",
      assignee_company: "",
      assignee_type: "production",
      unit_id: "",
      unit_status: "reserved",
      notes: "",
    });
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      resetForm();
    } else if (preselectedUnitId) {
      setFormData(prev => ({ ...prev, unit_id: preselectedUnitId }));
    }
    onOpenChange(isOpen);
  };

  const getZoneName = (zoneKey: string) => {
    return zones?.find((z) => z.zone_key === zoneKey)?.zone_name || zoneKey;
  };

  const handleSubmit = async () => {
    if (!formData.assignee_name.trim()) {
      toast.error("Please enter the assignee's name");
      return;
    }
    if (!isEditing && !formData.unit_id) {
      toast.error("Please select a unit");
      return;
    }

    const selectedUnit = isEditing ? null : availableUnits.find((u) => u.id === formData.unit_id);
    if (!isEditing && !selectedUnit) {
      toast.error("Selected unit not found");
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditing) {
        // Update existing booking — only assignee details, not unit
        const { error: updateError } = await supabase
          .from("lodging_bookings")
          .update({
            email: formData.email.trim().toLowerCase() || `${formData.assignee_name.toLowerCase().replace(/\s+/g, '.')}@manual.local`,
            assignee_type: formData.assignee_type,
            assignee_name: formData.assignee_name.trim(),
            assignee_company: formData.assignee_company.trim() || null,
            notes: formData.notes.trim() || null,
          })
          .eq("id", editingBookingId!);

        if (updateError) throw updateError;

        toast.success(`Updated guest details for ${formData.assignee_name}`);
        queryClient.invalidateQueries({ queryKey: ["accommodation-units-all"] });
        queryClient.invalidateQueries({ queryKey: ["lodging-booking-assignments"] });

        resetForm();
        handleOpenChange(false);
        return;
      }

      // CRITICAL: Check if this unit is already assigned to another booking
      const { data: existingAssignment, error: checkError } = await supabase
        .from("lodging_bookings")
        .select("id, email, assignee_name, registrations(name)")
        .eq("assigned_unit_id", formData.unit_id)
        .in("payment_status", ["paid", "completed", "comp"])
        .maybeSingle();

      if (checkError) {
        console.error("Error checking existing assignment:", checkError);
      }

      if (existingAssignment) {
        const assignedTo = existingAssignment.assignee_name || 
          (existingAssignment.registrations as any)?.name || 
          existingAssignment.email;
        toast.error(`Unit already assigned to ${assignedTo}. Reassign that booking first.`);
        setIsSubmitting(false);
        return;
      }

      // Create a comp lodging booking
      const { error: bookingError } = await supabase
        .from("lodging_bookings")
        .insert({
          email: formData.email.trim().toLowerCase() || `${formData.assignee_name.toLowerCase().replace(/\s+/g, '.')}@manual.local`,
          event_id: eventId,
          zone_key: selectedUnit.zone_key,
          quantity: 1,
          total_amount: 0, // Comp booking
          payment_status: "comp",
          assignment_status: formData.unit_status === "assigned" ? "assigned" : "pending",
          assigned_unit_id: formData.unit_id,
          assigned_at: new Date().toISOString(),
          assignee_type: formData.assignee_type,
          assignee_name: formData.assignee_name.trim(),
          assignee_company: formData.assignee_company.trim() || null,
          notes: formData.notes.trim() || null,
          guest_notified: false,
        });

      if (bookingError) throw bookingError;

      // Mark unit with the selected status
      const { error: unitError } = await supabase
        .from("accommodation_units")
        .update({ inventory_status: formData.unit_status })
        .eq("id", formData.unit_id);

      if (unitError) throw unitError;

      toast.success(`${selectedUnit.unit_name} ${formData.unit_status} for ${formData.assignee_name}`);
      queryClient.invalidateQueries({ queryKey: ["accommodation-units-all"] });
      queryClient.invalidateQueries({ queryKey: ["lodging-booking-assignments"] });
      
      resetForm();
      handleOpenChange(false);
    } catch (error: any) {
      console.error("Assignment error:", error);
      toast.error(error.message || "Failed to create assignment");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AdminSheet open={open} onOpenChange={handleOpenChange}>
      <AdminSheetContent>
        <AdminSheetHeader>
          <AdminSheetTitle>{isEditing ? "Edit Guest Details" : "Manual Unit Assignment"}</AdminSheetTitle>
          <AdminSheetDescription>
            {isEditing
              ? "Update the name, email, or notes for this assignment. Use the Reassign button to move them to a different unit."
              : "Reserve or assign a unit for production, bands, partners, or comp guests"}
          </AdminSheetDescription>
        </AdminSheetHeader>

        <div className="space-y-5 py-6">
          <div>
            <AdminLabel>Name *</AdminLabel>
            <AdminInput
              value={formData.assignee_name}
              onChange={(e) => setFormData({ ...formData, assignee_name: e.target.value })}
              placeholder="e.g., John Smith"
            />
          </div>

          <div>
            <AdminLabel>Company / Band Name</AdminLabel>
            <AdminInput
              value={formData.assignee_company}
              onChange={(e) => setFormData({ ...formData, assignee_company: e.target.value })}
              placeholder="e.g., Audio Crew, The Band Name"
            />
          </div>

          <div>
            <AdminLabel>Email Address</AdminLabel>
            <AdminInput
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="Optional - for notifications"
            />
            <p className="text-xs text-[hsl(var(--admin-text-muted))] mt-1">
              Only needed if you want to send assignment notifications
            </p>
          </div>

          <div>
            <AdminLabel>Role Type</AdminLabel>
            <AdminSelect
              value={formData.assignee_type}
              onValueChange={(v) => setFormData({ ...formData, assignee_type: v })}
            >
              {ASSIGNEE_TYPES.map((type) => (
                <AdminSelectItem key={type.value} value={type.value}>
                  {type.label}
                </AdminSelectItem>
              ))}
            </AdminSelect>
          </div>

          {!isEditing && (
            <>
              <div>
                <AdminLabel>Select Unit *</AdminLabel>
                <AdminSelect
                  value={formData.unit_id}
                  onValueChange={(v) => setFormData({ ...formData, unit_id: v })}
                  placeholder="Choose a unit..."
                >
                  {availableUnits
                    .sort((a, b) => a.unit_name.localeCompare(b.unit_name, undefined, { numeric: true }))
                    .map((unit) => (
                      <AdminSelectItem key={unit.id} value={unit.id}>
                        {unit.unit_name} — {getZoneName(unit.zone_key)} ({unit.product_type})
                      </AdminSelectItem>
                    ))}
                </AdminSelect>
              </div>

              <div>
                <AdminLabel>Unit Status</AdminLabel>
                <AdminSelect
                  value={formData.unit_status}
                  onValueChange={(v) => setFormData({ ...formData, unit_status: v as "reserved" | "assigned" })}
                >
                  {UNIT_STATUS_OPTIONS.map((opt) => (
                    <AdminSelectItem key={opt.value} value={opt.value}>
                      {opt.label} — {opt.description}
                    </AdminSelectItem>
                  ))}
                </AdminSelect>
                <p className="text-xs text-[hsl(var(--admin-text-muted))] mt-1">
                  Use "Reserved" to hold without notification, "Assigned" when ready
                </p>
              </div>
            </>
          )}
          <div>
            <AdminLabel>Notes (optional)</AdminLabel>
            <AdminInput
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Internal notes..."
            />
          </div>

          <div className="pt-4 flex gap-3">
            <AdminButton
              variant="adminOutline"
              className="flex-1"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </AdminButton>
            <AdminButton
              className="flex-1"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  {isEditing ? "Save Changes" : (formData.unit_status === "reserved" ? "Reserve Unit" : "Assign Unit")}
                </>
              )}
            </AdminButton>
          </div>
        </div>
      </AdminSheetContent>
    </AdminSheet>
  );
}
