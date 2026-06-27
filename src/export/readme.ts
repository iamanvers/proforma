import type { Model } from '../engine/types.ts';
import type { ModelAssumptions } from '../engine/schema.ts';
import type { DCFResult } from '../engine/dcf.ts';
import type { ValidationReport } from '../validation/types.ts';

/**
 * Deterministic README / methodology note (Markdown) generated from the engine
 * output and validation report. No LLM — every figure here comes from the
 * deterministic engine. A later pass can layer LLM-written prose on top, but the
 * numbers must always originate here.
 */

const nf = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const money = (x: number): string => (x < 0 ? `(${nf.format(Math.abs(x))})` : nf.format(x));
const pct = (x: number, d = 1): string => `${(x * 100).toFixed(d)}%`;
const mult = (x: number): string => `${x.toFixed(1)}x`;
const price = (x: number): string => (x < 0 ? `(${Math.abs(x).toFixed(2)})` : x.toFixed(2));

function table(headers: string[], rows: string[][]): string {
  const head = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
  return `${head}\n${sep}\n${body}`;
}

export interface ReadmeOptions {
  /** Optional generation date line (kept out by default so output is deterministic). */
  generatedOn?: string;
}

export function buildReadme(
  model: Model,
  assumptions: ModelAssumptions,
  dcf?: DCFResult,
  report?: ValidationReport,
  opts: ReadmeOptions = {},
): string {
  const { meta } = model;
  const d = assumptions.drivers;
  const debt = assumptions.debt;
  const final = model.periods[model.periods.length - 1];
  const u = `${meta.currency} in ${meta.units}`;
  const out: string[] = [];

  out.push(`# ${meta.company} — Financial Model`);
  out.push('');
  out.push(
    `*Integrated 3-statement model${dcf ? ' + discounted cash flow (DCF)' : ''}. ${u}; ` +
      `${meta.years}-year forecast.*`,
  );
  if (opts.generatedOn) out.push(`\n_Generated ${opts.generatedOn}._`);
  out.push('');
  out.push(
    '> Every figure below is computed by ProForma’s **deterministic engine**, validated for ' +
      'internal consistency, and exported as a live Excel workbook. The model uses **no ' +
      'AI-generated numbers**.',
  );

  // Validation status.
  if (report) {
    out.push('\n## Validation status');
    const s = report.summary;
    out.push(
      report.ok
        ? `**The model ties out.** ${s.pass} checks passed, ${s.warn} warning(s), 0 failures.`
        : `**${s.fail} check(s) failed.** ${s.pass} passed, ${s.warn} warning(s).`,
    );
    const issues = report.results.filter((r) => r.status !== 'pass');
    if (issues.length > 0) {
      out.push('');
      for (const r of issues.slice(0, 12)) {
        out.push(`- **${r.status.toUpperCase()}** — ${r.title}${r.period ? ` (${r.period})` : ''}: ${r.message}`);
      }
    }
  }

  // Key outputs.
  out.push('\n## Key outputs');
  const outputs: string[][] = [];
  if (final) {
    outputs.push([`Revenue (Year ${meta.years})`, money(final.income.revenue)]);
    outputs.push([`EBITDA (Year ${meta.years})`, `${money(final.income.ebitda)} (${pct(final.income.ebitda / final.income.revenue)} margin)`]);
    outputs.push([`EBIT (Year ${meta.years})`, money(final.income.ebit)]);
    outputs.push([`Net income (Year ${meta.years})`, money(final.income.netIncome)]);
    outputs.push([`Ending cash (Year ${meta.years})`, money(final.balance.cash)]);
  }
  if (dcf) {
    outputs.push(['Enterprise value', money(dcf.enterpriseValue)]);
    outputs.push(['Net debt', money(dcf.netDebt)]);
    outputs.push(['Equity value', money(dcf.equityValue)]);
    if (dcf.sharesOutstanding > 0) outputs.push(['Equity value / share', price(dcf.equityValuePerShare)]);
    outputs.push(['WACC', pct(dcf.wacc)]);
  }
  out.push(table(['Metric', `Value (${u})`], outputs));

  // Operating assumptions.
  out.push('\n## Operating assumptions');
  out.push(
    table(
      ['Driver', 'Value'],
      [
        ['Revenue (base year)', money(assumptions.revenueBase)],
        ['Revenue growth (YoY)', pct(d.revenueGrowth)],
        ['COGS (% of revenue)', pct(d.cogsPctRevenue)],
        ['SG&A (% of revenue)', pct(d.sgaPctRevenue)],
        ['SG&A (fixed)', money(d.sgaFixed)],
        ['Capex (% of revenue)', pct(d.capexPctRevenue)],
        ['Depreciation (% of gross PP&E)', pct(d.depreciationRate)],
        ['DSO / DIO / DPO (days)', `${d.dso} / ${d.dio} / ${d.dpo}`],
        ['Tax rate', pct(d.taxRate)],
        ['Dividend payout (% of NI)', pct(d.dividendPayoutPct)],
      ],
    ),
  );

  // Financing.
  out.push('\n## Financing');
  out.push(
    table(
      ['Item', 'Value'],
      [
        ['Revolver rate', pct(debt.revolverRate)],
        ['Term-loan rate', pct(debt.termLoanRate)],
        ['Cash interest rate', pct(debt.cashInterestRate)],
        ['Term-loan amortization (% of original)', pct(debt.termLoanAmortizationPct)],
        ['Minimum cash balance', money(debt.minCashBalance)],
        ['New equity issued / year', money(assumptions.equity.newEquityIssuancePerYear)],
        ['Shares outstanding', assumptions.equity.sharesOutstanding.toString()],
      ],
    ),
  );

  // DCF methodology.
  if (dcf) {
    out.push('\n## Valuation (DCF)');
    out.push(
      `Unlevered free cash flow is discounted at a CAPM-derived WACC of **${pct(dcf.wacc)}** ` +
        `(cost of equity ${pct(dcf.costOfEquity)}, after-tax cost of debt ${pct(dcf.costOfDebtAfterTax)}; ` +
        `weights ${pct(dcf.equityWeight)} equity / ${pct(dcf.debtWeight)} debt). ` +
        (dcf.terminalMethod === 'perpetuity'
          ? `Terminal value uses Gordon growth (implied exit multiple ${mult(dcf.impliedExitMultiple)}).`
          : `Terminal value uses an exit multiple (implied perpetuity growth ${pct(dcf.impliedPerpetuityGrowth)}).`),
    );
    out.push(
      `\nEnterprise value of **${money(dcf.enterpriseValue)}** less net debt of ${money(dcf.netDebt)} ` +
        `gives an equity value of **${money(dcf.equityValue)}**` +
        (dcf.sharesOutstanding > 0 ? `, or **${price(dcf.equityValuePerShare)}** per share` : '') +
        `. The terminal value is ${pct(dcf.terminalValuePctOfEV)} of enterprise value.`,
    );
  }

  // Forecast summary.
  out.push('\n## Forecast summary');
  out.push(
    table(
      ['Year', 'Revenue', 'EBITDA', 'Net income', 'Ending cash', 'Balances?'],
      model.periods.map((p) => [
        p.label,
        money(p.income.revenue),
        money(p.income.ebitda),
        money(p.income.netIncome),
        money(p.balance.cash),
        Math.abs(p.balance.balanceCheck) < 0.01 ? 'Yes' : `off ${money(p.balance.balanceCheck)}`,
      ]),
    ),
  );

  // Methodology.
  out.push('\n## How the model is built');
  out.push(
    [
      '- **Deterministic engine.** All financials are computed in pure TypeScript; the income ' +
        'statement, balance sheet, and cash-flow statement are fully linked.',
      '- **Revolver as the plug.** Surplus cash sweeps the revolver down; shortfalls draw it up to ' +
        'the minimum cash balance. This creates a revolver↔interest circular reference, solved ' +
        'by fixed-point iteration (and mirrored in Excel via iterative calculation).',
      '- **Schedules.** PP&E roll-forward with depreciation on beginning gross PP&E; working capital ' +
        'from DSO/DIO/DPO; term-loan amortization as a fixed % of the original balance.',
      '- **Validation.** Math tie-outs, circular-reference convergence, assumption sanity, and ' +
        'financial logic are checked and surfaced on the workbook’s Checks tab.',
    ].join('\n'),
  );

  out.push('\n---');
  out.push(
    '_Not investment advice. ProForma is an educational modeling tool; outputs depend entirely on ' +
      'the assumptions provided._',
  );
  out.push('');
  return out.join('\n');
}
