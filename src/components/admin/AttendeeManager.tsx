/**
 * AttendeeManager
 * 
 * Embedded inside the Registrations admin sheet.
 * Lets admins:
 *  - Change a registered attendee's ticket type (comp the change OR send Stripe link)
 *  - Change quantity (with inventory sync)
 *  - Transfer registration to a different email/name
 *  - Add add-ons (comp OR send Stripe payment link)
 *  - View / edit / remove existing add-ons & their dietary restrictions
 */

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AdminButton, AdminInput } from "@/components/admin/AdminUI";
import { AdminLabel, AdminCheckbox } from "@/components/admin/AdminFormPrimitives";
import {
  AdminSelect,
  AdminSelectItem,
} from "@/components/admin/AdminSelect";
import { AdminConfirmDialog } from "@/components/admin/AdminConfirmDialog";
import {
  ArrowUpCircle,
  Plus,
  Trash2,
  Mail,
  UserCog,
  Utensils,
  Loader2,
  Link2,
  DollarSign,
} from "lucide-react";
import { formatTicketType } from "@/lib/utils";

interface Props {
  registration: {
    id: string;
    name: string;
    email: string;
    ticket_type: string;
    quantity?: number | null;
    total_amount: number;
    comp_upgrade_amount?: number;
    payment_status: string;
    event_id: string;
  };
  onChanged: () => void;
}

interface TicketType {
  key: string;
  label: string;
  price: number;
}

interface AddonInventory {
  id: string;
  addon_type: string;
  display_name: string;
  price: number;
  total_quantity: number;
  sold_quantity: number;
}

interface AddonPurchase {
  id: string;
  inventory_id: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  payment_status: string;
  has_dietary_restrictions: boolean;
  dietary_restrictions: string | null;
  addon_inventory: { display_name: string; addon_type: string } | null;
}

export function AttendeeManager({ registration, onChanged }: Props) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState<"ticket" | "addons" | "transfer" | null>(null);

  // Ticket type change
  const [newTicketType, setNewTicketType] = useState(registration.ticket_type);
  const [newQuantity, setNewQuantity] = useState(String(registration.quantity || 1));
  const [confirmComp, setConfirmComp] = useState<null | "ticket" | "qty">(null);

  // Add-ons
  const [selectedAddon, setSelectedAddon] = useState<string>("");
  const [addonQty, setAddonQty] = useState("1");

  // Transfer
  const [transferEmail, setTransferEmail] = useState(registration.email);
  const [transferName, setTransferName] = useState(registration.name);
  const [confirmTransfer, setConfirmTransfer] = useState(false);

  // Dietary edit
  const [editingDietary, setEditingDietary] = useState<string | null>(null);
  const [dietaryHas, setDietaryHas] = useState(false);
  const [dietaryText, setDietaryText] = useState("");

  // Fetch ticket types
  const { data: ticketTypes = [] } = useQuery({
    queryKey: ["admin-ticket-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_types")
        .select("key,label,price")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data as TicketType[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch addon inventory for this event
  const { data: addons = [] } = useQuery({
    queryKey: ["admin-addons", registration.event_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("addon_inventory")
        .select("id,addon_type,display_name,price,total_quantity,sold_quantity")
        .eq("event_id", registration.event_id)
        .eq("is_active", true)
        .order("display_name");
      if (error) throw error;
      return data as AddonInventory[];
    },
    staleTime: 60 * 1000,
  });

  // Fetch existing add-on purchases
  const { data: purchases = [], refetch: refetchPurchases } = useQuery({
    queryKey: ["admin-addon-purchases", registration.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("addon_purchases")
        .select(
          "id,inventory_id,quantity,unit_price,total_amount,payment_status,has_dietary_restrictions,dietary_restrictions,addon_inventory:inventory_id(display_name,addon_type)",
        )
        .eq("registration_id", registration.id)
        .eq("purchase_type", "addon")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) as AddonPurchase[];
    },
  });

  const newTypeData = useMemo(
    () => ticketTypes.find((t) => t.key === newTicketType),
    [ticketTypes, newTicketType],
  );

  const qty = registration.quantity || 1;
  const newTotal = (newTypeData?.price ?? 0) * qty;
  const priceDelta = newTotal - registration.total_amount;

  const callAction = async (action: string, payload: Record<string, any>) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "admin-modify-attendee",
        { body: { action, registration_id: registration.id, ...payload } },
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    } finally {
      setBusy(false);
    }
  };

  const handleChangeTicketComp = async () => {
    setConfirmComp(null);
    try {
      await callAction("change_ticket_type", { new_ticket_type: newTicketType });
      toast.success("Ticket type updated (no charge collected)");
      onChanged();
      qc.invalidateQueries({ queryKey: ["registrations"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to change ticket type");
    }
  };

  const handleChangeTicketLink = async () => {
    try {
      const data = await callAction("send_ticket_change_payment_link", {
        new_ticket_type: newTicketType,
      });
      if (data?.url) {
        await navigator.clipboard.writeText(data.url).catch(() => {});
        toast.success("Stripe payment link copied to clipboard");
        window.open(data.url, "_blank");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to create payment link");
    }
  };

  const handleChangeQty = async () => {
    setConfirmComp(null);
    const n = parseInt(newQuantity, 10);
    if (Number.isNaN(n) || n < 1) {
      toast.error("Enter a valid quantity");
      return;
    }
    try {
      await callAction("change_quantity", { new_quantity: n });
      toast.success("Quantity updated");
      onChanged();
      qc.invalidateQueries({ queryKey: ["registrations"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to change quantity");
    }
  };

  const handleAddonComp = async () => {
    if (!selectedAddon) {
      toast.error("Pick an add-on");
      return;
    }
    try {
      await callAction("add_addon_comp", {
        addon_inventory_id: selectedAddon,
        addon_quantity: parseInt(addonQty, 10) || 1,
      });
      toast.success("Add-on comped to attendee");
      setSelectedAddon("");
      setAddonQty("1");
      refetchPurchases();
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Failed to comp add-on");
    }
  };

  const handleAddonLink = async () => {
    if (!selectedAddon) {
      toast.error("Pick an add-on");
      return;
    }
    try {
      const data = await callAction("send_addon_payment_link", {
        addon_inventory_id: selectedAddon,
        addon_quantity: parseInt(addonQty, 10) || 1,
      });
      if (data?.url) {
        await navigator.clipboard.writeText(data.url).catch(() => {});
        toast.success("Stripe payment link copied to clipboard");
        window.open(data.url, "_blank");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to create payment link");
    }
  };

  const handleRemoveAddon = async (id: string) => {
    if (!confirm("Remove this add-on? This will release the inventory.")) return;
    try {
      await callAction("remove_addon", { addon_purchase_id: id });
      toast.success("Add-on removed");
      refetchPurchases();
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Failed to remove add-on");
    }
  };

  const handleSaveDietary = async (id: string) => {
    try {
      await callAction("update_addon_dietary", {
        addon_purchase_id: id,
        has_dietary_restrictions: dietaryHas,
        dietary_restrictions: dietaryHas ? dietaryText : null,
      });
      toast.success("Dietary notes updated");
      setEditingDietary(null);
      refetchPurchases();
    } catch (e: any) {
      toast.error(e.message || "Failed to update");
    }
  };

  const handleTransfer = async () => {
    setConfirmTransfer(false);
    try {
      await callAction("transfer_email", {
        new_email: transferEmail,
        new_name: transferName,
      });
      toast.success("Registration transferred");
      onChanged();
      qc.invalidateQueries({ queryKey: ["registrations"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to transfer");
    }
  };

  return (
    <div className="border-t border-[hsl(var(--admin-border))] pt-4 space-y-3">
      <div className="text-sm font-semibold text-[hsl(var(--admin-text))] flex items-center gap-2">
        <UserCog className="h-4 w-4" /> Modify Attendee
      </div>

      {/* Action toggles */}
      <div className="flex flex-wrap gap-2">
        <AdminButton
          size="sm"
          variant={section === "ticket" ? "admin" : "outline"}
          onClick={() => setSection(section === "ticket" ? null : "ticket")}
        >
          <ArrowUpCircle className="h-3.5 w-3.5 mr-1.5" /> Ticket / Quantity
        </AdminButton>
        <AdminButton
          size="sm"
          variant={section === "addons" ? "admin" : "outline"}
          onClick={() => setSection(section === "addons" ? null : "addons")}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add-ons
          {purchases.length > 0 && (
            <span className="ml-1.5 px-1.5 rounded-full text-xs bg-[hsl(var(--admin-accent-subtle))] text-[hsl(var(--admin-accent))]">
              {purchases.length}
            </span>
          )}
        </AdminButton>
        <AdminButton
          size="sm"
          variant={section === "transfer" ? "admin" : "outline"}
          onClick={() => setSection(section === "transfer" ? null : "transfer")}
        >
          <Mail className="h-3.5 w-3.5 mr-1.5" /> Transfer
        </AdminButton>
      </div>

      {/* TICKET SECTION */}
      {section === "ticket" && (
        <div className="rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] p-4 space-y-4">
          <div>
            <AdminLabel>Change Ticket Type</AdminLabel>
            <AdminSelect value={newTicketType} onValueChange={setNewTicketType}>
              {ticketTypes.map((t) => (
                <AdminSelectItem key={t.key} value={t.key}>
                  {t.label} — ${(t.price / 100).toFixed(0)}
                </AdminSelectItem>
              ))}
            </AdminSelect>
            <div className="text-xs text-[hsl(var(--admin-text-secondary))] mt-2 space-y-0.5">
              <div>Current: {formatTicketType(registration.ticket_type)} (${(registration.total_amount / 100).toFixed(0)} for {qty} ticket{qty > 1 ? "s" : ""})</div>
              {(registration.comp_upgrade_amount || 0) > 0 && (
                <div className="text-[hsl(var(--admin-warning))]">
                  Includes ${((registration.comp_upgrade_amount || 0) / 100).toFixed(0)} comp upgrade • Net collected: ${((registration.total_amount - (registration.comp_upgrade_amount || 0)) / 100).toFixed(0)}
                </div>
              )}
              <div>New total: ${(newTotal / 100).toFixed(0)} • Difference: <span className={priceDelta > 0 ? "text-[hsl(var(--admin-warning))]" : priceDelta < 0 ? "text-[hsl(var(--admin-success))]" : ""}>{priceDelta >= 0 ? "+" : ""}${(priceDelta / 100).toFixed(0)}</span></div>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <AdminButton
                size="sm"
                variant="admin"
                disabled={busy || newTicketType === registration.ticket_type}
                onClick={() => setConfirmComp("ticket")}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <DollarSign className="h-3.5 w-3.5 mr-1.5" />}
                Change (no charge)
              </AdminButton>
              <AdminButton
                size="sm"
                variant="outline"
                disabled={busy || priceDelta <= 0}
                onClick={handleChangeTicketLink}
                title={priceDelta <= 0 ? "Only available when new price is higher" : ""}
              >
                <Link2 className="h-3.5 w-3.5 mr-1.5" /> Send payment link
              </AdminButton>
            </div>
          </div>

          <div className="border-t border-[hsl(var(--admin-border))] pt-4">
            <AdminLabel>Change Quantity</AdminLabel>
            <div className="flex items-center gap-2 mt-1">
              <AdminInput
                type="number"
                min={1}
                max={50}
                value={newQuantity}
                onChange={(e) => setNewQuantity(e.target.value)}
                className="w-24"
              />
              <AdminButton
                size="sm"
                variant="admin"
                disabled={busy || parseInt(newQuantity, 10) === qty}
                onClick={() => setConfirmComp("qty")}
              >
                Update Quantity
              </AdminButton>
            </div>
            <div className="text-xs text-[hsl(var(--admin-text-secondary))] mt-1.5">
              Current: {qty}. Adjusts inventory and ticket records. No charge collected for added quantity.
            </div>
          </div>
        </div>
      )}

      {/* ADD-ONS SECTION */}
      {section === "addons" && (
        <div className="rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] p-4 space-y-4">
          {/* Add new */}
          <div>
            <AdminLabel>Add an Add-on</AdminLabel>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1">
                <AdminSelect value={selectedAddon} onValueChange={setSelectedAddon} placeholder="Select an add-on…">
                  {addons.map((a) => {
                    const remaining = a.total_quantity - a.sold_quantity;
                    return (
                      <AdminSelectItem
                        key={a.id}
                        value={a.id}
                        disabled={remaining <= 0}
                      >
                        {a.display_name} — ${(a.price / 100).toFixed(0)} ({remaining} left)
                      </AdminSelectItem>
                    );
                  })}
                </AdminSelect>
              </div>
              <AdminInput
                type="number"
                min={1}
                max={20}
                value={addonQty}
                onChange={(e) => setAddonQty(e.target.value)}
                className="w-20"
              />
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <AdminButton size="sm" variant="admin" disabled={busy || !selectedAddon} onClick={handleAddonComp}>
                {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                Comp (free)
              </AdminButton>
              <AdminButton size="sm" variant="outline" disabled={busy || !selectedAddon} onClick={handleAddonLink}>
                <Link2 className="h-3.5 w-3.5 mr-1.5" /> Send payment link
              </AdminButton>
            </div>
          </div>

          {/* Existing purchases */}
          {purchases.length > 0 && (
            <div className="border-t border-[hsl(var(--admin-border))] pt-4 space-y-2">
              <div className="text-xs font-medium uppercase text-[hsl(var(--admin-text-secondary))]">
                Existing Add-ons ({purchases.length})
              </div>
              {purchases.map((p) => (
                <div
                  key={p.id}
                  className="rounded border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface-elevated))] p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium text-[hsl(var(--admin-text))]">
                        {p.quantity}× {p.addon_inventory?.display_name || p.inventory_id}
                      </div>
                      <div className="text-xs text-[hsl(var(--admin-text-secondary))]">
                        ${(p.total_amount / 100).toFixed(0)} • {p.payment_status}
                        {p.unit_price === 0 && " • COMPED"}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <AdminButton
                        size="icon"
                        variant="ghost"
                        title="Edit dietary"
                        onClick={() => {
                          setEditingDietary(editingDietary === p.id ? null : p.id);
                          setDietaryHas(p.has_dietary_restrictions);
                          setDietaryText(p.dietary_restrictions || "");
                        }}
                      >
                        <Utensils className="h-3.5 w-3.5" />
                      </AdminButton>
                      <AdminButton
                        size="icon"
                        variant="ghost"
                        title="Remove add-on"
                        onClick={() => handleRemoveAddon(p.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-[hsl(var(--admin-error))]" />
                      </AdminButton>
                    </div>
                  </div>

                  {p.has_dietary_restrictions && p.dietary_restrictions && editingDietary !== p.id && (
                    <div className="mt-2 text-xs text-[hsl(var(--admin-text-secondary))] flex items-start gap-1.5">
                      <Utensils className="h-3 w-3 mt-0.5 shrink-0" />
                      <span>{p.dietary_restrictions}</span>
                    </div>
                  )}

                  {editingDietary === p.id && (
                    <div className="mt-3 space-y-2 border-t border-[hsl(var(--admin-border))] pt-3">
                      <label className="flex items-center gap-2 text-xs">
                        <AdminCheckbox
                          checked={dietaryHas}
                          onCheckedChange={(v) => setDietaryHas(!!v)}
                        />
                        Has dietary restrictions
                      </label>
                      {dietaryHas && (
                        <AdminInput
                          value={dietaryText}
                          onChange={(e) => setDietaryText(e.target.value)}
                          placeholder="Allergies, preferences…"
                        />
                      )}
                      <div className="flex gap-2">
                        <AdminButton size="sm" variant="admin" onClick={() => handleSaveDietary(p.id)} disabled={busy}>
                          Save
                        </AdminButton>
                        <AdminButton size="sm" variant="outline" onClick={() => setEditingDietary(null)}>
                          Cancel
                        </AdminButton>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TRANSFER SECTION */}
      {section === "transfer" && (
        <div className="rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] p-4 space-y-3">
          <div>
            <AdminLabel>New Email</AdminLabel>
            <AdminInput
              type="email"
              value={transferEmail}
              onChange={(e) => setTransferEmail(e.target.value)}
            />
          </div>
          <div>
            <AdminLabel>New Name (optional)</AdminLabel>
            <AdminInput
              value={transferName}
              onChange={(e) => setTransferName(e.target.value)}
            />
          </div>
          <div className="text-xs text-[hsl(var(--admin-text-secondary))]">
            Updates the registration, all tickets, and add-on purchases linked to this attendee.
          </div>
          <AdminButton
            size="sm"
            variant="admin"
            disabled={busy || transferEmail.trim().toLowerCase() === registration.email.trim().toLowerCase()}
            onClick={() => setConfirmTransfer(true)}
          >
            <Mail className="h-3.5 w-3.5 mr-1.5" /> Transfer Registration
          </AdminButton>
        </div>
      )}

      {/* Confirm dialogs */}
      <AdminConfirmDialog
        open={confirmComp === "ticket"}
        onOpenChange={(o) => !o && setConfirmComp(null)}
        title="Change ticket type without charge?"
        description={`This will change ${registration.name}'s ticket from ${formatTicketType(registration.ticket_type)} to ${formatTicketType(newTicketType)}.`}
        consequences={[
          `Total amount on record will become $${(newTotal / 100).toFixed(0)} (${priceDelta >= 0 ? "+" : ""}${(priceDelta / 100).toFixed(0)})`,
          "Ticket inventory will be re-balanced",
          "No Stripe charge or refund is processed",
        ]}
        actionType="warning"
        actionLabel="Yes, change ticket"
        onConfirm={handleChangeTicketComp}
        isLoading={busy}
      />

      <AdminConfirmDialog
        open={confirmComp === "qty"}
        onOpenChange={(o) => !o && setConfirmComp(null)}
        title="Change registration quantity?"
        description={`Adjust quantity from ${qty} to ${newQuantity}.`}
        consequences={[
          "Inventory will be reserved or released accordingly",
          "Tickets table will sync (new tickets created or extras cancelled)",
          "No Stripe charge or refund is processed",
        ]}
        actionType="warning"
        actionLabel="Yes, update quantity"
        onConfirm={handleChangeQty}
        isLoading={busy}
      />

      <AdminConfirmDialog
        open={confirmTransfer}
        onOpenChange={setConfirmTransfer}
        title="Transfer registration to a new email?"
        description={`From ${registration.email} → ${transferEmail}`}
        consequences={[
          "Registration, tickets, and add-ons will all move to the new email",
          "The attendee will need to look up their tickets with the new email",
        ]}
        actionType="warning"
        actionLabel="Yes, transfer"
        onConfirm={handleTransfer}
        isLoading={busy}
      />
    </div>
  );
}
