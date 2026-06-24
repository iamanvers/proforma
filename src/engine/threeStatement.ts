import type {
  BalanceSheet,
  CashFlowStatement,
  IncomeStatement,
  Model,
  Period,
} from './types.ts';
import type { ModelAssumptions } from './schema.ts';
import { solveFinancing } from './circular.ts';
import {
  apFromDPO,
  arFromDSO,
  inventoryFromDIO,
  rollForwardPPE,
  termLoanAmortization,
} from './schedules.ts';

interface BalanceLines {
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
  commonEquity: number;
  retainedEarnings: number;
}

/** Fill subtotals and the balance check from raw balance-sheet line items. */
function assembleBalance(b: BalanceLines): BalanceSheet {
  const totalCurrentAssets =
    b.cash + b.accountsReceivable + b.inventory + b.otherCurrentAssets;
  const netPPE = b.grossPPE - b.accumulatedDepreciation;
  const totalAssets = totalCurrentAssets + netPPE + b.otherAssets;

  const totalCurrentLiabilities = b.accountsPayable + b.accruedLiabilities + b.revolver;
  const totalLiabilities =
    totalCurrentLiabilities + b.termLoan + b.otherLongTermLiabilities;

  const totalEquity = b.commonEquity + b.retainedEarnings;
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

  return {
    cash: b.cash,
    accountsReceivable: b.accountsReceivable,
    inventory: b.inventory,
    otherCurrentAssets: b.otherCurrentAssets,
    totalCurrentAssets,
    grossPPE: b.grossPPE,
    accumulatedDepreciation: b.accumulatedDepreciation,
    netPPE,
    otherAssets: b.otherAssets,
    totalAssets,
    accountsPayable: b.accountsPayable,
    accruedLiabilities: b.accruedLiabilities,
    revolver: b.revolver,
    totalCurrentLiabilities,
    termLoan: b.termLoan,
    otherLongTermLiabilities: b.otherLongTermLiabilities,
    totalLiabilities,
    commonEquity: b.commonEquity,
    retainedEarnings: b.retainedEarnings,
    totalEquity,
    totalLiabilitiesAndEquity,
    balanceCheck: totalAssets - totalLiabilitiesAndEquity,
  };
}

/** Build the integrated 3-statement model from validated assumptions. */
export function buildModel(a: ModelAssumptions): Model {
  const { drivers: d, debt, equity, circular, opening: o } = a;

  const openingBalance = assembleBalance(o);
  const periods: Period[] = [];

  let prev = openingBalance;
  let prevRevenue = a.revenueBase;
  const originalTermLoan = o.termLoan;

  for (let t = 1; t <= a.meta.years; t++) {
    const revenue = prevRevenue * (1 + d.revenueGrowth);
    const cogs = revenue * d.cogsPctRevenue;
    const grossProfit = revenue - cogs;
    const sga = revenue * d.sgaPctRevenue + d.sgaFixed;
    const ebitda = grossProfit - sga;

    const capex = revenue * d.capexPctRevenue;
    const ppe = rollForwardPPE(
      prev.grossPPE,
      prev.accumulatedDepreciation,
      capex,
      d.depreciationRate,
    );
    const ebit = ebitda - ppe.depreciation;

    // Working capital (other current assets / accrued held constant).
    const accountsReceivable = arFromDSO(revenue, d.dso);
    const inventory = inventoryFromDIO(cogs, d.dio);
    const accountsPayable = apFromDPO(cogs, d.dpo);
    const otherCurrentAssets = prev.otherCurrentAssets;
    const accruedLiabilities = prev.accruedLiabilities;

    const changeInAR = accountsReceivable - prev.accountsReceivable;
    const changeInInventory = inventory - prev.inventory;
    const changeInAP = accountsPayable - prev.accountsPayable;
    const changeInAccrued = accruedLiabilities - prev.accruedLiabilities;

    // Term loan schedule (deterministic).
    const termLoanBegin = prev.termLoan;
    const termLoanRepayment = termLoanAmortization(
      termLoanBegin,
      originalTermLoan,
      debt.termLoanAmortizationPct,
    );
    const termLoanEnd = termLoanBegin - termLoanRepayment;

    // Resolve the revolver/interest circular reference.
    const fin = solveFinancing({
      ebit,
      depreciation: ppe.depreciation,
      changeInAR,
      changeInInventory,
      changeInAP,
      changeInAccrued,
      capex,
      termLoanRepayment,
      termLoanBegin,
      termLoanEnd,
      equityIssuance: equity.newEquityIssuancePerYear,
      cashBegin: prev.cash,
      revolverBegin: prev.revolver,
      revolverRate: debt.revolverRate,
      termLoanRate: debt.termLoanRate,
      cashInterestRate: debt.cashInterestRate,
      taxRate: d.taxRate,
      dividendPayoutPct: d.dividendPayoutPct,
      minCash: debt.minCashBalance,
      maxIterations: circular.maxIterations,
      tolerance: circular.tolerance,
      breakCircular: circular.breakCircular,
    });

    const income: IncomeStatement = {
      revenue,
      cogs,
      grossProfit,
      sga,
      ebitda,
      depreciation: ppe.depreciation,
      ebit,
      revolverInterest: fin.revolverInterest,
      termLoanInterest: fin.termLoanInterest,
      interestIncome: fin.interestIncome,
      netInterest: fin.netInterest,
      ebt: fin.ebt,
      tax: fin.tax,
      netIncome: fin.netIncome,
    };

    const retainedEarnings = prev.retainedEarnings + fin.netIncome - fin.dividends;
    const commonEquity = prev.commonEquity + equity.newEquityIssuancePerYear;

    const balance = assembleBalance({
      cash: fin.cashEnd,
      accountsReceivable,
      inventory,
      otherCurrentAssets,
      grossPPE: ppe.grossPPE,
      accumulatedDepreciation: ppe.accumulatedDepreciation,
      otherAssets: prev.otherAssets,
      accountsPayable,
      accruedLiabilities,
      revolver: fin.revolverEnd,
      termLoan: termLoanEnd,
      otherLongTermLiabilities: prev.otherLongTermLiabilities,
      commonEquity,
      retainedEarnings,
    });

    const cashFlow: CashFlowStatement = {
      netIncome: fin.netIncome,
      depreciation: ppe.depreciation,
      changeInAR,
      changeInInventory,
      changeInAP,
      changeInAccrued,
      cfo: fin.cfo,
      capex,
      cfi: fin.cfi,
      termLoanRepayment,
      dividends: fin.dividends,
      equityIssuance: equity.newEquityIssuancePerYear,
      revolverDraw: fin.revolverDraw,
      cff: fin.cff,
      netChangeInCash: fin.netChangeInCash,
      beginningCash: prev.cash,
      endingCash: fin.cashEnd,
    };

    periods.push({ label: `Year ${t}`, income, balance, cashFlow, circular: fin.info });

    prev = balance;
    prevRevenue = revenue;
  }

  return {
    meta: {
      company: a.meta.company,
      currency: a.meta.currency,
      units: a.meta.units,
      years: a.meta.years,
    },
    opening: openingBalance,
    periods,
  };
}
