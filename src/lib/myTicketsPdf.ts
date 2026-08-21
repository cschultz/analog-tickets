import { jsPDF } from "jspdf";
import { formatTicketType } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { getSupabaseUrl, getSupabaseAnonKey } from "@/platform/config/env";

interface PdfTicket {
  id: string;
  holder_name?: string | null;
  holder_email?: string | null;
  ticket_type: string;
  unit_price?: number | null;
  checked_in_at?: string | null;
  event_details?: { title?: string; event_date?: string; venue_name?: string } | null;
}

interface PdfLodging {
  id: string;
  unitName?: string | null;
  zoneName?: string | null;
  zoneDescription?: string | null;
  quantity?: number | null;
  status?: string | null;
  totalAmount?: number | null;
  checkInDate?: string | null;
  checkOutDate?: string | null;
}

const formatDate = (value?: string | null) => {
  if (!value) return null;
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });
  } catch {
    return null;
  }
};

const formatMoney = (cents?: number | null) => {
  if (cents == null) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
};

export async function fetchLodgingForPdf(userEmail: string, registrationIds: string[], sessionToken?: string): Promise<PdfLodging[]> {
  try {
    const supabaseUrl = getSupabaseUrl();
    const supabaseKey = getSupabaseAnonKey();
    const normalizedEmail = userEmail.toLowerCase().trim();
    const url = new URL(`${supabaseUrl}/rest/v1/lodging_bookings`);
    url.searchParams.set("select", "*");
    url.searchParams.set("payment_status", "eq.paid");
    url.searchParams.set("order", "created_at.desc");
    if (registrationIds.length > 0) {
      url.searchParams.set("or", `(email.ilike.${normalizedEmail},registration_id.in.(${registrationIds.join(",")}))`);
    } else {
      url.searchParams.set("email", `ilike.${normalizedEmail}`);
    }
    const res = await fetch(url.toString(), {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, "x-mytickets-session": sessionToken || "" },
    });
    const bookings = res.ok ? await res.json() : [];

    const [zonesRes, unitsRes] = await Promise.all([
      supabase.from("accommodation_zones").select("zone_key, zone_name, description"),
      supabase.from("accommodation_units").select("id, unit_name"),
    ]);
    const zonesByKey = new Map((zonesRes.data || []).map((z: any) => [z.zone_key, z]));
    const unitsById = new Map((unitsRes.data || []).map((u: any) => [u.id, u]));

    return (bookings || []).map((b: any) => {
      const zone = b.zone_key ? zonesByKey.get(b.zone_key) as any : null;
      const unit = b.assigned_unit_id ? unitsById.get(b.assigned_unit_id) as any : null;
      return {
        id: b.id,
        unitName: unit?.unit_name || null,
        zoneName: zone?.zone_name || null,
        zoneDescription: zone?.description || null,
        quantity: b.quantity || 1,
        status: b.assignment_status || "confirmed",
        totalAmount: b.total_amount ?? null,
        checkInDate: b.check_in_date || b.start_date || null,
        checkOutDate: b.check_out_date || b.end_date || null,
      };
    });
  } catch (err) {
    console.error("fetchLodgingForPdf failed:", err);
    return [];
  }
}

export function generateMyTicketsPdf({
  userEmail,
  tickets,
  lodging,
}: {
  userEmail: string;
  tickets: PdfTicket[];
  lodging: PdfLodging[];
}) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("Cosmico — My Tickets", margin, y);
  y += 24;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(`Issued to: ${userEmail}`, margin, y);
  y += 14;
  doc.text(`Generated: ${new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}`, margin, y);
  y += 8;
  doc.setDrawColor(220);
  doc.line(margin, y + 6, pageWidth - margin, y + 6);
  y += 24;
  doc.setTextColor(20);

  // Tickets
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`Tickets (${tickets.length})`, margin, y);
  y += 18;

  if (tickets.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(11);
    doc.setTextColor(120);
    doc.text("No tickets on this booking.", margin, y);
    doc.setTextColor(20);
    y += 18;
  } else {
    tickets.forEach((t, idx) => {
      ensureSpace(110);
      const cardTop = y;
      const cardHeight = 96;
      doc.setDrawColor(210);
      doc.setFillColor(250, 249, 246);
      doc.roundedRect(margin, cardTop, pageWidth - margin * 2, cardHeight, 8, 8, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(20);
      doc.text(`Ticket ${idx + 1} · ${formatTicketType(t.ticket_type)}`, margin + 14, cardTop + 22);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(70);
      const holder = t.holder_name || "Unassigned";
      doc.text(`Holder: ${holder}`, margin + 14, cardTop + 40);
      if (t.holder_email) doc.text(`Email: ${t.holder_email}`, margin + 14, cardTop + 54);

      const eventTitle = t.event_details?.title || "Cosmico";
      const eventDate = formatDate(t.event_details?.event_date);
      doc.text(`Event: ${eventTitle}${eventDate ? ` · ${eventDate}` : ""}`, margin + 14, cardTop + 68);
      if (t.event_details?.venue_name) doc.text(`Venue: ${t.event_details.venue_name}`, margin + 14, cardTop + 82);

      doc.setFontSize(8);
      doc.setTextColor(140);
      doc.text(`Ticket ID: ${t.id}`, pageWidth - margin - 14, cardTop + 22, { align: "right" });
      if (t.checked_in_at) {
        doc.setTextColor(40, 120, 60);
        doc.text("Checked in", pageWidth - margin - 14, cardTop + 40, { align: "right" });
      }
      doc.setTextColor(20);
      y = cardTop + cardHeight + 12;
    });
  }

  // Lodging
  y += 8;
  ensureSpace(40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`Lodging (${lodging.length})`, margin, y);
  y += 18;

  if (lodging.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(11);
    doc.setTextColor(120);
    doc.text("No lodging booked.", margin, y);
    doc.setTextColor(20);
    y += 18;
  } else {
    lodging.forEach((l, idx) => {
      ensureSpace(100);
      const cardTop = y;
      const cardHeight = 90;
      doc.setDrawColor(210);
      doc.setFillColor(245, 248, 250);
      doc.roundedRect(margin, cardTop, pageWidth - margin * 2, cardHeight, 8, 8, "FD");

      const title = l.unitName || l.zoneName || "Lodging";
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(20);
      doc.text(`Lodging ${idx + 1} · ${title}`, margin + 14, cardTop + 22);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(70);
      let line = cardTop + 40;
      if (l.zoneName && l.unitName) {
        doc.text(`Zone: ${l.zoneName} · Unit ${l.unitName}`, margin + 14, line); line += 14;
      } else if (l.zoneName) {
        doc.text(`Zone: ${l.zoneName}`, margin + 14, line); line += 14;
      }
      if (l.zoneDescription) {
        const wrapped = doc.splitTextToSize(l.zoneDescription, pageWidth - margin * 2 - 28);
        doc.text(wrapped.slice(0, 2), margin + 14, line); line += 14 * Math.min(2, wrapped.length);
      }
      doc.text(`Quantity: ${l.quantity ?? 1}`, margin + 14, line); line += 14;
      const dates = [formatDate(l.checkInDate), formatDate(l.checkOutDate)].filter(Boolean).join(" → ");
      if (dates) { doc.text(`Dates: ${dates}`, margin + 14, line); line += 14; }
      const total = formatMoney(l.totalAmount);
      if (total) doc.text(`Total: ${total}`, margin + 14, line);

      doc.setFontSize(8);
      doc.setTextColor(140);
      doc.text(`Booking ID: ${l.id}`, pageWidth - margin - 14, cardTop + 22, { align: "right" });
      const status = (l.status || "confirmed").toLowerCase();
      doc.setTextColor(status === "assigned" || status === "confirmed" ? 40 : 170, status === "assigned" || status === "confirmed" ? 120 : 110, status === "assigned" || status === "confirmed" ? 60 : 30);
      doc.text(status === "pending" ? "Assignment pending" : "Confirmed", pageWidth - margin - 14, cardTop + 40, { align: "right" });
      doc.setTextColor(20);

      y = cardTop + cardHeight + 12;
    });
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `example.org · Page ${i} of ${pageCount} · Bring this PDF or your QR code (sent 7 days before the event) to check in.`,
      pageWidth / 2,
      pageHeight - 24,
      { align: "center" },
    );
  }

  const safeEmail = userEmail.replace(/[^a-z0-9]+/gi, "_");
  doc.save(`analog-commons-tickets-${safeEmail}.pdf`);
}
