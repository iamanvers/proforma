import { describe, expect, it } from 'vitest';
import { buildModel, parseAssumptions, runModel } from '../src/engine/index.ts';
import type { ModelAssumptions } from '../src/engine/index.ts';

/** A healthy, levered base case used across tests. */
function leveredBase(): ModelAssumptions {
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

/** No-debt company with ample cash — used for clean accounting-identity checks. */
function cleanNoDebt(depreciationRate: number, capexPct: number): ModelAssumptions {
  return parseAssumptions({
    meta: { company: 'CleanCo', years: 3 },
    revenueBase: 1000,
    opening: { cash: 5000, grossPPE: 1000, commonEquity: 6000 },
    drivers: {
      revenueGrowth: 0,
      cogsPctRevenue: 0.2,
      sgaPctRevenue: 0.1,
      capexPctRevenue: capexPct,
      depreciationRate,
      taxRate: 0.4,
    },
  });
}

const approxZero = (x: number, scale = 1) =>
  Math.abs(x) < 1e-6 * Math.max(1, Math.abs(scale));

describe('opening balance sheet', () => {
  it('balances', () => {
    const m = buildModel(leveredBase());
    expect(approxZero(m.opening.balanceCheck, m.opening.totalAssets)).toBe(true);
  });
});

describe('3-statement integrity (levered base case)', () => {
  const m = buildModel(leveredBase());

  it('balance sheet balances every period', () => {
    for (const p of m.periods) {
      expect(approxZero(p.balance.balanceCheck, p.balance.totalAssets)).toBe(true);
    }
  });

  it('cash flow ties to the balance sheet cash', () => {
    for (const p of m.periods) {
      expect(p.cashFlow.endingCash).toBeCloseTo(p.balance.cash, 6);
    }
  });

  it('ending cash = beginning cash + net change', () => {
    for (const p of m.periods) {
      expect(p.cashFlow.endingCash).toBeCloseTo(
        p.cashFlow.beginningCash + p.cashFlow.netChangeInCash,
        6,
      );
    }
  });

  it('retained-earnings roll-forward reconciles', () => {
    let prevRE = m.opening.retainedEarnings;
    for (const p of m.periods) {
      expect(p.balance.retainedEarnings).toBeCloseTo(
        prevRE + p.income.netIncome - p.cashFlow.dividends,
        6,
      );
      prevRE = p.balance.retainedEarnings;
    }
  });

  it('PP&E roll-forward reconciles', () => {
    let prevGross = m.opening.grossPPE;
    let prevAccum = m.opening.accumulatedDepreciation;
    for (const p of m.periods) {
      expect(p.balance.grossPPE).toBeCloseTo(prevGross + p.cashFlow.capex, 6);
      expect(p.balance.accumulatedDepreciation).toBeCloseTo(
        prevAccum + p.income.depreciation,
        6,
      );
      expect(p.balance.netPPE).toBeCloseTo(
        p.balance.grossPPE - p.balance.accumulatedDepreciation,
        6,
      );
      prevGross = p.balance.grossPPE;
      prevAccum = p.balance.accumulatedDepreciation;
    }
  });

  it('the revolver circular reference converges every period', () => {
    for (const p of m.periods) {
      expect(p.circular.converged).toBe(true);
      expect(p.circular.residual).toBeLessThan(1e-6);
    }
  });

  it('minimum cash balance is respected', () => {
    for (const p of m.periods) {
      expect(p.balance.cash).toBeGreaterThanOrEqual(50 - 1e-6);
    }
  });
});

describe('accounting identities (book oracle)', () => {
  it('+100 depreciation @40% tax → NI −60, cash +40, net PP&E −100, assets −60, RE −60', () => {
    const base = buildModel(cleanNoDebt(0.1, 0)).periods[0]!; // dep = 0.1*1000 = 100
    const bumped = buildModel(cleanNoDebt(0.2, 0)).periods[0]!; // dep = 0.2*1000 = 200

    expect(bumped.income.depreciation - base.income.depreciation).toBeCloseTo(100, 6);
    expect(bumped.income.netIncome - base.income.netIncome).toBeCloseTo(-60, 6);
    expect(bumped.balance.cash - base.balance.cash).toBeCloseTo(40, 6);
    expect(bumped.balance.netPPE - base.balance.netPPE).toBeCloseTo(-100, 6);
    expect(bumped.balance.totalAssets - base.balance.totalAssets).toBeCloseTo(-60, 6);
    expect(bumped.balance.retainedEarnings - base.balance.retainedEarnings).toBeCloseTo(
      -60,
      6,
    );
  });

  it('+1000 capex → cash −1000, gross & net PP&E +1000, NI unchanged, assets unchanged', () => {
    // capexPct 1.0 on revenue 1000 = 1000 capex; depreciation uses BEGINNING gross
    // PP&E, so the new asset does not depreciate in the purchase year (our stated
    // convention; differs from the book's illustrative same-year example).
    const base = buildModel(cleanNoDebt(0.1, 0)).periods[0]!;
    const bumped = buildModel(cleanNoDebt(0.1, 1.0)).periods[0]!;

    expect(bumped.cashFlow.capex - base.cashFlow.capex).toBeCloseTo(1000, 6);
    expect(bumped.balance.cash - base.balance.cash).toBeCloseTo(-1000, 6);
    expect(bumped.balance.grossPPE - base.balance.grossPPE).toBeCloseTo(1000, 6);
    expect(bumped.balance.netPPE - base.balance.netPPE).toBeCloseTo(1000, 6);
    expect(bumped.income.netIncome - base.income.netIncome).toBeCloseTo(0, 6);
    expect(bumped.balance.totalAssets - base.balance.totalAssets).toBeCloseTo(0, 6);
  });
});

/** Deterministic PRNG for reproducible property tests. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('property: balance sheet always balances and ties out', () => {
  it('holds across 200 randomized scenarios', () => {
    const rng = mulberry32(12345);
    const between = (lo: number, hi: number) => lo + rng() * (hi - lo);

    for (let n = 0; n < 200; n++) {
      // Random balanced opening: pick assets/liabilities, plug common equity.
      const cash = between(50, 500);
      const ar = between(0, 300);
      const inv = between(0, 300);
      const grossPPE = between(100, 2000);
      const accumDep = between(0, grossPPE * 0.6);
      const otherAssets = between(0, 500);
      const ap = between(0, 200);
      const accrued = between(0, 150);
      const revolver = between(0, 200);
      const termLoan = between(0, 800);
      const otherLTL = between(0, 300);
      const re = between(-100, 600);
      const netPPE = grossPPE - accumDep;
      const totalAssets = cash + ar + inv + netPPE + otherAssets;
      const totalLiab = ap + accrued + revolver + termLoan + otherLTL;
      const commonEquity = totalAssets - totalLiab - re; // balancing plug

      const m = runModel({
        meta: { company: 'Rand', years: 5 },
        revenueBase: between(100, 5000),
        opening: {
          cash,
          accountsReceivable: ar,
          inventory: inv,
          otherCurrentAssets: 0,
          grossPPE,
          accumulatedDepreciation: accumDep,
          otherAssets,
          accountsPayable: ap,
          accruedLiabilities: accrued,
          revolver,
          termLoan,
          otherLongTermLiabilities: otherLTL,
          commonEquity,
          retainedEarnings: re,
        },
        drivers: {
          revenueGrowth: between(-0.1, 0.3),
          cogsPctRevenue: between(0.3, 0.8),
          sgaPctRevenue: between(0.05, 0.3),
          capexPctRevenue: between(0.02, 0.15),
          depreciationRate: between(0.05, 0.25),
          dso: between(0, 90),
          dio: between(0, 120),
          dpo: between(0, 90),
          taxRate: between(0.15, 0.4),
          dividendPayoutPct: between(0, 0.5),
        },
        debt: {
          revolverRate: between(0.03, 0.1),
          termLoanRate: between(0.03, 0.08),
          cashInterestRate: between(0, 0.03),
          termLoanAmortizationPct: between(0, 0.2),
          minCashBalance: between(0, 200),
        },
      });

      // Opening balances by construction.
      expect(approxZero(m.opening.balanceCheck, m.opening.totalAssets)).toBe(true);

      for (const p of m.periods) {
        expect(approxZero(p.balance.balanceCheck, p.balance.totalAssets)).toBe(true);
        expect(p.cashFlow.endingCash).toBeCloseTo(p.balance.cash, 4);
        expect(p.circular.converged).toBe(true);
      }
    }
  });
});
