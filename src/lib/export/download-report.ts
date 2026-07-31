/**
 * Client-side report downloads: professional print PDF (jsPDF) and Excel (.xlsx via ExcelJS).
 */

import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type ExcelJS from 'exceljs';
import type { Client, Transaction } from '@/lib/mock-data';
import { resolveCounterpartyDisplay } from '@/lib/clients/display';
import { isExpenseType, isRevenueType } from '@/lib/finance/summary';

export type ReportKV = { label: string; value: string };

export type ReportTable = {
  title: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
};

export type ReportChartImage = {
  title: string;
  dataUrl: string;
  /** Optional legend / series key caption under the image (SVG fallback). */
  caption?: string;
};

/** Structured AI Data Analysis block embedded in PDF/Excel exports. */
export type ReportAiAnalysis = {
  periodLabel: string;
  confidenceLabel: string;
  sourceLabel: string;
  generatedAtLabel: string;
  summaryRows: ReportKV[];
  narrativeSections: Array<{
    title: string;
    paragraphs: string[];
    bullets: string[];
  }>;
  confidenceNote: string | null;
  findingsTable: ReportTable;
  metricsTable: ReportTable;
};

/** Page context used to resolve / fetch AI analysis during export. */
export type ReportAiScope = {
  walletId?: string | null;
  page?: string;
  sectionType?: string;
  sectionTitle?: string;
  asset?: string;
  network?: string;
  counterparty?: string;
  typeId?: string;
  period?: string | number;
  filters?: Record<string, string | number | boolean | null>;
  includeHidden?: boolean;
};

export type ReportPayload = {
  title: string;
  subtitle?: string;
  filenameBase: string;
  summary: ReportKV[];
  tables: ReportTable[];
  /** Optional chart screenshots (PNG data URLs) rendered below summary. */
  charts?: ReportChartImage[];
  /** Pre-built AI analysis section (set by enrichReportPayloadWithAi). */
  aiAnalysis?: ReportAiAnalysis | null;
  /** When set, download helpers fetch/cache AI analysis for this page scope. */
  aiScope?: ReportAiScope | null;
};

export type TransactionReportOpts = {
  title: string;
  subtitle?: string;
  filenameBase: string;
  transactions: Transaction[];
  /** Named clients for counterparty display in export rows. */
  clients?: Client[];
  /** Extra summary rows prepended before auto totals. */
  extraSummary?: ReportKV[];
  charts?: ReportChartImage[];
  aiScope?: ReportAiScope | null;
};

export type PdfReportOpts = {
  title: string;
  subtitle?: string;
  summaryRows: ReportKV[];
  tables: ReportTable[];
  filename: string;
  charts?: ReportChartImage[];
  aiAnalysis?: ReportAiAnalysis | null;
};

export type ExcelSheet = {
  name: string;
  summaryRows?: ReportKV[];
  table?: ReportTable;
  /** Extra free-form rows appended after summary/table (optional). */
  extraRows?: (string | number | null | undefined)[][];
};

export type ExcelReportOpts = {
  title: string;
  subtitle?: string;
  /** One or more sheets. If omitted, builds a single sheet from summaryRows + tables. */
  sheets?: ExcelSheet[];
  summaryRows?: ReportKV[];
  tables?: ReportTable[];
  filename: string;
  /** Optional chart screenshots (PNG data URLs) embedded on a Charts sheet. */
  charts?: ReportChartImage[];
  aiAnalysis?: ReportAiAnalysis | null;
};

/** Print-friendly light palette (not a dark UI clone). */
const PDF = {
  page: [255, 255, 255] as [number, number, number],
  pageAlt: [250, 251, 252] as [number, number, number],
  text: [17, 24, 39] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  accent: [0, 82, 255] as [number, number, number],
  line: [226, 232, 240] as [number, number, number],
  rule: [0, 82, 255] as [number, number, number],
  head: [0, 82, 255] as [number, number, number],
  headText: [255, 255, 255] as [number, number, number],
  surface: [248, 250, 252] as [number, number, number],
  alt: [241, 245, 249] as [number, number, number],
  cardBorder: [226, 232, 240] as [number, number, number],
};

const MARGIN = 16;
const HEADER_CONT_H = 22;
const FOOTER_H = 14;

function cellToString(value: string | number | null | undefined): string {
  if (value == null) return '';
  return String(value);
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function formatUsd(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function ensureExt(filename: string, ext: '.pdf' | '.xlsx'): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(ext)) return filename;
  return `${filename}${ext}`;
}

function formatGeneratedAt(date = new Date()): string {
  return date.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

type DocWithAutoTable = jsPDF & {
  lastAutoTable?: { finalY: number };
};

function lastTableY(doc: jsPDF, fallback: number): number {
  return (doc as DocWithAutoTable).lastAutoTable?.finalY ?? fallback;
}

function paintPageBackground(doc: jsPDF): void {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  doc.setFillColor(...PDF.page);
  doc.rect(0, 0, w, h, 'F');
}

/** Draw brand mark: blue rounded square + RADAREUM wordmark. */
function drawBrandMark(doc: jsPDF, x: number, y: number): number {
  const size = 7;
  doc.setFillColor(...PDF.accent);
  doc.roundedRect(x, y - size + 1.2, size, size, 1.2, 1.2, 'F');

  // Simple white chevron mark inside the badge
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.55);
  doc.setLineCap('round');
  doc.setLineJoin('round');
  const cx = x + size / 2;
  const cy = y - size / 2 + 1.2;
  doc.line(cx - 1.6, cy + 0.2, cx, cy - 1.5);
  doc.line(cx, cy - 1.5, cx + 1.6, cy + 0.2);
  doc.line(cx - 1.6, cy + 1.4, cx + 1.6, cy + 1.4);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...PDF.accent);
  doc.text('RADAREUM', x + size + 2.5, y);

  return size + 2.5 + doc.getTextWidth('RADAREUM');
}

export type DrawReportHeaderOpts = {
  title: string;
  subtitle?: string;
  generatedAt: string;
  /** Compact header for continuation pages (brand + title only). */
  compact?: boolean;
};

/**
 * Shared report header: brand mark, title, optional subtitle, generated-at, accent rule.
 * Returns Y position below the header for content.
 */
export function drawReportHeader(doc: jsPDF, opts: DrawReportHeaderOpts): number {
  const pageW = doc.internal.pageSize.getWidth();
  const right = pageW - MARGIN;
  let y = MARGIN + 2;

  paintPageBackground(doc);

  if (opts.compact) {
    drawBrandMark(doc, MARGIN, y + 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...PDF.muted);
    doc.text(opts.title, right, y + 4, { align: 'right' });

    y += 8;
    doc.setDrawColor(...PDF.rule);
    doc.setLineWidth(0.45);
    doc.line(MARGIN, y, right, y);
    return y + 6;
  }

  drawBrandMark(doc, MARGIN, y + 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...PDF.muted);
  doc.text(`Generated ${opts.generatedAt}`, right, y + 4, { align: 'right' });

  y += 12;
  doc.setDrawColor(...PDF.rule);
  doc.setLineWidth(0.55);
  doc.line(MARGIN, y, right, y);

  y += 9;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...PDF.text);
  const titleLines = doc.splitTextToSize(opts.title, pageW - MARGIN * 2);
  doc.text(titleLines, MARGIN, y);
  y += titleLines.length * 7;

  if (opts.subtitle) {
    y += 1;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...PDF.muted);
    const subLines = doc.splitTextToSize(opts.subtitle, pageW - MARGIN * 2);
    doc.text(subLines, MARGIN, y);
    y += subLines.length * 4.2 + 2;
  }

  y += 3;
  doc.setDrawColor(...PDF.line);
  doc.setLineWidth(0.25);
  doc.line(MARGIN, y, right, y);

  return y + 6;
}

function drawPageFooter(doc: jsPDF, pageNumber: number, pageCount: number): void {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const y = pageH - 8;

  doc.setDrawColor(...PDF.line);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y - 4, pageW - MARGIN, y - 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...PDF.muted);
  doc.text('Radareum', MARGIN, y);
  doc.text(`Page ${pageNumber} of ${pageCount}`, pageW - MARGIN, y, { align: 'right' });
}

function ensureSpace(doc: jsPDF, y: number, needed: number, headerOpts: DrawReportHeaderOpts): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + needed <= pageH - FOOTER_H - 4) return y;
  doc.addPage();
  return drawReportHeader(doc, { ...headerOpts, compact: true });
}

function drawSummarySection(
  doc: jsPDF,
  startY: number,
  rows: ReportKV[],
  headerOpts: DrawReportHeaderOpts,
): number {
  let y = ensureSpace(doc, startY, 28, headerOpts);
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - MARGIN * 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...PDF.text);
  doc.text('Summary', MARGIN, y);
  y += 5;

  const summary =
    rows.length > 0 ? rows : [{ label: 'Status', value: 'No summary data' }];

  // Two-column card grid
  const gap = 3;
  const colW = (contentW - gap) / 2;
  const cardH = 14;
  let col = 0;
  let rowY = y;

  for (const item of summary) {
    if (col === 0) {
      rowY = ensureSpace(doc, rowY, cardH + 2, headerOpts);
    }

    const x = MARGIN + col * (colW + gap);

    doc.setFillColor(...PDF.surface);
    doc.setDrawColor(...PDF.cardBorder);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, rowY, colW, cardH, 1.5, 1.5, 'FD');

    // Accent bar on left of card
    doc.setFillColor(...PDF.accent);
    doc.rect(x, rowY, 0.9, cardH, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF.muted);
    doc.text(item.label, x + 4, rowY + 5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...PDF.text);
    const valueLines = doc.splitTextToSize(item.value, colW - 8);
    doc.text(valueLines[0] ?? '', x + 4, rowY + 10.5);

    col += 1;
    if (col >= 2) {
      col = 0;
      rowY += cardH + gap;
    }
  }

  if (col !== 0) {
    rowY += cardH + gap;
  }

  return rowY + 4;
}

function drawChartsSection(
  doc: jsPDF,
  startY: number,
  charts: ReportChartImage[],
  headerOpts: DrawReportHeaderOpts,
): number {
  if (!charts.length) return startY;

  let y = startY;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - MARGIN * 2;
  // Prefer natural aspect ratio; allow tall cards (title + stats + plot + legend)
  // up to ~70% of page content height before forcing a page break.
  const maxH = Math.max(140, pageH - HEADER_CONT_H - FOOTER_H - 40);

  for (const chart of charts) {
    if (!chart.dataUrl?.startsWith('data:image')) continue;

    y = ensureSpace(doc, y, 20, headerOpts);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...PDF.text);
    doc.text(chart.title || 'Chart', MARGIN, y);
    y += 4;

    const imgW = contentW;
    let imgH = 120;

    try {
      const props = doc.getImageProperties(chart.dataUrl);
      if (props.width > 0 && props.height > 0) {
        // Fit width; do not crush height below natural aspect (cap only by page)
        imgH = (imgW * props.height) / props.width;
        if (imgH > maxH) {
          imgH = maxH;
        }
      }
    } catch {
      imgH = 120;
    }

    const captionLines = chart.caption
      ? doc.splitTextToSize(chart.caption, contentW - 4)
      : [];
    const captionH = captionLines.length > 0 ? 3 + captionLines.length * 3.6 : 0;

    y = ensureSpace(doc, y, imgH + 8 + captionH, headerOpts);

    doc.setFillColor(...PDF.pageAlt);
    doc.setDrawColor(...PDF.cardBorder);
    doc.setLineWidth(0.2);
    doc.roundedRect(MARGIN, y, imgW, imgH + 4, 1.5, 1.5, 'FD');

    try {
      doc.addImage(chart.dataUrl, 'PNG', MARGIN + 2, y + 2, imgW - 4, imgH, undefined, 'FAST');
    } catch {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...PDF.muted);
      doc.text('Chart image could not be embedded.', MARGIN + 4, y + 10);
    }

    y += imgH + 6;

    if (captionLines.length > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...PDF.muted);
      doc.text(captionLines, MARGIN + 1, y + 2);
      y += captionH + 4;
    } else {
      y += 6;
    }
  }

  return y;
}

function drawDataTable(
  doc: jsPDF,
  startY: number,
  table: ReportTable,
  headerOpts: DrawReportHeaderOpts,
): number {
  let y = ensureSpace(doc, startY, 24, headerOpts);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...PDF.text);
  doc.text(table.title || 'Table', MARGIN, y);
  y += 3;

  const headers = table.headers.length > 0 ? table.headers : ['Note'];
  const body =
    table.rows.length > 0
      ? table.rows.map(row => row.map(cellToString))
      : [['No rows available for the current filters.']];

  autoTable(doc, {
    startY: y,
    head: [headers],
    body,
    theme: 'plain',
    margin: { top: HEADER_CONT_H + 4, left: MARGIN, right: MARGIN, bottom: FOOTER_H + 2 },
    styles: {
      font: 'helvetica',
      fontSize: 7,
      textColor: PDF.text,
      fillColor: PDF.page,
      lineColor: PDF.line,
      lineWidth: 0.15,
      cellPadding: 2.2,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: PDF.head,
      textColor: PDF.headText,
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    alternateRowStyles: { fillColor: PDF.alt },
    willDrawPage: (data: { pageNumber: number }) => {
      if (data.pageNumber > 1) {
        drawReportHeader(doc, { ...headerOpts, compact: true });
      }
    },
  });

  return lastTableY(doc, y) + 10;
}

function drawNarrativeBlock(
  doc: jsPDF,
  startY: number,
  title: string,
  paragraphs: string[],
  bullets: string[],
  headerOpts: DrawReportHeaderOpts,
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - MARGIN * 2;
  let y = ensureSpace(doc, startY, 16, headerOpts);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...PDF.text);
  doc.text(title, MARGIN, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF.text);

  for (const paragraph of paragraphs) {
    const lines = doc.splitTextToSize(paragraph, contentW);
    y = ensureSpace(doc, y, lines.length * 4 + 3, headerOpts);
    doc.text(lines, MARGIN, y);
    y += lines.length * 4 + 2.5;
  }

  for (const bullet of bullets) {
    const lines = doc.splitTextToSize(`• ${bullet}`, contentW - 3);
    y = ensureSpace(doc, y, lines.length * 4 + 2, headerOpts);
    doc.text(lines, MARGIN + 1, y);
    y += lines.length * 4 + 1.5;
  }

  return y + 2;
}

function drawAiAnalysisSection(
  doc: jsPDF,
  startY: number,
  analysis: ReportAiAnalysis,
  headerOpts: DrawReportHeaderOpts,
): number {
  let y = ensureSpace(doc, startY, 24, headerOpts);
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...PDF.text);
  doc.text('AI Data Analysis', MARGIN, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...PDF.muted);
  const meta = [
    analysis.periodLabel ? `Period: ${analysis.periodLabel}` : null,
    analysis.confidenceLabel || null,
    analysis.sourceLabel || null,
    analysis.generatedAtLabel ? `Analyzed ${analysis.generatedAtLabel}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  if (meta) {
    const metaLines = doc.splitTextToSize(meta, pageW - MARGIN * 2);
    doc.text(metaLines, MARGIN, y);
    y += metaLines.length * 3.8 + 3;
  }

  y = drawSummarySection(doc, y, analysis.summaryRows, headerOpts);

  for (const section of analysis.narrativeSections) {
    y = drawNarrativeBlock(
      doc,
      y,
      section.title,
      section.paragraphs,
      section.bullets,
      headerOpts,
    );
  }

  if (analysis.confidenceNote) {
    y = drawNarrativeBlock(doc, y, 'Confidence', [analysis.confidenceNote], [], headerOpts);
  }

  if (analysis.findingsTable.rows.length > 0) {
    y = drawDataTable(doc, y, analysis.findingsTable, headerOpts);
  }

  if (analysis.metricsTable.rows.length > 0) {
    y = drawDataTable(doc, y, analysis.metricsTable, headerOpts);
  }

  return y;
}

/** Generate a real PDF blob and trigger a direct .pdf download. */
export function downloadPdfReport(opts: PdfReportOpts): void {
  const filename = ensureExt(opts.filename, '.pdf');
  const generatedAt = formatGeneratedAt();

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const headerOpts: DrawReportHeaderOpts = {
    title: opts.title,
    subtitle: opts.subtitle,
    generatedAt,
  };

  let y = drawReportHeader(doc, headerOpts);

  y = drawSummarySection(doc, y, opts.summaryRows, headerOpts);

  if (opts.charts?.length) {
    y = drawChartsSection(doc, y, opts.charts, headerOpts);
  }

  if (opts.aiAnalysis) {
    y = drawAiAnalysisSection(doc, y, opts.aiAnalysis, headerOpts);
  }

  const tables =
    opts.tables.length > 0
      ? opts.tables
      : [
          {
            title: 'Data',
            headers: ['Note'],
            rows: [['No rows available for the current filters.']],
          },
        ];

  for (const table of tables) {
    y = drawDataTable(doc, y, table, headerOpts);
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    drawPageFooter(doc, i, pageCount);
  }

  const pdfBlob = doc.output('blob');
  downloadBlob(filename, new Blob([pdfBlob], { type: 'application/pdf' }));
}

const EXCEL = {
  accent: '0052FF',
  white: 'FFFFFF',
  text: '111827',
  muted: '64748B',
  altRow: 'F1F5F9',
  border: 'CBD5E1',
  thinBorder: {
    top: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
  },
};

function sheetNameSafe(name: string, used: Set<string>): string {
  let base = name.replace(/[\\/?*[\]]/g, ' ').trim().slice(0, 31) || 'Sheet';
  let candidate = base;
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${i})`;
    candidate = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    i += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function argb(hex6: string): string {
  return `FF${hex6.replace(/^#/, '').toUpperCase()}`;
}

function looksLikeMoneyHeader(header: string): boolean {
  return /\b(usd|price|value|amount|cost|fee|pnl|gain|loss|revenue|inflow|outflow|net|volume|balance)\b|\$/i.test(
    header,
  );
}

function tryParseMoney(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const hasMoneySignal =
    s.includes('$') || /^usd\b/i.test(s) || /\busd\b/i.test(s);
  if (!hasMoneySignal) return null;

  const parenNeg = /^\(.*\)$/.test(s);
  const cleaned = s.replace(/[^0-9.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return parenNeg && n > 0 ? -n : n;
}

function tryParsePlainNumber(raw: string): number | null {
  const s = raw.trim().replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function tryParseDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s || s.length < 8) return null;
  // Avoid treating hashes / ids as dates
  if (/^[0-9a-f]{16,}$/i.test(s)) return null;
  if (/^0x/i.test(s)) return null;

  // ISO / yyyy-mm-dd / yyyy/mm/dd
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s) || /^\d{1,2}[-/]\d{1,2}[-/]\d{4}/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime()) && d.getFullYear() >= 1970 && d.getFullYear() <= 2100) {
      return d;
    }
  }
  return null;
}

type ParsedExcelCell = {
  value: ExcelJS.CellValue;
  numFmt?: string;
};

function parseExcelCell(
  raw: string | number | null | undefined,
  header: string,
): ParsedExcelCell {
  if (raw == null || raw === '') return { value: null };
  if (typeof raw === 'number') {
    if (Number.isFinite(raw) && looksLikeMoneyHeader(header)) {
      return { value: raw, numFmt: '$#,##0.00' };
    }
    return { value: Number.isFinite(raw) ? raw : String(raw) };
  }

  const s = String(raw).trim();
  if (!s) return { value: null };

  const money = tryParseMoney(s);
  if (money != null) return { value: money, numFmt: '$#,##0.00' };

  if (looksLikeMoneyHeader(header)) {
    const asNum = tryParsePlainNumber(s);
    if (asNum != null) return { value: asNum, numFmt: '$#,##0.00' };
  }

  const plain = tryParsePlainNumber(s);
  if (plain != null) return { value: plain };

  const date = tryParseDate(s);
  if (date) return { value: date, numFmt: 'yyyy-mm-dd' };

  return { value: s };
}

function applyHeaderRowStyle(row: ExcelJS.Row, colCount: number): void {
  row.font = { bold: true, color: { argb: argb(EXCEL.white) }, name: 'Calibri', size: 11 };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: argb(EXCEL.accent) },
  };
  row.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  row.height = 22;
  for (let c = 1; c <= colCount; c += 1) {
    const cell = row.getCell(c);
    cell.border = EXCEL.thinBorder;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: argb(EXCEL.accent) },
    };
    cell.font = { bold: true, color: { argb: argb(EXCEL.white) }, name: 'Calibri', size: 11 };
  }
}

function autosizeColumns(
  sheet: ExcelJS.Worksheet,
  colCount: number,
  sampleRows: string[][],
): void {
  for (let c = 0; c < colCount; c += 1) {
    let maxLen = 8;
    for (const row of sampleRows) {
      const v = row[c] ?? '';
      maxLen = Math.max(maxLen, Math.min(String(v).length, 48));
    }
    sheet.getColumn(c + 1).width = Math.min(42, Math.max(10, maxLen + 2));
  }
}

function writeSummarySheet(
  wb: ExcelJS.Workbook,
  opts: {
    title: string;
    subtitle?: string;
    generatedAt: string;
    summaryRows: ReportKV[];
    name: string;
  },
): void {
  const sheet = wb.addWorksheet(opts.name, {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    properties: { defaultRowHeight: 18 },
  });

  // Brand header row
  sheet.mergeCells(1, 1, 1, 2);
  const brand = sheet.getCell(1, 1);
  brand.value = 'Radareum';
  brand.font = { bold: true, color: { argb: argb(EXCEL.white) }, name: 'Calibri', size: 16 };
  brand.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: argb(EXCEL.accent) },
  };
  brand.alignment = { vertical: 'middle', horizontal: 'left' };
  sheet.getRow(1).height = 28;
  sheet.getCell(1, 2).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: argb(EXCEL.accent) },
  };

  sheet.getCell(2, 1).value = 'Report';
  sheet.getCell(2, 1).font = { bold: true, color: { argb: argb(EXCEL.muted) }, size: 9 };
  sheet.getCell(2, 2).value = opts.title;
  sheet.getCell(2, 2).font = { bold: true, color: { argb: argb(EXCEL.text) }, size: 13 };

  let rowIdx = 3;
  if (opts.subtitle) {
    sheet.getCell(rowIdx, 1).value = 'Subtitle';
    sheet.getCell(rowIdx, 1).font = { color: { argb: argb(EXCEL.muted) }, size: 9 };
    sheet.getCell(rowIdx, 2).value = opts.subtitle;
    sheet.getCell(rowIdx, 2).font = { color: { argb: argb(EXCEL.text) }, size: 11 };
    rowIdx += 1;
  }

  sheet.getCell(rowIdx, 1).value = 'Generated';
  sheet.getCell(rowIdx, 1).font = { color: { argb: argb(EXCEL.muted) }, size: 9 };
  sheet.getCell(rowIdx, 2).value = opts.generatedAt;
  sheet.getCell(rowIdx, 2).font = { color: { argb: argb(EXCEL.text) }, size: 11 };
  rowIdx += 2;

  const headerRow = sheet.getRow(rowIdx);
  headerRow.getCell(1).value = 'Label';
  headerRow.getCell(2).value = 'Value';
  applyHeaderRowStyle(headerRow, 2);
  const tableStart = rowIdx;
  rowIdx += 1;

  const summary =
    opts.summaryRows.length > 0
      ? opts.summaryRows
      : [{ label: 'Status', value: 'No summary data' }];

  for (let i = 0; i < summary.length; i += 1) {
    const item = summary[i]!;
    const r = sheet.getRow(rowIdx);
    const labelCell = r.getCell(1);
    const valueCell = r.getCell(2);
    labelCell.value = item.label;
    labelCell.font = { color: { argb: argb(EXCEL.text) }, name: 'Calibri', size: 11 };
    labelCell.border = EXCEL.thinBorder;

    const parsed = parseExcelCell(item.value, item.label);
    valueCell.value = parsed.value;
    if (parsed.numFmt) valueCell.numFmt = parsed.numFmt;
    valueCell.font = { color: { argb: argb(EXCEL.text) }, name: 'Calibri', size: 11 };
    valueCell.border = EXCEL.thinBorder;

    if (i % 2 === 1) {
      labelCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: argb(EXCEL.altRow) },
      };
      valueCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: argb(EXCEL.altRow) },
      };
    }
    rowIdx += 1;
  }

  const tableEnd = rowIdx - 1;
  sheet.autoFilter = {
    from: { row: tableStart, column: 1 },
    to: { row: tableEnd, column: 2 },
  };

  autosizeColumns(sheet, 2, [
    ['Label', 'Value'],
    ...summary.map(s => [s.label, s.value]),
  ]);
  sheet.getColumn(1).width = Math.max(sheet.getColumn(1).width ?? 14, 18);
  sheet.getColumn(2).width = Math.max(sheet.getColumn(2).width ?? 20, 28);
}

const CHART_IMG_WIDTH_PX = 650;
const CHART_IMG_MAX_HEIGHT_PX = 480;
const EXCEL_ROW_HEIGHT_PX = 18;

function parseDataUrlImage(
  dataUrl: string,
): { extension: 'png' | 'jpeg' | 'gif'; base64: string } | null {
  const m = /^data:image\/(png|jpeg|jpg|gif);base64,(.+)$/i.exec(dataUrl.trim());
  if (!m?.[1] || !m[2]) return null;
  const kind = m[1].toLowerCase();
  const extension: 'png' | 'jpeg' | 'gif' =
    kind === 'png' ? 'png' : kind === 'gif' ? 'gif' : 'jpeg';
  return { extension, base64: m[2] };
}

function readPngSize(base64: string): { width: number; height: number } | null {
  try {
    // Need ≥24 decoded bytes (signature + IHDR length/type + width/height).
    // 32 base64 chars → 24 bytes; keep length divisible by 4 for atob.
    const chunk = base64.slice(0, 32);
    if (chunk.length < 32) return null;
    const binary = atob(chunk);
    if (binary.length < 24) return null;
    const bytes = new Uint8Array(24);
    for (let i = 0; i < 24; i += 1) bytes[i] = binary.charCodeAt(i);
    // PNG signature + IHDR chunk
    if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
      return null;
    }
    const width =
      ((bytes[16]! << 24) | (bytes[17]! << 16) | (bytes[18]! << 8) | bytes[19]!) >>> 0;
    const height =
      ((bytes[20]! << 24) | (bytes[21]! << 16) | (bytes[22]! << 8) | bytes[23]!) >>> 0;
    if (width > 0 && height > 0) return { width, height };
  } catch {
    return null;
  }
  return null;
}

function chartImageSize(base64: string, extension: 'png' | 'jpeg' | 'gif'): {
  width: number;
  height: number;
} {
  let width = CHART_IMG_WIDTH_PX;
  let height = 360;
  if (extension === 'png') {
    const natural = readPngSize(base64);
    if (natural && natural.width > 0) {
      height = Math.round((width * natural.height) / natural.width);
      if (height > CHART_IMG_MAX_HEIGHT_PX) {
        height = CHART_IMG_MAX_HEIGHT_PX;
        width = Math.round((height * natural.width) / natural.height);
      }
    }
  }
  return { width, height };
}

/** Embed chart PNGs on a dedicated Charts sheet (omitted when empty). */
function writeChartsSheet(
  wb: ExcelJS.Workbook,
  opts: {
    title: string;
    subtitle?: string;
    generatedAt: string;
    charts: ReportChartImage[];
    usedNames: Set<string>;
  },
): void {
  const charts = opts.charts.filter(c => c.dataUrl?.startsWith('data:image'));
  if (charts.length === 0) return;

  const sheet = wb.addWorksheet(sheetNameSafe('Charts', opts.usedNames), {
    views: [{ showGridLines: false }],
    properties: { defaultRowHeight: EXCEL_ROW_HEIGHT_PX },
  });
  sheet.getColumn(1).width = 22;
  sheet.getColumn(2).width = 72;

  sheet.mergeCells(1, 1, 1, 2);
  const brand = sheet.getCell(1, 1);
  brand.value = 'Radareum';
  brand.font = { bold: true, color: { argb: argb(EXCEL.white) }, name: 'Calibri', size: 16 };
  brand.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: argb(EXCEL.accent) },
  };
  brand.alignment = { vertical: 'middle', horizontal: 'left' };
  sheet.getRow(1).height = 28;
  sheet.getCell(1, 2).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: argb(EXCEL.accent) },
  };

  sheet.getCell(2, 1).value = 'Charts';
  sheet.getCell(2, 1).font = { bold: true, color: { argb: argb(EXCEL.muted) }, size: 9 };
  sheet.getCell(2, 2).value = opts.title;
  sheet.getCell(2, 2).font = { bold: true, color: { argb: argb(EXCEL.text) }, size: 13 };

  let rowIdx = 3;
  if (opts.subtitle) {
    sheet.getCell(rowIdx, 1).value = 'Subtitle';
    sheet.getCell(rowIdx, 1).font = { color: { argb: argb(EXCEL.muted) }, size: 9 };
    sheet.getCell(rowIdx, 2).value = opts.subtitle;
    sheet.getCell(rowIdx, 2).font = { color: { argb: argb(EXCEL.text) }, size: 11 };
    rowIdx += 1;
  }

  sheet.getCell(rowIdx, 1).value = 'Generated';
  sheet.getCell(rowIdx, 1).font = { color: { argb: argb(EXCEL.muted) }, size: 9 };
  sheet.getCell(rowIdx, 2).value = opts.generatedAt;
  sheet.getCell(rowIdx, 2).font = { color: { argb: argb(EXCEL.text) }, size: 11 };
  rowIdx += 2;

  for (const chart of charts) {
    const parsed = parseDataUrlImage(chart.dataUrl);
    if (!parsed) continue;

    const titleCell = sheet.getCell(rowIdx, 1);
    titleCell.value = chart.title || 'Chart';
    titleCell.font = {
      bold: true,
      color: { argb: argb(EXCEL.text) },
      name: 'Calibri',
      size: 12,
    };
    sheet.mergeCells(rowIdx, 1, rowIdx, 2);
    rowIdx += 1;

    const { width: imgW, height: imgH } = chartImageSize(parsed.base64, parsed.extension);
    const imageId = wb.addImage({
      base64: parsed.base64,
      extension: parsed.extension,
    });

    // tl anchors are 0-based (row 0 = Excel row 1)
    sheet.addImage(imageId, {
      tl: { col: 0, row: rowIdx - 1 },
      ext: { width: imgW, height: imgH },
      editAs: 'oneCell',
    });

    const rowsSpanned = Math.max(10, Math.ceil(imgH / EXCEL_ROW_HEIGHT_PX) + 1);
    rowIdx += rowsSpanned;

    if (chart.caption) {
      const captionCell = sheet.getCell(rowIdx, 1);
      captionCell.value = chart.caption;
      captionCell.font = {
        italic: true,
        color: { argb: argb(EXCEL.muted) },
        name: 'Calibri',
        size: 9,
      };
      sheet.mergeCells(rowIdx, 1, rowIdx, 2);
      rowIdx += 2;
    } else {
      rowIdx += 1;
    }
  }
}

function writeDataTableSheet(
  wb: ExcelJS.Workbook,
  name: string,
  table: ReportTable,
  extraRows?: (string | number | null | undefined)[][],
): void {
  const sheet = wb.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { defaultRowHeight: 18 },
  });

  const headers =
    table.headers.length > 0 ? table.headers.map(h => String(h)) : ['Note'];
  const colCount = headers.length;

  const headerRow = sheet.getRow(1);
  for (let c = 0; c < colCount; c += 1) {
    headerRow.getCell(c + 1).value = headers[c];
  }
  applyHeaderRowStyle(headerRow, colCount);

  const dataRows =
    table.rows.length > 0
      ? table.rows
      : [headers.map((_, i) => (i === 0 ? 'No data' : ''))];

  let rowIdx = 2;
  for (let r = 0; r < dataRows.length; r += 1) {
    const src = dataRows[r] ?? [];
    const excelRow = sheet.getRow(rowIdx);
    const alt = r % 2 === 1;

    for (let c = 0; c < colCount; c += 1) {
      const header = headers[c] ?? '';
      const cell = excelRow.getCell(c + 1);
      const parsed = parseExcelCell(src[c], header);
      cell.value = parsed.value;
      if (parsed.numFmt) cell.numFmt = parsed.numFmt;
      cell.font = { color: { argb: argb(EXCEL.text) }, name: 'Calibri', size: 10 };
      cell.border = EXCEL.thinBorder;
      cell.alignment = { vertical: 'middle' };
      if (alt) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: argb(EXCEL.altRow) },
        };
      }
    }
    rowIdx += 1;
  }

  if (extraRows?.length) {
    rowIdx += 1;
    for (const extra of extraRows) {
      const excelRow = sheet.getRow(rowIdx);
      for (let c = 0; c < Math.max(colCount, extra.length); c += 1) {
        const cell = excelRow.getCell(c + 1);
        const parsed = parseExcelCell(extra[c], headers[c] ?? '');
        cell.value = parsed.value;
        if (parsed.numFmt) cell.numFmt = parsed.numFmt;
        cell.font = { color: { argb: argb(EXCEL.muted) }, name: 'Calibri', size: 10 };
      }
      rowIdx += 1;
    }
  }

  const lastDataRow = Math.max(2, 1 + dataRows.length);
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: lastDataRow, column: colCount },
  };

  const samples: string[][] = [
    headers,
    ...dataRows.slice(0, 80).map(row =>
      headers.map((_, i) => (row[i] == null ? '' : String(row[i]))),
    ),
  ];
  autosizeColumns(sheet, colCount, samples);
}

function writeAiAnalysisSheets(
  wb: ExcelJS.Workbook,
  analysis: ReportAiAnalysis,
  usedNames: Set<string>,
): void {
  writeSummarySheet(wb, {
    title: 'AI Data Analysis',
    subtitle: [analysis.periodLabel, analysis.confidenceLabel, analysis.sourceLabel]
      .filter(Boolean)
      .join(' · '),
    generatedAt: analysis.generatedAtLabel || formatGeneratedAt(),
    summaryRows: analysis.summaryRows,
    name: sheetNameSafe('AI Analysis', usedNames),
  });

  const narrativeRows: (string | number | null | undefined)[][] = [];
  for (const section of analysis.narrativeSections) {
    narrativeRows.push([section.title, '']);
    for (const paragraph of section.paragraphs) {
      narrativeRows.push(['', paragraph]);
    }
    for (const bullet of section.bullets) {
      narrativeRows.push(['', `• ${bullet}`]);
    }
    narrativeRows.push(['', '']);
  }
  if (analysis.confidenceNote) {
    narrativeRows.push(['Confidence', analysis.confidenceNote]);
  }

  if (narrativeRows.length > 0) {
    writeDataTableSheet(wb, sheetNameSafe('AI Narrative', usedNames), {
      title: 'AI Narrative',
      headers: ['Section', 'Content'],
      rows: narrativeRows,
    });
  }

  if (analysis.findingsTable.rows.length > 0) {
    writeDataTableSheet(
      wb,
      sheetNameSafe('AI Findings', usedNames),
      analysis.findingsTable,
    );
  }

  if (analysis.metricsTable.rows.length > 0) {
    writeDataTableSheet(
      wb,
      sheetNameSafe('AI Metrics', usedNames),
      analysis.metricsTable,
    );
  }
}

async function buildExcelWorkbook(opts: ExcelReportOpts): Promise<ArrayBuffer> {
  const mod = await import('exceljs');
  // CJS/ESM interop: Node exposes Workbook on the module; some bundlers put it on default.
  const ExcelJSLib = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const wb = new ExcelJSLib.Workbook();
  wb.creator = 'Radareum';
  wb.created = new Date();
  wb.modified = new Date();

  const generatedAt = formatGeneratedAt();
  const usedNames = new Set<string>();

  if (opts.sheets && opts.sheets.length > 0) {
    const coverSummary =
      opts.summaryRows ??
      opts.sheets.find(s => (s.summaryRows?.length ?? 0) > 0)?.summaryRows ??
      [];

    writeSummarySheet(wb, {
      title: opts.title,
      subtitle: opts.subtitle,
      generatedAt,
      summaryRows: coverSummary,
      name: sheetNameSafe('Summary', usedNames),
    });

    for (const sheet of opts.sheets) {
      if (sheet.table) {
        writeDataTableSheet(
          wb,
          sheetNameSafe(sheet.name || sheet.table.title || 'Data', usedNames),
          sheet.table,
          sheet.extraRows,
        );
        continue;
      }

      if (sheet.extraRows?.length) {
        const width = Math.max(1, ...sheet.extraRows.map(r => r.length));
        writeDataTableSheet(wb, sheetNameSafe(sheet.name || 'Extra', usedNames), {
          title: sheet.name,
          headers: Array.from({ length: width }, (_, i) => `Column ${i + 1}`),
          rows: sheet.extraRows,
        });
        continue;
      }

      // Skip pure-summary sheets — already represented on the cover Summary sheet
      if ((sheet.summaryRows?.length ?? 0) > 0) continue;

      writeDataTableSheet(wb, sheetNameSafe(sheet.name || 'Data', usedNames), {
        title: sheet.name,
        headers: ['Note'],
        rows: [],
      });
    }
  } else {
    const summaryRows = opts.summaryRows ?? [];
    const tables = opts.tables ?? [];

    writeSummarySheet(wb, {
      title: opts.title,
      subtitle: opts.subtitle,
      generatedAt,
      summaryRows,
      name: sheetNameSafe('Summary', usedNames),
    });

    if (tables.length === 0) {
      writeDataTableSheet(wb, sheetNameSafe('Data', usedNames), {
        title: 'Data',
        headers: ['Note'],
        rows: [],
      });
    } else {
      for (const table of tables) {
        writeDataTableSheet(
          wb,
          sheetNameSafe(table.title || 'Data', usedNames),
          table,
        );
      }
    }
  }

  if (opts.charts?.length) {
    writeChartsSheet(wb, {
      title: opts.title,
      subtitle: opts.subtitle,
      generatedAt,
      charts: opts.charts,
      usedNames,
    });
  }

  if (opts.aiAnalysis) {
    writeAiAnalysisSheets(wb, opts.aiAnalysis, usedNames);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

/** Generate a real .xlsx workbook and trigger a direct download. */
export function downloadExcelReport(opts: ExcelReportOpts): void {
  const filename = ensureExt(opts.filename, '.xlsx');
  void buildExcelWorkbook(opts)
    .then(data => {
      const blob = new Blob([data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      downloadBlob(filename, blob);
    })
    .catch(err => {
      console.error('[Radareum] Excel export failed', err);
    });
}

/** Download PDF from the shared ReportPayload shape used across pages. */
export async function downloadReportPdf(payload: ReportPayload): Promise<boolean> {
  const { enrichReportPayloadWithAi } = await import('@/lib/export/ai-analysis-report');
  const { payload: enriched, aiIncluded } = await enrichReportPayloadWithAi(payload);
  downloadPdfReport({
    title: enriched.title,
    subtitle: enriched.subtitle,
    summaryRows: enriched.summary,
    tables: enriched.tables,
    charts: enriched.charts,
    aiAnalysis: enriched.aiAnalysis,
    filename: `${enriched.filenameBase}-${stamp()}.pdf`,
  });
  return aiIncluded;
}

/** Download Excel (.xlsx) from the shared ReportPayload shape used across pages. */
export async function downloadReportExcel(payload: ReportPayload): Promise<boolean> {
  const { useWalletStore } = await import('@/stores/wallet-store');
  const { planAllowsExcelExport } = await import('@/lib/plans/features');
  const plan = useWalletStore.getState().currentPlan;
  if (!planAllowsExcelExport(plan)) {
    throw new Error('Excel export is available on the Business plan. Upgrade to unlock .xlsx reports.');
  }

  const { enrichReportPayloadWithAi } = await import('@/lib/export/ai-analysis-report');
  const { payload: enriched, aiIncluded } = await enrichReportPayloadWithAi(payload);
  downloadExcelReport({
    title: enriched.title,
    subtitle: enriched.subtitle,
    summaryRows: enriched.summary,
    tables: enriched.tables,
    charts: enriched.charts,
    aiAnalysis: enriched.aiAnalysis,
    filename: `${enriched.filenameBase}-${stamp()}.xlsx`,
  });
  return aiIncluded;
}

/** Build a report from the currently visible/filtered transactions. */
export function buildTransactionsReportPayload(
  opts: TransactionReportOpts,
): ReportPayload | null {
  const txs = opts.transactions;
  if (txs.length === 0) return null;

  let inflow = 0;
  let outflow = 0;
  let volume = 0;
  for (const tx of txs) {
    volume += Math.abs(tx.value);
    if (isRevenueType(tx.type)) inflow += tx.value;
    if (isExpenseType(tx.type)) outflow += tx.value;
  }

  return {
    title: opts.title,
    subtitle: opts.subtitle,
    filenameBase: opts.filenameBase,
    aiScope: opts.aiScope ?? null,
    summary: [
      ...(opts.extraSummary ?? []),
      { label: 'Transactions', value: String(txs.length) },
      { label: 'Inflow (USD)', value: formatUsd(inflow) },
      { label: 'Outflow (USD)', value: formatUsd(outflow) },
      { label: 'Net (USD)', value: formatUsd(inflow - outflow) },
      { label: 'Volume (USD)', value: formatUsd(volume) },
    ],
    tables: [
      {
        title: 'Transactions',
        headers: [
          'Date',
          'Method',
          'Classification',
          'Token',
          'Quantity',
          'Price (USD)',
          'Value (USD)',
          'Network',
          'Counterparty',
          'Tx hash',
        ],
        rows: txs.map(tx => [
          tx.date,
          tx.activity || '',
          tx.typeLabel || tx.type,
          tx.token,
          tx.quantity,
          tx.price,
          tx.value,
          tx.networkLabel || tx.network,
          resolveCounterpartyDisplay(
            {
              counterparty: tx.counterparty,
              counterpartyLabel: tx.counterpartyLabel,
            },
            opts.clients,
          ),
          tx.txHash,
        ]),
      },
    ],
    charts: opts.charts,
  };
}
