/** Display formatting + browser download helpers for the builder UI. */

const nf1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Accountant money: one decimal, comma groups, parentheses for negatives. */
export function money(x: number): string {
  return x < 0 ? `(${nf1.format(Math.abs(x))})` : nf1.format(x);
}

export const pct = (x: number, d = 1): string => `${(x * 100).toFixed(d)}%`;
export const mult = (x: number): string => `${x.toFixed(1)}x`;
export const price = (x: number): string =>
  x < 0 ? `(${Math.abs(x).toFixed(2)})` : x.toFixed(2);

/** Trigger a client-side file download (no server round-trip). */
export function downloadBytes(
  bytes: Uint8Array,
  filename: string,
  mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
): void {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Trigger a client-side text-file download (e.g. a Markdown README). */
export function downloadText(text: string, filename: string, mime = 'text/markdown'): void {
  downloadBytes(new TextEncoder().encode(text), filename, mime);
}

/** Filesystem-safe slug for a workbook filename. */
export const slug = (s: string): string =>
  s.trim().replace(/[^\w-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'model';
