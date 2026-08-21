import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { supabase } from "@/integrations/supabase/client";
import {
  AdminCard,
  AdminCardContent,
  AdminCardDescription,
  AdminCardHeader,
  AdminCardTitle,
  AdminButton,
  AdminInput,
  AdminLabel,
  AdminTextarea,
  AdminSwitch,
  AdminCheckbox,
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
  AdminBadge,
} from "@/components/admin";
import { Plus, Pencil, Trash2, Tent } from "lucide-react";
import { toast } from "sonner";

interface LodgingInventoryManagerProps {
  eventId: string;
  eventTitle?: string;
}

interface LodgingInventory {
  id: string;
  lodging_type: string;
  display_name: string;
  description: string | null;
  price: number;
  total_quantity: number;
  sold_quantity: number;
  is_active: boolean;
  event_id: string;
  required_ticket_types: string[] | null;
}

import { TICKET_TIER_OPTIONS } from "@/config/ticketTypes";

export function LodgingInventoryManager({ eventId, eventTitle }: LodgingInventoryManagerProps) {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    lodging_type: "",
    display_name: "",
    description: "",
    price: 0,
    total_quantity: 0,
    is_active: true,
    required_ticket_types: [] as string[],
  });

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

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from("lodging_inventory").insert({
        event_id: eventId,
        lodging_type: data.lodging_type.toLowerCase().replace(/\s+/g, "_"),
        display_name: data.display_name,
        description: data.description || null,
        price: data.price,
        total_quantity: data.total_quantity,
        is_active: data.is_active,
        required_ticket_types: data.required_ticket_types.length > 0 ? data.required_ticket_types : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lodging-inventory", eventId] });
      toast.success("Lodging created successfully");
      resetForm();
    },
    onError: (error) => {
      toast.error("Failed to create lodging: " + error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase
        .from("lodging_inventory")
        .update({
          lodging_type: data.lodging_type.toLowerCase().replace(/\s+/g, "_"),
          display_name: data.display_name,
          description: data.description || null,
          price: data.price,
          total_quantity: data.total_quantity,
          is_active: data.is_active,
          required_ticket_types: data.required_ticket_types.length > 0 ? data.required_ticket_types : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lodging-inventory", eventId] });
      toast.success("Lodging updated successfully");
      resetForm();
    },
    onError: (error) => {
      toast.error("Failed to update lodging: " + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lodging_inventory").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lodging-inventory", eventId] });
      toast.success("Lodging deleted successfully");
    },
    onError: (error) => {
      toast.error("Failed to delete lodging: " + error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      lodging_type: "",
      display_name: "",
      description: "",
      price: 0,
      total_quantity: 0,
      is_active: true,
      required_ticket_types: [],
    });
    setEditingId(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (item: LodgingInventory) => {
    setFormData({
      lodging_type: item.lodging_type,
      display_name: item.display_name,
      description: item.description || "",
      price: item.price,
      total_quantity: item.total_quantity,
      is_active: item.is_active,
      required_ticket_types: item.required_ticket_types || [],
    });
    setEditingId(item.id);
    setIsDialogOpen(true);
  };

  const toggleTicketType = (ticketType: string) => {
    setFormData((prev) => {
      const current = prev.required_ticket_types;
      if (current.includes(ticketType)) {
        return { ...prev, required_ticket_types: current.filter((t) => t !== ticketType) };
      } else {
        return { ...prev, required_ticket_types: [...current, ticketType] };
      }
    });
  };

  const formatRequirements = (types: string[] | null) => {
    if (!types || types.length === 0) return "All tickets";
    return types.map((t) => TICKET_TIER_OPTIONS.find((o) => o.value === t)?.label || t).join(", ");
  };

  const handleSubmit = () => {
    if (!formData.display_name || !formData.lodging_type) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  return (
    <AdminCard>
      <AdminCardHeader icon={Tent}>
        <div className="flex flex-row items-center justify-between w-full">
          <div>
            <AdminCardTitle>Lodging</AdminCardTitle>
            <AdminCardDescription>
              Manage WineCamp tents and other lodging options
              {eventTitle && ` for ${eventTitle}`}
            </AdminCardDescription>
          </div>
          <AdminButton onClick={() => { resetForm(); setIsDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Add Lodging
          </AdminButton>
        </div>
      </AdminCardHeader>
      <AdminCardContent>
        {isLoading ? (
          <p className="text-[hsl(var(--admin-text-muted))]">Loading...</p>
        ) : !inventory?.length ? (
          <p className="text-[hsl(var(--admin-text-muted))] text-center py-8">
            No lodging configured yet. Click "Add Lodging" to create one.
          </p>
        ) : (
          <AdminTable>
            <AdminTableHeader>
              <AdminTableRow>
                <AdminTableHead>Lodging</AdminTableHead>
                <AdminTableHead>Type Key</AdminTableHead>
                <AdminTableHead>Requires</AdminTableHead>
                <AdminTableHead className="text-right">Price</AdminTableHead>
                <AdminTableHead className="text-center">Sold</AdminTableHead>
                <AdminTableHead className="text-center">Total</AdminTableHead>
                <AdminTableHead className="text-center">Available</AdminTableHead>
                <AdminTableHead className="text-center">Status</AdminTableHead>
                <AdminTableHead className="text-right">Actions</AdminTableHead>
              </AdminTableRow>
            </AdminTableHeader>
            <AdminTableBody>
              {inventory.map((item) => (
                <AdminTableRow key={item.id}>
                  <AdminTableCell className="font-medium">{item.display_name}</AdminTableCell>
                  <AdminTableCell className="text-[hsl(var(--admin-text-muted))] font-mono text-xs">
                    {item.lodging_type}
                  </AdminTableCell>
                  <AdminTableCell className="text-xs">
                    {formatRequirements(item.required_ticket_types)}
                  </AdminTableCell>
                  <AdminTableCell className="text-right">{formatPrice(item.price)}</AdminTableCell>
                  <AdminTableCell className="text-center">{item.sold_quantity}</AdminTableCell>
                  <AdminTableCell className="text-center">{item.total_quantity}</AdminTableCell>
                  <AdminTableCell className="text-center">
                    {item.total_quantity - item.sold_quantity}
                  </AdminTableCell>
                  <AdminTableCell className="text-center">
                    <AdminBadge intent={item.is_active ? "success" : "neutral"}>
                      {item.is_active ? "Active" : "Inactive"}
                    </AdminBadge>
                  </AdminTableCell>
                  <AdminTableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <AdminButton variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                        <Pencil className="h-4 w-4" />
                      </AdminButton>
                      <AdminButton
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (item.sold_quantity > 0) {
                            toast.error("Cannot delete lodging with sales");
                            return;
                          }
                          if (confirm("Delete this lodging?")) {
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
              ))}
            </AdminTableBody>
          </AdminTable>
        )}
      </AdminCardContent>

      {/* Create/Edit Dialog */}
      <AdminDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <AdminDialogContent>
          <AdminDialogHeader>
            <AdminDialogTitle>{editingId ? "Edit Lodging" : "Add New Lodging"}</AdminDialogTitle>
            <AdminDialogDescription>
              Configure the lodging details and inventory quantity
            </AdminDialogDescription>
          </AdminDialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <AdminLabel htmlFor="display_name">Display Name *</AdminLabel>
              <AdminInput
                id="display_name"
                placeholder="e.g., WineCamp Glamping Tent"
                value={formData.display_name}
                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <AdminLabel htmlFor="lodging_type">Type Key *</AdminLabel>
              <AdminInput
                id="lodging_type"
                placeholder="e.g., winecamp_tent"
                value={formData.lodging_type}
                onChange={(e) => setFormData({ ...formData, lodging_type: e.target.value })}
              />
              <p className="text-xs text-[hsl(var(--admin-text-muted))]">
                Unique identifier used in code (auto-formatted to snake_case)
              </p>
            </div>
            <div className="grid gap-2">
              <AdminLabel htmlFor="description">Description</AdminLabel>
              <AdminTextarea
                id="description"
                placeholder="Brief description of the lodging..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <AdminLabel htmlFor="price">Price (cents)</AdminLabel>
                <AdminInput
                  id="price"
                  type="number"
                  min="0"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: parseInt(e.target.value) || 0 })}
                />
                <p className="text-xs text-[hsl(var(--admin-text-muted))]">
                  {formatPrice(formData.price)}
                </p>
              </div>
              <div className="grid gap-2">
                <AdminLabel htmlFor="total_quantity">Total Quantity</AdminLabel>
                <AdminInput
                  id="total_quantity"
                  type="number"
                  min="0"
                  value={formData.total_quantity}
                  onChange={(e) => setFormData({ ...formData, total_quantity: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <AdminLabel>Required Ticket Types</AdminLabel>
              <p className="text-xs text-[hsl(var(--admin-text-muted))] mb-2">
                Select which ticket types can purchase this lodging. Leave empty for all tickets.
              </p>
              <div className="flex flex-wrap gap-4">
                {TICKET_TIER_OPTIONS.map((option) => (
                  <div key={option.value} className="flex items-center space-x-2">
                    <AdminCheckbox
                      id={`ticket-${option.value}`}
                      checked={formData.required_ticket_types.includes(option.value)}
                      onCheckedChange={() => toggleTicketType(option.value)}
                    />
                    <AdminLabel htmlFor={`ticket-${option.value}`} className="text-sm font-normal">
                      {option.label}
                    </AdminLabel>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <AdminSwitch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <AdminLabel htmlFor="is_active">Active (visible in checkout when enabled)</AdminLabel>
            </div>
          </div>
          <AdminDialogFooter>
            <AdminButton variant="outline" onClick={resetForm}>
              Cancel
            </AdminButton>
            <AdminButton onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {editingId ? "Update" : "Create"}
            </AdminButton>
          </AdminDialogFooter>
        </AdminDialogContent>
      </AdminDialog>
    </AdminCard>
  );
}