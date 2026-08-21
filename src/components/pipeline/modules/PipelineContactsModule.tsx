import { useState } from "react";
import { AdminConfirmDialog } from "@/components/admin/AdminConfirmDialog";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePipeline } from "../PipelineContext";
import { AdminButton, AdminBadge, AdminInput, AdminLabel, AdminSwitch } from "@/components/admin";
import { AdminSelect, AdminSelectItem } from "@/components/admin/AdminSelect";
import { AdminAvatar } from "@/components/admin/AdminPrimitives";
import {
  AdminSheet,
  AdminSheetContent,
  AdminSheetHeader,
  AdminSheetTitle,
  AdminSheetDescription,
} from "@/components/admin/AdminSheet";
import { Phone, Plus, Mail, Pencil, Trash2, Star } from "lucide-react";
import { toast } from "sonner";

interface Contact {
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  role: string | null;
  is_primary: boolean | null;
}

const ROLES = [
  { value: "manager", label: "Manager" },
  { value: "agent", label: "Agent" },
  { value: "marketing", label: "Marketing" },
  { value: "tour_manager", label: "Tour Manager" },
  { value: "artist_direct", label: "Artist Direct" },
  { value: "label_rep", label: "Label Rep" },
  { value: "other", label: "Other" },
];

export function PipelineContactsModule() {
  const { config, selectedRecord } = usePipeline();
  const queryClient = useQueryClient();
  const [deleteContactId, setDeleteContactId] = useState<string | null>(null);
  
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    role: "manager",
    is_primary: false,
  });

  // Determine contacts table based on entity type
  const contactsTable = config?.slug === "artist" 
    ? "artist_contacts"
    : config?.slug === "artisan"
    ? "artisan_contacts"
    : config?.slug === "partner"
    ? "partner_contacts"
    : "vendor_contacts";

  const foreignKey = config?.slug === "artist"
    ? "artist_id"
    : config?.slug === "artisan"
    ? "artisan_id"
    : config?.slug === "partner"
    ? "partner_id"
    : "vendor_id";

  // For cloned artists, resolve the source artist ID to show shared contacts
  const sourceArtistId = config?.slug === "artist" && selectedRecord?.source_artist_id
    ? selectedRecord.source_artist_id as string
    : null;

  const effectiveId = sourceArtistId || selectedRecord?.id;

  const { data: contacts = [], isLoading } = useAuthQuery({
    queryKey: ["pipeline-contacts", config?.slug, effectiveId],
    queryFn: async () => {
      if (!effectiveId) return [];
      
      const { data, error } = await supabase
        .from(contactsTable as "vendor_contacts" | "artist_contacts" | "artisan_contacts" | "partner_contacts")
        .select("*")
        .eq(foreignKey as never, effectiveId as never)
        .order("is_primary", { ascending: false })
        .order("name");

      if (error) throw error;
      return data as Contact[];
    },
    enabled: !!effectiveId && !!config,
  });

  const resetForm = () => {
    setFormData({
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      role: "manager",
      is_primary: false,
    });
    setEditingContact(null);
    setIsSheetOpen(false);
  };

  const openAddSheet = () => {
    resetForm();
    setIsSheetOpen(true);
  };

  const openEditSheet = (contact: Contact) => {
    setFormData({
      first_name: contact.first_name || contact.name.split(' ')[0] || "",
      last_name: contact.last_name || contact.name.split(' ').slice(1).join(' ') || "",
      email: contact.email,
      phone: contact.phone || "",
      role: contact.role || "manager",
      is_primary: contact.is_primary || false,
    });
    setEditingContact(contact);
    setIsSheetOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.first_name.trim() || !formData.email.trim()) {
      toast.error("First name and email are required");
      return;
    }

    if (!selectedRecord?.id) {
      toast.error("No record selected");
      return;
    }

    const fullName = formData.last_name.trim() 
      ? `${formData.first_name.trim()} ${formData.last_name.trim()}`
      : formData.first_name.trim();

    try {
      if (editingContact) {
        const { error } = await supabase
          .from(contactsTable as "vendor_contacts" | "artist_contacts" | "artisan_contacts" | "partner_contacts")
          .update({
            name: fullName,
            first_name: formData.first_name.trim(),
            last_name: formData.last_name.trim() || null,
            email: formData.email.trim(),
            phone: formData.phone.trim() || null,
            role: formData.role,
            is_primary: formData.is_primary,
          } as never)
          .eq("id" as never, editingContact.id as never);

        if (error) throw error;
        toast.success("Contact updated");
      } else {
        const insertData = {
          [foreignKey]: effectiveId,
          name: fullName,
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim() || null,
          email: formData.email.trim(),
          phone: formData.phone.trim() || null,
          role: formData.role,
          is_primary: formData.is_primary,
        };

        const { error } = await supabase
          .from(contactsTable as "vendor_contacts" | "artist_contacts" | "artisan_contacts" | "partner_contacts")
          .insert(insertData as never);

        if (error) throw error;
        toast.success("Contact added");
      }

      queryClient.invalidateQueries({ queryKey: ["pipeline-contacts", config?.slug, effectiveId] });
      resetForm();
    } catch (error: any) {
      toast.error("Failed to save contact: " + error.message);
    }
  };

  const handleDelete = async (contactId: string) => {
    try {
      const { error } = await supabase
        .from(contactsTable as "vendor_contacts" | "artist_contacts" | "artisan_contacts" | "partner_contacts")
        .delete()
        .eq("id" as never, contactId as never);

      if (error) throw error;
      toast.success("Contact deleted");
      queryClient.invalidateQueries({ queryKey: ["pipeline-contacts", config?.slug, effectiveId] });
    } catch (error: any) {
      toast.error("Failed to delete: " + error.message);
    } finally {
      setDeleteContactId(null);
    }
  };

  if (!config?.has_contacts) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-[hsl(var(--admin-foreground))]">
            Contacts
          </h3>
          <AdminBadge intent="neutral" className="text-[10px] px-1.5">
            {contacts.length}
          </AdminBadge>
        </div>
        <AdminButton variant="adminOutline" size="sm" onClick={openAddSheet}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add Contact
        </AdminButton>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="py-8 text-center text-xs text-[hsl(var(--admin-muted-foreground))]">
          Loading...
        </div>
      ) : contacts.length === 0 ? (
        <div className="py-12 text-center border border-dashed border-[hsl(var(--admin-border))] rounded-lg bg-[hsl(var(--admin-surface))]">
          <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-[hsl(var(--admin-muted)/0.3)] flex items-center justify-center">
            <Mail className="w-5 h-5 text-[hsl(var(--admin-muted-foreground))]" />
          </div>
          <p className="text-sm text-[hsl(var(--admin-muted-foreground))] mb-3">No contacts added</p>
          <AdminButton variant="adminOutline" size="sm" onClick={openAddSheet}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add First Contact
          </AdminButton>
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map((contact) => (
            <div 
              key={contact.id} 
              className="flex items-center justify-between p-3 border border-[hsl(var(--admin-border))] rounded-lg bg-[hsl(var(--admin-card))] hover:bg-[hsl(var(--admin-card-hover))] transition-colors group"
            >
              <div className="flex items-center gap-3">
                <AdminAvatar name={contact.name} size="sm" />
                <div>
                  <p className="font-medium text-sm text-[hsl(var(--admin-foreground))] flex items-center gap-2">
                    {contact.name}
                    {contact.is_primary && (
                      <Star className="w-3 h-3 text-[hsl(var(--admin-warning))] fill-[hsl(var(--admin-warning))]" />
                    )}
                  </p>
                  <p className="text-[11px] text-[hsl(var(--admin-muted-foreground))]">{contact.role || "Contact"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a href={`mailto:${contact.email}`} className="text-[hsl(var(--admin-info))] hover:underline text-xs">
                  {contact.email}
                </a>
                {contact.phone && (
                  <a href={`tel:${contact.phone}`} className="text-[hsl(var(--admin-muted-foreground))] hover:text-[hsl(var(--admin-foreground))]">
                    <Phone className="w-3.5 h-3.5" />
                  </a>
                )}
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 ml-2">
                  <AdminButton variant="adminGhost" size="sm" onClick={() => openEditSheet(contact)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </AdminButton>
                  <AdminButton variant="adminGhost" size="sm" onClick={() => setDeleteContactId(contact.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-[hsl(var(--admin-error))]" />
                  </AdminButton>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Sheet (Drawer) */}
      <AdminSheet open={isSheetOpen} onOpenChange={(open) => !open && resetForm()}>
        <AdminSheetContent side="right" className="w-[400px]">
          <AdminSheetHeader>
            <AdminSheetTitle>{editingContact ? "Edit Contact" : "Add Contact"}</AdminSheetTitle>
            <AdminSheetDescription>
              {editingContact ? "Update contact details." : `Add a contact for ${selectedRecord?.name || "this record"}.`}
            </AdminSheetDescription>
          </AdminSheetHeader>
          <div className="space-y-4 py-6">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <AdminLabel htmlFor="contact-first-name" required>First Name</AdminLabel>
                <AdminInput
                  id="contact-first-name"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  placeholder="First name"
                />
              </div>
              <div className="space-y-2">
                <AdminLabel htmlFor="contact-last-name">Last Name</AdminLabel>
                <AdminInput
                  id="contact-last-name"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  placeholder="Last name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <AdminLabel htmlFor="contact-email" required>Email</AdminLabel>
              <AdminInput
                id="contact-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="email@example.com"
              />
            </div>
            <div className="space-y-2">
              <AdminLabel htmlFor="contact-phone">Phone</AdminLabel>
              <AdminInput
                id="contact-phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="(555) 123-4567"
              />
            </div>
            <div className="space-y-2">
              <AdminLabel htmlFor="contact-role">Role</AdminLabel>
              <AdminSelect 
                value={formData.role} 
                onValueChange={(value) => setFormData({ ...formData, role: value })}
                mobileTitle="Select Role"
              >
                {ROLES.map((role) => (
                  <AdminSelectItem key={role.value} value={role.value}>
                    {role.label}
                  </AdminSelectItem>
                ))}
              </AdminSelect>
            </div>
            <div className="flex items-center gap-2">
              <AdminSwitch
                id="is-primary"
                checked={formData.is_primary}
                onCheckedChange={(checked) => setFormData({ ...formData, is_primary: checked })}
              />
              <AdminLabel htmlFor="is-primary">Primary contact</AdminLabel>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-[hsl(var(--admin-border))]">
              <AdminButton variant="adminOutline" onClick={resetForm}>Cancel</AdminButton>
              <AdminButton variant="admin" onClick={handleSubmit}>
                {editingContact ? "Update" : "Add"} Contact
              </AdminButton>
            </div>
          </div>
        </AdminSheetContent>
      </AdminSheet>

      {/* Delete Confirmation */}
      <AdminConfirmDialog
        open={!!deleteContactId}
        onOpenChange={(open) => !open && setDeleteContactId(null)}
        title="Delete Contact"
        description="This contact will be permanently removed. This action cannot be undone."
        actionLabel="Delete"
        actionType="destructive"
        onConfirm={() => deleteContactId && handleDelete(deleteContactId)}
      />
    </div>
  );
}
