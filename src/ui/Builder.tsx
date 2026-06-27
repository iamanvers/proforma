import { useMemo, useState } from 'react';
import {
  buildModel,
  computeDCF,
  DCFAssumptionsSchema,
  parseAssumptions,
  type DCFInput,
  type DCFResult,
  type Model,
  type ModelAssumptionsInput,
} from '../engine/index.ts';
import { validateModel, type ValidationReport } from '../validation/index.ts';
import { buildReadme } from '../export/index.ts';
import { PRESETS, type Preset } from '../templates/index.ts';
import { Button, Field, NumberInput, Section, Stat, StatusPill, TextInput } from './components.tsx';
import { downloadBytes, downloadText, money, mult, pct, price, slug } from './lib.ts';

interface FormState {
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

/** Build a complete form from a preset (parse first so every field is present). */
function formFromPreset(p: Preset): FormState {
  const a = parseAssumptions(p.assumptions);
  const dcf = DCFAssumptionsSchema.parse(p.dcf);
  const d = a.drivers;
  const o = a.opening;
  const debt = a.debt;
  return {
    company: a.meta.company,
    years: a.meta.years,
    currency: a.meta.currency,
    units: a.meta.units,
    revenueBase: a.revenueBase,
    revenueGrowth: d.revenueGrowth * 100,
    cogs: d.cogsPctRevenue * 100,
    sga: d.sgaPctRevenue * 100,
    sgaFixed: d.sgaFixed,
    capex: d.capexPctRevenue * 100,
    dep: d.depreciationRate * 100,
    dso: d.dso,
    dio: d.dio,
    dpo: d.dpo,
    tax: d.taxRate * 100,
    div: d.dividendPayoutPct * 100,
    revolverRate: debt.revolverRate * 100,
    termRate: debt.termLoanRate * 100,
    cashRate: debt.cashInterestRate * 100,
    termAmort: debt.termLoanAmortizationPct * 100,
    minCash: debt.minCashBalance,
    newEquity: a.equity.newEquityIssuancePerYear,
    shares: a.equity.sharesOutstanding,
    oCash: o.cash,
    oAR: o.accountsReceivable,
    oInv: o.inventory,
    oOCA: o.otherCurrentAssets,
    oGross: o.grossPPE,
    oAccum: o.accumulatedDepreciation,
    oOther: o.otherAssets,
    oAP: o.accountsPayable,
    oAccr: o.accruedLiabilities,
    oRev: o.revolver,
    oTerm: o.termLoan,
    oLTL: o.otherLongTermLiabilities,
    oRE: o.retainedEarnings,
    rf: dcf.riskFreeRate * 100,
    erp: dcf.equityRiskPremium * 100,
    beta: dcf.beta,
    size: dcf.sizePremium * 100,
    kd: dcf.preTaxCostOfDebt * 100,
    dcfTax: dcf.taxRate * 100,
    terminalMethod: dcf.terminalMethod,
    g: dcf.terminalGrowth * 100,
    exit: dcf.exitMultiple,
    midYear: dcf.midYearConvention,
  };
}

/** Opening common equity, plugged so the balance sheet ties out. */
function commonEquityPlug(f: FormState): number {
  const assets = f.oCash + f.oAR + f.oInv + f.oOCA + (f.oGross - f.oAccum) + f.oOther;
  const liabilities = f.oAP + f.oAccr + f.oRev + f.oTerm + f.oLTL;
  return assets - liabilities - f.oRE;
}

function toInputs(f: FormState): { assumptions: ModelAssumptionsInput; dcf: DCFInput } {
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

interface Generated {
  model: Model;
  dcf: DCFResult;
  report: ValidationReport;
  bytes: Uint8Array;
  filename: string;
  readme: string;
  readmeFilename: string;
}

export default function Builder() {
  const [presetId, setPresetId] = useState(PRESETS[0]!.id);
  const [form, setForm] = useState<FormState>(() => formFromPreset(PRESETS[0]!));
  const [showOpening, setShowOpening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Generated | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]): void =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const num = (k: keyof FormState, step?: number, unit?: string, help?: string, label?: string) => (
    <Field label={label ?? ''} unit={unit} help={help}>
      <NumberInput value={form[k] as number} step={step} onChange={(v) => set(k, v as FormState[typeof k])} />
    </Field>
  );

  const loadPreset = (id: string): void => {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    setPresetId(id);
    setForm(formFromPreset(p));
    setResult(null);
    setError(null);
  };

  const generate = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const { assumptions, dcf } = toInputs(form);
      const a = parseAssumptions(assumptions);
      const model = buildModel(a);
      const dcfA = DCFAssumptionsSchema.parse(dcf);
      const dcfRes = computeDCF(model, dcfA);
      const report = validateModel(model, a, dcfRes);
      const base = `ProForma_${slug(a.meta.company)}`;
      const readme = buildReadme(model, a, dcfRes, report, {
        generatedOn: new Date().toLocaleDateString('en-US'),
      });
      // Lazy-load the Excel writer (ExcelJS) so it stays out of the initial bundle.
      const { buildWorkbook } = await import('../excel/index.ts');
      const bytes = await buildWorkbook(model, a, dcfA);
      setResult({
        model,
        dcf: dcfRes,
        report,
        bytes,
        filename: `${base}.xlsx`,
        readme,
        readmeFilename: `${base}_README.md`,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const plug = useMemo(() => commonEquityPlug(form), [form]);

  return (
    <div className="space-y-6">
      {/* Company & template */}
      <Section
        title="Company & template"
        subtitle="Start from a bank-inspired template, then tailor the drivers. Every number is computed by a deterministic engine — never by an AI."
      >
        <div className="mb-5 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => loadPreset(p.id)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                presetId === p.id
                  ? 'border-citi-600 bg-citi-700 text-white'
                  : 'border-line bg-white text-ink hover:border-citi-300'
              }`}
              title={p.description}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Company">
            <TextInput value={form.company} onChange={(v) => set('company', v)} />
          </Field>
          {num('years', 1, 'yrs', 'Forecast horizon (1–10).', 'Forecast years')}
          <Field label="Currency">
            <TextInput value={form.currency} onChange={(v) => set('currency', v)} />
          </Field>
          <Field label="Units">
            <TextInput value={form.units} onChange={(v) => set('units', v)} />
          </Field>
        </div>
      </Section>

      {/* Operating drivers */}
      <Section title="Operating drivers" subtitle="The income-statement build. Percentages are of revenue unless noted.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {num('revenueBase', 1, undefined, `Most recent actual revenue (${form.currency} ${form.units}).`, 'Revenue (base year)')}
          {num('revenueGrowth', 0.5, '%', 'Year-over-year growth applied to each forecast year.', 'Revenue growth')}
          {num('cogs', 0.5, '%', 'Cost of goods sold as a share of revenue.', 'COGS % of revenue')}
          {num('sga', 0.5, '%', 'Variable operating expense as a share of revenue.', 'SG&A % of revenue')}
          {num('sgaFixed', 1, undefined, 'Fixed SG&A added on top of the variable portion.', 'SG&A (fixed)')}
          {num('capex', 0.5, '%', 'Capital expenditure as a share of revenue.', 'Capex % of revenue')}
          {num('dep', 0.5, '%', 'Depreciation as a share of beginning gross PP&E.', 'Depreciation rate')}
          {num('tax', 0.5, '%', 'Effective tax rate on pre-tax income.', 'Tax rate')}
          {num('div', 0.5, '%', 'Share of positive net income paid as dividends.', 'Dividend payout')}
        </div>
      </Section>

      {/* Working capital */}
      <Section title="Working capital" subtitle="Activity-day drivers that size receivables, inventory, and payables.">
        <div className="grid gap-4 sm:grid-cols-3">
          {num('dso', 1, 'days', 'Days sales outstanding → accounts receivable.', 'DSO')}
          {num('dio', 1, 'days', 'Days inventory outstanding → inventory.', 'DIO')}
          {num('dpo', 1, 'days', 'Days payable outstanding → accounts payable.', 'DPO')}
        </div>
      </Section>

      {/* Financing */}
      <Section
        title="Financing & capitalization"
        subtitle="The revolver is the plug: surplus cash sweeps it down, shortfalls draw it up. This creates the revolver↔interest circular reference the engine solves."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {num('revolverRate', 0.25, '%', 'Interest rate on the revolving credit facility.', 'Revolver rate')}
          {num('termRate', 0.25, '%', 'Interest rate on the term loan.', 'Term-loan rate')}
          {num('cashRate', 0.25, '%', 'Interest earned on cash balances.', 'Cash interest rate')}
          {num('termAmort', 0.5, '%', 'Mandatory repayment as a % of the original term loan, each year.', 'Term-loan amortization')}
          {num('minCash', 1, undefined, 'Minimum operating cash maintained each period.', 'Minimum cash')}
          {num('newEquity', 1, undefined, 'Equity issued each forecast year (0 for none).', 'New equity / year')}
          {num('shares', 0.1, undefined, 'Used for DCF value-per-share.', 'Shares outstanding')}
        </div>
      </Section>

      {/* DCF */}
      <Section title="DCF assumptions" subtitle="Cost of capital via CAPM and the terminal value. WACC must exceed the perpetuity growth rate.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {num('rf', 0.1, '%', 'Risk-free rate (e.g. 10-year government yield).', 'Risk-free rate')}
          {num('erp', 0.1, '%', 'Equity risk premium over the risk-free rate.', 'Equity risk premium')}
          {num('beta', 0.05, undefined, 'Levered equity beta.', 'Beta')}
          {num('size', 0.1, '%', 'Optional small-company premium.', 'Size premium')}
          {num('kd', 0.1, '%', 'Pre-tax cost of debt (tax-shielded in WACC).', 'Pre-tax cost of debt')}
          {num('dcfTax', 0.5, '%', 'Marginal tax rate for NOPAT and the debt shield.', 'DCF tax rate')}
          <Field label="Terminal method" help="Gordon perpetuity or an EV/EBITDA exit multiple.">
            <select
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-ink outline-none focus:border-citi-500 focus:ring-2 focus:ring-citi-200"
              value={form.terminalMethod}
              onChange={(e) => set('terminalMethod', e.target.value as FormState['terminalMethod'])}
            >
              <option value="perpetuity">Perpetuity growth</option>
              <option value="exitMultiple">Exit multiple</option>
            </select>
          </Field>
          {form.terminalMethod === 'perpetuity'
            ? num('g', 0.1, '%', 'Long-run growth rate (must be below WACC).', 'Terminal growth')
            : num('exit', 0.5, 'x', 'EV/EBITDA applied to the final forecast year.', 'Exit multiple')}
          <Field label="Mid-year convention" help="Discount cash flows half a year closer.">
            <label className="mt-2 inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-citi-700"
                checked={form.midYear}
                onChange={(e) => set('midYear', e.target.checked)}
              />
              <span className="text-sm text-muted">{form.midYear ? 'On' : 'Off'}</span>
            </label>
          </Field>
        </div>
      </Section>

      {/* Opening balance sheet (advanced) */}
      <Section
        title="Opening balance sheet"
        subtitle="Period-zero balances. Common equity is the plug, so the opening sheet always ties out."
        right={
          <button onClick={() => setShowOpening((s) => !s)} className="text-sm font-medium text-citi-700 hover:text-citi-800">
            {showOpening ? 'Hide' : 'Edit'}
          </button>
        }
      >
        {showOpening ? (
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {num('oCash', 1, undefined, undefined, 'Cash')}
            {num('oAR', 1, undefined, undefined, 'Receivables')}
            {num('oInv', 1, undefined, undefined, 'Inventory')}
            {num('oOCA', 1, undefined, undefined, 'Other current assets')}
            {num('oGross', 1, undefined, undefined, 'Gross PP&E')}
            {num('oAccum', 1, undefined, undefined, 'Accum. depreciation')}
            {num('oOther', 1, undefined, undefined, 'Other assets')}
            {num('oAP', 1, undefined, undefined, 'Payables')}
            {num('oAccr', 1, undefined, undefined, 'Accrued liabilities')}
            {num('oRev', 1, undefined, undefined, 'Revolver')}
            {num('oTerm', 1, undefined, undefined, 'Term loan')}
            {num('oLTL', 1, undefined, undefined, 'Other LT liabilities')}
            {num('oRE', 1, undefined, undefined, 'Retained earnings')}
            <div className="rounded-lg border border-citi-200 bg-citi-50 px-3 py-2">
              <div className="text-xs font-medium text-citi-800">Common equity (plug)</div>
              <div className="tabular mt-1 text-ink">{money(plug)}</div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">
            Common equity plug: <span className="tabular font-medium text-ink">{money(plug)}</span> · opening
            balances tie out by construction.
          </p>
        )}
      </Section>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Could not generate the model: {error}
        </div>
      )}

      {result && <Results result={result} />}

      {/* Sticky action bar */}
      <div className="sticky bottom-0 z-20 flex flex-col items-stretch gap-3 rounded-2xl border border-line bg-white/90 px-5 py-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs text-muted">
          Runs entirely in your browser — no data leaves your device. Not investment advice.
        </span>
        <div className="flex flex-wrap gap-3">
          {result && (
            <>
              <Button variant="ghost" onClick={() => downloadText(result.readme, result.readmeFilename)}>
                Download README
              </Button>
              <Button variant="ghost" onClick={() => downloadBytes(result.bytes, result.filename)}>
                Download .xlsx
              </Button>
            </>
          )}
          <Button onClick={generate} disabled={busy}>
            {busy ? 'Generating…' : result ? 'Regenerate' : 'Generate model'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Results({ result }: { result: Generated }) {
  const { model, dcf, report } = result;
  const final = model.periods[model.periods.length - 1]!;
  const ebitdaMargin = final.income.ebitda / final.income.revenue;
  const issues = report.results.filter((r) => r.status !== 'pass');

  return (
    <Section
      title="Results"
      subtitle="Computed and validated by the deterministic engine. Download the live Excel workbook below."
      right={
        <div className="flex flex-wrap gap-2">
          <StatusPill status="pass">{report.summary.pass} passed</StatusPill>
          {report.summary.warn > 0 && <StatusPill status="warn">{report.summary.warn} warnings</StatusPill>}
          <StatusPill status={report.summary.fail === 0 ? 'pass' : 'fail'}>
            {report.summary.fail === 0 ? 'Ties out ✓' : `${report.summary.fail} failures`}
          </StatusPill>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Enterprise value" value={money(dcf.enterpriseValue)} hint={`${model.meta.currency} ${model.meta.units}`} />
        <Stat label="Equity value" value={money(dcf.equityValue)} hint={`net debt ${money(dcf.netDebt)}`} />
        <Stat
          label="Value / share"
          value={dcf.sharesOutstanding > 0 ? price(dcf.equityValuePerShare) : '—'}
          hint={dcf.sharesOutstanding > 0 ? `${dcf.sharesOutstanding} shares` : 'set shares outstanding'}
        />
        <Stat label="WACC" value={pct(dcf.wacc)} hint={`terminal ${dcf.terminalMethod === 'perpetuity' ? pct(dcf.impliedPerpetuityGrowth) + ' g' : mult(dcf.impliedExitMultiple)}`} />
        <Stat label={`Revenue (Y${model.meta.years})`} value={money(final.income.revenue)} />
        <Stat label="EBITDA margin" value={pct(ebitdaMargin)} hint={money(final.income.ebitda)} />
        <Stat label={`Net income (Y${model.meta.years})`} value={money(final.income.netIncome)} />
        <Stat label="Ending cash" value={money(final.balance.cash)} hint={`revolver ${money(final.balance.revolver)}`} />
      </div>

      {issues.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-sm font-medium text-ink">Validation notes</div>
          <ul className="space-y-1.5">
            {issues.slice(0, 8).map((r, i) => (
              <li key={`${r.id}-${i}`} className="flex items-start gap-2 text-sm">
                <StatusPill status={r.status}>{r.status}</StatusPill>
                <span className="text-muted">
                  {r.title}
                  {r.period ? ` · ${r.period}` : ''} — {r.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}
