import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface PdfColumn {
  header: string;
  key: string;
  align?: 'left' | 'center' | 'right';
  width?: string;
  format?: (value: any, row: any) => string;
}

export interface PdfExportOptions {
  moduleName?: string;
  title: string;
  subtitle?: string;
  dateRange?: string;
  columns: PdfColumn[];
  data: any[];
  summaryCards?: { label: string; value: string }[];
  summaryRows?: { [key: string]: string | number }[];
  orientation?: 'portrait' | 'landscape';
}

/**
 * Generates the requested filename format: "Sales (date and time)" or "Module Name (date and time)"
 * Uses dots/dashes for time to remain 100% compliant with Windows/Mac/Linux filesystem rules.
 * Example: "Sales (08-Oct-2026 12.15 PM)"
 */
export const formatPdfFilename = (moduleName: string, date: Date = new Date()): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = pad(date.getDate());
  const month = date.toLocaleString('en-US', { month: 'short' });
  const year = date.getFullYear();
  let hours = date.getHours();
  const minutes = pad(date.getMinutes());
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const strHours = pad(hours);
  const timeStr = `${strHours}.${minutes} ${ampm}`;
  const cleanModuleName = moduleName.replace(/[<>:"/\\|?*]/g, '').trim();
  return `${cleanModuleName} (${day}-${month}-${year} ${timeStr})`;
};

/**
 * Sanitizes strings for standard PDF fonts (replaces Bengali currency symbol ৳ with Tk)
 * and removes unnecessary trailing zeros (.00 -> '', .50 -> .5).
 */
const cleanPdfText = (str: string): string => {
  if (!str) return '';
  return String(str)
    .replace(/৳/g, 'Tk ')
    .replace(/(\.\d*?[1-9])0+\b/g, '$1')
    .replace(/\.00\b/g, '');
};

export const exportTableToPdf = (options: PdfExportOptions) => {
  const {
    moduleName = 'Sales',
    title,
    subtitle = 'Blue Dream ',
    dateRange,
    columns,
    data,
    summaryCards = [],
    orientation = 'landscape'
  } = options;

  const pdfBaseName = formatPdfFilename(moduleName);
  const fileName = `${pdfBaseName}.pdf`;

  // Create jsPDF document
  const doc = new jsPDF({
    orientation: orientation,
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 28;

  // Header Colors & Styling
  // Top decorative brand bar
  doc.setFillColor(29, 78, 216); // Royal Blue (#1d4ed8)
  doc.rect(margin, 20, pageWidth - margin * 2, 3, 'F');

  // Brand Name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(29, 78, 216);
  doc.text('Blue Dream', margin, 42);

  // Brand Tagline
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139); // Slate-500
  doc.text(subtitle.toUpperCase(), margin, 52);

  // Document Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42); // Slate-900
  doc.text(title, margin, 68);

  // Date Range / Period if available
  if (dateRange) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(2, 132, 199); // Sky-600
    doc.text(`Period: ${dateRange}`, margin, 80);
  }

  // Right Meta Info
  const now = new Date();
  const genDateStr = now.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
  const genTimeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Generated: ${genDateStr} ${genTimeStr}`, pageWidth - margin, 42, { align: 'right' });
  doc.text(`Total Records: ${data.length}`, pageWidth - margin, 53, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(29, 78, 216);
  doc.text('CONFIDENTIAL & PROPRIETARY', pageWidth - margin, 65, { align: 'right' });

  let currentY = dateRange ? 90 : 80;

  // Summary KPI Cards
  if (summaryCards && summaryCards.length > 0) {
    const cardGap = 8;
    const totalCardsWidth = pageWidth - margin * 2;
    const cardWidth = (totalCardsWidth - (summaryCards.length - 1) * cardGap) / summaryCards.length;
    const cardHeight = 32;

    summaryCards.forEach((card, i) => {
      const cardX = margin + i * (cardWidth + cardGap);

      // Card background
      doc.setFillColor(248, 250, 252); // Slate-50
      doc.setDrawColor(226, 232, 240); // Slate-200
      doc.roundedRect(cardX, currentY, cardWidth, cardHeight, 3, 3, 'FD');

      // Card Label
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(card.label.toUpperCase(), cardX + 6, currentY + 11);

      // Card Value
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(cleanPdfText(String(card.value)), cardX + 6, currentY + 24);
    });

    currentY += cardHeight + 12;
  }

  // Build Table Headers and Rows
  const tableHeaders = ['#', ...columns.map(col => col.header)];

  const tableBody = data.map((row, index) => {
    const rowValues = columns.map(col => {
      if (col.format) {
        return cleanPdfText(col.format(row[col.key], row));
      }
      const val = row[col.key];
      return val !== undefined && val !== null ? cleanPdfText(String(val)) : '-';
    });
    return [String(index + 1), ...rowValues];
  });

  // Prepare column styles alignment
  const columnStyles: { [key: number]: any } = {
    0: { halign: 'center', cellWidth: 24 }, // Row number
  };

  columns.forEach((col, idx) => {
    columnStyles[idx + 1] = {
      halign: col.align || 'left',
    };
  });

  // Render Table with autoTable
  autoTable(doc, {
    startY: currentY,
    head: [tableHeaders],
    body: tableBody.length > 0 ? tableBody : [['-', ...columns.map(() => 'No records found')]],
    theme: 'grid',
    headStyles: {
      fillColor: [29, 78, 216], // Brand Royal Blue
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: 4.5,
      halign: 'left',
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 4,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
      overflow: 'linebreak',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: columnStyles,
    margin: { left: margin, right: margin, bottom: 30 },
    didDrawPage: (dataObj) => {
      // Footer on every page
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184); // Slate-400

      // Left Footer
      doc.text('Blue Dream POS Enterprise System', margin, pageHeight - 12);

      // Center Footer (Filename)
      doc.text(pdfBaseName, pageWidth / 2, pageHeight - 12, { align: 'center' });

      // Right Footer (Page Number)
      const pageStr = `Page ${dataObj.pageNumber}`;
      doc.text(pageStr, pageWidth - margin, pageHeight - 12, { align: 'right' });
    }
  });

  // Download the PDF directly with the exact format: "Sales (Date and time).pdf"
  doc.save(fileName);
};
