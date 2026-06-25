import { z } from 'zod';

/**
 * Assumption schema — the single source of truth for engine inputs.
 * MVP uses scalar drivers applied to every forecast year (per-year overrides
 * can be layered on later). The LLM may *suggest* these values, but the user
 * reviews them and the engine alone computes the model.
 */

const pct = z.number(); // ratios expressed as decimals, e.g. 0.10 = 10%

export const OpeningBalanceSchema = z.object({
  cash: z.number(),
  accountsReceivable: z.number().default(0),
  inventory: z.number().default(0),
  otherCurrentAssets: z.number().default(0),
  grossPPE: z.number().default(0),
  accumulatedDepreciation: z.number().default(0),
  otherAssets: z.number().default(0),
  accountsPayable: z.number().default(0),
  accruedLiabilities: z.number().default(0),
  revolver: z.number().default(0),
  termLoan: z.number().default(0),
  otherLongTermLiabilities: z.number().default(0),
  commonEquity: z.number().default(0),
  retainedEarnings: z.number().default(0),
});

export const DriversSchema = z.object({
  revenueGrowth: pct, // YoY growth on revenueBase
  cogsPctRevenue: pct,
  sgaPctRevenue: pct,
  sgaFixed: z.number().default(0),
  capexPctRevenue: pct,
  depreciationRate: pct, // applied to beginning gross PP&E
  dso: z.number().default(0), // days sales outstanding -> AR
  dio: z.number().default(0), // days inventory outstanding -> inventory
  dpo: z.number().default(0), // days payable outstanding -> AP
  taxRate: pct,
  dividendPayoutPct: pct.default(0), // share of positive net income paid as dividends
});

export const DebtSchema = z.object({
  revolverRate: pct.default(0),
  termLoanRate: pct.default(0),
  cashInterestRate: pct.default(0),
  termLoanAmortizationPct: pct.default(0), // % of ORIGINAL term loan repaid each year
  minCashBalance: z.number().default(0),
});

export const EquitySchema = z.object({
  newEquityIssuancePerYear: z.number().default(0),
  sharesOutstanding: z.number().default(0),
});

export const CircularSchema = z.object({
  maxIterations: z.number().int().min(1).default(100),
  tolerance: z.number().positive().default(1e-6),
  /** Break the circular reference (interest on beginning balances only). */
  breakCircular: z.boolean().default(false),
});

export const ModelAssumptionsSchema = z.object({
  meta: z.object({
    company: z.string().default('NewCo'),
    years: z.number().int().min(1).max(10).default(5),
    currency: z.string().default('USD'),
    units: z.string().default('millions'),
  }),
  revenueBase: z.number(), // most recent actual revenue (period 0)
  opening: OpeningBalanceSchema,
  drivers: DriversSchema,
  debt: DebtSchema.default({}),
  equity: EquitySchema.default({}),
  circular: CircularSchema.default({}),
});

export type ModelAssumptions = z.infer<typeof ModelAssumptionsSchema>;
/** Raw (pre-default) input accepted by {@link parseAssumptions}. */
export type ModelAssumptionsInput = z.input<typeof ModelAssumptionsSchema>;
export type OpeningBalance = z.infer<typeof OpeningBalanceSchema>;

/** Parse + apply defaults; throws ZodError on invalid input. */
export function parseAssumptions(input: unknown): ModelAssumptions {
  return ModelAssumptionsSchema.parse(input);
}
