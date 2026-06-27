import { describe, expect, it } from 'vitest';
import { runLBO, type LBOInput } from '../src/engine/index.ts';
import { validateLBO } from '../src/validation/index.ts';

/**
 * Hand-computable deal: entry EBITDA 200 (1000 revenue × 20% margin), 10.0x entry
 * EV = 2,000, a single 5.0x term loan (1,000) at 10%, no fees / capex / WC / tax,
 * no growth, full cash sweep, no mandatory amortization.
 *
 *   Sponsor equity = 2,000 uses − 1,000 debt = 1,000.
 *   Y1: interest 100, CFADS 100… wait — CFADS = EBITDA − interest = 200 − 100 = 100? No:
 *       sweep uses CFADS = 200 − 100 = 100 → debt 1,000 − 100 = 900? Recompute below.
 */
function flatDeal(over: Partial<LBOInput> = {}): LBOInput {
  return {
    meta: { company: 'Flat', holdYears: 3 },
    revenueBase: 1000,
    ebitdaMargin: 0.2,
    revenueGrowth: 0,
    capexPctRevenue: 0,
    depreciationPctRevenue: 0,
    nwcPctRevenue: 0,
    taxRate: 0,
    entryMultiple: 10,
    exitMultiple: 10,
    cashSweepPct: 1,
    tranches: [{ name: 'Term Loan', turns: 5, rate: 0.1, amortizationPct: 0, cashSweep: true }],
    ...over,
  };
}

describe('LBO — sources & uses', () => {
  it('sizes the deal and plugs sponsor equity', () => {
    const r = runLBO({ ...flatDeal(), transactionFeesPct: 0, financingFeesPct: 0 });
    expect(r.sourcesUses.entryEbitda).toBeCloseTo(200, 6);
    expect(r.sourcesUses.entryEV).toBeCloseTo(2000, 6);
    expect(r.sourcesUses.newDebtTotal).toBeCloseTo(1000, 6);
    expect(r.sourcesUses.sponsorEquity).toBeCloseTo(1000, 6);
    expect(r.sourcesUses.totalSources).toBeCloseTo(r.sourcesUses.totalUses, 6);
    expect(r.sourcesUses.entryLeverage).toBeCloseTo(5, 6);
  });

  it('includes fees in uses and re-plugs equity', () => {
    const r = runLBO({ ...flatDeal(), transactionFeesPct: 0.02, financingFeesPct: 0.03 });
    // Uses = 2000 + 0.02*2000 + 0.03*1000 + 0 = 2070; equity = 2070 − 1000 = 1070.
    expect(r.sourcesUses.totalUses).toBeCloseTo(2070, 6);
    expect(r.sourcesUses.sponsorEquity).toBeCloseTo(1070, 6);
  });
});

describe('LBO — debt waterfall (full cash sweep)', () => {
  const r = runLBO(flatDeal());
  // CFADS each year = EBITDA(200) − cash interest(10% × beginning debt); all swept.
  // Y1: int 100 → CFADS 100 → debt 1000−100 = 900
  // Y2: int 90  → CFADS 110 → debt 900−110 = 790
  // Y3: int 79  → CFADS 121 → debt 790−121 = 669
  it('sweeps the term loan down each year', () => {
    expect(r.periods[0]!.trancheBalances[0]).toBeCloseTo(900, 6);
    expect(r.periods[1]!.trancheBalances[0]).toBeCloseTo(790, 6);
    expect(r.periods[2]!.trancheBalances[0]).toBeCloseTo(669, 6);
  });

  it('holds cash at the minimum (everything sweeps)', () => {
    for (const p of r.periods) expect(p.cash).toBeCloseTo(0, 6);
  });
});

describe('LBO — returns', () => {
  it('computes exit equity, MOIC and IRR (closed form)', () => {
    const r = runLBO(flatDeal());
    // Exit EV = 200 × 10 = 2000; exit net debt = 669; exit equity = 1331.
    expect(r.exit.exitEV).toBeCloseTo(2000, 6);
    expect(r.exit.exitNetDebt).toBeCloseTo(669, 6);
    expect(r.exit.exitEquity).toBeCloseTo(1331, 6);
    expect(r.returns.moic).toBeCloseTo(1.331, 6); // 1331 / 1000
    expect(r.returns.irr).toBeCloseTo(Math.cbrt(1.331) - 1, 6); // = 0.10
    expect(r.returns.irr).toBeCloseTo(0.1, 6);
  });

  it('splits proceeds with rollover equity pro-rata', () => {
    const r = runLBO({ ...flatDeal(), rolloverEquity: 200 });
    // Uses 2000; equity 2000−1000−200 = 800 sponsor + 200 rollover = 1000 total.
    expect(r.sourcesUses.sponsorEquity).toBeCloseTo(800, 6);
    expect(r.exit.sponsorShare).toBeCloseTo(800 / 1000, 6);
    expect(r.exit.sponsorProceeds).toBeCloseTo(1331 * 0.8, 6);
  });
});

describe('LBO — validation', () => {
  it('a healthy deal passes with no failures', () => {
    const report = validateLBO(runLBO(flatDeal()));
    expect(report.results.filter((r) => r.status === 'fail')).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.results.some((r) => r.id === 'lbo.sources-uses' && r.status === 'pass')).toBe(true);
  });

  it('flags an over-levered deal with non-positive sponsor equity', () => {
    // 11.0x of debt on a 10.0x purchase ⇒ sponsor equity negative.
    const r = runLBO({
      ...flatDeal(),
      tranches: [{ name: 'Term Loan', turns: 11, rate: 0.1 }],
    });
    expect(r.sourcesUses.sponsorEquity).toBeLessThan(0);
    const report = validateLBO(r);
    expect(report.results.find((x) => x.id === 'lbo.sponsor-equity-positive')?.status).toBe('fail');
    expect(report.ok).toBe(false);
  });
});
