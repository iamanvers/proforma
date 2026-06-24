/** Small, pure schedule helpers used by the 3-statement assembler. */

export const avg = (a: number, b: number): number => (a + b) / 2;

/** Straight-line-ish depreciation on the BEGINNING gross PP&E balance. New
 * capex begins depreciating the following year, which avoids same-year
 * capex↔depreciation coupling. Capped so accumulated depreciation never
 * exceeds gross PP&E. */
export function depreciation(
  beginningGrossPPE: number,
  beginningAccumDep: number,
  rate: number,
): number {
  const raw = rate * beginningGrossPPE;
  const remaining = Math.max(0, beginningGrossPPE - beginningAccumDep);
  return Math.min(raw, remaining);
}

export interface PPERoll {
  grossPPE: number;
  accumulatedDepreciation: number;
  netPPE: number;
  depreciation: number;
}

export function rollForwardPPE(
  beginningGrossPPE: number,
  beginningAccumDep: number,
  capex: number,
  rate: number,
): PPERoll {
  const dep = depreciation(beginningGrossPPE, beginningAccumDep, rate);
  const grossPPE = beginningGrossPPE + capex;
  const accumulatedDepreciation = beginningAccumDep + dep;
  return {
    grossPPE,
    accumulatedDepreciation,
    netPPE: grossPPE - accumulatedDepreciation,
    depreciation: dep,
  };
}

/** Mandatory term-loan amortization: a fixed % of the ORIGINAL balance each
 * year, floored at the remaining balance. */
export function termLoanAmortization(
  beginningBalance: number,
  originalBalance: number,
  amortizationPct: number,
): number {
  return Math.min(beginningBalance, amortizationPct * originalBalance);
}

/** Working-capital balances from activity-day drivers. */
export const arFromDSO = (revenue: number, dso: number): number => (revenue * dso) / 365;
export const inventoryFromDIO = (cogs: number, dio: number): number => (cogs * dio) / 365;
export const apFromDPO = (cogs: number, dpo: number): number => (cogs * dpo) / 365;
