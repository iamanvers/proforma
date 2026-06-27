import type { Model } from '../engine/types.ts';
import type { ModelAssumptions } from '../engine/schema.ts';
import type { DCFResult } from '../engine/dcf.ts';
import type { LBOResult } from '../engine/lbo.ts';
import type { CheckResult, ValidationReport } from './types.ts';
import { checkAssumptions, checkCircular, checkDCF, checkLBO, checkLogic, checkMath } from './checks.ts';

export * from './types.ts';

/** Summarize a list of check results into a report. */
function summarize(results: CheckResult[]): ValidationReport {
  const summary = { pass: 0, warn: 0, fail: 0, total: results.length };
  for (const r of results) {
    if (r.status === 'pass') summary.pass++;
    else if (r.status === 'warn') summary.warn++;
    else summary.fail++;
  }
  return { results, summary, ok: summary.fail === 0 };
}

/** Validate an LBO result (sources/uses tie-out + credit logic). */
export function validateLBO(lbo: LBOResult): ValidationReport {
  const results: CheckResult[] = [];
  checkLBO(results, lbo);
  return summarize(results);
}

/**
 * Run the full validation catalog over an engine `Model`. When the originating
 * `assumptions` are supplied, the assumption-sanity checks (category 3) also
 * run; when a `dcf` valuation is supplied, its tie-outs and logic checks run
 * too. Excel-mechanics checks (category 5) are added in P3.
 */
export function validateModel(
  model: Model,
  assumptions?: ModelAssumptions,
  dcf?: DCFResult,
): ValidationReport {
  const results: CheckResult[] = [];

  checkMath(results, model);
  checkCircular(results, model);
  checkLogic(results, model);
  if (assumptions) checkAssumptions(results, assumptions);
  if (dcf) checkDCF(results, dcf);

  return summarize(results);
}
