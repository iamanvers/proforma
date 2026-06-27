import {
  DCFAssumptionsSchema,
  parseAssumptions,
  type DCFInput,
  type ModelAssumptionsInput,
} from '../engine/index.ts';
import type { Preset } from '../templates/index.ts';

/** Round to `d` decimals, killing floating-point tails (e.g. 5.5000000001 → 5.5). */
export const round = (n: number, d = 2): number => {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

export interface FormState {
  company: string;
  years: number;
  currency: string;
  units: string;
  revenueBase: number;
  revenueGrowth: number;
  cogs: number;
  sga: number;
  sgaFixed: number;
  capex: number;
  dep: number;
  dso: number;
  dio: number;
  dpo: number;
  tax: number;
  div: number;
  revolverRate: number;
  termRate: number;
  cashRate: number;
  termAmort: number;
  minCash: number;
  newEquity: number;
  shares: number;
  oCash: number;
  oAR: number;
  oInv: number;
  oOCA: number;
  oGross: number;
  oAccum: number;
  oOther: number;
  oAP: number;
  oAccr: number;
  oRev: number;
  oTerm: number;
  oLTL: number;
  oRE: number;
  rf: number;
  erp: number;
  beta: number;
  size: number;
  kd: number;
  dcfTax: number;
  terminalMethod: 'perpetuity' | 'exitMultiple';
  g: number;
  exit: number;
  midYear: boolean;
}

/** A complete form from a preset (parsed first, percentages rounded for display). */
export function presetToForm(p: Preset): FormState {
  const a = parseAssumptions(p.assumptions);
  const dcf = DCFAssumptionsSchema.parse(p.dcf);
  const d = a.drivers;
  const o = a.opening;
  const debt = a.debt;
  const p100 = (x: number) => round(x * 100, 2);
  return {
    company: a.meta.company,
    years: a.meta.years,
    currency: a.meta.currency,
    units: a.meta.units,
    revenueBase: round(a.revenueBase, 1),
    revenueGrowth: p100(d.revenueGrowth),
    cogs: p100(d.cogsPctRevenue),
    sga: p100(d.sgaPctRevenue),
    sgaFixed: round(d.sgaFixed, 1),
    capex: p100(d.capexPctRevenue),
    dep: p100(d.depreciationRate),
    dso: round(d.dso, 0),
    dio: round(d.dio, 0),
    dpo: round(d.dpo, 0),
    tax: p100(d.taxRate),
    div: p100(d.dividendPayoutPct),
    revolverRate: p100(debt.revolverRate),
    termRate: p100(debt.termLoanRate),
    cashRate: p100(debt.cashInterestRate),
    termAmort: p100(debt.termLoanAmortizationPct),
    minCash: round(debt.minCashBalance, 1),
    newEquity: round(a.equity.newEquityIssuancePerYear, 1),
    shares: round(a.equity.sharesOutstanding, 2),
    oCash: round(o.cash, 1),
    oAR: round(o.accountsReceivable, 1),
    oInv: round(o.inventory, 1),
    oOCA: round(o.otherCurrentAssets, 1),
    oGross: round(o.grossPPE, 1),
    oAccum: round(o.accumulatedDepreciation, 1),
    oOther: round(o.otherAssets, 1),
    oAP: round(o.accountsPayable, 1),
    oAccr: round(o.accruedLiabilities, 1),
    oRev: round(o.revolver, 1),
    oTerm: round(o.termLoan, 1),
    oLTL: round(o.otherLongTermLiabilities, 1),
    oRE: round(o.retainedEarnings, 1),
    rf: p100(dcf.riskFreeRate),
    erp: p100(dcf.equityRiskPremium),
    beta: round(dcf.beta, 2),
    size: p100(dcf.sizePremium),
    kd: p100(dcf.preTaxCostOfDebt),
    dcfTax: p100(dcf.taxRate),
    terminalMethod: dcf.terminalMethod,
    g: p100(dcf.terminalGrowth),
    exit: round(dcf.exitMultiple, 1),
    midYear: dcf.midYearConvention,
  };
}

/** Common-equity plug so the opening balance sheet ties out. */
export function commonEquityPlug(f: FormState): number {
  const assets = f.oCash + f.oAR + f.oInv + f.oOCA + (f.oGross - f.oAccum) + f.oOther;
  const liabilities = f.oAP + f.oAccr + f.oRev + f.oTerm + f.oLTL;
  return round(assets - liabilities - f.oRE, 4);
}

export function toInputs(f: FormState): { assumptions: ModelAssumptionsInput; dcf: DCFInput } {
  return {
    assumptions: {
      meta: { company: f.company, years: f.years, currency: f.currency, units: f.units },
      revenueBase: f.revenueBase,
      opening: {
        cash: f.oCash,
        accountsReceivable: f.oAR,
        inventory: f.oInv,
        otherCurrentAssets: f.oOCA,
        grossPPE: f.oGross,
        accumulatedDepreciation: f.oAccum,
        otherAssets: f.oOther,
        accountsPayable: f.oAP,
        accruedLiabilities: f.oAccr,
        revolver: f.oRev,
        termLoan: f.oTerm,
        otherLongTermLiabilities: f.oLTL,
        commonEquity: commonEquityPlug(f),
        retainedEarnings: f.oRE,
      },
      drivers: {
        revenueGrowth: f.revenueGrowth / 100,
        cogsPctRevenue: f.cogs / 100,
        sgaPctRevenue: f.sga / 100,
        sgaFixed: f.sgaFixed,
        capexPctRevenue: f.capex / 100,
        depreciationRate: f.dep / 100,
        dso: f.dso,
        dio: f.dio,
        dpo: f.dpo,
        taxRate: f.tax / 100,
        dividendPayoutPct: f.div / 100,
      },
      debt: {
        revolverRate: f.revolverRate / 100,
        termLoanRate: f.termRate / 100,
        cashInterestRate: f.cashRate / 100,
        termLoanAmortizationPct: f.termAmort / 100,
        minCashBalance: f.minCash,
      },
      equity: { newEquityIssuancePerYear: f.newEquity, sharesOutstanding: f.shares },
    },
    dcf: {
      riskFreeRate: f.rf / 100,
      equityRiskPremium: f.erp / 100,
      beta: f.beta,
      sizePremium: f.size / 100,
      preTaxCostOfDebt: f.kd / 100,
      taxRate: f.dcfTax / 100,
      terminalMethod: f.terminalMethod,
      terminalGrowth: f.g / 100,
      exitMultiple: f.exit,
      midYearConvention: f.midYear,
      sharesOutstanding: f.shares,
    },
  };
}

/** Merge LLM-suggested values onto a base form, rounding and ignoring junk. */
export function mergeSuggestion(base: FormState, patch: Record<string, unknown>): FormState {
  const next: FormState = { ...base };
  const baseRec = base as unknown as Record<string, unknown>;
  const nextRec = next as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in base)) continue;
    const cur = baseRec[k];
    if (typeof cur === 'number' && typeof v === 'number' && Number.isFinite(v)) nextRec[k] = round(v, 3);
    else if (typeof cur === 'string' && typeof v === 'string') nextRec[k] = v;
    else if (typeof cur === 'boolean' && typeof v === 'boolean') nextRec[k] = v;
  }
  if (next.terminalMethod !== 'perpetuity' && next.terminalMethod !== 'exitMultiple') {
    next.terminalMethod = 'perpetuity';
  }
  return next;
}

/** Field groups for the review step (the "key values" the user confirms). */
export const REVIEW_GROUPS: Array<{
  title: string;
  fields: Array<{ key: keyof FormState; label: string; unit?: string; step?: number }>;
}> = [
  {
    title: 'Operating',
    fields: [
      { key: 'revenueBase', label: 'Revenue (base year)', step: 1 },
      { key: 'revenueGrowth', label: 'Revenue growth', unit: '%', step: 0.5 },
      { key: 'cogs', label: 'COGS % of revenue', unit: '%', step: 0.5 },
      { key: 'sga', label: 'SG&A % of revenue', unit: '%', step: 0.5 },
      { key: 'capex', label: 'Capex % of revenue', unit: '%', step: 0.5 },
      { key: 'dep', label: 'Depreciation rate', unit: '%', step: 0.5 },
      { key: 'tax', label: 'Tax rate', unit: '%', step: 0.5 },
      { key: 'div', label: 'Dividend payout', unit: '%', step: 0.5 },
    ],
  },
  {
    title: 'Working capital',
    fields: [
      { key: 'dso', label: 'DSO', unit: 'days', step: 1 },
      { key: 'dio', label: 'DIO', unit: 'days', step: 1 },
      { key: 'dpo', label: 'DPO', unit: 'days', step: 1 },
    ],
  },
  {
    title: 'Financing',
    fields: [
      { key: 'revolverRate', label: 'Revolver rate', unit: '%', step: 0.25 },
      { key: 'termRate', label: 'Term-loan rate', unit: '%', step: 0.25 },
      { key: 'minCash', label: 'Minimum cash', step: 1 },
      { key: 'shares', label: 'Shares outstanding', step: 0.1 },
    ],
  },
  {
    title: 'DCF / valuation',
    fields: [
      { key: 'rf', label: 'Risk-free rate', unit: '%', step: 0.1 },
      { key: 'erp', label: 'Equity risk premium', unit: '%', step: 0.1 },
      { key: 'beta', label: 'Beta', step: 0.05 },
      { key: 'kd', label: 'Pre-tax cost of debt', unit: '%', step: 0.1 },
      { key: 'g', label: 'Terminal growth', unit: '%', step: 0.1 },
      { key: 'exit', label: 'Exit multiple', unit: 'x', step: 0.5 },
    ],
  },
];
