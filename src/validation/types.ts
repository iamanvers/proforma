/**
 * Validation report types. The validation engine runs a catalog of checks over
 * the deterministic engine's `Model` output (and, where supplied, the
 * assumptions that produced it) and returns structured, plain-English results.
 *
 * The same results are surfaced in-app and, later (P3), embedded as live
 * TRUE/FALSE cells on the workbook's Checks tab.
 */

export type CheckCategory =
  | 'math' // tie-outs, crossfoot, roll-forwards
  | 'circular' // revolver/interest convergence
  | 'assumptions' // driver sanity / plausible bounds
  | 'logic' // financial-logic plausibility
  | 'excel'; // workbook mechanics (added in P3)

/** Outcome of a single check. */
export type CheckStatus = 'pass' | 'warn' | 'fail';

/** How serious a non-pass is. `error` → blocks a clean bill of health. */
export type Severity = 'info' | 'warn' | 'error';

export interface CheckResult {
  /** Stable identifier for the check type, e.g. "math.bs-balances". */
  id: string;
  category: CheckCategory;
  /** Short human title, e.g. "Balance sheet balances". */
  title: string;
  status: CheckStatus;
  /** Severity applied when the check does not pass. */
  severity: Severity;
  /** Plain-English description of the outcome. */
  message: string;
  /** Period label this result applies to (omitted for whole-model checks). */
  period?: string;
  /** Optional numeric context for display / debugging. */
  detail?: { actual?: number; expected?: number; tolerance?: number };
}

export interface ValidationReport {
  results: CheckResult[];
  summary: { pass: number; warn: number; fail: number; total: number };
  /** True when nothing failed (warnings are allowed). */
  ok: boolean;
}
