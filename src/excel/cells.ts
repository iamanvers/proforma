/** Column/address helpers and a row registry for cross-sheet formula refs. */

/** 1 → "A", 2 → "B", 27 → "AA". */
export function colLetter(n: number): string {
  let s = '';
  let x = n;
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

/** Column A = labels; period 0 (opening) = column B; period t = column (2 + t). */
export const periodCol = (t: number): number => 2 + t;
export const periodColLetter = (t: number): string => colLetter(periodCol(t));

/**
 * Tracks the row each named line lands on, per sheet, so formulas can reference
 * cells by semantic key instead of hand-counted row numbers.
 */
export class Layout {
  private rows: Record<string, Record<string, number>> = {};

  setRow(sheet: string, key: string, row: number): void {
    (this.rows[sheet] ??= {})[key] = row;
  }

  rowOf(sheet: string, key: string): number {
    const r = this.rows[sheet]?.[key];
    if (r === undefined) throw new Error(`No row registered for ${sheet}.${key}`);
    return r;
  }

  /** Sheet-qualified A1 reference, e.g. "'Balance Sheet'!C12". */
  ref(sheet: string, key: string, t: number): string {
    return `'${sheet}'!${periodColLetter(t)}${this.rowOf(sheet, key)}`;
  }

  /** Same-sheet A1 range across one column, e.g. "C5:C8". */
  rangeInCol(sheet: string, keyFrom: string, keyTo: string, t: number): string {
    const col = periodColLetter(t);
    return `${col}${this.rowOf(sheet, keyFrom)}:${col}${this.rowOf(sheet, keyTo)}`;
  }
}
