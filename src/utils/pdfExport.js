import { jsPDF } from 'jspdf';

const margin = 16;
const lineHeight = 5.2;

const toText = (value) => {
  if (Array.isArray(value)) {
    return value.join(', ');
  }

  if (value === null || value === undefined || value === '') {
    return 'N/A';
  }

  return String(value);
};

const getCellValue = (row, column) => {
  if (typeof column.accessor === 'function') {
    return column.accessor(row);
  }

  return row[column.accessor || column.header];
};

const drawPageNumbers = (doc) => {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(95, 105, 117);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
  }
};

export const exportStructuredPdf = ({
  filename,
  title,
  subtitle = '',
  orientation = 'portrait',
  meta = [],
  summary = [],
  sections = [],
}) => {
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (height, onNewPage) => {
    if (y + height <= pageHeight - margin) {
      return;
    }

    doc.addPage();
    y = margin;

    if (onNewPage) {
      onNewPage();
    }
  };

  doc.setProperties({ title });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(49, 93, 155);
  doc.text(title, margin, y);
  y += 8;

  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(75, 85, 99);
    doc.text(doc.splitTextToSize(subtitle, usableWidth), margin, y);
    y += 9;
  }

  if (meta.length > 0) {
    doc.setFontSize(9);
    meta.forEach((item) => {
      doc.setTextColor(95, 105, 117);
      doc.text(`${item.label}:`, margin, y);
      doc.setTextColor(17, 24, 39);
      doc.text(toText(item.value), margin + 30, y);
      y += 5;
    });
    y += 4;
  }

  if (summary.length > 0) {
    const gap = 4;
    const cardCount = Math.min(summary.length, orientation === 'landscape' ? 4 : 3);
    const cardWidth = (usableWidth - gap * (cardCount - 1)) / cardCount;
    const cardHeight = 22;

    ensureSpace(cardHeight + 8);
    summary.forEach((item, index) => {
      const row = Math.floor(index / cardCount);
      const column = index % cardCount;
      const x = margin + column * (cardWidth + gap);
      const cardY = y + row * (cardHeight + gap);

      doc.setFillColor(240, 243, 247);
      doc.roundedRect(x, cardY, cardWidth, cardHeight, 2.5, 2.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(95, 105, 117);
      doc.text(String(item.label).toUpperCase(), x + 4, cardY + 7);
      doc.setFontSize(13);
      doc.setTextColor(49, 93, 155);
      doc.text(toText(item.value), x + 4, cardY + 16);
    });
    y += Math.ceil(summary.length / cardCount) * (cardHeight + gap) + 4;
  }

  const drawTable = (section) => {
    const columns = section.columns || [];
    const rows = section.rows || [];

    if (columns.length === 0) {
      return;
    }

    const widthUnits = columns.reduce((total, column) => total + (column.width || 1), 0);
    const widths = columns.map((column) => (usableWidth * (column.width || 1)) / widthUnits);
    const headerHeight = 9;

    const drawSectionHeader = () => {
      if (section.title) {
        ensureSpace(14);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(17, 24, 39);
        doc.text(section.title, margin, y);
        y += 7;
      }

      ensureSpace(headerHeight);
      doc.setFillColor(49, 93, 155);
      doc.rect(margin, y, usableWidth, headerHeight, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);

      let x = margin;
      columns.forEach((column, index) => {
        doc.text(String(column.header).toUpperCase(), x + 2, y + 6);
        x += widths[index];
      });
      y += headerHeight;
    };

    drawSectionHeader();

    const visibleRows = rows.length ? rows : [{ empty: section.emptyMessage || 'No records available.' }];
    visibleRows.forEach((row, rowIndex) => {
      const wrappedCells = columns.map((column, index) => {
        const value = row.empty ? (index === 0 ? row.empty : '') : getCellValue(row, column);
        return doc.splitTextToSize(toText(value), Math.max(8, widths[index] - 4));
      });
      const rowHeight = Math.max(10, Math.max(...wrappedCells.map((cell) => cell.length)) * lineHeight + 4);

      ensureSpace(rowHeight, drawSectionHeader);

      doc.setFillColor(rowIndex % 2 === 0 ? 255 : 247, rowIndex % 2 === 0 ? 255 : 249, rowIndex % 2 === 0 ? 255 : 252);
      doc.rect(margin, y, usableWidth, rowHeight, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(17, 24, 39);

      let x = margin;
      wrappedCells.forEach((cell, index) => {
        doc.text(cell, x + 2, y + 6);
        x += widths[index];
      });
      y += rowHeight;
    });

    y += 8;
  };

  sections.forEach(drawTable);
  drawPageNumbers(doc);
  doc.save(filename);
};
