import { format, parseISO } from "date-fns";
import { ArtistOffer } from "./types";

interface ExportOptions {
  format: 'csv' | 'print' | 'json';
  includeFinancials: boolean;
  onlyConfirmed: boolean;
}

export const exportArtistSchedule = (
  offers: ArtistOffer[],
  eventTitle: string,
  options: Partial<ExportOptions> = {}
) => {
  const { format: exportFormat = 'csv', includeFinancials = false, onlyConfirmed = false } = options;

  let filteredOffers = offers;
  if (onlyConfirmed) {
    filteredOffers = offers.filter(o => o.status === 'accepted');
  }

  // Sort by date and time
  filteredOffers.sort((a, b) => {
    const dateA = a.performance_date ? Date.parse(a.performance_date) : Number.MAX_SAFE_INTEGER;
    const dateB = b.performance_date ? Date.parse(b.performance_date) : Number.MAX_SAFE_INTEGER;
    if (dateA !== dateB) return dateA - dateB;
    return (a.set_time || '').localeCompare(b.set_time || '');
  });

  if (exportFormat === 'csv') {
    exportAsCSV(filteredOffers, eventTitle, includeFinancials);
  } else if (exportFormat === 'print') {
    openPrintableSchedule(filteredOffers, eventTitle);
  } else if (exportFormat === 'json') {
    exportAsJSON(filteredOffers, eventTitle);
  }
};

const exportAsCSV = (offers: ArtistOffer[], eventTitle: string, includeFinancials: boolean) => {
  const headers = ['Date', 'Day', 'Set Time', 'Artist', 'Stage', 'Duration (min)', 'Status'];
  if (includeFinancials) {
    headers.push('Offer Amount');
  }

  const rows = offers.map(offer => {
    const row = [
      offer.performance_date ? format(parseISO(offer.performance_date), 'yyyy-MM-dd') : 'TBD',
      offer.performance_date ? format(parseISO(offer.performance_date), 'EEEE') : '',
      offer.set_time || 'TBD',
      offer.artist_name,
      offer.stage || 'TBD',
      offer.set_length_minutes?.toString() || '',
      offer.status,
    ];
    if (includeFinancials) {
      row.push(offer.offer_amount?.toString() || '');
    }
    return row;
  });

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${eventTitle.replace(/\s+/g, '-')}-artist-schedule.csv`;
  link.click();
};

const exportAsJSON = (offers: ArtistOffer[], eventTitle: string) => {
  const data = {
    event: eventTitle,
    exportedAt: new Date().toISOString(),
    artists: offers.map(offer => ({
      name: offer.artist_name,
      date: offer.performance_date,
      time: offer.set_time,
      stage: offer.stage,
      duration: offer.set_length_minutes,
      status: offer.status,
    })),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${eventTitle.replace(/\s+/g, '-')}-artist-schedule.json`;
  link.click();
};

const openPrintableSchedule = (offers: ArtistOffer[], eventTitle: string) => {
  // Group by date
  const byDate = new Map<string, ArtistOffer[]>();
  offers.forEach(offer => {
    const date = offer.performance_date || 'TBD';
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(offer);
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${eventTitle} - Run of Show</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          padding: 40px;
          max-width: 1000px;
          margin: 0 auto;
        }
        h1 { 
          font-size: 28px; 
          margin-bottom: 8px;
          border-bottom: 3px solid #000;
          padding-bottom: 12px;
        }
        .subtitle { 
          color: #666; 
          margin-bottom: 32px;
          font-size: 14px;
        }
        .day-section {
          margin-bottom: 32px;
          page-break-inside: avoid;
        }
        .day-header {
          background: #f3f4f6;
          padding: 12px 16px;
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 8px;
          border-radius: 4px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th {
          text-align: left;
          padding: 8px 12px;
          font-size: 12px;
          text-transform: uppercase;
          color: #666;
          border-bottom: 2px solid #e5e7eb;
        }
        td {
          padding: 12px;
          border-bottom: 1px solid #e5e7eb;
          vertical-align: top;
        }
        .artist-name { font-weight: 600; }
        .time { font-family: monospace; font-size: 14px; }
        .stage { 
          display: inline-block;
          padding: 2px 8px;
          background: #e5e7eb;
          border-radius: 4px;
          font-size: 12px;
        }
        .status {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11px;
          text-transform: uppercase;
        }
        .status-accepted { background: #d1fae5; color: #065f46; }
        .status-sent { background: #dbeafe; color: #1e40af; }
        .status-draft { background: #f3f4f6; color: #374151; }
        @media print {
          body { padding: 20px; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <h1>${eventTitle}</h1>
      <p class="subtitle">Run of Show • Generated ${format(new Date(), 'MMMM d, yyyy h:mm a')}</p>
      
      <button class="no-print" onclick="window.print()" style="margin-bottom: 20px; padding: 10px 20px; cursor: pointer;">
        Print Schedule
      </button>
      
      ${Array.from(byDate.entries()).map(([date, dayOffers]) => `
        <div class="day-section">
          <div class="day-header">
            ${date !== 'TBD' ? format(parseISO(date), 'EEEE, MMMM d, yyyy') : 'Date TBD'}
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 100px;">Time</th>
                <th>Artist</th>
                <th style="width: 120px;">Stage</th>
                <th style="width: 80px;">Duration</th>
                <th style="width: 100px;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${dayOffers.map(offer => `
                <tr>
                  <td class="time">${offer.set_time || 'TBD'}</td>
                  <td class="artist-name">${offer.artist_name}</td>
                  <td><span class="stage">${offer.stage || 'TBD'}</span></td>
                  <td>${offer.set_length_minutes ? `${offer.set_length_minutes} min` : '—'}</td>
                  <td><span class="status status-${offer.status}">${offer.status === 'accepted' ? 'Confirmed' : offer.status}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `).join('')}
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  }
};

export default exportArtistSchedule;
