import type { BalanceSheet, Model, Period } from '../engine/types.ts';
import type { ModelAssumptions } from '../engine/schema.ts';
import type { DCFResult } from '../engine/dcf.ts';
import type { CheckCategory, CheckResult, Severity } from './types.ts';

/**
 * The check catalog. Each function appends `CheckResult`s for one category.
 * Categories 1–4 run over the engine output here; category 5 (Excel mechanics)
 * is added in P3 once the workbook writer exists.
 */

/** Relative tie-out tolerance, scaled by the magnitude of the figures. */
const TIE_EPS = 1e-6;

type Base = { id: string; category: CheckCategory; title: string; period?: string };

function rec(
  out: CheckResult[],
  base: Base,
  status: CheckResult['status'],
  severity: Severity,
  message: string,
  detail?: CheckResult['detail'],
): void {
  out.push({ ...base, status, severity, message, ...(detail ? { detail } : {}) });
}

const fmt = (x: number): string =>
  Math.abs(x) >= 1e6 || (x !== 0 && Math.abs(x) < 1e-3)
    ? x.toExponential(2)
    : x.toLocaleString('en-US', { maximumFractionDigits: 2 });

/** Assert two figures are equal within a magnitude-scaled tolerance. */
function tie(
  out: CheckResult[],
  base: Base,
  label: string,
  actual: number,
  expected: number,
  scale: number,
): void {
  const diff = Math.abs(actual - expected);
  const tol = TIE_EPS * Math.max(1, Math.abs(scale));
  if (diff <= tol) {
    rec(out, base, 'pass', 'error', `${label} ties out.`, { actual, expected, tolerance: tol });
  } else {
    rec(
      out,
      base,
      'fail',
      'error',
      `${label} is off by ${fmt(diff)} (tolerance ${fmt(tol)}).`,
      { actual, expected, tolerance: tol },
    );
  }
}

/** Assert a value falls within [lo, hi]; otherwise warn (or fail if severe). */
function range(
  out: CheckResult[],
  base: Base,
  label: string,
  value: number,
  lo: number,
  hi: number,
  severity: Severity = 'warn',
): void {
  if (value >= lo && value <= hi) {
    rec(out, base, 'pass', severity, `${label} (${fmt(value)}) is within [${lo}, ${hi}].`, {
      actual: value,
    });
  } else {
    rec(
      out,
      base,
      severity === 'error' ? 'fail' : 'warn',
      severity,
      `${label} (${fmt(value)}) is outside the expected range [${lo}, ${hi}].`,
      { actual: value },
    );
  }
}

// ── Category 1: math / tie-out ───────────────────────────────────────────────

function checkBalanceCrossfoot(out: CheckResult[], b: BalanceSheet, period: string): void {
  const cat: CheckCategory = 'math';
  tie(
    out,
    { id: 'math.bs-balances', category: cat, title: 'Balance sheet balances', period },
    'Assets = Liabilities + Equity',
    b.totalAssets,
    b.totalLiabilitiesAndEquity,
    b.totalAssets,
  );
  tie(
    out,
    { id: 'math.tca-crossfoot', category: cat, title: 'Current assets crossfoot', period },
    'Total current assets',
    b.totalCurrentAssets,
    b.cash + b.accountsReceivable + b.inventory + b.otherCurrentAssets,
    b.totalAssets,
  );
  tie(
    out,
    { id: 'math.netppe', category: cat, title: 'Net PP&E', period },
    'Net PP&E = gross − accumulated depreciation',
    b.netPPE,
    b.grossPPE - b.accumulatedDepreciation,
    b.totalAssets,
  );
  tie(
    out,
    { id: 'math.assets-crossfoot', category: cat, title: 'Total assets crossfoot', period },
    'Total assets',
    b.totalAssets,
    b.totalCurrentAssets + b.netPPE + b.otherAssets,
    b.totalAssets,
  );
  tie(
    out,
    { id: 'math.liab-crossfoot', category: cat, title: 'Total liabilities crossfoot', period },
    'Total liabilities',
    b.totalLiabilities,
    b.totalCurrentLiabilities + b.termLoan + b.otherLongTermLiabilities,
    b.totalAssets,
  );
  tie(
    out,
    { id: 'math.equity-crossfoot', category: cat, title: 'Total equity crossfoot', period },
    'Total equity',
    b.totalEquity,
    b.commonEquity + b.retainedEarnings,
    b.totalAssets,
  );
}

export function checkMath(out: CheckResult[], model: Model): void {
  const cat: CheckCategory = 'math';
  checkBalanceCrossfoot(out, model.opening, 'Opening');

  let prev: BalanceSheet = model.opening;
  for (const p of model.periods) {
    const period = p.label;
    checkBalanceCrossfoot(out, p.balance, period);

    // Income statement crossfoot.
    tie(
      out,
      { id: 'math.is-gross', category: cat, title: 'Gross profit crossfoot', period },
      'Gross profit = revenue − COGS',
      p.income.grossProfit,
      p.income.revenue - p.income.cogs,
      p.income.revenue,
    );
    tie(
      out,
      { id: 'math.is-ebitda', category: cat, title: 'EBITDA crossfoot', period },
      'EBITDA = gross profit − SG&A',
      p.income.ebitda,
      p.income.grossProfit - p.income.sga,
      p.income.revenue,
    );
    tie(
      out,
      { id: 'math.is-ebit', category: cat, title: 'EBIT crossfoot', period },
      'EBIT = EBITDA − depreciation',
      p.income.ebit,
      p.income.ebitda - p.income.depreciation,
      p.income.revenue,
    );
    tie(
      out,
      { id: 'math.is-netinterest', category: cat, title: 'Net interest crossfoot', period },
      'Net interest = revolver + term-loan interest − interest income',
      p.income.netInterest,
      p.income.revolverInterest + p.income.termLoanInterest - p.income.interestIncome,
      p.income.revenue,
    );
    tie(
      out,
      { id: 'math.is-netincome', category: cat, title: 'Net income crossfoot', period },
      'Net income = EBIT − net interest − tax',
      p.income.netIncome,
      p.income.ebit - p.income.netInterest - p.income.tax,
      p.income.revenue,
    );

    // Cash flow ties to the balance sheet.
    tie(
      out,
      { id: 'math.cfs-cash-tie', category: cat, title: 'Cash flow ties to balance sheet', period },
      'CFS ending cash = BS cash',
      p.cashFlow.endingCash,
      p.balance.cash,
      Math.max(1, Math.abs(p.balance.cash)),
    );
    tie(
      out,
      { id: 'math.cfs-rollforward', category: cat, title: 'Cash roll-forward', period },
      'Ending cash = beginning cash + net change',
      p.cashFlow.endingCash,
      p.cashFlow.beginningCash + p.cashFlow.netChangeInCash,
      Math.max(1, Math.abs(p.balance.cash)),
    );

    // Retained-earnings roll-forward.
    tie(
      out,
      { id: 'math.re-rollforward', category: cat, title: 'Retained-earnings roll-forward', period },
      'RE = prior RE + net income − dividends',
      p.balance.retainedEarnings,
      prev.retainedEarnings + p.income.netIncome - p.cashFlow.dividends,
      p.balance.totalEquity,
    );

    // PP&E roll-forward.
    tie(
      out,
      { id: 'math.gross-ppe-rollforward', category: cat, title: 'Gross PP&E roll-forward', period },
      'Gross PP&E = prior gross + capex',
      p.balance.grossPPE,
      prev.grossPPE + p.cashFlow.capex,
      Math.max(1, p.balance.grossPPE),
    );
    tie(
      out,
      {
        id: 'math.accum-dep-rollforward',
        category: cat,
        title: 'Accumulated depreciation roll-forward',
        period,
      },
      'Accumulated depreciation = prior + depreciation',
      p.balance.accumulatedDepreciation,
      prev.accumulatedDepreciation + p.income.depreciation,
      Math.max(1, p.balance.grossPPE),
    );

    prev = p.balance;
  }
}

// ── Category 2: circular references ──────────────────────────────────────────

export function checkCircular(out: CheckResult[], model: Model): void {
  const cat: CheckCategory = 'circular';
  for (const p of model.periods) {
    const base: Base = {
      id: 'circular.converged',
      category: cat,
      title: 'Revolver circularity converges',
      period: p.label,
    };
    if (p.circular.converged && p.circular.residual < 1e-3) {
      rec(
        out,
        base,
        'pass',
        'error',
        `Converged in ${p.circular.iterations} iterations (residual ${fmt(p.circular.residual)}).`,
        { actual: p.circular.residual },
      );
    } else if (!p.circular.converged) {
      rec(
        out,
        base,
        'fail',
        'error',
        `Did not converge within the iteration limit (residual ${fmt(p.circular.residual)}). ` +
          `The revolver/interest loop is unstable for these assumptions.`,
        { actual: p.circular.residual },
      );
    } else {
      rec(
        out,
        base,
        'warn',
        'warn',
        `Marked converged but residual ${fmt(p.circular.residual)} is larger than expected.`,
        { actual: p.circular.residual },
      );
    }
  }
}

// ── Category 4: financial logic ──────────────────────────────────────────────

function checkPeriodLogic(out: CheckResult[], p: Period): void {
  const cat: CheckCategory = 'logic';
  const period = p.label;
  const b = p.balance;

  // Revenue should be positive.
  rec(
    out,
    { id: 'logic.revenue-positive', category: cat, title: 'Revenue is positive', period },
    p.income.revenue > 0 ? 'pass' : 'warn',
    'warn',
    p.income.revenue > 0
      ? `Revenue is ${fmt(p.income.revenue)}.`
      : `Revenue is non-positive (${fmt(p.income.revenue)}).`,
    { actual: p.income.revenue },
  );

  // COGS should not exceed revenue (gross margin ≥ 0 / ≤ 100%).
  rec(
    out,
    { id: 'logic.gross-margin', category: cat, title: 'Gross margin within 0–100%', period },
    p.income.cogs >= 0 && p.income.cogs <= p.income.revenue ? 'pass' : 'warn',
    'warn',
    p.income.cogs <= p.income.revenue
      ? `Gross margin is ${fmt((p.income.grossProfit / p.income.revenue) * 100)}%.`
      : `COGS (${fmt(p.income.cogs)}) exceeds revenue (${fmt(p.income.revenue)}) — negative gross margin.`,
  );

  // Cash should not be negative.
  rec(
    out,
    { id: 'logic.cash-nonneg', category: cat, title: 'Cash is non-negative', period },
    b.cash >= -TIE_EPS ? 'pass' : 'fail',
    'error',
    b.cash >= -TIE_EPS
      ? `Ending cash is ${fmt(b.cash)}.`
      : `Ending cash is negative (${fmt(b.cash)}); the revolver should have plugged the shortfall.`,
    { actual: b.cash },
  );

  // Accumulated depreciation cannot exceed gross PP&E.
  rec(
    out,
    { id: 'logic.dep-le-ppe', category: cat, title: 'Depreciation ≤ gross PP&E', period },
    b.accumulatedDepreciation <= b.grossPPE + TIE_EPS ? 'pass' : 'fail',
    'error',
    b.accumulatedDepreciation <= b.grossPPE + TIE_EPS
      ? `Accumulated depreciation (${fmt(b.accumulatedDepreciation)}) ≤ gross PP&E (${fmt(b.grossPPE)}).`
      : `Accumulated depreciation (${fmt(b.accumulatedDepreciation)}) exceeds gross PP&E (${fmt(b.grossPPE)}).`,
  );

  // Negative equity is a going-concern flag.
  rec(
    out,
    { id: 'logic.positive-equity', category: cat, title: 'Equity is positive', period },
    b.totalEquity > 0 ? 'pass' : 'warn',
    'warn',
    b.totalEquity > 0
      ? `Total equity is ${fmt(b.totalEquity)}.`
      : `Total equity is non-positive (${fmt(b.totalEquity)}) — possible going-concern issue.`,
    { actual: b.totalEquity },
  );

  // Interest coverage.
  const interest = p.income.revolverInterest + p.income.termLoanInterest;
  if (interest > TIE_EPS) {
    const coverage = p.income.ebit / interest;
    rec(
      out,
      { id: 'logic.interest-coverage', category: cat, title: 'Interest coverage ≥ 1×', period },
      coverage >= 1 ? 'pass' : 'warn',
      'warn',
      coverage >= 1
        ? `EBIT covers interest ${fmt(coverage)}×.`
        : `EBIT covers interest only ${fmt(coverage)}× (< 1×).`,
      { actual: coverage },
    );
  }
}

export function checkLogic(out: CheckResult[], model: Model): void {
  for (const p of model.periods) checkPeriodLogic(out, p);
}

// ── Category 3: assumptions sanity ───────────────────────────────────────────

export function checkAssumptions(out: CheckResult[], a: ModelAssumptions): void {
  const cat: CheckCategory = 'assumptions';
  const d = a.drivers;
  const mk = (id: string, title: string): Base => ({ id, category: cat, title });

  range(out, mk('assume.revenue-growth', 'Revenue growth plausible'), 'Revenue growth', d.revenueGrowth, -0.5, 1.0);
  range(out, mk('assume.cogs-pct', 'COGS % of revenue'), 'COGS % of revenue', d.cogsPctRevenue, 0, 1);
  range(out, mk('assume.sga-pct', 'SG&A % of revenue'), 'SG&A % of revenue', d.sgaPctRevenue, 0, 1);
  range(out, mk('assume.capex-pct', 'Capex % of revenue'), 'Capex % of revenue', d.capexPctRevenue, 0, 1);
  range(out, mk('assume.dep-rate', 'Depreciation rate'), 'Depreciation rate', d.depreciationRate, 0, 1);
  range(out, mk('assume.dso', 'DSO plausible'), 'DSO (days)', d.dso, 0, 365);
  range(out, mk('assume.dio', 'DIO plausible'), 'DIO (days)', d.dio, 0, 365);
  range(out, mk('assume.dpo', 'DPO plausible'), 'DPO (days)', d.dpo, 0, 365);
  range(out, mk('assume.tax-rate', 'Tax rate plausible'), 'Tax rate', d.taxRate, 0, 0.6);
  range(out, mk('assume.dividend-payout', 'Dividend payout 0–100%'), 'Dividend payout', d.dividendPayoutPct, 0, 1);

  range(out, mk('assume.revolver-rate', 'Revolver rate plausible'), 'Revolver rate', a.debt.revolverRate, 0, 0.25);
  range(out, mk('assume.termloan-rate', 'Term-loan rate plausible'), 'Term-loan rate', a.debt.termLoanRate, 0, 0.25);
  range(out, mk('assume.cash-rate', 'Cash interest rate plausible'), 'Cash interest rate', a.debt.cashInterestRate, 0, 0.15);

  // Combined COGS + SG&A leaving no operating margin is worth flagging.
  const opMargin = 1 - d.cogsPctRevenue - d.sgaPctRevenue;
  rec(
    out,
    mk('assume.operating-margin', 'Positive operating margin'),
    opMargin > 0 ? 'pass' : 'warn',
    'warn',
    opMargin > 0
      ? `Implied EBITDA margin before fixed SG&A is ${fmt(opMargin * 100)}%.`
      : `COGS + SG&A (${fmt((d.cogsPctRevenue + d.sgaPctRevenue) * 100)}%) leave no operating margin.`,
    { actual: opMargin },
  );
}

// ── DCF: math tie-outs + financial logic ─────────────────────────────────────

export function checkDCF(out: CheckResult[], dcf: DCFResult): void {
  const math: Base = { id: 'dcf.ev-crossfoot', category: 'math', title: 'Enterprise value ties out' };
  tie(
    out,
    math,
    'EV = PV(forecast UFCF) + PV(terminal value)',
    dcf.enterpriseValue,
    dcf.pvOfForecast + dcf.pvOfTerminalValue,
    Math.max(1, Math.abs(dcf.enterpriseValue)),
  );
  tie(
    out,
    { id: 'dcf.equity-bridge', category: 'math', title: 'Equity value bridge ties out' },
    'Equity value = EV − net debt',
    dcf.equityValue,
    dcf.enterpriseValue - dcf.netDebt,
    Math.max(1, Math.abs(dcf.equityValue)),
  );
  tie(
    out,
    { id: 'dcf.netdebt-crossfoot', category: 'math', title: 'Net debt crossfoot' },
    'Net debt = total debt − cash',
    dcf.netDebt,
    dcf.totalDebt - dcf.cash,
    Math.max(1, Math.abs(dcf.totalDebt)),
  );
  tie(
    out,
    { id: 'dcf.pv-forecast-sum', category: 'math', title: 'PV of forecast crossfoot' },
    'PV of forecast = Σ discounted UFCF',
    dcf.pvOfForecast,
    dcf.periods.reduce((s, p) => s + p.presentValue, 0),
    Math.max(1, Math.abs(dcf.pvOfForecast)),
  );

  // Gordon model is only well-defined when WACC > terminal growth.
  rec(
    out,
    { id: 'dcf.wacc-gt-growth', category: 'logic', title: 'WACC exceeds terminal growth' },
    dcf.terminalMethod === 'exitMultiple' || dcf.terminalValid ? 'pass' : 'fail',
    'error',
    dcf.terminalMethod === 'exitMultiple'
      ? `Exit-multiple terminal value (no perpetuity constraint).`
      : dcf.terminalValid
        ? `WACC (${fmt(dcf.wacc * 100)}%) exceeds terminal growth — Gordon model is well-defined.`
        : `WACC (${fmt(dcf.wacc * 100)}%) does not exceed terminal growth; the perpetuity is invalid.`,
    { actual: dcf.wacc },
  );

  // Cost of equity should exceed after-tax cost of debt.
  rec(
    out,
    { id: 'dcf.ke-gt-kd', category: 'logic', title: 'Cost of equity exceeds cost of debt' },
    dcf.costOfEquity >= dcf.costOfDebtAfterTax ? 'pass' : 'warn',
    'warn',
    dcf.costOfEquity >= dcf.costOfDebtAfterTax
      ? `Cost of equity (${fmt(dcf.costOfEquity * 100)}%) ≥ after-tax cost of debt (${fmt(dcf.costOfDebtAfterTax * 100)}%).`
      : `Cost of equity (${fmt(dcf.costOfEquity * 100)}%) is below after-tax cost of debt — unusual.`,
  );

  // Enterprise value should be positive.
  rec(
    out,
    { id: 'dcf.ev-positive', category: 'logic', title: 'Enterprise value is positive' },
    dcf.enterpriseValue > 0 ? 'pass' : 'warn',
    'warn',
    dcf.enterpriseValue > 0
      ? `Enterprise value is ${fmt(dcf.enterpriseValue)}.`
      : `Enterprise value is non-positive (${fmt(dcf.enterpriseValue)}).`,
    { actual: dcf.enterpriseValue },
  );

  // A terminal value dominating EV signals over-reliance on the long-run assumption.
  range(
    out,
    { id: 'dcf.tv-share', category: 'logic', title: 'Terminal value share of EV' },
    'Terminal value as % of EV',
    dcf.terminalValuePctOfEV,
    0,
    0.85,
  );

  // WACC should land in a plausible band.
  range(
    out,
    { id: 'dcf.wacc-range', category: 'assumptions', title: 'WACC plausible' },
    'WACC',
    dcf.wacc,
    0.04,
    0.2,
  );
}
