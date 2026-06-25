import { z } from 'zod';
import type { Model } from './types.ts';

/**
 * Discounted-cash-flow valuation (deterministic; no LLM, no DOM).
 *
 * Built on top of an engine `Model`: we read EBIT, D&A, capex and the
 * working-capital deltas straight off each forecast period, so the DCF is
 * always internally consistent with the 3-statement model it values.
 *
 * Conventions (documented because practitioners disagree):
 *  - Unlevered FCF = EBIT·(1−t) + D&A − capex − increase in net working capital,
 *    where increase in NWC = ΔAR + ΔInventory − ΔAP − ΔAccrued (a use of cash).
 *  - WACC via CAPM: Ke = rf + β·ERP + size premium; after-tax Kd = Kd·(1−t).
 *  - Mid-year convention discounts period t at exponent (t − 0.5).
 *  - Terminal value:
 *      • perpetuity growth (Gordon): UFCFₙ·(1+g)/(WACC−g), discounted with the
 *        SAME factor as the final projection period (its flows are also mid-year);
 *      • exit multiple: EV/EBITDA · EBITDAₙ, discounted at the END-of-year-N
 *        factor (a sale happens at year-end, so it earns no mid-year benefit).
 *  - Net-debt bridge uses the opening (valuation-date) balance sheet:
 *    net debt = revolver + term loan − cash.
 */

const pct = z.number(); // ratios as decimals, e.g. 0.10 = 10%

export const DCFAssumptionsSchema = z.object({
  // CAPM cost of equity.
  riskFreeRate: pct,
  equityRiskPremium: pct,
  beta: z.number(),
  sizePremium: pct.default(0),
  // Cost of debt (pre-tax); taxed via the shield below.
  preTaxCostOfDebt: pct.default(0),
  taxRate: pct.default(0.25), // marginal tax for NOPAT and the debt shield
  // Target capital-structure weights. When omitted, both are derived from the
  // opening balance sheet's book values (E = total equity, D = revolver + term loan).
  equityWeight: pct.optional(),
  debtWeight: pct.optional(),
  // Terminal value.
  terminalMethod: z.enum(['perpetuity', 'exitMultiple']).default('perpetuity'),
  terminalGrowth: pct.default(0.02),
  exitMultiple: z.number().default(8), // EV / EBITDA
  // Discounting.
  midYearConvention: z.boolean().default(false),
  // Per-share bridge (0 ⇒ skip the per-share figure).
  sharesOutstanding: z.number().default(0),
});

export type DCFAssumptions = z.infer<typeof DCFAssumptionsSchema>;
export type DCFInput = z.input<typeof DCFAssumptionsSchema>;

export interface DCFPeriod {
  label: string;
  /** Discount exponent (t, or t − 0.5 under mid-year). */
  t: number;
  ebit: number;
  nopat: number;
  depreciation: number;
  capex: number;
  /** Increase in net working capital (a use of cash). */
  changeInNWC: number;
  unleveredFCF: number;
  discountFactor: number;
  presentValue: number;
}

export interface DCFResult {
  // Cost of capital.
  costOfEquity: number;
  costOfDebtAfterTax: number;
  equityWeight: number;
  debtWeight: number;
  wacc: number;

  // Forecast.
  periods: DCFPeriod[];
  pvOfForecast: number;

  // Terminal value.
  terminalMethod: 'perpetuity' | 'exitMultiple';
  finalYearEbitda: number;
  finalYearUFCF: number;
  terminalValue: number; // undiscounted, as of end of horizon
  terminalDiscountFactor: number;
  pvOfTerminalValue: number;
  terminalValuePctOfEV: number;
  /** Cross-check: the other method's implied parameter at this EV. */
  impliedExitMultiple: number; // TV / final-year EBITDA
  impliedPerpetuityGrowth: number; // g implied by TV and final-year UFCF

  // Enterprise → equity bridge (as of the opening balance sheet).
  enterpriseValue: number;
  totalDebt: number;
  cash: number;
  netDebt: number;
  equityValue: number;
  sharesOutstanding: number;
  equityValuePerShare: number;

  /** True when WACC > terminal growth (the Gordon model is well-defined). */
  terminalValid: boolean;
}

/** Unlevered FCF for one forecast period, pulled from the linked statements. */
function unleveredFCF(
  ebit: number,
  depreciation: number,
  capex: number,
  changeInNWC: number,
  taxRate: number,
): { nopat: number; ufcf: number } {
  const nopat = ebit * (1 - taxRate);
  return { nopat, ufcf: nopat + depreciation - capex - changeInNWC };
}

/** WACC from CAPM and a target capital structure (weights are normalized). */
function costOfCapital(
  a: DCFAssumptions,
  derivedEquityWeight: number,
  derivedDebtWeight: number,
): {
  costOfEquity: number;
  costOfDebtAfterTax: number;
  equityWeight: number;
  debtWeight: number;
  wacc: number;
} {
  const costOfEquity = a.riskFreeRate + a.beta * a.equityRiskPremium + a.sizePremium;
  const costOfDebtAfterTax = a.preTaxCostOfDebt * (1 - a.taxRate);

  let we = a.equityWeight ?? derivedEquityWeight;
  let wd = a.debtWeight ?? derivedDebtWeight;
  const sum = we + wd;
  if (sum > 0) {
    we /= sum;
    wd /= sum;
  } else {
    we = 1;
    wd = 0;
  }

  return {
    costOfEquity,
    costOfDebtAfterTax,
    equityWeight: we,
    debtWeight: wd,
    wacc: we * costOfEquity + wd * costOfDebtAfterTax,
  };
}

/** Core valuation, parameterized so the sensitivity grid can reuse it. */
function valueStream(
  periods: DCFPeriod[],
  finalYearEbitda: number,
  params: {
    wacc: number;
    terminalMethod: 'perpetuity' | 'exitMultiple';
    terminalGrowth: number;
    exitMultiple: number;
    midYear: boolean;
  },
): {
  periods: DCFPeriod[];
  pvOfForecast: number;
  terminalValue: number;
  terminalDiscountFactor: number;
  pvOfTerminalValue: number;
  enterpriseValue: number;
  terminalValid: boolean;
} {
  const { wacc } = params;
  const n = periods.length;

  let pvOfForecast = 0;
  const discounted = periods.map((p) => {
    const discountFactor = 1 / Math.pow(1 + wacc, p.t);
    const presentValue = p.unleveredFCF * discountFactor;
    pvOfForecast += presentValue;
    return { ...p, discountFactor, presentValue };
  });

  const finalUFCF = periods[n - 1]?.unleveredFCF ?? 0;
  const lastExponent = periods[n - 1]?.t ?? n;

  const denom = wacc - params.terminalGrowth;
  const terminalValid = denom > 0;
  let terminalValue: number;
  let terminalExponent: number;
  if (params.terminalMethod === 'perpetuity') {
    terminalValue = (finalUFCF * (1 + params.terminalGrowth)) / denom;
    // Perpetuity flows inherit the final period's (possibly mid-year) timing.
    terminalExponent = lastExponent;
  } else {
    terminalValue = finalYearEbitda * params.exitMultiple;
    // A year-end sale earns no mid-year benefit.
    terminalExponent = n;
  }

  const terminalDiscountFactor = 1 / Math.pow(1 + wacc, terminalExponent);
  const pvOfTerminalValue = terminalValue * terminalDiscountFactor;
  const enterpriseValue = pvOfForecast + pvOfTerminalValue;

  return {
    periods: discounted,
    pvOfForecast,
    terminalValue,
    terminalDiscountFactor,
    pvOfTerminalValue,
    enterpriseValue,
    terminalValid,
  };
}

/** Compute a full DCF valuation for an engine `Model`. */
export function computeDCF(model: Model, a: DCFAssumptions): DCFResult {
  const o = model.opening;
  const totalDebt = o.revolver + o.termLoan;
  const equityBook = o.totalEquity;
  const denom = equityBook + totalDebt;
  const derivedEquityWeight = denom > 0 ? equityBook / denom : 1;
  const derivedDebtWeight = denom > 0 ? totalDebt / denom : 0;

  const coc = costOfCapital(a, derivedEquityWeight, derivedDebtWeight);

  // Build the unlevered-FCF stream from the linked statements.
  const stream: DCFPeriod[] = model.periods.map((p, i) => {
    const changeInNWC =
      p.cashFlow.changeInAR +
      p.cashFlow.changeInInventory -
      p.cashFlow.changeInAP -
      p.cashFlow.changeInAccrued;
    const { nopat, ufcf } = unleveredFCF(
      p.income.ebit,
      p.income.depreciation,
      p.cashFlow.capex,
      changeInNWC,
      a.taxRate,
    );
    const t = a.midYearConvention ? i + 1 - 0.5 : i + 1;
    return {
      label: p.label,
      t,
      ebit: p.income.ebit,
      nopat,
      depreciation: p.income.depreciation,
      capex: p.cashFlow.capex,
      changeInNWC,
      unleveredFCF: ufcf,
      discountFactor: 0, // filled by valueStream
      presentValue: 0,
    };
  });

  const finalYearEbitda = model.periods.at(-1)?.income.ebitda ?? 0;
  const finalYearUFCF = stream.at(-1)?.unleveredFCF ?? 0;

  const v = valueStream(stream, finalYearEbitda, {
    wacc: coc.wacc,
    terminalMethod: a.terminalMethod,
    terminalGrowth: a.terminalGrowth,
    exitMultiple: a.exitMultiple,
    midYear: a.midYearConvention,
  });

  const cash = o.cash;
  const netDebt = totalDebt - cash;
  const equityValue = v.enterpriseValue - netDebt;
  const equityValuePerShare =
    a.sharesOutstanding > 0 ? equityValue / a.sharesOutstanding : 0;

  const impliedExitMultiple =
    finalYearEbitda !== 0 ? v.terminalValue / finalYearEbitda : 0;
  // From TV = UFCFₙ·(1+g)/(WACC−g): g = (TV·WACC − UFCFₙ)/(TV + UFCFₙ).
  const impliedDenom = v.terminalValue + finalYearUFCF;
  const impliedPerpetuityGrowth =
    impliedDenom !== 0
      ? (v.terminalValue * coc.wacc - finalYearUFCF) / impliedDenom
      : 0;

  return {
    costOfEquity: coc.costOfEquity,
    costOfDebtAfterTax: coc.costOfDebtAfterTax,
    equityWeight: coc.equityWeight,
    debtWeight: coc.debtWeight,
    wacc: coc.wacc,

    periods: v.periods,
    pvOfForecast: v.pvOfForecast,

    terminalMethod: a.terminalMethod,
    finalYearEbitda,
    finalYearUFCF,
    terminalValue: v.terminalValue,
    terminalDiscountFactor: v.terminalDiscountFactor,
    pvOfTerminalValue: v.pvOfTerminalValue,
    terminalValuePctOfEV:
      v.enterpriseValue !== 0 ? v.pvOfTerminalValue / v.enterpriseValue : 0,
    impliedExitMultiple,
    impliedPerpetuityGrowth,

    enterpriseValue: v.enterpriseValue,
    totalDebt,
    cash,
    netDebt,
    equityValue,
    sharesOutstanding: a.sharesOutstanding,
    equityValuePerShare,

    terminalValid: v.terminalValid,
  };
}

/** Parse raw DCF assumptions (applying defaults), then value the model. */
export function runDCF(model: Model, input: unknown): DCFResult {
  return computeDCF(model, DCFAssumptionsSchema.parse(input));
}

// ── Sensitivity table ────────────────────────────────────────────────────────

export type SensitivityMetric = 'enterpriseValue' | 'equityValuePerShare';

export interface SensitivityAxis {
  /** What is being varied, e.g. "WACC" or "Terminal growth". */
  label: string;
  values: number[];
}

export interface SensitivityTable {
  metric: SensitivityMetric;
  /** Rows vary WACC. */
  rowAxis: SensitivityAxis;
  /** Columns vary the terminal-value parameter (growth or exit multiple). */
  colAxis: SensitivityAxis;
  /** grid[row][col]. */
  grid: number[][];
}

/** Symmetric ± steps centered on `base`, e.g. spread(0.1,0.01,2) → 5 values. */
function spread(base: number, step: number, halfCount: number): number[] {
  const out: number[] = [];
  for (let i = -halfCount; i <= halfCount; i++) out.push(base + i * step);
  return out;
}

/**
 * Two-way DCF sensitivity: WACC (rows) against the active terminal parameter
 * (columns — terminal growth for the perpetuity method, exit multiple for the
 * exit-multiple method). Axes default to a symmetric grid around the base case.
 */
export function buildSensitivity(
  model: Model,
  a: DCFAssumptions,
  opts?: {
    metric?: SensitivityMetric;
    waccValues?: number[];
    terminalValues?: number[];
  },
): SensitivityTable {
  const base = computeDCF(model, a);
  const isPerpetuity = a.terminalMethod === 'perpetuity';

  const metric: SensitivityMetric =
    opts?.metric ?? (a.sharesOutstanding > 0 ? 'equityValuePerShare' : 'enterpriseValue');

  const waccValues = opts?.waccValues ?? spread(base.wacc, 0.01, 2);
  const terminalValues =
    opts?.terminalValues ??
    (isPerpetuity ? spread(a.terminalGrowth, 0.005, 2) : spread(a.exitMultiple, 1, 2));

  // Rebuild the unlevered-FCF stream once; only discounting/TV vary per cell.
  const stream = base.periods.map((p) => ({ ...p }));
  const finalEbitda = base.finalYearEbitda;

  const grid = waccValues.map((wacc) =>
    terminalValues.map((tv) => {
      const v = valueStream(stream, finalEbitda, {
        wacc,
        terminalMethod: a.terminalMethod,
        terminalGrowth: isPerpetuity ? tv : a.terminalGrowth,
        exitMultiple: isPerpetuity ? a.exitMultiple : tv,
        midYear: a.midYearConvention,
      });
      if (metric === 'enterpriseValue') return v.enterpriseValue;
      const equityValue = v.enterpriseValue - base.netDebt;
      return a.sharesOutstanding > 0 ? equityValue / a.sharesOutstanding : equityValue;
    }),
  );

  return {
    metric,
    rowAxis: { label: 'WACC', values: waccValues },
    colAxis: {
      label: isPerpetuity ? 'Terminal growth' : 'Exit multiple (EV/EBITDA)',
      values: terminalValues,
    },
    grid,
  };
}
