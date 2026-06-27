import type ExcelJS from 'exceljs';

/**
 * Bank-grade formatting primitives.
 *
 * Conventions follow public desk standards: Arial throughout, gridlines off,
 * accountant number formats (parenthesized negatives, aligned), and the
 * canonical input/formula/link color code.
 *
 * Color code:
 *  - blue  = hard-coded input
 *  - black = in-sheet formula
 *  - green = cross-sheet link
 *  - red   = check failure / external link (used sparingly)
 */
export const COLORS = {
  input: 'FF0000FF', // blue
  formula: 'FF000000', // black
  link: 'FF008000', // green
  negative: 'FFC00000', // dark red (also failed checks)
  headerBg: 'FF1F3864', // deep navy
  headerFg: 'FFFFFFFF', // white
  sectionFg: 'FF1F3864',
  subtotalBg: 'FFF2F5FA',
  rule: 'FF1F3864', // header underline / total rules
  hairline: 'FFBFBFBF',
  note: 'FF808080',
} as const;

/** Tab colors, so the workbook reads at a glance (inputs vs. outputs vs. checks). */
export const TAB_COLORS = {
  cover: 'FF1F3864',
  dashboard: 'FF0B3D91',
  assumptions: 'FF2E5FAC',
  statement: 'FF595959',
  wc: 'FF0F6F6F',
  ppe: 'FF7A6A1F',
  debt: 'FF8B2F4A',
  ratios: 'FF6B46C1',
  dcf: 'FF2E7D32',
  checks: 'FFB7791F',
} as const;

/**
 * Number formats. Three sections (positive;negative;zero) follow CFI's
 * convention: `_)` reserves a parenthesis-width space so values align on the
 * decimal (the accountant look), negatives use brackets, and **zeroes render
 * as a dash** so they read cleanly and are easy to spot.
 */
export const FMT = {
  currency: '#,##0.0_);(#,##0.0);"-"_)',
  currency0: '#,##0_);(#,##0);"-"_)',
  percent: '0.0%_);(0.0%);"-"_)',
  percent2: '0.00%_);(0.00%);"-"_)',
  multiple: '#,##0.0"x";(#,##0.0"x");"-"',
  days: '#,##0;(#,##0);"-"',
  price: '#,##0.00_);(#,##0.00);"-"_)',
  shares: '#,##0.0',
  factor: '0.000',
} as const;

export type CellRole = 'input' | 'formula' | 'link' | 'label';

export const FONT = 'Arial';
const BASE = { name: FONT, size: 10 } as const;

/** Italic grey note line (units header, disclaimers). */
export const noteFont = (): Partial<ExcelJS.Font> => ({
  name: FONT,
  size: 8,
  italic: true,
  color: { argb: COLORS.note },
});

function roleColor(role: CellRole): string {
  if (role === 'input') return COLORS.input;
  if (role === 'link') return COLORS.link;
  return COLORS.formula;
}

/** Apply a value cell's role color, number format, and optional emphasis. */
export function styleValue(
  cell: ExcelJS.Cell,
  role: CellRole,
  numFmt?: string,
  opts: { bold?: boolean; topBorder?: boolean; doubleBottom?: boolean } = {},
): void {
  cell.font = { ...BASE, color: { argb: roleColor(role) }, bold: opts.bold ?? false };
  if (numFmt) cell.numFmt = numFmt;
  cell.alignment = { horizontal: 'right' };
  if (opts.topBorder || opts.doubleBottom) {
    cell.border = {
      ...(opts.topBorder ? { top: { style: 'thin', color: { argb: COLORS.rule } } } : {}),
      ...(opts.doubleBottom ? { bottom: { style: 'double', color: { argb: COLORS.rule } } } : {}),
    };
  }
}

/** Left-aligned row label in column A. */
export function styleLabel(
  cell: ExcelJS.Cell,
  opts: { bold?: boolean; indent?: number; italic?: boolean } = {},
): void {
  cell.font = { ...BASE, bold: opts.bold ?? false, italic: opts.italic ?? false };
  cell.alignment = { horizontal: 'left', indent: opts.indent ?? 0 };
}

/** A full-width sheet/title header band. */
export function styleHeaderCell(cell: ExcelJS.Cell, opts: { center?: boolean; size?: number } = {}): void {
  cell.font = { name: FONT, size: opts.size ?? 11, bold: true, color: { argb: COLORS.headerFg } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
  cell.alignment = { horizontal: opts.center ? 'center' : 'left', vertical: 'middle' };
}

/** A period column header (Year 1 …): bold, right-aligned, ruled underneath. */
export function stylePeriodHeader(cell: ExcelJS.Cell): void {
  cell.font = { ...BASE, bold: true };
  cell.alignment = { horizontal: 'right' };
  cell.border = { bottom: { style: 'thin', color: { argb: COLORS.rule } } };
}

/** A subsection label (e.g. "Operating activities"): bold with a hairline rule. */
export function styleSection(cell: ExcelJS.Cell): void {
  cell.font = { ...BASE, bold: true, color: { argb: COLORS.sectionFg } };
  cell.alignment = { horizontal: 'left' };
  cell.border = { bottom: { style: 'hair', color: { argb: COLORS.hairline } } };
}
