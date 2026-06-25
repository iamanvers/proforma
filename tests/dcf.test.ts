import { describe, expect, it } from 'vitest';
import {
  buildModel,
  buildSensitivity,
  computeDCF,
  DCFAssumptionsSchema,
  parseAssumptions,
  runDCF,
} from '../src/engine/index.ts';
import type { DCFInput, Model } from '../src/engine/index.ts';
import { validateModel } from '../src/validation/index.ts';

/**
 * A deliberately clean, hand-computable model: no debt, no working-capital
 * movement, no capex, constant revenue. Depreciation runs off the (constant)
 * beginning gross PP&E, so every year is identical:
 *   EBITDA = (1000 − 200) − 100 = 700
 *   EBIT   = 700 − 100 (dep)    = 600
 * With a 40% DCF tax rate the unlevered FCF is constant:
 *   UFCF = 600·(1−0.4) + 100 − 0 − 0 = 460
 */
function flatModel(years = 3): Model {
  return buildModel(
    parseAssumptions({
      meta: { company: 'FlatCo', years },
      revenueBase: 1000,
      opening: { cash: 5000, grossPPE: 1000, commonEquity: 6000 },
      drivers: {
        revenueGrowth: 0,
        cogsPctRevenue: 0.2,
        sgaPctRevenue: 0.1,
        capexPctRevenue: 0,
        depreciationRate: 0.1, // dep = 100/yr, capped well under gross
        taxRate: 0.4,
      },
    }),
  );
}

/** WACC = cost of equity = 0.03 + 1.4·0.05 = 0.10 (weights forced to all-equity). */
function flatDCF(overrides: Partial<DCFInput> = {}): DCFInput {
  return {
    riskFreeRate: 0.03,
    equityRiskPremium: 0.05,
    beta: 1.4,
    preTaxCostOfDebt: 0,
    taxRate: 0.4,
    equityWeight: 1,
    debtWeight: 0,
    terminalMethod: 'perpetuity',
    terminalGrowth: 0.02,
    sharesOutstanding: 100,
    ...overrides,
  };
}

describe('DCF — unlevered FCF and WACC', () => {
  const dcf = runDCF(flatModel(), flatDCF());

  it('computes WACC from CAPM with the supplied weights', () => {
    expect(dcf.costOfEquity).toBeCloseTo(0.1, 10);
    expect(dcf.costOfDebtAfterTax).toBeCloseTo(0, 10);
    expect(dcf.equityWeight).toBeCloseTo(1, 10);
    expect(dcf.wacc).toBeCloseTo(0.1, 10);
  });

  it('builds a constant 460 unlevered-FCF stream from the linked statements', () => {
    expect(dcf.periods).toHaveLength(3);
    for (const p of dcf.periods) {
      expect(p.ebit).toBeCloseTo(600, 6);
      expect(p.nopat).toBeCloseTo(360, 6);
      expect(p.depreciation).toBeCloseTo(100, 6);
      expect(p.capex).toBeCloseTo(0, 6);
      expect(p.changeInNWC).toBeCloseTo(0, 6);
      expect(p.unleveredFCF).toBeCloseTo(460, 6);
    }
  });
});

describe('DCF — valuation against an independent closed form', () => {
  const wacc = 0.1;
  const ufcf = 460;
  const g = 0.02;

  // Independent oracle: discount a constant 460 over 3 years at 10%.
  const pvForecast = [1, 2, 3].reduce((s, t) => s + ufcf / Math.pow(1 + wacc, t), 0);
  const tv = (ufcf * (1 + g)) / (wacc - g); // Gordon, as of end of year 3
  const pvTV = tv / Math.pow(1 + wacc, 3); // end-of-year discounting
  const ev = pvForecast + pvTV;

  const dcf = runDCF(flatModel(), flatDCF());

  it('matches PV of the forecast period', () => {
    expect(dcf.pvOfForecast).toBeCloseTo(pvForecast, 6);
  });

  it('matches the Gordon-growth terminal value and its PV', () => {
    expect(dcf.terminalValue).toBeCloseTo(tv, 6);
    expect(dcf.pvOfTerminalValue).toBeCloseTo(pvTV, 6);
  });

  it('matches enterprise value and ties out EV = PV(forecast) + PV(TV)', () => {
    expect(dcf.enterpriseValue).toBeCloseTo(ev, 6);
    expect(dcf.enterpriseValue).toBeCloseTo(dcf.pvOfForecast + dcf.pvOfTerminalValue, 6);
  });

  it('bridges to equity value and per share using opening net debt', () => {
    // No debt, 5000 cash ⇒ net debt = −5000 ⇒ equity value = EV + 5000.
    expect(dcf.totalDebt).toBeCloseTo(0, 6);
    expect(dcf.netDebt).toBeCloseTo(-5000, 6);
    expect(dcf.equityValue).toBeCloseTo(ev + 5000, 6);
    expect(dcf.equityValuePerShare).toBeCloseTo((ev + 5000) / 100, 6);
  });

  it('reports the implied exit multiple as a cross-check', () => {
    // finalYearEbitda = 700; impliedExitMultiple = TV / 700.
    expect(dcf.finalYearEbitda).toBeCloseTo(700, 6);
    expect(dcf.impliedExitMultiple).toBeCloseTo(tv / 700, 6);
  });
});

describe('DCF — exit-multiple terminal value', () => {
  it('values TV = exit multiple × final-year EBITDA, discounted at year-end', () => {
    const dcf = runDCF(flatModel(), flatDCF({ terminalMethod: 'exitMultiple', exitMultiple: 8 }));
    const tv = 700 * 8;
    expect(dcf.terminalValue).toBeCloseTo(tv, 6);
    expect(dcf.pvOfTerminalValue).toBeCloseTo(tv / Math.pow(1.1, 3), 6);
    // Cross-check the implied perpetuity growth solves the Gordon identity.
    const g = dcf.impliedPerpetuityGrowth;
    expect((460 * (1 + g)) / (0.1 - g)).toBeCloseTo(tv, 4);
  });
});

describe('DCF — mid-year convention', () => {
  it('raises value vs. end-of-year by pulling cash flows half a year closer', () => {
    const endYear = runDCF(flatModel(), flatDCF());
    const midYear = runDCF(flatModel(), flatDCF({ midYearConvention: true }));
    expect(midYear.enterpriseValue).toBeGreaterThan(endYear.enterpriseValue);
    expect(midYear.periods[0]!.t).toBeCloseTo(0.5, 10);
    // Mid-year discount factor for year 1 is 1/1.1^0.5.
    expect(midYear.periods[0]!.discountFactor).toBeCloseTo(1 / Math.pow(1.1, 0.5), 10);
  });
});

describe('DCF — capital-structure weights default from the opening balance sheet', () => {
  it('derives equity/debt weights from book values when not supplied', () => {
    // Levered opening: equity 490, debt = revolver 50 + term loan 300 = 350.
    const m = buildModel(
      parseAssumptions({
        meta: { company: 'LevCo', years: 3 },
        revenueBase: 1000,
        opening: {
          cash: 200,
          grossPPE: 600,
          accumulatedDepreciation: 100,
          revolver: 50,
          termLoan: 300,
          commonEquity: 400,
          retainedEarnings: 90,
        },
        drivers: {
          revenueGrowth: 0.05,
          cogsPctRevenue: 0.5,
          sgaPctRevenue: 0.2,
          capexPctRevenue: 0.05,
          depreciationRate: 0.1,
          taxRate: 0.25,
        },
      }),
    );
    const dcf = computeDCF(m, {
      riskFreeRate: 0.03,
      equityRiskPremium: 0.05,
      beta: 1,
      preTaxCostOfDebt: 0.06,
      taxRate: 0.25,
      terminalMethod: 'perpetuity',
      terminalGrowth: 0.02,
      exitMultiple: 8,
      sizePremium: 0,
      midYearConvention: false,
      sharesOutstanding: 0,
    });
    const equity = 490;
    const debt = 350;
    expect(dcf.equityWeight).toBeCloseTo(equity / (equity + debt), 10);
    expect(dcf.debtWeight).toBeCloseTo(debt / (equity + debt), 10);
    // WACC = we·Ke + wd·Kd·(1−t) = we·0.08 + wd·0.06·0.75.
    const ke = 0.03 + 1 * 0.05;
    const kd = 0.06 * 0.75;
    expect(dcf.wacc).toBeCloseTo(
      (equity / (equity + debt)) * ke + (debt / (equity + debt)) * kd,
      10,
    );
  });
});

describe('DCF — sensitivity table', () => {
  const m = flatModel();
  const a = DCFAssumptionsSchema.parse(flatDCF());
  const table = buildSensitivity(m, a);

  it('produces a 5×5 WACC × terminal-growth grid defaulting to per-share value', () => {
    expect(table.metric).toBe('equityValuePerShare');
    expect(table.rowAxis.label).toBe('WACC');
    expect(table.colAxis.label).toBe('Terminal growth');
    expect(table.rowAxis.values).toHaveLength(5);
    expect(table.colAxis.values).toHaveLength(5);
    // Center cell equals the base-case per-share value.
    const base = computeDCF(m, a);
    expect(table.grid[2]![2]!).toBeCloseTo(base.equityValuePerShare, 6);
  });

  it('rises with terminal growth (across columns) and falls with WACC (down rows)', () => {
    for (const row of table.grid) {
      for (let c = 1; c < row.length; c++) expect(row[c]!).toBeGreaterThan(row[c - 1]!);
    }
    for (let c = 0; c < table.colAxis.values.length; c++) {
      for (let r = 1; r < table.grid.length; r++) {
        expect(table.grid[r]![c]!).toBeLessThan(table.grid[r - 1]![c]!);
      }
    }
  });
});

describe('DCF validation checks', () => {
  it('a healthy DCF raises no failures', () => {
    const m = flatModel();
    const dcf = runDCF(m, flatDCF());
    const report = validateModel(m, undefined, dcf);
    const dcfFails = report.results.filter((r) => r.id.startsWith('dcf.') && r.status === 'fail');
    expect(dcfFails).toHaveLength(0);
    expect(report.results.some((r) => r.id === 'dcf.ev-crossfoot' && r.status === 'pass')).toBe(true);
  });

  it('flags WACC ≤ terminal growth as a failure', () => {
    const m = flatModel();
    const dcf = runDCF(m, flatDCF({ terminalGrowth: 0.12 })); // > WACC 0.10
    expect(dcf.terminalValid).toBe(false);
    const report = validateModel(m, undefined, dcf);
    const fail = report.results.find((r) => r.id === 'dcf.wacc-gt-growth');
    expect(fail?.status).toBe('fail');
    expect(report.ok).toBe(false);
  });
});
