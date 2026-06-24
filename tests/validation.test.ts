import { describe, expect, it } from 'vitest';
import { buildModel, parseAssumptions } from '../src/engine/index.ts';
import type { ModelAssumptions } from '../src/engine/index.ts';
import type { Model } from '../src/engine/types.ts';
import { validateModel } from '../src/validation/index.ts';
import type { CheckResult } from '../src/validation/index.ts';

/** A healthy, levered base case (mirrors the engine test's fixture). */
function healthy(overrides: Record<string, unknown> = {}): ModelAssumptions {
  return parseAssumptions({
    meta: { company: 'TestCo', years: 5 },
    revenueBase: 1000,
    opening: {
      cash: 200,
      accountsReceivable: 120,
      inventory: 80,
      grossPPE: 600,
      accumulatedDepreciation: 100,
      accountsPayable: 60,
      revolver: 50,
      termLoan: 300,
      commonEquity: 400,
      retainedEarnings: 90,
    },
    drivers: {
      revenueGrowth: 0.08,
      cogsPctRevenue: 0.55,
      sgaPctRevenue: 0.2,
      capexPctRevenue: 0.06,
      depreciationRate: 0.12,
      dso: 45,
      dio: 40,
      dpo: 35,
      taxRate: 0.25,
      dividendPayoutPct: 0.2,
      ...overrides,
    },
    debt: {
      revolverRate: 0.07,
      termLoanRate: 0.05,
      cashInterestRate: 0.01,
      termLoanAmortizationPct: 0.1,
      minCashBalance: 50,
    },
  });
}

const find = (results: CheckResult[], id: string): CheckResult | undefined =>
  results.find((r) => r.id === id);
const findFail = (results: CheckResult[], id: string): CheckResult | undefined =>
  results.find((r) => r.id === id && r.status === 'fail');

/** Deep clone a model so a test can corrupt one figure in isolation. */
const clone = (m: Model): Model => structuredClone(m);

describe('validation — healthy model', () => {
  const a = healthy();
  const report = validateModel(buildModel(a), a);

  it('passes with no failures', () => {
    expect(report.ok).toBe(true);
    expect(report.summary.fail).toBe(0);
  });

  it('produces results in every implemented category', () => {
    const cats = new Set(report.results.map((r) => r.category));
    expect(cats.has('math')).toBe(true);
    expect(cats.has('circular')).toBe(true);
    expect(cats.has('logic')).toBe(true);
    expect(cats.has('assumptions')).toBe(true);
  });

  it('summary counts add up', () => {
    const { pass, warn, fail, total } = report.summary;
    expect(pass + warn + fail).toBe(total);
    expect(total).toBe(report.results.length);
  });

  it('runs without assumptions (skips category 3)', () => {
    const r = validateModel(buildModel(a));
    expect(r.results.some((x) => x.category === 'assumptions')).toBe(false);
    expect(r.ok).toBe(true);
  });
});

describe('validation — injected math failures', () => {
  const a = healthy();

  it('flags a balance sheet that does not balance', () => {
    const m = clone(buildModel(a));
    m.periods[0]!.balance.totalLiabilitiesAndEquity += 100;
    const report = validateModel(m, a);
    expect(report.ok).toBe(false);
    const f = findFail(report.results, 'math.bs-balances');
    expect(f).toBeDefined();
    expect(f!.period).toBe(m.periods[0]!.label);
  });

  it('flags cash flow that does not tie to the balance sheet', () => {
    const m = clone(buildModel(a));
    m.periods[1]!.cashFlow.endingCash += 25;
    const report = validateModel(m, a);
    expect(findFail(report.results, 'math.cfs-cash-tie')).toBeDefined();
  });

  it('flags a broken retained-earnings roll-forward', () => {
    const m = clone(buildModel(a));
    m.periods[0]!.balance.retainedEarnings += 10;
    const report = validateModel(m, a);
    expect(findFail(report.results, 'math.re-rollforward')).toBeDefined();
  });

  it('flags a broken income-statement crossfoot', () => {
    const m = clone(buildModel(a));
    m.periods[2]!.income.netIncome += 5;
    const report = validateModel(m, a);
    expect(findFail(report.results, 'math.is-netincome')).toBeDefined();
  });
});

describe('validation — injected circular failure', () => {
  it('flags a period whose revolver loop did not converge', () => {
    const a = healthy();
    const m = clone(buildModel(a));
    m.periods[0]!.circular = { converged: false, iterations: 100, residual: 1.5 };
    const report = validateModel(m, a);
    const f = findFail(report.results, 'circular.converged');
    expect(f).toBeDefined();
    expect(report.ok).toBe(false);
  });
});

describe('validation — injected financial-logic failures', () => {
  const a = healthy();

  it('flags negative cash', () => {
    const m = clone(buildModel(a));
    m.periods[0]!.balance.cash = -5;
    const report = validateModel(m, a);
    expect(findFail(report.results, 'logic.cash-nonneg')).toBeDefined();
  });

  it('flags accumulated depreciation exceeding gross PP&E', () => {
    const m = clone(buildModel(a));
    m.periods[0]!.balance.accumulatedDepreciation = m.periods[0]!.balance.grossPPE + 100;
    const report = validateModel(m, a);
    expect(findFail(report.results, 'logic.dep-le-ppe')).toBeDefined();
  });
});

describe('validation — assumption sanity', () => {
  it('warns on an implausible tax rate', () => {
    const a = healthy({ taxRate: 0.95 });
    const report = validateModel(buildModel(a), a);
    const r = find(report.results, 'assume.tax-rate');
    expect(r?.status).toBe('warn');
    // A warning alone should not fail the report.
    expect(report.summary.warn).toBeGreaterThan(0);
  });

  it('warns on implausibly high revenue growth', () => {
    const a = healthy({ revenueGrowth: 5 });
    const report = validateModel(buildModel(a), a);
    expect(find(report.results, 'assume.revenue-growth')?.status).toBe('warn');
  });

  it('warns when COGS + SG&A leave no operating margin', () => {
    const a = healthy({ cogsPctRevenue: 0.8, sgaPctRevenue: 0.3 });
    const report = validateModel(buildModel(a), a);
    expect(find(report.results, 'assume.operating-margin')?.status).toBe('warn');
  });
});
