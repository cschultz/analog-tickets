import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminEvent } from "@/hooks/useAdminEvent";
import { toast } from "sonner";
import { Download, Loader2, FileSpreadsheet } from "lucide-react";
import { AdminButton } from "./AdminUI";
import {
  AdminDialog,
  AdminDialogContent,
  AdminDialogHeader,
  AdminDialogTitle,
  AdminDialogDescription,
  AdminDialogBody,
  AdminDialogFooter,
} from "./AdminDialog";
import { AdminCheckbox, AdminLabel } from "./AdminFormPrimitives";

type ExportType = "registrations" | "tickets" | "attendees" | "lodging";

interface ExportOption {
  id: ExportType;
  label: string;
  description: string;
}

const EXPORT_OPTIONS: ExportOption[] = [
  { id: "registrations", label: "Registrations", description: "All registration orders with payment status" },
  { id: "tickets", label: "Tickets", description: "Individual ticket holders with QR codes" },
  { id: "attendees", label: "Attendees", description: "Unique attendees for check-in lists" },
  { id: "lodging", label: "Lodging Bookings", description: "Accommodation reservations" },
];

function downloadCSV(filename: string, data: Record<string, unknown>[]) {
  if (data.length === 0) {
    toast.error("No data to export");
    return;
  }

  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(","),
    ...data.map((row) =>
      headers.map((h) => {
        const val = row[h];
        if (val === null || val === undefined) return "";
        const str = String(val);
        // Escape quotes and wrap in quotes if contains comma
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(",")
    ),
  ];

  const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function CSVExport() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ExportType[]>(["registrations"]);
  const [isExporting, setIsExporting] = useState(false);
  const { selectedEventId, selectedEvent } = useAdminEvent();

  const toggleOption = (id: ExportType) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleExport = async () => {
    if (!selectedEventId || selected.length === 0) return;

    setIsExporting(true);
    const timestamp = new Date().toISOString().split("T")[0];
    const eventSlug = selectedEvent?.title?.toLowerCase().replace(/\s+/g, "-") || "event";

    try {
      for (const type of selected) {
        let data: Record<string, unknown>[] = [];
        let filename = "";

        switch (type) {
          case "registrations": {
            const { data: regs, error } = await supabase
              .from("registrations")
              .select("order_number, name, email, ticket_type, quantity, total_amount, payment_status, created_at, checked_in")
              .eq("event_id", selectedEventId)
              .order("created_at", { ascending: false });
            if (error) throw error;
            data = (regs || []).map((r) => ({
              order_number: r.order_number,
              name: r.name,
              email: r.email,
              ticket_type: r.ticket_type,
              quantity: r.quantity,
              total_amount: ((r.total_amount || 0) / 100).toFixed(2),
              payment_status: r.payment_status,
              created_at: r.created_at,
              checked_in: r.checked_in,
            }));
            filename = `${eventSlug}-registrations-${timestamp}.csv`;
            break;
          }
          case "tickets": {
            const { data: tickets, error } = await supabase
              .from("tickets")
              .select("id, holder_name, holder_email, ticket_type, unit_price, status, checked_in_at, original_purchaser_email")
              .eq("event_id", selectedEventId)
              .order("created_at", { ascending: false });
            if (error) throw error;
            data = (tickets || []).map((t) => ({
              id: t.id,
              holder_name: t.holder_name,
              holder_email: t.holder_email,
              ticket_type: t.ticket_type,
              unit_price: ((t.unit_price || 0) / 100).toFixed(2),
              status: t.status,
              checked_in_at: t.checked_in_at,
              original_purchaser_email: t.original_purchaser_email,
            }));
            filename = `${eventSlug}-tickets-${timestamp}.csv`;
            break;
          }
          case "attendees": {
            const { data: tickets, error } = await supabase
              .from("tickets")
              .select("holder_name, holder_email, ticket_type, status")
              .eq("event_id", selectedEventId)
              .eq("status", "active");
            if (error) throw error;
            // Dedupe by email
            const seen = new Set<string>();
            data = (tickets || []).filter((t) => {
              const key = t.holder_email?.toLowerCase() || t.holder_name || "";
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            }).map((t) => ({
              holder_name: t.holder_name,
              holder_email: t.holder_email,
              ticket_type: t.ticket_type,
              status: t.status,
            }));
            filename = `${eventSlug}-attendees-${timestamp}.csv`;
            break;
          }
          case "lodging": {
            const { data: bookings, error } = await supabase
              .from("lodging_bookings")
              .select("assignee_name, email, zone_key, quantity, total_amount, payment_status, assignment_status, created_at")
              .eq("event_id", selectedEventId)
              .order("created_at", { ascending: false });
            if (error) throw error;
            data = (bookings || []).map((b) => ({
              guest_name: b.assignee_name,
              email: b.email,
              zone_key: b.zone_key,
              quantity: b.quantity,
              total_amount: ((b.total_amount || 0) / 100).toFixed(2),
              payment_status: b.payment_status,
              assignment_status: b.assignment_status,
              created_at: b.created_at,
            }));
            filename = `${eventSlug}-lodging-${timestamp}.csv`;
            break;
          }
        }

        downloadCSV(filename, data);
        toast.success(`Exported ${data.length} ${type}`);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Export failed";
      toast.error(msg);
    } finally {
      setIsExporting(false);
      setOpen(false);
    }
  };

  return (
    <>
      <AdminButton variant="adminOutline" size="sm" onClick={() => setOpen(true)}>
        <Download className="w-4 h-4 mr-2" />
        Export CSV
      </AdminButton>

      <AdminDialog open={open} onOpenChange={setOpen}>
        <AdminDialogContent>
          <AdminDialogHeader>
            <AdminDialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" />
              Export Data
            </AdminDialogTitle>
            <AdminDialogDescription>
              Select data types to export as CSV files
            </AdminDialogDescription>
          </AdminDialogHeader>
          <AdminDialogBody className="space-y-3">
            {EXPORT_OPTIONS.map((opt) => (
              <label
                key={opt.id}
                className="flex items-start gap-3 p-3 rounded-lg border border-[hsl(var(--admin-border))] hover:bg-[hsl(var(--admin-hover))] cursor-pointer transition-colors"
              >
                <AdminCheckbox
                  checked={selected.includes(opt.id)}
                  onCheckedChange={() => toggleOption(opt.id)}
                />
                <div>
                  <AdminLabel className="cursor-pointer">{opt.label}</AdminLabel>
                  <p className="text-xs text-[hsl(var(--admin-text-muted))]">{opt.description}</p>
                </div>
              </label>
            ))}
          </AdminDialogBody>
          <AdminDialogFooter>
            <AdminButton variant="adminGhost" onClick={() => setOpen(false)}>
              Cancel
            </AdminButton>
            <AdminButton
              onClick={handleExport}
              disabled={isExporting || selected.length === 0}
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Export ({selected.length})
                </>
              )}
            </AdminButton>
          </AdminDialogFooter>
        </AdminDialogContent>
      </AdminDialog>
    </>
  );
}
