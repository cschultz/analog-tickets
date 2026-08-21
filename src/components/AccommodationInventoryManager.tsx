import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { supabase } from "@/integrations/supabase/client";
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
  AdminDialog,
  AdminDialogContent,
  AdminDialogDescription,
  AdminDialogFooter,
  AdminDialogHeader,
  AdminDialogTitle,
} from "@/components/admin";
import {
  AdminSheet,
  AdminSheetContent,
  AdminSheetDescription,
  AdminSheetHeader,
  AdminSheetTitle,
} from "@/components/admin/AdminSheet";
import { 
  Home, 
  Plus, 
  Edit2, 
  Trash2, 
  Upload, 
  X, 
  Image as ImageIcon,
  Users,
  Bed,
  Clock,
  DollarSign
} from "lucide-react";
import { toast } from "sonner";

interface AccommodationInventoryManagerProps {
  eventId: string;
  eventTitle?: string;
}

interface LodgingInventory {
  id: string;
  event_id: string | null;
  lodging_type: string;
  display_name: string;
  description: string | null;
  price: number;
  total_quantity: number;
  sold_quantity: number;
  is_active: boolean;
  is_publicly_available: boolean;
  required_ticket_types: string[] | null;
  capacity: number | null;
  bed_config: string | null;
  amenities: string[] | null;
  check_in_time: string | null;
  check_out_time: string | null;
  policies: string | null;
  location_notes: string | null;
  images: string[] | null;
}

const AMENITY_OPTIONS = [
  "Private Bathroom",
  "Shared Bathroom",
  "Air Conditioning",
  "Heating",
  "WiFi",
  "Electricity",
  "Linens Provided",
  "Towels Provided",
  "Mini Fridge",
  "Coffee Maker",
  "Fire Pit Access",
  "River View",
  "Deck/Patio",
  "Pet Friendly",
];

export function AccommodationInventoryManager({ eventId, eventTitle }: AccommodationInventoryManagerProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const [selectedAccommodation, setSelectedAccommodation] = useState<LodgingInventory | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    lodging_type: "",
    display_name: "",
    description: "",
    price: 0,
    total_quantity: 1,
    is_active: true,
    is_publicly_available: true,
    required_ticket_types: ["vip", "krewe"] as string[],
    capacity: 2,
    bed_config: "",
    amenities: [] as string[],
    check_in_time: "3:00 PM",
    check_out_time: "11:00 AM",
    policies: "",
    location_notes: "",
    images: [] as string[],
  });

  const queryClient = useQueryClient();

  const { data: inventory, isLoading } = useAuthQuery({
    queryKey: ["lodging-inventory", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lodging_inventory")
        .select("*")
        .eq("event_id", eventId)
        .order("display_name");

      if (error) throw error;
      return data as LodgingInventory[];
    },
    enabled: !!eventId,
  });

  const { data: eventDetails } = useAuthQuery({
    queryKey: ["event-details", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_details")
        .select("accommodations_enabled")
        .eq("id", eventId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!eventId,
  });

  const toggleAccommodationsMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from("event_details")
        .update({ accommodations_enabled: enabled })
        .eq("id", eventId);
      if (error) throw error;
    },
    onSuccess: (_, enabled) => {
      toast.success(enabled ? "Accommodations enabled in checkout" : "Accommodations disabled in checkout");
      queryClient.invalidateQueries({ queryKey: ["event-details", eventId] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update setting");
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: Omit<LodgingInventory, "id" | "sold_quantity" | "event_id">) => {
      const { error } = await supabase.from("lodging_inventory").insert([{
        ...data,
        event_id: eventId,
        sold_quantity: 0,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Accommodation created");
      queryClient.invalidateQueries({ queryKey: ["lodging-inventory", eventId] });
      closeDialog();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create accommodation");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<LodgingInventory> }) => {
      const { error } = await supabase
        .from("lodging_inventory")
        .update(data)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Accommodation updated");
      queryClient.invalidateQueries({ queryKey: ["lodging-inventory", eventId] });
      closeDialog();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update accommodation");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("lodging_inventory")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Accommodation deleted");
      queryClient.invalidateQueries({ queryKey: ["lodging-inventory", eventId] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete accommodation");
    },
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      lodging_type: "",
      display_name: "",
      description: "",
      price: 0,
      total_quantity: 1,
      is_active: true,
      is_publicly_available: true,
      required_ticket_types: ["vip", "krewe"],
      capacity: 2,
      bed_config: "",
      amenities: [],
      check_in_time: "3:00 PM",
      check_out_time: "11:00 AM",
      policies: "",
      location_notes: "",
      images: [],
    });
  };

  const handleEdit = (item: LodgingInventory) => {
    setEditingId(item.id);
    setFormData({
      lodging_type: item.lodging_type,
      display_name: item.display_name,
      description: item.description || "",
      price: item.price / 100,
      total_quantity: item.total_quantity,
      is_active: item.is_active,
      is_publicly_available: item.is_publicly_available,
      required_ticket_types: item.required_ticket_types || ["vip", "krewe"],
      capacity: item.capacity || 2,
      bed_config: item.bed_config || "",
      amenities: item.amenities || [],
      check_in_time: item.check_in_time || "3:00 PM",
      check_out_time: item.check_out_time || "11:00 AM",
      policies: item.policies || "",
      location_notes: item.location_notes || "",
      images: item.images || [],
    });
    setDialogOpen(true);
  };

  const handleViewDetails = (item: LodgingInventory) => {
    setSelectedAccommodation(item);
    setDetailSheetOpen(true);
  };

  const handleSubmit = () => {
    const submitData = {
      lodging_type: formData.lodging_type.toLowerCase().replace(/\s+/g, "_"),
      display_name: formData.display_name,
      description: formData.description || null,
      price: Math.round(formData.price * 100),
      total_quantity: formData.total_quantity,
      is_active: formData.is_active,
      is_publicly_available: formData.is_publicly_available,
      required_ticket_types: formData.required_ticket_types,
      capacity: formData.capacity,
      bed_config: formData.bed_config || null,
      amenities: formData.amenities.length > 0 ? formData.amenities : null,
      check_in_time: formData.check_in_time || null,
      check_out_time: formData.check_out_time || null,
      policies: formData.policies || null,
      location_notes: formData.location_notes || null,
      images: formData.images.length > 0 ? formData.images : null,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: submitData });
    } else {
      createMutation.mutate(submitData as any);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be less than 5MB");
      return;
    }

    setUploadingImage(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${eventId}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from("accommodations")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("accommodations")
        .getPublicUrl(fileName);

      setFormData(prev => ({
        ...prev,
        images: [...prev.images, urlData.publicUrl],
      }));
      
      toast.success("Image uploaded");
    } catch (error: any) {
      toast.error(error.message || "Failed to upload image");
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const removeImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }));
  };

  const toggleAmenity = (amenity: string) => {
    setFormData(prev => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter(a => a !== amenity)
        : [...prev.amenities, amenity],
    }));
  };

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  return (
    <>
      <AdminCard>
        <AdminCardHeader icon={Home}>
          <div className="flex justify-between items-center w-full">
            <div>
              <AdminCardTitle>Accommodation Inventory</AdminCardTitle>
              <AdminCardDescription>
                Manage lodging options for {eventTitle || "this event"}
              </AdminCardDescription>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <AdminLabel htmlFor="accommodations-toggle" className="text-sm text-[hsl(var(--admin-text-muted))]">
                  Show in Checkout
                </AdminLabel>
                <AdminSwitch
                  id="accommodations-toggle"
                  checked={eventDetails?.accommodations_enabled ?? false}
                  onCheckedChange={(checked) => toggleAccommodationsMutation.mutate(checked)}
                />
              </div>
              <AdminButton
                onClick={() => {
                  resetForm();
                  setDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Accommodation
              </AdminButton>
            </div>
          </div>
        </AdminCardHeader>
        <AdminCardContent>
          {!eventDetails?.accommodations_enabled && (
            <div className="mb-4 p-3 bg-[hsl(var(--admin-warning)/0.1)] border border-[hsl(var(--admin-warning)/0.3)] rounded-lg">
              <p className="text-sm text-[hsl(var(--admin-warning))]">
                <strong>Accommodations are hidden from checkout.</strong> Toggle "Show in Checkout" above to enable accommodation selection during ticket purchase.
                Waitlist registration will still be available for eligible ticket holders.
              </p>
            </div>
          )}
          
          {isLoading ? (
            <div className="text-center py-8 text-[hsl(var(--admin-text-muted))]">Loading inventory...</div>
          ) : !inventory?.length ? (
            <div className="text-center py-8 text-[hsl(var(--admin-text-muted))]">
              No accommodations configured for this event yet.
            </div>
          ) : (
            <AdminTable>
              <AdminTableHeader>
                <AdminTableRow>
                  <AdminTableHead>Accommodation</AdminTableHead>
                  <AdminTableHead className="text-center">Capacity</AdminTableHead>
                  <AdminTableHead className="text-right">Price</AdminTableHead>
                  <AdminTableHead className="text-center">Sold / Total</AdminTableHead>
                  <AdminTableHead className="text-center">Status</AdminTableHead>
                  <AdminTableHead className="text-right">Actions</AdminTableHead>
                </AdminTableRow>
              </AdminTableHeader>
              <AdminTableBody>
                {inventory.map((item) => {
                  const available = item.total_quantity - item.sold_quantity;
                  return (
                    <AdminTableRow key={item.id} className={!item.is_active ? "opacity-50" : ""}>
                      <AdminTableCell>
                        <div className="flex items-center gap-3">
                          {item.images?.[0] ? (
                            <img
                              src={item.images[0]}
                              alt={item.display_name}
                              className="w-12 h-12 object-cover rounded"
                            />
                          ) : (
                            <div className="w-12 h-12 bg-[hsl(var(--admin-border))] rounded flex items-center justify-center">
                              <ImageIcon className="h-5 w-5 text-[hsl(var(--admin-text-muted))]" />
                            </div>
                          )}
                          <div>
                            <p className="font-medium">{item.display_name}</p>
                            {item.bed_config && (
                              <p className="text-xs text-[hsl(var(--admin-text-muted))]">{item.bed_config}</p>
                            )}
                          </div>
                        </div>
                      </AdminTableCell>
                      <AdminTableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Users className="h-3 w-3" />
                          {item.capacity || "—"}
                        </div>
                      </AdminTableCell>
                      <AdminTableCell className="text-right">
                        {formatPrice(item.price)}
                      </AdminTableCell>
                      <AdminTableCell className="text-center">
                        <span className={available === 0 ? "text-[hsl(var(--admin-error))]" : ""}>
                          {item.sold_quantity} / {item.total_quantity}
                        </span>
                        {available === 0 && (
                          <AdminBadge intent="danger" className="ml-2">Sold Out</AdminBadge>
                        )}
                      </AdminTableCell>
                      <AdminTableCell className="text-center">
                        <div className="flex flex-col gap-1 items-center">
                          <AdminBadge intent={item.is_active ? "success" : "neutral"}>
                            {item.is_active ? "Active" : "Inactive"}
                          </AdminBadge>
                          {!item.is_publicly_available && (
                            <AdminBadge intent="info" size="sm">
                              Offers Only
                            </AdminBadge>
                          )}
                        </div>
                      </AdminTableCell>
                      <AdminTableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <AdminButton
                            size="sm"
                            variant="ghost"
                            onClick={() => handleViewDetails(item)}
                          >
                            View
                          </AdminButton>
                          <AdminButton
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(item)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </AdminButton>
                          <AdminButton
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              if (item.sold_quantity > 0) {
                                toast.error("Cannot delete accommodation with bookings");
                                return;
                              }
                              if (confirm("Delete this accommodation?")) {
                                deleteMutation.mutate(item.id);
                              }
                            }}
                            disabled={item.sold_quantity > 0}
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

      {/* Create/Edit Dialog */}
      <AdminDialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <AdminDialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <AdminDialogHeader>
            <AdminDialogTitle>
              {editingId ? "Edit Accommodation" : "Add Accommodation"}
            </AdminDialogTitle>
            <AdminDialogDescription>
              Configure accommodation details including images, capacity, and policies.
            </AdminDialogDescription>
          </AdminDialogHeader>

          <div className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <AdminLabel htmlFor="display_name">Display Name *</AdminLabel>
                <AdminInput
                  id="display_name"
                  value={formData.display_name}
                  onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                  placeholder="e.g., Safari Tent"
                />
              </div>
              <div>
                <AdminLabel htmlFor="lodging_type">Type Key *</AdminLabel>
                <AdminInput
                  id="lodging_type"
                  value={formData.lodging_type}
                  onChange={(e) => setFormData({ ...formData, lodging_type: e.target.value })}
                  placeholder="e.g., safari_tent"
                />
              </div>
            </div>

            <div>
              <AdminLabel htmlFor="description">Description</AdminLabel>
              <AdminTextarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe the accommodation..."
                rows={3}
              />
            </div>

            {/* Capacity & Beds */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <AdminLabel htmlFor="capacity">Sleeps (guests)</AdminLabel>
                <AdminInput
                  id="capacity"
                  type="number"
                  min={1}
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div>
                <AdminLabel htmlFor="bed_config">Bed Configuration</AdminLabel>
                <AdminInput
                  id="bed_config"
                  value={formData.bed_config}
                  onChange={(e) => setFormData({ ...formData, bed_config: e.target.value })}
                  placeholder="e.g., 1 King Bed"
                />
              </div>
              <div>
                <AdminLabel htmlFor="price">Price ($)</AdminLabel>
                <AdminInput
                  id="price"
                  type="number"
                  min={0}
                  step={0.01}
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            {/* Quantity & Status */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <AdminLabel htmlFor="total_quantity">Total Units Available</AdminLabel>
                <AdminInput
                  id="total_quantity"
                  type="number"
                  min={1}
                  value={formData.total_quantity}
                  onChange={(e) => setFormData({ ...formData, total_quantity: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-2">
                  <AdminSwitch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                  <AdminLabel htmlFor="is_active">Active</AdminLabel>
                </div>
                <div className="flex items-center gap-2">
                  <AdminSwitch
                    id="is_publicly_available"
                    checked={formData.is_publicly_available}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_publicly_available: checked })}
                  />
                  <AdminLabel htmlFor="is_publicly_available">Publicly Available</AdminLabel>
                </div>
                {!formData.is_publicly_available && (
                  <p className="text-xs text-[hsl(var(--admin-info))]">
                    Reserved for custom offers only
                  </p>
                )}
              </div>
            </div>

            {/* Check-in/out Times */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <AdminLabel htmlFor="check_in_time">Check-in Time</AdminLabel>
                <AdminInput
                  id="check_in_time"
                  value={formData.check_in_time}
                  onChange={(e) => setFormData({ ...formData, check_in_time: e.target.value })}
                  placeholder="e.g., 3:00 PM"
                />
              </div>
              <div>
                <AdminLabel htmlFor="check_out_time">Check-out Time</AdminLabel>
                <AdminInput
                  id="check_out_time"
                  value={formData.check_out_time}
                  onChange={(e) => setFormData({ ...formData, check_out_time: e.target.value })}
                  placeholder="e.g., 11:00 AM"
                />
              </div>
            </div>

            {/* Amenities */}
            <div>
              <AdminLabel>Amenities</AdminLabel>
              <div className="flex flex-wrap gap-2 mt-2">
                {AMENITY_OPTIONS.map((amenity) => (
                  <AdminBadge
                    key={amenity}
                    intent={formData.amenities.includes(amenity) ? "info" : "neutral"}
                    className="cursor-pointer"
                    onClick={() => toggleAmenity(amenity)}
                  >
                    {amenity}
                  </AdminBadge>
                ))}
              </div>
            </div>

            {/* Location Notes */}
            <div>
              <AdminLabel htmlFor="location_notes">Location Notes</AdminLabel>
              <AdminTextarea
                id="location_notes"
                value={formData.location_notes}
                onChange={(e) => setFormData({ ...formData, location_notes: e.target.value })}
                placeholder="e.g., Located near the river, 5 min walk to main stage..."
                rows={2}
              />
            </div>

            {/* Policies */}
            <div>
              <AdminLabel htmlFor="policies">Policies</AdminLabel>
              <AdminTextarea
                id="policies"
                value={formData.policies}
                onChange={(e) => setFormData({ ...formData, policies: e.target.value })}
                placeholder="Cancellation policy, quiet hours, etc."
                rows={3}
              />
            </div>

            {/* Images */}
            <div>
              <AdminLabel>Images</AdminLabel>
              <div className="mt-2 space-y-3">
                <div className="flex flex-wrap gap-3">
                  {formData.images.map((url, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={url}
                        alt={`Image ${index + 1}`}
                        className="w-24 h-24 object-cover rounded"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute -top-2 -right-2 w-5 h-5 bg-[hsl(var(--admin-error))] text-[hsl(var(--admin-error-foreground))] rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      {index === 0 && (
                        <AdminBadge className="absolute bottom-1 left-1 text-[10px]">Primary</AdminBadge>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                    className="w-24 h-24 border-2 border-dashed border-[hsl(var(--admin-border))] rounded flex flex-col items-center justify-center gap-1 hover:border-[hsl(var(--admin-primary))] transition-colors"
                  >
                    {uploadingImage ? (
                      <span className="text-xs">Uploading...</span>
                    ) : (
                      <>
                        <Upload className="h-5 w-5 text-[hsl(var(--admin-text-muted))]" />
                        <span className="text-xs text-[hsl(var(--admin-text-muted))]">Upload</span>
                      </>
                    )}
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <p className="text-xs text-[hsl(var(--admin-text-muted))]">
                  First image will be used as the primary/hero image. Max 5MB per image.
                </p>
              </div>
            </div>
          </div>

          <AdminDialogFooter>
            <AdminButton variant="outline" onClick={closeDialog}>
              Cancel
            </AdminButton>
            <AdminButton
              onClick={handleSubmit}
              disabled={!formData.display_name || !formData.lodging_type}
            >
              {editingId ? "Update" : "Create"}
            </AdminButton>
          </AdminDialogFooter>
        </AdminDialogContent>
      </AdminDialog>

      {/* Detail Sheet */}
      <AdminSheet open={detailSheetOpen} onOpenChange={setDetailSheetOpen}>
        <AdminSheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selectedAccommodation && (
            <>
              <AdminSheetHeader>
                <AdminSheetTitle>{selectedAccommodation.display_name}</AdminSheetTitle>
                <AdminSheetDescription>
                  Full accommodation details
                </AdminSheetDescription>
              </AdminSheetHeader>

              <div className="mt-6 space-y-6">
                {/* Images Gallery */}
                {selectedAccommodation.images && selectedAccommodation.images.length > 0 && (
                  <div className="space-y-2">
                    <img
                      src={selectedAccommodation.images[0]}
                      alt={selectedAccommodation.display_name}
                      className="w-full h-48 object-cover rounded-lg"
                    />
                    {selectedAccommodation.images.length > 1 && (
                      <div className="flex gap-2 overflow-x-auto">
                        {selectedAccommodation.images.slice(1).map((url, i) => (
                          <img
                            key={i}
                            src={url}
                            alt={`View ${i + 2}`}
                            className="w-20 h-20 object-cover rounded flex-shrink-0"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Quick Stats */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                    <span>Sleeps {selectedAccommodation.capacity || "—"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Bed className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                    <span>{selectedAccommodation.bed_config || "—"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                    <span>{formatPrice(selectedAccommodation.price)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                    <span>
                      {selectedAccommodation.check_in_time} - {selectedAccommodation.check_out_time}
                    </span>
                  </div>
                </div>

                {/* Description */}
                {selectedAccommodation.description && (
                  <div>
                    <h4 className="font-medium mb-2">Description</h4>
                    <p className="text-sm text-[hsl(var(--admin-text-muted))]">
                      {selectedAccommodation.description}
                    </p>
                  </div>
                )}

                {/* Amenities */}
                {selectedAccommodation.amenities && selectedAccommodation.amenities.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Amenities</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedAccommodation.amenities.map((amenity) => (
                        <AdminBadge key={amenity} intent="info">{amenity}</AdminBadge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Location */}
                {selectedAccommodation.location_notes && (
                  <div>
                    <h4 className="font-medium mb-2">Location</h4>
                    <p className="text-sm text-[hsl(var(--admin-text-muted))]">
                      {selectedAccommodation.location_notes}
                    </p>
                  </div>
                )}

                {/* Policies */}
                {selectedAccommodation.policies && (
                  <div>
                    <h4 className="font-medium mb-2">Policies</h4>
                    <p className="text-sm text-[hsl(var(--admin-text-muted))] whitespace-pre-line">
                      {selectedAccommodation.policies}
                    </p>
                  </div>
                )}

                {/* Inventory Status */}
                <div className="pt-4 border-t">
                  <h4 className="font-medium mb-2">Inventory</h4>
                  <div className="flex items-center gap-4">
                    <span>
                      {selectedAccommodation.sold_quantity} of {selectedAccommodation.total_quantity} sold
                    </span>
                    {selectedAccommodation.total_quantity - selectedAccommodation.sold_quantity === 0 && (
                      <AdminBadge intent="danger">Sold Out</AdminBadge>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </AdminSheetContent>
      </AdminSheet>
    </>
  );
}
