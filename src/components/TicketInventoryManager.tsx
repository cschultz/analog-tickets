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
  AdminSelect,
  AdminSelectItem,
  AdminLabel,
  AdminBadge,
  AdminSwitch,
} from "@/components/admin";
import { InlineTextCell, InlineCurrencyCell, InlineNumberCell, InlineToggleCell } from "@/components/admin/InlineEditableCell";
import { Plus, Trash2, Edit2, Package, DollarSign, Settings2, GripVertical } from "lucide-react";
import { toast } from "sonner";

interface TicketInventoryManagerProps {
  eventId: string;
  eventTitle?: string;
}

interface TicketTier {
  id: string;
  event_id: string;
  tier_key: string;
  display_name: string;
  sort_order: number;
}

interface TicketInventory {
  id: string;
  ticket_type: string;
  tier: string;
  display_name: string | null;
  description: string | null;
  price: number;
  total_quantity: number;
  sold_quantity: number;
  is_active: boolean;
  event_id: string | null;
}

const DEFAULT_TIERS = [
  { tier_key: "early_bird", display_name: "Early Bird", sort_order: 0 },
  { tier_key: "standard", display_name: "Standard", sort_order: 1 },
  { tier_key: "late", display_name: "Late / Door", sort_order: 2 },
  { tier_key: "vip", display_name: "VIP", sort_order: 3 },
  { tier_key: "patron", display_name: "Patron", sort_order: 4 },
];

export function TicketInventoryManager({ eventId, eventTitle }: TicketInventoryManagerProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tierDialogOpen, setTierDialogOpen] = useState(false);
  const [editingTicket, setEditingTicket] = useState<TicketInventory | null>(null);
  const [editingTier, setEditingTier] = useState<TicketTier | null>(null);
  const [formData, setFormData] = useState({
    ticket_type: "",
    tier: "standard",
    display_name: "",
    description: "",
    price: 0,
    total_quantity: 0,
    is_active: true,
  });
  const [tierFormData, setTierFormData] = useState({
    tier_key: "",
    display_name: "",
  });
  const queryClient = useQueryClient();

  // Fetch tiers
  const { data: tiers, isLoading: tiersLoading } = useAuthQuery({
    queryKey: ["ticket-tiers", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_tiers")
        .select("*")
        .eq("event_id", eventId)
        .order("sort_order");

      if (error) throw error;
      
      // If no tiers exist, create defaults
      if (!data || data.length === 0) {
        const defaultTiersWithEvent = DEFAULT_TIERS.map(t => ({
          ...t,
          event_id: eventId,
        }));
        
        const { data: inserted, error: insertError } = await supabase
          .from("ticket_tiers")
          .insert(defaultTiersWithEvent)
          .select();
        
        if (insertError) throw insertError;
        return inserted as TicketTier[];
      }
      
      return data as TicketTier[];
    },
    enabled: !!eventId,
  });

  const { data: inventory, isLoading } = useAuthQuery({
    queryKey: ["ticket-inventory", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_inventory")
        .select("*")
        .eq("event_id", eventId)
        .order("tier")
        .order("ticket_type");

      if (error) throw error;
      return data as TicketInventory[];
    },
    enabled: !!eventId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: Omit<TicketInventory, "id" | "sold_quantity" | "event_id">) => {
      const { error } = await supabase.from("ticket_inventory").insert([{
        ...data,
        event_id: eventId,
        sold_quantity: 0,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ticket type created");
      queryClient.invalidateQueries({ queryKey: ["ticket-inventory", eventId] });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create ticket type");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TicketInventory> }) => {
      const { error } = await supabase
        .from("ticket_inventory")
        .update(data)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ticket type updated");
      queryClient.invalidateQueries({ queryKey: ["ticket-inventory", eventId] });
      setDialogOpen(false);
      setEditingTicket(null);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update ticket type");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("ticket_inventory")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ticket type deleted");
      queryClient.invalidateQueries({ queryKey: ["ticket-inventory", eventId] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete ticket type");
    },
  });

  // Tier mutations
  const createTierMutation = useMutation({
    mutationFn: async (data: { tier_key: string; display_name: string }) => {
      const maxOrder = tiers?.reduce((max, t) => Math.max(max, t.sort_order), -1) ?? -1;
      const { error } = await supabase.from("ticket_tiers").insert([{
        ...data,
        event_id: eventId,
        sort_order: maxOrder + 1,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tier created");
      queryClient.invalidateQueries({ queryKey: ["ticket-tiers", eventId] });
      setTierDialogOpen(false);
      resetTierForm();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create tier");
    },
  });

  const updateTierMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TicketTier> }) => {
      const { error } = await supabase
        .from("ticket_tiers")
        .update(data)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tier updated");
      queryClient.invalidateQueries({ queryKey: ["ticket-tiers", eventId] });
      setTierDialogOpen(false);
      setEditingTier(null);
      resetTierForm();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update tier");
    },
  });

  const deleteTierMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("ticket_tiers")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tier deleted");
      queryClient.invalidateQueries({ queryKey: ["ticket-tiers", eventId] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete tier");
    },
  });

  const resetForm = () => {
    setFormData({
      ticket_type: "",
      tier: "standard",
      display_name: "",
      description: "",
      price: 0,
      total_quantity: 0,
      is_active: true,
    });
    setEditingTicket(null);
  };

  const resetTierForm = () => {
    setTierFormData({
      tier_key: "",
      display_name: "",
    });
    setEditingTier(null);
  };

  const handleEdit = (ticket: TicketInventory) => {
    setEditingTicket(ticket);
    setFormData({
      ticket_type: ticket.ticket_type,
      tier: ticket.tier || "standard",
      display_name: ticket.display_name || "",
      description: ticket.description || "",
      price: ticket.price / 100,
      total_quantity: ticket.total_quantity,
      is_active: ticket.is_active,
    });
    setDialogOpen(true);
  };

  const handleEditTier = (tier: TicketTier) => {
    setEditingTier(tier);
    setTierFormData({
      tier_key: tier.tier_key,
      display_name: tier.display_name,
    });
    setTierDialogOpen(true);
  };

  const handleSubmit = () => {
    const submitData = {
      ticket_type: formData.ticket_type,
      tier: formData.tier,
      display_name: formData.display_name || null,
      description: formData.description || null,
      price: Math.round(formData.price * 100),
      total_quantity: formData.total_quantity,
      is_active: formData.is_active,
    };

    if (editingTicket) {
      updateMutation.mutate({
        id: editingTicket.id,
        data: submitData,
      });
    } else {
      createMutation.mutate(submitData as any);
    }
  };

  const handleTierSubmit = () => {
    if (editingTier) {
      updateTierMutation.mutate({
        id: editingTier.id,
        data: { display_name: tierFormData.display_name },
      });
    } else {
      createTierMutation.mutate({
        tier_key: tierFormData.tier_key.toLowerCase().replace(/\s+/g, "_"),
        display_name: tierFormData.display_name,
      });
    }
  };

  const formatTicketType = (ticket: TicketInventory) => {
    if (ticket.display_name) return ticket.display_name;
    return ticket.ticket_type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const getTierDisplayName = (tierKey: string) => {
    const tier = tiers?.find(t => t.tier_key === tierKey);
    return tier?.display_name || tierKey.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const getTierBadgeIntent = (tierKey: string): "success" | "info" | "neutral" | "danger" => {
    if (tierKey.includes("early")) return "success";
    if (tierKey.includes("vip") || tierKey.includes("patron")) return "info";
    if (tierKey.includes("late") || tierKey.includes("door")) return "danger";
    return "neutral";
  };

  // Group inventory by tier, ordered by tier sort_order
  const groupedInventory = tiers?.reduce((acc, tier) => {
    const tierTickets = inventory?.filter(t => t.tier === tier.tier_key) || [];
    if (tierTickets.length > 0) {
      acc.push({ tier, tickets: tierTickets });
    }
    return acc;
  }, [] as { tier: TicketTier; tickets: TicketInventory[] }[]);

  // Check if a tier is in use
  const isTierInUse = (tierKey: string) => {
    return inventory?.some(t => t.tier === tierKey) || false;
  };

  return (
    <AdminCard>
      <AdminCardHeader icon={Package}>
        <div className="flex justify-between items-center w-full">
          <div>
            <AdminCardTitle>Ticket Inventory</AdminCardTitle>
            <AdminCardDescription>
              {eventTitle ? `Manage ticket types for ${eventTitle}` : "Manage ticket types, pricing tiers, and quantities"}
            </AdminCardDescription>
          </div>
          <div className="flex gap-2">
            <AdminButton 
              variant="outline"
              onClick={() => {
                resetTierForm();
                setTierDialogOpen(true);
              }}
            >
              <Settings2 className="h-4 w-4 mr-2" />
              Manage Tiers
            </AdminButton>
            <AdminButton 
              onClick={() => {
                resetForm();
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Ticket Type
            </AdminButton>
          </div>
        </div>
      </AdminCardHeader>
      <AdminCardContent>
        {isLoading || tiersLoading ? (
          <div className="text-center py-8 text-[hsl(var(--admin-text-muted))]">Loading inventory...</div>
        ) : !inventory?.length ? (
          <div className="text-center py-8 text-[hsl(var(--admin-text-muted))]">
            No ticket types configured for this event yet.
          </div>
        ) : (
          <div className="space-y-6">
            {groupedInventory?.map(({ tier, tickets }) => (
              <div key={tier.id} className="space-y-2">
                <div className="flex items-center gap-2 pb-2 border-b border-[hsl(var(--admin-border))]">
                  <AdminBadge intent={getTierBadgeIntent(tier.tier_key)}>
                    {tier.display_name}
                  </AdminBadge>
                  <span className="text-sm text-[hsl(var(--admin-text-muted))]">
                    {tickets.length} ticket type{tickets.length !== 1 ? "s" : ""}
                  </span>
                  <AdminButton
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7 px-2"
                    onClick={() => handleEditTier(tier)}
                  >
                    <Edit2 className="h-3 w-3" />
                  </AdminButton>
                </div>
                <AdminTable>
                  <AdminTableHeader>
                    <AdminTableRow>
                      <AdminTableHead>Ticket Type</AdminTableHead>
                      <AdminTableHead className="text-right">Price</AdminTableHead>
                      <AdminTableHead className="text-right">Sold</AdminTableHead>
                      <AdminTableHead className="text-right">Total</AdminTableHead>
                      <AdminTableHead className="text-right">Available</AdminTableHead>
                      <AdminTableHead className="text-center">Active</AdminTableHead>
                      <AdminTableHead className="text-right">Actions</AdminTableHead>
                    </AdminTableRow>
                  </AdminTableHeader>
                  <AdminTableBody>
                    {tickets.map((ticket) => {
                      const available = ticket.total_quantity - ticket.sold_quantity;
                      const percentSold = ticket.total_quantity > 0 
                        ? Math.round((ticket.sold_quantity / ticket.total_quantity) * 100) 
                        : 0;
                      
                      return (
                        <AdminTableRow key={ticket.id} className={!ticket.is_active ? "opacity-50" : ""}>
                          <AdminTableCell>
                            <InlineTextCell
                              value={ticket.display_name || formatTicketType(ticket)}
                              onSave={async (value) => {
                                await updateMutation.mutateAsync({ 
                                  id: ticket.id, 
                                  data: { display_name: value || null } 
                                });
                              }}
                              placeholder="Ticket name..."
                            />
                          </AdminTableCell>
                          <AdminTableCell className="text-right">
                            <InlineCurrencyCell
                              value={ticket.price}
                              onSave={async (value) => {
                                await updateMutation.mutateAsync({ 
                                  id: ticket.id, 
                                  data: { price: value } 
                                });
                              }}
                            />
                          </AdminTableCell>
                          <AdminTableCell className="text-right">
                            {ticket.sold_quantity}
                            <AdminBadge intent="neutral" size="sm" className="ml-2">
                              {percentSold}%
                            </AdminBadge>
                          </AdminTableCell>
                          <AdminTableCell className="text-right">
                            <InlineNumberCell
                              value={ticket.total_quantity}
                              onSave={async (value) => {
                                if (value < ticket.sold_quantity) {
                                  toast.error("Total cannot be less than sold quantity");
                                  return;
                                }
                                await updateMutation.mutateAsync({ 
                                  id: ticket.id, 
                                  data: { total_quantity: value } 
                                });
                              }}
                              min={ticket.sold_quantity}
                            />
                          </AdminTableCell>
                          <AdminTableCell className="text-right">
                            <span className={available === 0 ? "text-[hsl(var(--admin-error))]" : available < 10 ? "text-[hsl(var(--admin-warning))]" : ""}>
                              {available}
                            </span>
                          </AdminTableCell>
                          <AdminTableCell className="text-center">
                            <InlineToggleCell
                              value={ticket.is_active}
                              onSave={async (value) => {
                                await updateMutation.mutateAsync({ 
                                  id: ticket.id, 
                                  data: { is_active: value } 
                                });
                              }}
                            />
                          </AdminTableCell>
                          <AdminTableCell className="text-right">
                            <AdminButton
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                if (ticket.sold_quantity > 0) {
                                  toast.error("Cannot delete ticket type with sales");
                                  return;
                                }
                                if (confirm("Delete this ticket type?")) {
                                  deleteMutation.mutate(ticket.id);
                                }
                              }}
                              disabled={ticket.sold_quantity > 0}
                            >
                              <Trash2 className="h-4 w-4" />
                            </AdminButton>
                          </AdminTableCell>
                        </AdminTableRow>
                      );
                    })}
                  </AdminTableBody>
                </AdminTable>
              </div>
            ))}
          </div>
        )}
      </AdminCardContent>

      {/* Ticket Dialog */}
      <AdminDialog open={dialogOpen} onOpenChange={(open) => {
        if (!open) {
          setDialogOpen(false);
          resetForm();
        }
      }}>
        <AdminDialogContent className="max-w-md">
          <AdminDialogHeader>
            <AdminDialogTitle>{editingTicket ? "Edit Ticket Type" : "Add Ticket Type"}</AdminDialogTitle>
            <AdminDialogDescription>
              {editingTicket 
                ? "Update the details for this ticket type" 
                : "Add a new ticket type with pricing tier"}
            </AdminDialogDescription>
          </AdminDialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <AdminLabel htmlFor="ticket_type">Ticket Type ID</AdminLabel>
                <AdminInput
                  id="ticket_type"
                  value={formData.ticket_type}
                  onChange={(e) => setFormData({ ...formData, ticket_type: e.target.value })}
                  placeholder="e.g., ga_2day"
                  disabled={!!editingTicket}
                />
                <p className="text-xs text-[hsl(var(--admin-text-muted))] mt-1">
                  Use snake_case
                </p>
              </div>
              <div>
                <AdminLabel htmlFor="tier">Pricing Tier</AdminLabel>
                <AdminSelect
                  value={formData.tier}
                  onValueChange={(value) => setFormData({ ...formData, tier: value })}
                >
                  {tiers?.map(tier => (
                    <AdminSelectItem key={tier.id} value={tier.tier_key}>
                      {tier.display_name}
                    </AdminSelectItem>
                  ))}
                </AdminSelect>
              </div>
            </div>

            <div>
              <AdminLabel htmlFor="display_name">Display Name</AdminLabel>
              <AdminInput
                id="display_name"
                value={formData.display_name}
                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                placeholder="e.g., Early Bird 2-Day Pass"
              />
            </div>

            <div>
              <AdminLabel htmlFor="description">Description (optional)</AdminLabel>
              <AdminInput
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="e.g., Includes all activities"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <AdminLabel htmlFor="price">Price ($)</AdminLabel>
                <AdminInput
                  id="price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
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

            <div className="flex items-center justify-between">
              <AdminLabel htmlFor="is_active">Active (available for sale)</AdminLabel>
              <AdminSwitch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
          </div>
          <AdminDialogFooter>
            <AdminButton variant="outline" onClick={() => {
              setDialogOpen(false);
              resetForm();
            }}>
              Cancel
            </AdminButton>
            <AdminButton
              onClick={handleSubmit}
              disabled={!formData.ticket_type || formData.total_quantity < 0 || formData.price < 0}
            >
              {editingTicket ? "Update" : "Create"}
            </AdminButton>
          </AdminDialogFooter>
        </AdminDialogContent>
      </AdminDialog>

      {/* Tier Management Dialog */}
      <AdminDialog open={tierDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setTierDialogOpen(false);
          resetTierForm();
        }
      }}>
        <AdminDialogContent className="max-w-lg">
          <AdminDialogHeader>
            <AdminDialogTitle>{editingTier ? "Edit Tier" : "Manage Pricing Tiers"}</AdminDialogTitle>
            <AdminDialogDescription>
              {editingTier 
                ? "Update the display name for this tier" 
                : "Add, rename, or remove pricing tiers. Tier names are consistent across all tickets."}
            </AdminDialogDescription>
          </AdminDialogHeader>
          
          {editingTier ? (
            <div className="space-y-4">
              <div>
                <AdminLabel htmlFor="tier_key">Tier Key</AdminLabel>
                <AdminInput
                  id="tier_key"
                  value={editingTier.tier_key}
                  disabled
                  className="bg-[hsl(var(--admin-hover))]"
                />
              </div>
              <div>
                <AdminLabel htmlFor="tier_display_name">Display Name</AdminLabel>
                <AdminInput
                  id="tier_display_name"
                  value={tierFormData.display_name}
                  onChange={(e) => setTierFormData({ ...tierFormData, display_name: e.target.value })}
                  placeholder="e.g., Early Bird Special"
                />
              </div>
              <AdminDialogFooter>
                <AdminButton variant="outline" onClick={() => {
                  setEditingTier(null);
                  resetTierForm();
                }}>
                  Back
                </AdminButton>
                <AdminButton
                  onClick={handleTierSubmit}
                  disabled={!tierFormData.display_name}
                >
                  Save
                </AdminButton>
              </AdminDialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                {tiers?.map((tier, index) => (
                  <div 
                    key={tier.id} 
                    className="flex items-center gap-3 p-3 bg-[hsl(var(--admin-surface-hover))] rounded-lg"
                  >
                    <GripVertical className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                    <div className="flex-1">
                      <p className="font-medium">{tier.display_name}</p>
                      <p className="text-xs text-[hsl(var(--admin-text-muted))]">{tier.tier_key}</p>
                    </div>
                    <div className="flex gap-2">
                      <AdminButton
                        size="sm"
                        variant="outline"
                        onClick={() => handleEditTier(tier)}
                      >
                        <Edit2 className="h-3 w-3" />
                      </AdminButton>
                      <AdminButton
                        size="sm"
                        variant="destructive"
                        disabled={isTierInUse(tier.tier_key)}
                        onClick={() => {
                          if (confirm(`Delete tier "${tier.display_name}"?`)) {
                            deleteTierMutation.mutate(tier.id);
                          }
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </AdminButton>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-[hsl(var(--admin-border))] pt-4">
                <p className="text-sm font-medium mb-2">Add New Tier</p>
                <div className="flex gap-2">
                  <AdminInput
                    value={tierFormData.tier_key}
                    onChange={(e) => setTierFormData({ 
                      ...tierFormData, 
                      tier_key: e.target.value,
                      display_name: tierFormData.display_name || e.target.value.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())
                    })}
                    placeholder="Tier key (e.g., super_early)"
                    className="flex-1"
                  />
                  <AdminInput
                    value={tierFormData.display_name}
                    onChange={(e) => setTierFormData({ ...tierFormData, display_name: e.target.value })}
                    placeholder="Display name"
                    className="flex-1"
                  />
                  <AdminButton
                    onClick={handleTierSubmit}
                    disabled={!tierFormData.tier_key || !tierFormData.display_name}
                  >
                    <Plus className="h-4 w-4" />
                  </AdminButton>
                </div>
              </div>
            </div>
          )}
        </AdminDialogContent>
      </AdminDialog>
    </AdminCard>
  );
}
