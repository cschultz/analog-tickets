import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ArtistContact {
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  role: string;
  role_notes: string | null;
  is_primary: boolean;
}

interface ArtistContactsManagerProps {
  artistId: string;
  artistName: string;
  onContactsChange?: () => void;
}

const ROLES = [
  { value: "manager", label: "Manager" },
  { value: "agent", label: "Agent" },
  { value: "publicist", label: "Publicist" },
  { value: "tour_manager", label: "Tour Manager" },
  { value: "artist_direct", label: "Artist Direct" },
  { value: "label_rep", label: "Label Rep" },
  { value: "marketing", label: "Marketing" },
  { value: "other", label: "Other" },
];

const ROLE_LABELS: Record<string, string> = {
  manager: "Manager",
  agent: "Agent",
  publicist: "Publicist",
  tour_manager: "Tour Manager",
  artist_direct: "Artist Direct",
  label_rep: "Label Rep",
  marketing: "Marketing",
  other: "Other",
};

const ArtistContactsManager = ({ artistId, artistName, onContactsChange }: ArtistContactsManagerProps) => {
  const [contacts, setContacts] = useState<ArtistContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<ArtistContact | null>(null);
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    role: "manager",
    role_notes: "",
    is_primary: false,
  });

  useEffect(() => {
    fetchContacts();
  }, [artistId]);

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("artist_contacts")
        .select("*")
        .eq("artist_id", artistId)
        .order("is_primary", { ascending: false })
        .order("name");

      if (error) throw error;
      setContacts(data || []);
    } catch (error: any) {
      toast.error("Failed to fetch contacts: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const checkDuplicateContact = async (email: string, excludeId?: string): Promise<boolean> => {
    const normalizedEmail = email.toLowerCase().trim();
    
    // Check within this artist's contacts
    const existingInArtist = contacts.find(
      c => c.email.toLowerCase() === normalizedEmail && c.id !== excludeId
    );
    
    if (existingInArtist) {
      toast.error(`A contact with email "${email}" already exists for this artist`);
      return true;
    }
    
    return false;
  };

  const handleSubmit = async () => {
    if (!formData.first_name.trim() || !formData.email.trim()) {
      toast.error("First name and email are required");
      return;
    }
    
    const fullName = formData.last_name.trim() 
      ? `${formData.first_name.trim()} ${formData.last_name.trim()}`
      : formData.first_name.trim();

    // Check for duplicates before saving
    const isDuplicate = await checkDuplicateContact(
      formData.email, 
      editingContact?.id
    );
    
    if (isDuplicate) return;

    try {
      if (editingContact) {
        const { error } = await supabase
          .from("artist_contacts")
          .update({
            name: fullName,
            first_name: formData.first_name.trim(),
            last_name: formData.last_name.trim() || null,
            email: formData.email,
            phone: formData.phone || null,
            role: formData.role as any,
            role_notes: formData.role_notes || null,
            is_primary: formData.is_primary,
          })
          .eq("id", editingContact.id);

        if (error) throw error;
        toast.success("Contact updated successfully");
      } else {
        const { error } = await supabase
          .from("artist_contacts")
          .insert({
            artist_id: artistId,
            name: fullName,
            first_name: formData.first_name.trim(),
            last_name: formData.last_name.trim() || null,
            email: formData.email,
            phone: formData.phone || null,
            role: formData.role as any,
            role_notes: formData.role_notes || null,
            is_primary: formData.is_primary,
          });

        if (error) throw error;
        toast.success("Contact added successfully");
      }

      resetForm();
      fetchContacts();
      onContactsChange?.();
    } catch (error: any) {
      toast.error("Failed to save contact: " + error.message);
    }
  };

  const handleDelete = async (contactId: string) => {
    if (!confirm("Are you sure you want to delete this contact?")) return;

    try {
      const { error } = await supabase
        .from("artist_contacts")
        .delete()
        .eq("id", contactId);

      if (error) throw error;
      toast.success("Contact deleted successfully");
      fetchContacts();
      onContactsChange?.();
    } catch (error: any) {
      toast.error("Failed to delete contact: " + error.message);
    }
  };

  const resetForm = () => {
    setFormData({
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      role: "manager",
      role_notes: "",
      is_primary: false,
    });
    setEditingContact(null);
    setIsDialogOpen(false);
  };

  const openEditDialog = (contact: ArtistContact) => {
    setFormData({
      first_name: contact.first_name || contact.name.split(' ')[0] || "",
      last_name: contact.last_name || contact.name.split(' ').slice(1).join(' ') || "",
      email: contact.email,
      phone: contact.phone || "",
      role: contact.role,
      role_notes: contact.role_notes || "",
      is_primary: contact.is_primary,
    });
    setEditingContact(contact);
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm">Contacts for {artistName}</h4>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          if (!open) resetForm();
          setIsDialogOpen(open);
        }}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Add Contact
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingContact ? "Edit Contact" : "Add New Contact"}</DialogTitle>
              <DialogDescription>
                Add a team member contact for {artistName}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="contact-first-name">First Name *</Label>
                  <Input
                    id="contact-first-name"
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    placeholder="First name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact-last-name">Last Name</Label>
                  <Input
                    id="contact-last-name"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    placeholder="Last name"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-email">Email *</Label>
                <Input
                  id="contact-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-phone">Phone</Label>
                <Input
                  id="contact-phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="(555) 123-4567"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-role">Role *</Label>
                <Select 
                  value={formData.role} 
                  onValueChange={(value) => setFormData({ ...formData, role: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border shadow-lg z-50">
                    {ROLES.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {formData.role === "other" && (
                <div className="space-y-2">
                  <Label htmlFor="role-notes">Role Description</Label>
                  <Input
                    id="role-notes"
                    value={formData.role_notes}
                    onChange={(e) => setFormData({ ...formData, role_notes: e.target.value })}
                    placeholder="Describe the role"
                  />
                </div>
              )}
              <div className="flex items-center gap-2">
                <Switch
                  id="is-primary"
                  checked={formData.is_primary}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_primary: checked })}
                />
                <Label htmlFor="is-primary">Primary contact</Label>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="adminOutline" onClick={resetForm}>Cancel</Button>
                <Button variant="admin" onClick={handleSubmit}>
                  {editingContact ? "Update" : "Add"} Contact
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <div className="animate-spin h-6 w-6 border-4 border-[hsl(var(--admin-accent))] border-t-transparent rounded-full" />
        </div>
      ) : contacts.length === 0 ? (
        <p className="text-sm text-[hsl(var(--admin-text-muted))] text-center py-4">
          No contacts added yet. Add team members to communicate with this artist.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.map((contact) => (
              <TableRow key={contact.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {contact.name}
                    {contact.is_primary && (
                      <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                    )}
                  </div>
                </TableCell>
                <TableCell>{contact.email}</TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {ROLE_LABELS[contact.role] || contact.role}
                    {contact.role === "other" && contact.role_notes && `: ${contact.role_notes}`}
                  </Badge>
                </TableCell>
                <TableCell>{contact.phone || "-"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEditDialog(contact)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(contact.id)}>
                      <Trash2 className="h-4 w-4 text-[hsl(var(--admin-error))]" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
};

export default ArtistContactsManager;
