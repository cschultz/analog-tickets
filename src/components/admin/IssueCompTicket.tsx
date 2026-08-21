import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import {
  AdminButton,
  AdminInput,
  AdminTextarea,
  AdminSheet,
  AdminSheetContent,
  AdminSheetHeader,
  AdminSheetTitle,
  AdminSheetFooter,
  AdminTabs,
  AdminTabsList,
  AdminTabsTrigger,
  AdminTabsContent,
} from "@/components/admin";
import { AdminLabel } from "@/components/admin/AdminFormPrimitives";
import { AdminSelect, AdminSelectItem } from "@/components/admin/AdminSelect";
import { toast } from "sonner";
import { UserPlus, ClipboardPaste, Loader2 } from "lucide-react";

interface IssueCompTicketProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const COMP_TYPES = ["Artist Guest List", "Staff Comp", "Volunteer", "Industry", "Media/Press", "VIP Comp", "Promo", "Other"];
const GUEST_OF_TYPES = ["artist", "staff", "partner", "other"];

export default function IssueCompTicket({ open, onClose, onSuccess }: IssueCompTicketProps) {
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [loading, setLoading] = useState(false);

  // Single guest form
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    ticketType: "",
    compType: "Artist Guest List",
    guestOfName: "",
    guestOfType: "artist",
    notes: "",
    quantity: "1",
  });

  // Bulk paste
  const [bulkText, setBulkText] = useState("");
  const [bulkTicketType, setBulkTicketType] = useState("");
  const [bulkCompType, setBulkCompType] = useState("Artist Guest List");
  const [bulkGuestOfName, setBulkGuestOfName] = useState("");
  const [bulkGuestOfType, setBulkGuestOfType] = useState("artist");
  const [parsedGuests, setParsedGuests] = useState<{ first_name: string; last_name?: string; email?: string }[]>([]);

  // Fetch ticket types
  const { data: ticketTypes } = useAuthQuery({
    queryKey: ["ticket-types-for-comp"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_inventory")
        .select("ticket_type, display_name, is_active")
        .eq("is_active", true)
        .order("ticket_type");
      if (error) throw error;
      return data;
    },
  });

  // Fetch event ID — must be the published + active event (singleton enforced in DB)
  const { data: eventData } = useAuthQuery({
    queryKey: ["event-for-comp-v2"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_details")
        .select("id, title, status, is_active")
        .eq("is_active", true)
        .eq("status", "published")
        .order("event_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("No active published event found. Set an event to active + published before issuing comp tickets.");
      return data;
    },
    staleTime: 0,
    gcTime: 0,
  });

  const parseBulkText = (text: string) => {
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    const guests: { first_name: string; last_name?: string; email?: string }[] = [];

    for (const line of lines) {
      const emailMatch = line.match(/[\w.+-]+@[\w.-]+\.\w+/);
      const email = emailMatch?.[0];
      let namePart = email ? line.replace(email, "").trim() : line;
      namePart = namePart.replace(/[,;|<>]+$/, "").replace(/^[,;|<>]+/, "").trim();

      if (!namePart) {
        if (email) {
          const localPart = email.split("@")[0];
          guests.push({ first_name: localPart, email });
        }
        continue;
      }

      const parts = namePart.split(/\s+/);
      const firstName = parts[0];
      const lastName = parts.slice(1).join(" ") || undefined;
      guests.push({ first_name: firstName, last_name: lastName, email });
    }

    setParsedGuests(guests);
    return guests;
  };

  const handleSingleSubmit = async () => {
    if (!formData.firstName.trim()) {
      toast.error("First name is required");
      return;
    }
    if (!formData.ticketType) {
      toast.error("Ticket type is required");
      return;
    }
    if (!eventData?.id) {
      toast.error("No event found");
      return;
    }

    setLoading(true);
    try {
      const qty = Math.max(1, Math.min(4, parseInt(formData.quantity) || 1));
      const baseGuest = {
        first_name: formData.firstName.trim(),
        last_name: formData.lastName.trim() || undefined,
        email: formData.email.trim() || undefined,
        ticket_type: formData.ticketType,
        comp_type: formData.compType,
        guest_of_name: formData.guestOfName.trim() || undefined,
        guest_of_type: formData.guestOfType,
        notes: formData.notes.trim() || undefined,
      };
      const guests = qty === 1
        ? [baseGuest]
        : Array.from({ length: qty }, (_, i) => ({
            ...baseGuest,
            notes: [baseGuest.notes, `Guest ${i + 1} of ${qty}`].filter(Boolean).join(" — "),
          }));

      const { data, error } = await supabase.functions.invoke("issue-comp-ticket", {
        body: { event_id: eventData.id, guests },
      });

      if (error) throw error;

      const result = data as any;
      if (result.issued > 0) {
        const emailInfo = result.results?.[0]?.email_sent ? " — confirmation email sent" : "";
        toast.success(`${result.issued} comp ticket${result.issued !== 1 ? "s" : ""} issued for ${formData.firstName}${emailInfo}`);
      }
      if (result.failed > 0) {
        toast.error(`Failed: ${result.errors?.[0]?.error}`);
      }

      resetForm();
      onSuccess();
    } catch (err) {
      console.error("Error issuing comp:", err);
      toast.error("Failed to issue comp ticket");
    } finally {
      setLoading(false);
    }
  };

  const handleBulkSubmit = async () => {
    if (parsedGuests.length === 0) {
      toast.error("No guests parsed. Paste names first.");
      return;
    }
    if (!bulkTicketType) {
      toast.error("Select a ticket type");
      return;
    }
    if (!eventData?.id) {
      toast.error("No event found");
      return;
    }

    setLoading(true);
    try {
      const guests = parsedGuests.map(g => ({
        ...g,
        ticket_type: bulkTicketType,
        comp_type: bulkCompType,
        guest_of_name: bulkGuestOfName.trim() || undefined,
        guest_of_type: bulkGuestOfType,
      }));

      const { data, error } = await supabase.functions.invoke("issue-comp-ticket", {
        body: { event_id: eventData.id, guests },
      });

      if (error) throw error;

      const result = data as any;
      toast.success(`${result.issued} comp ticket(s) issued${result.failed > 0 ? `, ${result.failed} failed` : ""}`);
      
      resetForm();
      onSuccess();
    } catch (err) {
      console.error("Error issuing bulk comps:", err);
      toast.error("Failed to issue comp tickets");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({ firstName: "", lastName: "", email: "", ticketType: "", compType: "Artist Guest List", guestOfName: "", guestOfType: "artist", notes: "", quantity: "1" });
    setBulkText("");
    setBulkTicketType("");
    setBulkCompType("Artist Guest List");
    setBulkGuestOfName("");
    setBulkGuestOfType("artist");
    setParsedGuests([]);
  };

  return (
    <AdminSheet open={open} onOpenChange={onClose}>
      <AdminSheetContent side="right" className="admin-theme font-admin w-full sm:max-w-lg overflow-y-auto">
        <AdminSheetHeader>
          <AdminSheetTitle>Issue Comp Ticket</AdminSheetTitle>
        </AdminSheetHeader>

        <div className="py-4">
          <AdminTabs value={mode} onValueChange={(v) => setMode(v as "single" | "bulk")}>
            <AdminTabsList className="w-full">
              <AdminTabsTrigger value="single" className="flex-1">
                <UserPlus className="h-4 w-4 mr-2" />
                Single Guest
              </AdminTabsTrigger>
              <AdminTabsTrigger value="bulk" className="flex-1">
                <ClipboardPaste className="h-4 w-4 mr-2" />
                Paste List
              </AdminTabsTrigger>
            </AdminTabsList>

            <AdminTabsContent value="single" className="mt-4">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <AdminLabel required>First Name</AdminLabel>
                    <AdminInput
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      placeholder="John"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <AdminLabel>Last Name</AdminLabel>
                    <AdminInput
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      placeholder="Doe"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <AdminLabel>Email</AdminLabel>
                  <AdminInput
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="Optional — needed for QR code delivery"
                  />
                </div>

                <div className="grid grid-cols-[1fr_120px] gap-3">
                  <div className="space-y-1.5">
                    <AdminLabel required>Ticket Type</AdminLabel>
                    <AdminSelect
                      value={formData.ticketType}
                      onValueChange={(v) => setFormData({ ...formData, ticketType: v })}
                      placeholder="Select ticket type"
                    >
                      {ticketTypes?.map((t) => (
                        <AdminSelectItem key={t.ticket_type} value={t.ticket_type}>
                          {t.display_name || t.ticket_type}
                        </AdminSelectItem>
                      ))}
                    </AdminSelect>
                  </div>
                  <div className="space-y-1.5">
                    <AdminLabel>Quantity</AdminLabel>
                    <AdminSelect
                      value={formData.quantity}
                      onValueChange={(v) => setFormData({ ...formData, quantity: v })}
                      placeholder="1"
                    >
                      {[1, 2, 3, 4].map((n) => (
                        <AdminSelectItem key={n} value={String(n)}>
                          {n === 1 ? "1 ticket" : `${n} tickets (${n - 1} +1)`}
                        </AdminSelectItem>
                      ))}
                    </AdminSelect>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <AdminLabel>Comp Type</AdminLabel>
                    <AdminSelect
                      value={formData.compType}
                      onValueChange={(v) => setFormData({ ...formData, compType: v })}
                      placeholder="Select type"
                    >
                      {COMP_TYPES.map((t) => (
                        <AdminSelectItem key={t} value={t}>{t}</AdminSelectItem>
                      ))}
                    </AdminSelect>
                  </div>
                  <div className="space-y-1.5">
                    <AdminLabel>Guest Of Type</AdminLabel>
                    <AdminSelect
                      value={formData.guestOfType}
                      onValueChange={(v) => setFormData({ ...formData, guestOfType: v })}
                      placeholder="Select"
                    >
                      {GUEST_OF_TYPES.map((t) => (
                        <AdminSelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</AdminSelectItem>
                      ))}
                    </AdminSelect>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <AdminLabel>Guest Of (Name)</AdminLabel>
                  <AdminInput
                    value={formData.guestOfName}
                    onChange={(e) => setFormData({ ...formData, guestOfName: e.target.value })}
                    placeholder="e.g. Gilligan Moss"
                  />
                </div>

                <div className="space-y-1.5">
                  <AdminLabel>Notes</AdminLabel>
                  <AdminTextarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Internal notes..."
                    rows={2}
                  />
                </div>
              </div>
            </AdminTabsContent>

            <AdminTabsContent value="bulk" className="mt-4">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <AdminLabel required>Paste Guest Names</AdminLabel>
                  <p className="text-xs text-[hsl(var(--admin-text-muted))]">
                    One per line. Include email if available. Examples: "John Doe", "Jane Smith jane@email.com", "Bob Wilson"
                  </p>
                  <AdminTextarea
                    value={bulkText}
                    onChange={(e) => {
                      setBulkText(e.target.value);
                      parseBulkText(e.target.value);
                    }}
                    placeholder={"John Doe john@email.com\nJane Smith\nBob Wilson bob@example.com"}
                    rows={6}
                    className="font-mono text-sm"
                  />
                  {parsedGuests.length > 0 && (
                    <div className="rounded-md border border-[hsl(var(--admin-border))] p-3 bg-[hsl(var(--admin-hover))]">
                      <p className="text-xs font-medium text-[hsl(var(--admin-text))] mb-2">
                        Parsed {parsedGuests.length} guest{parsedGuests.length !== 1 ? "s" : ""}:
                      </p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {parsedGuests.map((g, i) => (
                          <div key={i} className="text-xs text-[hsl(var(--admin-text-muted))] flex gap-2">
                            <span className="font-medium text-[hsl(var(--admin-text))]">
                              {g.first_name} {g.last_name || ""}
                            </span>
                            {g.email && (
                              <span className="text-[hsl(var(--admin-accent))]">{g.email}</span>
                            )}
                            {!g.email && (
                              <span className="text-[hsl(var(--admin-warning))]">no email</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <AdminLabel required>Ticket Type (for all)</AdminLabel>
                  <AdminSelect
                    value={bulkTicketType}
                    onValueChange={setBulkTicketType}
                    placeholder="Select ticket type"
                  >
                    {ticketTypes?.map((t) => (
                      <AdminSelectItem key={t.ticket_type} value={t.ticket_type}>
                        {t.display_name || t.ticket_type}
                      </AdminSelectItem>
                    ))}
                  </AdminSelect>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <AdminLabel>Comp Type</AdminLabel>
                    <AdminSelect
                      value={bulkCompType}
                      onValueChange={setBulkCompType}
                      placeholder="Select type"
                    >
                      {COMP_TYPES.map((t) => (
                        <AdminSelectItem key={t} value={t}>{t}</AdminSelectItem>
                      ))}
                    </AdminSelect>
                  </div>
                  <div className="space-y-1.5">
                    <AdminLabel>Guest Of Type</AdminLabel>
                    <AdminSelect
                      value={bulkGuestOfType}
                      onValueChange={setBulkGuestOfType}
                      placeholder="Select"
                    >
                      {GUEST_OF_TYPES.map((t) => (
                        <AdminSelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</AdminSelectItem>
                      ))}
                    </AdminSelect>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <AdminLabel>Guest Of (Name)</AdminLabel>
                  <AdminInput
                    value={bulkGuestOfName}
                    onChange={(e) => setBulkGuestOfName(e.target.value)}
                    placeholder="e.g. Gilligan Moss"
                  />
                </div>
              </div>
            </AdminTabsContent>
          </AdminTabs>
        </div>

        <AdminSheetFooter className="mt-4">
          <AdminButton variant="adminOutline" onClick={onClose} disabled={loading}>
            Cancel
          </AdminButton>
          <AdminButton
            variant="admin"
            onClick={mode === "single" ? handleSingleSubmit : handleBulkSubmit}
            disabled={loading}
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {mode === "single"
              ? "Issue Comp Ticket"
              : `Issue ${parsedGuests.length} Comp Ticket${parsedGuests.length !== 1 ? "s" : ""}`}
          </AdminButton>
        </AdminSheetFooter>
      </AdminSheetContent>
    </AdminSheet>
  );
}
