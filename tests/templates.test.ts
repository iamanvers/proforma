import { describe, expect, it } from 'vitest';
import {
  buildModel,
  computeDCF,
  DCFAssumptionsSchema,
  parseAssumptions,
} from '../src/engine/index.ts';
import { validateModel } from '../src/validation/index.ts';
import { PRESETS } from '../src/templates/index.ts';

describe('bank-inspired starter presets', () => {
  for (const preset of PRESETS) {
    describe(preset.name, () => {
      const a = parseAssumptions(preset.assumptions);
      const model = buildModel(a);
      const dcf = computeDCF(model, DCFAssumptionsSchema.parse(preset.dcf));
      const report = validateModel(model, a, dcf);

      it('opening balance sheet ties out by construction', () => {
        expect(Math.abs(model.opening.balanceCheck)).toBeLessThan(1e-6 * Math.max(1, model.opening.totalAssets));
      });

      it('balances and converges every forecast period', () => {
        for (const p of model.periods) {
          expect(Math.abs(p.balance.balanceCheck)).toBeLessThan(1e-6 * Math.max(1, p.balance.totalAssets));
          expect(p.circular.converged).toBe(true);
          expect(p.balance.cash).toBeGreaterThanOrEqual(a.debt.minCashBalance - 1e-6);
        }
      });

      it('passes validation with no failures', () => {
        const fails = report.results.filter((r) => r.status === 'fail');
        expect(fails).toEqual([]);
        expect(report.ok).toBe(true);
      });

      it('produces a positive, well-defined DCF valuation', () => {
        expect(dcf.enterpriseValue).toBeGreaterThan(0);
        expect(dcf.wacc).toBeGreaterThan(0);
        if (dcf.terminalMethod === 'perpetuity') expect(dcf.terminalValid).toBe(true);
      });
    });
  }
});
