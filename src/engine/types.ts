/**
 * Output types for the deterministic financial engine.
 * All figures are plain IEEE-754 numbers (to match Excel's own arithmetic).
 */

export interface IncomeStatement {
  revenue: number;
  cogs: number;
  grossProfit: number;
  sga: number;
  ebitda: number;
  depreciation: number;
  ebit: number;
  revolverInterest: number;
  termLoanInterest: number;
  interestIncome: number;
  netInterest: number; // interest expense net of interest income
  ebt: number;
  tax: number;
  netIncome: number;
}

export interface BalanceSheet {
  cash: number;
  accountsReceivable: number;
  inventory: number;
  otherCurrentAssets: number;
  totalCurrentAssets: number;
  grossPPE: number;
  accumulatedDepreciation: number;
  netPPE: number;
  otherAssets: number;
  totalAssets: number;

  accountsPayable: number;
  accruedLiabilities: number;
  revolver: number;
  totalCurrentLiabilities: number;
  termLoan: number;
  otherLongTermLiabilities: number;
  totalLiabilities: number;

  commonEquity: number;
  retainedEarnings: number;
  totalEquity: number;

  totalLiabilitiesAndEquity: number;
  /** assets − (liabilities + equity); should be ~0. */
  balanceCheck: number;
}

export interface CashFlowStatement {
  netIncome: number;
  depreciation: number;
  changeInAR: number;
  changeInInventory: number;
  changeInAP: number;
  changeInAccrued: number;
  cfo: number;

  capex: number;
  cfi: number;

  termLoanRepayment: number;
  dividends: number;
  equityIssuance: number;
  revolverDraw: number; // + draw, − paydown
  cff: number;

  netChangeInCash: number;
  beginningCash: number;
  endingCash: number;
}

export interface CircularSolveInfo {
  converged: boolean;
  iterations: number;
  residual: number;
}

export interface Period {
  /** e.g. "2026E" or "Year 1". */
  label: string;
  income: IncomeStatement;
  balance: BalanceSheet;
  cashFlow: CashFlowStatement;
  circular: CircularSolveInfo;
}

export interface Model {
  meta: { company: string; currency: string; units: string; years: number };
  /** Opening balance sheet (period 0). */
  opening: BalanceSheet;
  /** Forecast periods 1..N. */
  periods: Period[];
}
