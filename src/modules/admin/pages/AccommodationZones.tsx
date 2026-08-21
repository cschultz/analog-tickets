import { useState } from "react";
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
  AdminSwitch,
  AdminTable,
  AdminTableBody,
  AdminTableCell,
  AdminTableHead,
  AdminTableHeader,
  AdminTableRow,
  AdminTableEmpty,
  AdminSheet,
  AdminSheetContent,
  AdminSheetHeader,
  AdminSheetTitle,
  AdminSheetDescription,
} from "@/components/admin";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Home, Volume2, VolumeX, Volume1, Users } from "lucide-react";
import { toast } from "sonner";

type SoundLevel = "Low" | "Moderate" | "High";

interface AccommodationZone {
  id: string;
  zone_key: string;
  zone_name: string;
  description: string | null;
  sound_level: SoundLevel;
  sleeps_min: number;
  sleeps_max: number;
  inventory_total: number;
  inventory_available: number;
  night_price: number;
  stripe_price_id: string | null;
  is_publicly_available: boolean;
  created_at: string;
  updated_at: string;
}

const getSoundLevelIcon = (level: SoundLevel) => {
  switch (level) {
    case "High":
      return <Volume2 className="h-4 w-4" />;
    case "Moderate":
      return <Volume1 className="h-4 w-4" />;
    case "Low":
      return <VolumeX className="h-4 w-4" />;
  }
};

const getSoundLevelIntent = (level: SoundLevel) => {
  switch (level) {
    case "High":
      return "danger" as const;
    case "Moderate":
      return "warning" as const;
    case "Low":
      return "success" as const;
  }
};

export default function AccommodationZonesPage() {
  const queryClient = useQueryClient();
  const [selectedZone, setSelectedZone] = useState<AccommodationZone | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [formData, setFormData] = useState({
    description: "",
    night_price: 0,
    inventory_total: 0,
    is_publicly_available: false,
  });

  const { data: zones, isLoading } = useAuthQuery({
    queryKey: ["accommodation-zones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accommodation_zones")
        .select("*")
        .order("night_price", { ascending: false });

      if (error) {
        console.error("Error fetching accommodation zones:", error);
        throw error;
      }
      return data as AccommodationZone[];
    },
    staleTime: 60 * 1000,
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<AccommodationZone>;
    }) => {
      const { error } = await supabase
        .from("accommodation_zones")
        .update(data)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Zone updated");
      queryClient.invalidateQueries({ queryKey: ["accommodation-zones"] });
      setSheetOpen(false);
      setSelectedZone(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update zone");
    },
  });

  const toggleVisibilityMutation = useMutation({
    mutationFn: async ({
      id,
      is_publicly_available,
    }: {
      id: string;
      is_publicly_available: boolean;
    }) => {
      const { error } = await supabase
        .from("accommodation_zones")
        .update({ is_publicly_available })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      toast.success(
        variables.is_publicly_available
          ? "Zone is now publicly available"
          : "Zone hidden from public"
      );
      queryClient.invalidateQueries({ queryKey: ["accommodation-zones"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update visibility");
    },
  });

  const handleRowClick = (zone: AccommodationZone) => {
    setSelectedZone(zone);
    setFormData({
      description: zone.description || "",
      night_price: zone.night_price / 100,
      inventory_total: zone.inventory_total,
      is_publicly_available: zone.is_publicly_available,
    });
    setSheetOpen(true);
  };

  const handleSave = () => {
    if (!selectedZone) return;

    // Calculate new available inventory
    const soldCount = selectedZone.inventory_total - selectedZone.inventory_available;
    const newAvailable = Math.max(0, formData.inventory_total - soldCount);

    updateMutation.mutate({
      id: selectedZone.id,
      data: {
        description: formData.description || null,
        night_price: Math.round(formData.night_price * 100),
        inventory_total: formData.inventory_total,
        inventory_available: newAvailable,
        is_publicly_available: formData.is_publicly_available,
      },
    });
  };

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={Home}
        title="Accommodation Zones"
        subtitle="Manage lodging zones and availability"
      />

      <AdminCard>
        <AdminCardHeader icon={Home}>
          <div>
            <AdminCardTitle>Zone Inventory</AdminCardTitle>
            <AdminCardDescription>
              Click a row to edit zone details
            </AdminCardDescription>
          </div>
        </AdminCardHeader>
        <AdminCardContent>
          {isLoading ? (
            <div className="text-center py-8 text-[hsl(var(--admin-text-muted))]">
              Loading zones...
            </div>
          ) : !zones?.length ? (
            <AdminTable>
              <AdminTableBody>
                <AdminTableEmpty
                  title="No zones configured"
                  description="Accommodation zones will appear here once configured."
                />
              </AdminTableBody>
            </AdminTable>
          ) : (
            <AdminTable>
              <AdminTableHeader>
                <AdminTableRow>
                  <AdminTableHead>Zone</AdminTableHead>
                  <AdminTableHead className="text-center">Sound Level</AdminTableHead>
                  <AdminTableHead className="text-center">Sleeps</AdminTableHead>
                  <AdminTableHead className="text-center">Availability</AdminTableHead>
                  <AdminTableHead className="text-right">Price</AdminTableHead>
                  <AdminTableHead className="text-center">Public</AdminTableHead>
                </AdminTableRow>
              </AdminTableHeader>
              <AdminTableBody>
                {zones.map((zone) => {
                  const soldCount = zone.inventory_total - zone.inventory_available;
                  return (
                    <AdminTableRow
                      key={zone.id}
                      className="cursor-pointer hover:bg-[hsl(var(--admin-hover))]"
                      onClick={() => handleRowClick(zone)}
                    >
                      <AdminTableCell>
                        <div>
                          <p className="font-medium">{zone.zone_name}</p>
                          <p className="text-xs text-[hsl(var(--admin-text-muted))] max-w-xs truncate">
                            {zone.description}
                          </p>
                        </div>
                      </AdminTableCell>
                      <AdminTableCell className="text-center">
                        <AdminBadge
                          intent={getSoundLevelIntent(zone.sound_level)}
                          className="inline-flex items-center gap-1"
                        >
                          {getSoundLevelIcon(zone.sound_level)}
                          {zone.sound_level}
                        </AdminBadge>
                      </AdminTableCell>
                      <AdminTableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Users className="h-3 w-3" />
                          {zone.sleeps_min}–{zone.sleeps_max}
                        </div>
                      </AdminTableCell>
                      <AdminTableCell className="text-center">
                        <span
                          className={
                            zone.inventory_available === 0
                              ? "text-[hsl(var(--admin-error))]"
                              : ""
                          }
                        >
                          {zone.inventory_available} / {zone.inventory_total}
                        </span>
                        {zone.inventory_available === 0 && (
                          <AdminBadge intent="danger" className="ml-2">
                            Sold Out
                          </AdminBadge>
                        )}
                        {soldCount > 0 && zone.inventory_available > 0 && (
                          <span className="ml-2 text-xs text-[hsl(var(--admin-text-muted))]">
                            ({soldCount} sold)
                          </span>
                        )}
                      </AdminTableCell>
                      <AdminTableCell className="text-right font-medium">
                        {formatPrice(zone.night_price)}
                      </AdminTableCell>
                      <AdminTableCell className="text-center">
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="flex justify-center"
                        >
                          <AdminSwitch
                            checked={zone.is_publicly_available}
                            onCheckedChange={(checked) =>
                              toggleVisibilityMutation.mutate({
                                id: zone.id,
                                is_publicly_available: checked,
                              })
                            }
                          />
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

      <AdminSheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <AdminSheetContent>
          <AdminSheetHeader>
            <AdminSheetTitle>{selectedZone?.zone_name}</AdminSheetTitle>
            <AdminSheetDescription>
              Edit zone settings and availability
            </AdminSheetDescription>
          </AdminSheetHeader>

          {selectedZone && (
            <div className="space-y-6 mt-6">
              {/* Sound Level Badge */}
              <div>
                <AdminLabel className="text-xs uppercase tracking-wider text-[hsl(var(--admin-text-muted))]">
                  Sound Level
                </AdminLabel>
                <div className="mt-2">
                  <AdminBadge
                    intent={getSoundLevelIntent(selectedZone.sound_level)}
                    className="inline-flex items-center gap-1"
                  >
                    {getSoundLevelIcon(selectedZone.sound_level)}
                    {selectedZone.sound_level}
                  </AdminBadge>
                </div>
              </div>

              {/* Description */}
              <div>
                <AdminLabel htmlFor="description">Description</AdminLabel>
                <AdminTextarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder="Zone description..."
                  rows={3}
                  className="mt-1.5"
                />
              </div>

              {/* Weekend Price */}
              <div>
                <AdminLabel htmlFor="price">Price per Night ($)</AdminLabel>
                <AdminInput
                  id="price"
                  type="number"
                  min={0}
                  step={50}
                  value={formData.night_price}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      night_price: parseFloat(e.target.value) || 0,
                    }))
                  }
                  className="mt-1.5"
                />
              </div>

              {/* Inventory Total */}
              <div>
                <AdminLabel htmlFor="inventory">Total Inventory</AdminLabel>
                <AdminInput
                  id="inventory"
                  type="number"
                  min={0}
                  value={formData.inventory_total}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      inventory_total: parseInt(e.target.value) || 0,
                    }))
                  }
                  className="mt-1.5"
                />
                <p className="text-xs text-[hsl(var(--admin-text-muted))] mt-1">
                  {selectedZone.inventory_total - selectedZone.inventory_available}{" "}
                  already sold
                </p>
              </div>

              {/* Public Visibility */}
              <div className="flex items-center justify-between">
                <div>
                  <AdminLabel htmlFor="visibility">Publicly Available</AdminLabel>
                  <p className="text-xs text-[hsl(var(--admin-text-muted))]">
                    Show this zone during booking
                  </p>
                </div>
                <AdminSwitch
                  id="visibility"
                  checked={formData.is_publicly_available}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({
                      ...prev,
                      is_publicly_available: checked,
                    }))
                  }
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-[hsl(var(--admin-border))]">
                <AdminButton
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  className="flex-1"
                >
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </AdminButton>
                <AdminButton
                  variant="outline"
                  onClick={() => {
                    setSheetOpen(false);
                    setSelectedZone(null);
                  }}
                >
                  Cancel
                </AdminButton>
              </div>
            </div>
          )}
        </AdminSheetContent>
      </AdminSheet>
    </div>
  );
}
