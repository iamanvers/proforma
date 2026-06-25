import type { ModelAssumptionsInput } from '../engine/schema.ts';
import type { DCFInput } from '../engine/dcf.ts';

/**
 * Bank-inspired **starter templates**.
 *
 * These replicate *public* modeling conventions only — sensible driver sets for
 * a few common company profiles — so the app produces a clean, balancing model
 * (and a polished workbook) out of the box, and forms have realistic defaults.
 * They are not copied from any proprietary bank template or book (CLAUDE.md #4).
 *
 * Each preset's opening balance sheet **balances by construction**: common
 * equity is the plug, so Assets = Liabilities + Equity exactly.
 */

interface OpeningNumbers {
  cash: number;
  accountsReceivable: number;
  inventory: number;
  otherCurrentAssets: number;
  grossPPE: number;
  accumulatedDepreciation: number;
  otherAssets: number;
  accountsPayable: number;
  accruedLiabilities: number;
  revolver: number;
  termLoan: number;
  otherLongTermLiabilities: number;
  retainedEarnings: number;
}

/** Append the common-equity plug so the opening balance sheet ties out. */
function balancedOpening(o: OpeningNumbers): OpeningNumbers & { commonEquity: number } {
  const totalAssets =
    o.cash +
    o.accountsReceivable +
    o.inventory +
    o.otherCurrentAssets +
    (o.grossPPE - o.accumulatedDepreciation) +
    o.otherAssets;
  const totalLiabilities =
    o.accountsPayable + o.accruedLiabilities + o.revolver + o.termLoan + o.otherLongTermLiabilities;
  return { ...o, commonEquity: totalAssets - totalLiabilities - o.retainedEarnings };
}

export interface Preset {
  id: string;
  name: string;
  /** One-line profile shown in the template picker. */
  description: string;
  assumptions: ModelAssumptionsInput;
  /** A matching DCF starting point for the same company profile. */
  dcf: DCFInput;
}

// ── SaaS / software: high growth, high gross margin, asset-light ──────────────
const saas: Preset = {
  id: 'saas',
  name: 'SaaS / Software',
  description: 'High growth, ~75% gross margin, heavy S&M, minimal inventory and capex.',
  assumptions: {
    meta: { company: 'CloudCo', years: 5, currency: 'USD', units: 'millions' },
    revenueBase: 500,
    opening: balancedOpening({
      cash: 300,
      accountsReceivable: 68,
      inventory: 0,
      otherCurrentAssets: 20,
      grossPPE: 90,
      accumulatedDepreciation: 30,
      otherAssets: 120,
      accountsPayable: 10,
      accruedLiabilities: 25,
      revolver: 0,
      termLoan: 0,
      otherLongTermLiabilities: 40,
      retainedEarnings: 50,
    }),
    drivers: {
      revenueGrowth: 0.25,
      cogsPctRevenue: 0.25,
      sgaPctRevenue: 0.45,
      capexPctRevenue: 0.03,
      depreciationRate: 0.2,
      dso: 50,
      dio: 0,
      dpo: 30,
      taxRate: 0.23,
      dividendPayoutPct: 0,
    },
    debt: { revolverRate: 0.07, termLoanRate: 0.06, cashInterestRate: 0.02, termLoanAmortizationPct: 0, minCashBalance: 50 },
    equity: { sharesOutstanding: 100 },
  },
  dcf: {
    riskFreeRate: 0.04,
    equityRiskPremium: 0.055,
    beta: 1.3,
    sizePremium: 0.01,
    preTaxCostOfDebt: 0.06,
    taxRate: 0.23,
    terminalMethod: 'perpetuity',
    terminalGrowth: 0.03,
    exitMultiple: 12,
    midYearConvention: true,
    sharesOutstanding: 100,
  },
};

// ── Industrial / manufacturing: moderate growth, capex- and inventory-heavy ──
const industrial: Preset = {
  id: 'industrial',
  name: 'Industrial / Manufacturing',
  description: 'Mid-single-digit growth, ~32% gross margin, working-capital and capex intensive, levered.',
  assumptions: {
    meta: { company: 'MakerCorp', years: 5, currency: 'USD', units: 'millions' },
    revenueBase: 1200,
    opening: balancedOpening({
      cash: 120,
      accountsReceivable: 180,
      inventory: 200,
      otherCurrentAssets: 30,
      grossPPE: 1400,
      accumulatedDepreciation: 600,
      otherAssets: 150,
      accountsPayable: 130,
      accruedLiabilities: 60,
      revolver: 40,
      termLoan: 500,
      otherLongTermLiabilities: 120,
      retainedEarnings: 300,
    }),
    drivers: {
      revenueGrowth: 0.06,
      cogsPctRevenue: 0.68,
      sgaPctRevenue: 0.14,
      capexPctRevenue: 0.07,
      depreciationRate: 0.1,
      dso: 55,
      dio: 70,
      dpo: 45,
      taxRate: 0.25,
      dividendPayoutPct: 0.25,
    },
    debt: { revolverRate: 0.06, termLoanRate: 0.055, cashInterestRate: 0.015, termLoanAmortizationPct: 0.1, minCashBalance: 60 },
    equity: { sharesOutstanding: 80 },
  },
  dcf: {
    riskFreeRate: 0.04,
    equityRiskPremium: 0.05,
    beta: 1.0,
    preTaxCostOfDebt: 0.055,
    taxRate: 0.25,
    terminalMethod: 'perpetuity',
    terminalGrowth: 0.02,
    exitMultiple: 8,
    sharesOutstanding: 80,
  },
};

// ── Consumer / retail: thin margins, inventory-heavy, lease-laden ────────────
const retail: Preset = {
  id: 'retail',
  name: 'Consumer / Retail',
  description: 'Low growth, thin ~38% gross margin, inventory and lease liabilities, dividend payer.',
  assumptions: {
    meta: { company: 'ShopWell', years: 5, currency: 'USD', units: 'millions' },
    revenueBase: 2000,
    opening: balancedOpening({
      cash: 150,
      accountsReceivable: 55,
      inventory: 330,
      otherCurrentAssets: 40,
      grossPPE: 1200,
      accumulatedDepreciation: 500,
      otherAssets: 200,
      accountsPayable: 280,
      accruedLiabilities: 90,
      revolver: 30,
      termLoan: 350,
      otherLongTermLiabilities: 250,
      retainedEarnings: 200,
    }),
    drivers: {
      revenueGrowth: 0.04,
      cogsPctRevenue: 0.62,
      sgaPctRevenue: 0.3,
      capexPctRevenue: 0.04,
      depreciationRate: 0.12,
      dso: 10,
      dio: 60,
      dpo: 50,
      taxRate: 0.25,
      dividendPayoutPct: 0.35,
    },
    debt: { revolverRate: 0.07, termLoanRate: 0.06, cashInterestRate: 0.01, termLoanAmortizationPct: 0.08, minCashBalance: 80 },
    equity: { sharesOutstanding: 120 },
  },
  dcf: {
    riskFreeRate: 0.04,
    equityRiskPremium: 0.05,
    beta: 0.9,
    preTaxCostOfDebt: 0.06,
    taxRate: 0.25,
    terminalMethod: 'exitMultiple',
    terminalGrowth: 0.015,
    exitMultiple: 7,
    sharesOutstanding: 120,
  },
};

export const PRESETS: Preset[] = [saas, industrial, retail];

export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}
