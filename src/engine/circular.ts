import type { CircularSolveInfo } from './types.ts';
import { avg } from './schedules.ts';

/**
 * Revolver-as-plug circular-reference solver for a single period.
 *
 * The circularity: revolver/cash balances → interest → net income → cash flow →
 * revolver/cash balances. We resolve it by fixed-point iteration (mirroring
 * Excel's iterative calculation). Term-loan interest is non-circular (its
 * ending balance is deterministic); revolver and cash interest use average
 * balances and therefore iterate.
 *
 * Plug rule (interviewing book, Ch.15): if pre-financing cash ≥ minimum cash,
 * sweep the surplus to pay down the revolver; otherwise draw the revolver to
 * restore the minimum cash balance.
 */
export interface FinancingInput {
  ebit: number;
  depreciation: number;
  changeInAR: number;
  changeInInventory: number;
  changeInAP: number;
  changeInAccrued: number;
  capex: number;
  termLoanRepayment: number;
  termLoanBegin: number;
  termLoanEnd: number;
  equityIssuance: number;
  cashBegin: number;
  revolverBegin: number;
  revolverRate: number;
  termLoanRate: number;
  cashInterestRate: number;
  taxRate: number;
  dividendPayoutPct: number;
  minCash: number;
  maxIterations: number;
  tolerance: number;
  breakCircular: boolean;
}

export interface FinancingResult {
  revolverInterest: number;
  termLoanInterest: number;
  interestIncome: number;
  netInterest: number;
  ebt: number;
  tax: number;
  netIncome: number;
  dividends: number;
  revolverEnd: number;
  cashEnd: number;
  revolverDraw: number;
  cfo: number;
  cfi: number;
  cff: number;
  netChangeInCash: number;
  info: CircularSolveInfo;
}

export function solveFinancing(inp: FinancingInput): FinancingResult {
  const termLoanInterest = inp.termLoanRate * avg(inp.termLoanBegin, inp.termLoanEnd);
  const cfi = -inp.capex;
  const limit = inp.breakCircular ? 1 : inp.maxIterations;

  let revolverEnd = inp.revolverBegin;
  let cashEnd = inp.cashBegin;
  let residual = Infinity;
  let converged = false;
  let used = 0;

  let revolverInterest = 0;
  let interestIncome = 0;
  let netInterest = 0;
  let ebt = 0;
  let tax = 0;
  let netIncome = 0;
  let dividends = 0;
  let cfo = 0;
  let cffExRevolver = 0;

  for (let i = 1; i <= limit; i++) {
    used = i;
    revolverInterest =
      inp.revolverRate * (inp.breakCircular ? inp.revolverBegin : avg(inp.revolverBegin, revolverEnd));
    interestIncome =
      inp.cashInterestRate * (inp.breakCircular ? inp.cashBegin : avg(inp.cashBegin, cashEnd));
    netInterest = revolverInterest + termLoanInterest - interestIncome;

    ebt = inp.ebit - netInterest;
    tax = ebt * inp.taxRate;
    netIncome = ebt - tax;
    dividends = inp.dividendPayoutPct * Math.max(0, netIncome);

    cfo =
      netIncome +
      inp.depreciation -
      inp.changeInAR -
      inp.changeInInventory +
      inp.changeInAP +
      inp.changeInAccrued;
    cffExRevolver = -inp.termLoanRepayment - dividends + inp.equityIssuance;
    const preRevolverCash = inp.cashBegin + cfo + cfi + cffExRevolver;

    let newRevolverEnd: number;
    let newCashEnd: number;
    if (preRevolverCash >= inp.minCash) {
      const paydown = Math.min(inp.revolverBegin, preRevolverCash - inp.minCash);
      newRevolverEnd = inp.revolverBegin - paydown;
      newCashEnd = preRevolverCash - paydown;
    } else {
      const draw = inp.minCash - preRevolverCash;
      newRevolverEnd = inp.revolverBegin + draw;
      newCashEnd = inp.minCash;
    }

    residual = Math.max(
      Math.abs(newRevolverEnd - revolverEnd),
      Math.abs(newCashEnd - cashEnd),
    );
    revolverEnd = newRevolverEnd;
    cashEnd = newCashEnd;

    if (inp.breakCircular || residual < inp.tolerance) {
      converged = true;
      break;
    }
  }

  const revolverDraw = revolverEnd - inp.revolverBegin;
  const cff = cffExRevolver + revolverDraw;
  const netChangeInCash = cfo + cfi + cff;

  return {
    revolverInterest,
    termLoanInterest,
    interestIncome,
    netInterest,
    ebt,
    tax,
    netIncome,
    dividends,
    revolverEnd,
    cashEnd,
    revolverDraw,
    cfo,
    cfi,
    cff,
    netChangeInCash,
    info: { converged, iterations: used, residual },
  };
}
