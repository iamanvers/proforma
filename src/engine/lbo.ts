import { z } from 'zod';

/**
 * Leveraged-buyout model (deterministic; no LLM, no DOM).
 *
 * Reuses the project's operating-driver conventions (revenue growth, margin,
 * capex / D&A / working-capital as % of revenue) to produce cash flow available
 * for debt service, then runs a multi-tranche debt waterfall with mandatory
 * amortization, an optional excess-cash sweep, and a revolver backstop, and
 * computes sponsor returns (MOIC / IRR) and credit stats.
 *
 * Conventions (documented because they vary by desk):
 *  - Interest accrues on **beginning-of-period** balances, so the cash sweep is
 *    non-circular and the waterfall resolves in a single pass per year.
 *  - PIK tranches accrue interest to principal (tax-deductible) and never sweep.
 *  - No interim distributions, so IRR has the closed form MOIC^(1/years) − 1.
 *  - No NOL carryforward (cash tax floors at zero each year).
 */

const pct = z.number();

export const LBOTrancheSchema = z.object({
  name: z.string(),
  /** Size as a multiple of entry EBITDA (e.g. 4.0 = "4.0x"). */
  turns: z.number(),
  rate: pct,
  /** Mandatory amortization as a % of the ORIGINAL balance each year. */
  amortizationPct: pct.default(0),
  /** Participates in the excess-cash sweep. */
  cashSweep: z.boolean().default(true),
  /** Pay-in-kind: interest accrues to principal instead of being paid in cash. */
  pik: z.boolean().default(false),
});

export const LBOAssumptionsSchema = z.object({
  meta: z.object({
    company: z.string().default('TargetCo'),
    holdYears: z.number().int().min(1).max(10).default(5),
    currency: z.string().default('USD'),
    units: z.string().default('millions'),
  }),
  revenueBase: z.number(),
  ebitdaMargin: pct,
  revenueGrowth: pct,
  capexPctRevenue: pct.default(0),
  depreciationPctRevenue: pct.default(0),
  /** Net working capital as a % of revenue; the change is a use/source of cash. */
  nwcPctRevenue: pct.default(0),
  taxRate: pct.default(0.25),
  entryMultiple: z.number(), // EV / entry EBITDA
  exitMultiple: z.number(), // EV / exit EBITDA
  transactionFeesPct: pct.default(0), // of entry EV
  financingFeesPct: pct.default(0), // of new debt
  minCash: z.number().default(0),
  revolverRate: pct.default(0),
  /** Share of post-mandatory excess cash applied to the sweep (1 = full sweep). */
  cashSweepPct: pct.default(1),
  rolloverEquity: z.number().default(0),
  tranches: z.array(LBOTrancheSchema).default([]),
});

export type LBOAssumptions = z.infer<typeof LBOAssumptionsSchema>;
export type LBOInput = z.input<typeof LBOAssumptionsSchema>;

export interface LBOSourcesUses {
  entryEbitda: number;
  entryEV: number;
  transactionFees: number;
  financingFees: number;
  minCash: number;
  newDebt: Array<{ name: string; amount: number }>;
  newDebtTotal: number;
  rolloverEquity: number;
  sponsorEquity: number;
  totalUses: number;
  totalSources: number;
  entryNetDebt: number;
  entryLeverage: number; // net debt / entry EBITDA
}

export interface LBOPeriod {
  label: string;
  revenue: number;
  ebitda: number;
  depreciation: number;
  ebit: number;
  cashInterest: number;
  pikInterest: number;
  totalInterest: number;
  cashTaxes: number;
  capex: number;
  deltaNwc: number;
  cfads: number; // cash flow available for debt service
  mandatory: number;
  sweep: number;
  revolverDraw: number;
  trancheBalances: number[];
  revolver: number;
  cash: number;
  totalDebt: number;
  netDebt: number;
  leverage: number; // net debt / EBITDA
  interestCoverage: number; // EBITDA / total interest
}

export interface LBOResult {
  sourcesUses: LBOSourcesUses;
  periods: LBOPeriod[];
  exit: {
    exitEbitda: number;
    exitMultiple: number;
    exitEV: number;
    exitNetDebt: number;
    exitEquity: number;
    sponsorShare: number;
    sponsorProceeds: number;
  };
  returns: { moic: number; irr: number; holdYears: number };
}

export function computeLBO(a: LBOAssumptions): LBOResult {
  const entryEbitda = a.revenueBase * a.ebitdaMargin;
  const entryEV = entryEbitda * a.entryMultiple;
  const sized = a.tranches.map((t) => ({ ...t, amount: t.turns * entryEbitda }));
  const newDebtTotal = sized.reduce((s, t) => s + t.amount, 0);
  const financingFees = a.financingFeesPct * newDebtTotal;
  const transactionFees = a.transactionFeesPct * entryEV;
  const totalUses = entryEV + transactionFees + financingFees + a.minCash;
  const sponsorEquity = totalUses - newDebtTotal - a.rolloverEquity;

  const original = sized.map((t) => t.amount);
  let balances = [...original];
  let revolver = 0;
  let cash = a.minCash;
  let prevRevenue = a.revenueBase;
  const periods: LBOPeriod[] = [];

  for (let y = 1; y <= a.meta.holdYears; y++) {
    const revenue = prevRevenue * (1 + a.revenueGrowth);
    const ebitda = revenue * a.ebitdaMargin;
    const depreciation = revenue * a.depreciationPctRevenue;
    const ebit = ebitda - depreciation;
    const capex = revenue * a.capexPctRevenue;
    const deltaNwc = a.nwcPctRevenue * (revenue - prevRevenue);

    // Interest on beginning balances; PIK accrues to principal.
    let cashInterest = 0;
    let pikInterest = 0;
    const pikAccrual = balances.map((b, i) => {
      const t = sized[i]!;
      const interest = t.rate * b;
      if (t.pik) {
        pikInterest += interest;
        return interest;
      }
      cashInterest += interest;
      return 0;
    });
    const revolverInterest = a.revolverRate * revolver;
    cashInterest += revolverInterest;
    const totalInterest = cashInterest + pikInterest;

    const ebt = ebit - totalInterest;
    const cashTaxes = Math.max(0, ebt) * a.taxRate;
    const cfads = ebitda - capex - deltaNwc - cashInterest - cashTaxes;

    // Mandatory amortization (non-PIK), floored at the remaining balance.
    const mandatory = balances.map((b, i) => {
      const t = sized[i]!;
      return t.pik ? 0 : Math.min(b, t.amortizationPct * original[i]!);
    });
    const totalMandatory = mandatory.reduce((s, x) => s + x, 0);

    const newBalances = balances.map((b, i) => b - mandatory[i]! + pikAccrual[i]!);
    const swept = newBalances.map(() => 0);
    let revolverDraw = 0;

    const preSweepCash = cash + cfads - totalMandatory;
    if (preSweepCash < a.minCash) {
      revolverDraw = a.minCash - preSweepCash;
      revolver += revolverDraw;
      cash = a.minCash;
    } else {
      let surplus = preSweepCash - a.minCash;
      const revPay = Math.min(revolver, surplus);
      revolver -= revPay;
      surplus -= revPay;
      let budget = a.cashSweepPct * surplus;
      for (let i = 0; i < newBalances.length; i++) {
        const t = sized[i]!;
        if (!t.cashSweep || t.pik || budget <= 1e-9) continue;
        const pay = Math.min(newBalances[i]!, budget);
        newBalances[i]! -= pay;
        swept[i] = pay;
        budget -= pay;
      }
      const totalSwept = swept.reduce((s, x) => s + x, 0);
      cash = a.minCash + surplus - totalSwept;
    }

    balances = newBalances;
    const totalDebt = balances.reduce((s, x) => s + x, 0) + revolver;
    const netDebt = totalDebt - cash;
    periods.push({
      label: `Year ${y}`,
      revenue,
      ebitda,
      depreciation,
      ebit,
      cashInterest,
      pikInterest,
      totalInterest,
      cashTaxes,
      capex,
      deltaNwc,
      cfads,
      mandatory: totalMandatory,
      sweep: swept.reduce((s, x) => s + x, 0),
      revolverDraw,
      trancheBalances: [...balances],
      revolver,
      cash,
      totalDebt,
      netDebt,
      leverage: ebitda !== 0 ? netDebt / ebitda : 0,
      interestCoverage: totalInterest > 1e-9 ? ebitda / totalInterest : Infinity,
    });
    prevRevenue = revenue;
  }

  const last = periods[periods.length - 1]!;
  const exitEbitda = last.ebitda;
  const exitEV = exitEbitda * a.exitMultiple;
  const exitNetDebt = last.netDebt;
  const exitEquity = exitEV - exitNetDebt;
  const totalEquityInvested = sponsorEquity + a.rolloverEquity;
  const sponsorShare = totalEquityInvested > 0 ? sponsorEquity / totalEquityInvested : 1;
  const sponsorProceeds = exitEquity * sponsorShare;
  const moic = sponsorEquity > 0 ? sponsorProceeds / sponsorEquity : 0;
  const irr =
    sponsorEquity > 0 && sponsorProceeds > 0
      ? Math.pow(sponsorProceeds / sponsorEquity, 1 / a.meta.holdYears) - 1
      : -1;

  return {
    sourcesUses: {
      entryEbitda,
      entryEV,
      transactionFees,
      financingFees,
      minCash: a.minCash,
      newDebt: sized.map((t) => ({ name: t.name, amount: t.amount })),
      newDebtTotal,
      rolloverEquity: a.rolloverEquity,
      sponsorEquity,
      totalUses,
      totalSources: newDebtTotal + a.rolloverEquity + sponsorEquity,
      entryNetDebt: newDebtTotal - a.minCash,
      entryLeverage: entryEbitda !== 0 ? (newDebtTotal - a.minCash) / entryEbitda : 0,
    },
    periods,
    exit: { exitEbitda, exitMultiple: a.exitMultiple, exitEV, exitNetDebt, exitEquity, sponsorShare, sponsorProceeds },
    returns: { moic, irr, holdYears: a.meta.holdYears },
  };
}

/** Parse raw LBO assumptions (applying defaults), then run the model. */
export function runLBO(input: unknown): LBOResult {
  return computeLBO(LBOAssumptionsSchema.parse(input));
}
