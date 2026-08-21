import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { AdminCard, AdminCardContent, AdminCardDescription, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import { AdminButton } from "@/components/admin";
import { Download, FileText, FileSpreadsheet, ClipboardList } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Row = {
  zone_name: string;
  unit_name: string;
  bed_configuration: string | null;
  sleeps_max: number | null;
  guest_name: string;
  email: string;
  phone: string;
  company: string;
  assignee_type: string;
  notes: string;
  ticket_type: string;
  payment_status: string;
  assignment_status: string;
};

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function LodgingManifestExport() {
  const [busy, setBusy] = useState<"pdf" | "csv" | null>(null);

  const { data: rows, isLoading } = useAuthQuery({
    queryKey: ["lodging-manifest-export"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("lodging_bookings")
        .select(`
          email, assignee_name, assignee_company, assignee_type, notes,
          payment_status, assignment_status,
          accommodation_zones!lodging_bookings_zone_key_fkey(zone_name),
          accommodation_units!lodging_bookings_assigned_unit_id_fkey(unit_name, bed_configuration, sleeps_max),
          registrations!lodging_bookings_registration_id_fkey(name, phone, ticket_type)
        `)
        .in("payment_status", ["paid", "comp", "completed"]);
      if (error) throw error;
      const mapped: Row[] = (data ?? []).map((b: any) => ({
        zone_name: b.accommodation_zones?.zone_name ?? "(unassigned zone)",
        unit_name: b.accommodation_units?.unit_name ?? "(unassigned)",
        bed_configuration: b.accommodation_units?.bed_configuration ?? null,
        sleeps_max: b.accommodation_units?.sleeps_max ?? null,
        guest_name: (b.assignee_name?.trim() || b.registrations?.name || "").trim(),
        email: b.email ?? "",
        phone: b.registrations?.phone ?? "",
        company: b.assignee_company ?? "",
        assignee_type: b.assignee_type ?? "",
        notes: b.notes ?? "",
        ticket_type: b.registrations?.ticket_type ?? "",
        payment_status: b.payment_status ?? "",
        assignment_status: b.assignment_status ?? "",
      }));
      mapped.sort((a, b) =>
        a.zone_name.localeCompare(b.zone_name) ||
        a.unit_name.localeCompare(b.unit_name, undefined, { numeric: true }) ||
        a.guest_name.localeCompare(b.guest_name)
      );
      return mapped;
    },
    staleTime: 30 * 1000,
  });

  const grouped = useMemo(() => {
    const m = new Map<string, Row[]>();
    (rows ?? []).forEach((r) => {
      const k = r.zone_name;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    });
    return [...m.entries()];
  }, [rows]);

  const today = new Date().toISOString().slice(0, 10);
  const baseName = `analog-commons-2026-lodging-manifest-${today}`;

  function downloadCSV() {
    if (!rows?.length) return;
    setBusy("csv");
    try {
      const headers = ["Zone","Unit","Bed Config","Sleeps","Guest","Email","Phone","Company","Type","Payment","Assignment","Ticket","Notes"];
      const lines = [headers.join(",")];
      rows.forEach((r) => {
        lines.push([
          r.zone_name, r.unit_name, r.bed_configuration ?? "", r.sleeps_max ?? "",
          r.guest_name, r.email, r.phone, r.company, r.assignee_type,
          r.payment_status, r.assignment_status, r.ticket_type, r.notes,
        ].map(csvEscape).join(","));
      });
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${baseName}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(null);
    }
  }

  function downloadPDF() {
    if (!rows?.length) return;
    setBusy("pdf");
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
      const pageW = doc.internal.pageSize.getWidth();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("Cosmico 2026 — On-Site Lodging Manifest", 32, 36);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(120);
      const stamp = new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
      doc.text(`Generated ${stamp} · ${rows.length} bookings · Example Meadow`, 32, 52);
      doc.setTextColor(0);

      let y = 72;
      grouped.forEach(([zone, items]) => {
        if (y > 480) { doc.addPage(); y = 48; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text(`${zone} (${items.length})`, 32, y);
        y += 6;
        autoTable(doc, {
          startY: y + 2,
          head: [["Unit","Bed Config","Sleeps","Guest","Email","Phone","Type","Notes"]],
          body: items.map((r) => [
            r.unit_name,
            r.bed_configuration ?? "—",
            r.sleeps_max?.toString() ?? "—",
            r.guest_name || "—",
            r.email,
            r.phone || "—",
            r.assignee_type,
            r.notes || "",
          ]),
          margin: { left: 32, right: 32 },
          styles: { fontSize: 8, cellPadding: 4, valign: "top", overflow: "linebreak" },
          headStyles: { fillColor: [17, 17, 17], textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [245, 243, 238] },
          columnStyles: {
            0: { cellWidth: 50 },
            1: { cellWidth: 110 },
            2: { cellWidth: 40 },
            3: { cellWidth: 130 },
            4: { cellWidth: 170 },
            5: { cellWidth: 80 },
            6: { cellWidth: 50 },
            7: { cellWidth: pageW - 64 - 50 - 110 - 40 - 130 - 170 - 80 - 50 },
          },
        });
        // @ts-expect-error lastAutoTable provided by plugin
        y = (doc.lastAutoTable?.finalY ?? y) + 18;
      });

      doc.save(`${baseName}.pdf`);
    } finally {
      setBusy(null);
    }
  }

  const count = rows?.length ?? 0;

  return (
    <AdminCard>
      <AdminCardHeader icon={ClipboardList}>
        <AdminCardTitle>Venue Manifest</AdminCardTitle>
        <AdminCardDescription>
          One-click export of all paid &amp; comp on-site lodging bookings, grouped by zone and unit. Share with Example Meadow.
        </AdminCardDescription>
      </AdminCardHeader>
      <AdminCardContent className="pt-0 space-y-4">
        <div className="text-sm text-[hsl(var(--admin-text-muted))]">
          {isLoading ? "Loading bookings…" : `${count} booking${count === 1 ? "" : "s"} ready to export.`}
        </div>
        <div className="flex flex-wrap gap-3">
          <AdminButton onClick={downloadPDF} disabled={!count || busy !== null}>
            <FileText className="h-4 w-4" />
            {busy === "pdf" ? "Building PDF…" : "Download PDF"}
          </AdminButton>
          <AdminButton variant="outline" onClick={downloadCSV} disabled={!count || busy !== null}>
            <FileSpreadsheet className="h-4 w-4" />
            {busy === "csv" ? "Building CSV…" : "Download CSV"}
          </AdminButton>
          <span className="inline-flex items-center gap-1 text-xs text-[hsl(var(--admin-text-muted))]">
            <Download className="h-3.5 w-3.5" />
            Files save to your Downloads folder
          </span>
        </div>
      </AdminCardContent>
    </AdminCard>
  );
}
