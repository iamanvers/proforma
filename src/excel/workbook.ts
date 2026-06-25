import ExcelJS from 'exceljs';
import type { BalanceSheet, IncomeStatement, Model } from '../engine/types.ts';
import type { ModelAssumptions } from '../engine/schema.ts';
import { computeDCF, type DCFAssumptions, type DCFResult } from '../engine/dcf.ts';
import { injectIterativeCalc } from './calcPr.ts';
import { Layout, periodCol, periodColLetter } from './cells.ts';
import {
  FMT,
  FONT,
  noteFont,
  styleHeaderCell,
  styleLabel,
  stylePeriodHeader,
  styleSection,
  styleValue,
  TAB_COLORS,
  type CellRole,
} from './style.ts';

const SHEET = {
  cover: 'Cover',
  assumptions: 'Assumptions',
  is: 'Income Statement',
  bs: 'Balance Sheet',
  cf: 'Cash Flow',
  dcf: 'DCF',
  checks: 'Checks',
} as const;

const TITLE_ROW = 1;
const UNITS_ROW = 2;
const HEADER_ROW = 4;
const FIRST_DATA_ROW = 5;
const NOTE_FONT = noteFont();
const PAGE_SETUP = {
  orientation: 'landscape',
  fitToPage: true,
  fitToWidth: 1,
  fitToHeight: 0,
  margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
} as const;

type RowKind = 'line' | 'subtotal' | 'total' | 'section' | 'spacer';
interface PlanRow {
  key?: string;
  label?: string;
  kind: RowKind;
  indent?: number;
}
interface ValueOpts {
  bold?: boolean;
  topBorder?: boolean;
  doubleBottom?: boolean;
}

/**
 * Build a validated, bank-styled `.xlsx` with live formulas + cached results.
 * When `dcfAssumptions` is supplied, the DCF is computed here (single source)
 * and rendered on its own sheet.
 */
export async function buildWorkbook(
  model: Model,
  assumptions: ModelAssumptions,
  dcfAssumptions?: DCFAssumptions,
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ProForma';
  wb.calcProperties.fullCalcOnLoad = true;

  const dcf = dcfAssumptions ? computeDCF(model, dcfAssumptions) : undefined;
  const N = model.periods.length;
  const layout = new Layout();
  const sheets: Record<string, ExcelJS.Worksheet> = {};
  const lastCol = periodCol(N);

  const ws = (name: string): ExcelJS.Worksheet => {
    const s = sheets[name];
    if (!s) throw new Error(`sheet ${name} not created`);
    return s;
  };
  const addSheet = (name: string, opts: { freeze?: boolean; tab?: string } = {}): ExcelJS.Worksheet => {
    const freeze = opts.freeze ?? true;
    const sheet = wb.addWorksheet(name, {
      views: [
        freeze
          ? { state: 'frozen', xSplit: 1, ySplit: HEADER_ROW, showGridLines: false }
          : { showGridLines: false },
      ],
      properties: opts.tab ? { tabColor: { argb: opts.tab } } : {},
      pageSetup: { ...PAGE_SETUP },
    });
    sheets[name] = sheet;
    return sheet;
  };

  // ── cell writers ───────────────────────────────────────────────────────────
  const formula = (
    sheet: string,
    key: string,
    t: number,
    f: string,
    result: number,
    role: CellRole,
    fmt: string,
    opts: ValueOpts = {},
  ): void => {
    const cell = ws(sheet).getCell(layout.rowOf(sheet, key), periodCol(t));
    cell.value = { formula: f, result };
    styleValue(cell, role, fmt, opts);
  };
  const input = (
    sheet: string,
    key: string,
    t: number,
    value: number,
    fmt: string,
    name?: string,
  ): void => {
    const row = layout.rowOf(sheet, key);
    const cell = ws(sheet).getCell(row, periodCol(t));
    cell.value = value;
    styleValue(cell, 'input', fmt);
    if (name) wb.definedNames.add(`'${sheet}'!$${periodColLetter(t)}$${row}`, name);
  };

  const writeChrome = (name: string, openingCol: boolean): void => {
    const sheet = ws(name);
    sheet.getColumn(1).width = 40;
    for (let t = 0; t <= N; t++) sheet.getColumn(periodCol(t)).width = 13;
    sheet.mergeCells(TITLE_ROW, 1, TITLE_ROW, lastCol);
    const title = sheet.getCell(TITLE_ROW, 1);
    title.value = `${model.meta.company} — ${name}`;
    styleHeaderCell(title);
    const units = sheet.getCell(UNITS_ROW, 1);
    units.value = `${model.meta.currency} in ${model.meta.units} unless noted`;
    units.font = { ...NOTE_FONT };
    for (let t = openingCol ? 0 : 1; t <= N; t++) {
      const cell = sheet.getCell(HEADER_ROW, periodCol(t));
      cell.value = t === 0 ? 'Opening' : (model.periods[t - 1]?.label ?? `Year ${t}`);
      stylePeriodHeader(cell);
    }
    sheet.getRow(TITLE_ROW).height = 20;
    sheet.pageSetup.printTitlesRow = `${TITLE_ROW}:${HEADER_ROW}`;
  };

  const layoutStatement = (name: string, plan: PlanRow[]): void => {
    const sheet = ws(name);
    let r = FIRST_DATA_ROW;
    for (const row of plan) {
      if (row.kind === 'spacer') {
        r++;
        continue;
      }
      const labelCell = sheet.getCell(r, 1);
      labelCell.value = row.label ?? '';
      if (row.kind === 'section') {
        sheet.mergeCells(r, 1, r, lastCol);
        styleSection(labelCell);
      } else {
        styleLabel(labelCell, {
          bold: row.kind === 'subtotal' || row.kind === 'total',
          indent: row.indent ?? (row.kind === 'line' ? 1 : 0),
        });
      }
      if (row.key) layout.setRow(name, row.key, r);
      r++;
    }
  };

  // ── cached-value accessors (must equal engine output) ──────────────────────
  const isVal = (key: keyof IncomeStatement, t: number): number => model.periods[t - 1]!.income[key];
  const bsVal = (key: keyof BalanceSheet, t: number): number =>
    t === 0 ? model.opening[key] : model.periods[t - 1]!.balance[key];
  const cf = (t: number) => model.periods[t - 1]!.cashFlow;

  // ════════════════ Cover (first, so the workbook opens contents-first) ═══════
  writeCover(addSheet(SHEET.cover, { freeze: false, tab: TAB_COLORS.cover }), model, !!dcf);

  // ════════════════ Assumptions ══════════════════════════════════════════════
  {
    const sheet = addSheet(SHEET.assumptions, { tab: TAB_COLORS.assumptions });
    sheet.getColumn(1).width = 42;
    sheet.getColumn(2).width = 16;
    sheet.mergeCells(TITLE_ROW, 1, TITLE_ROW, 2);
    const title = sheet.getCell(TITLE_ROW, 1);
    title.value = `${model.meta.company} — Assumptions & Drivers`;
    styleHeaderCell(title);
    sheet.getCell(UNITS_ROW, 1).value = 'Blue cells are inputs. Edit here; the statements recalculate.';
    sheet.getCell(UNITS_ROW, 1).font = { ...NOTE_FONT };

    let r = FIRST_DATA_ROW - 1;
    const section = (label: string): void => {
      r++;
      sheet.mergeCells(r, 1, r, 2);
      const c = sheet.getCell(r, 1);
      c.value = label;
      styleSection(c);
    };
    const assume = (name: string, label: string, value: number, fmt: string): void => {
      r++;
      sheet.getCell(r, 1).value = label;
      styleLabel(sheet.getCell(r, 1), { indent: 1 });
      const cell = sheet.getCell(r, 2);
      cell.value = value;
      styleValue(cell, 'input', fmt);
      wb.definedNames.add(`'${SHEET.assumptions}'!$B$${r}`, name);
    };

    const d = assumptions.drivers;
    section('Operating drivers');
    assume('revenueBase', 'Revenue (base year)', assumptions.revenueBase, FMT.currency);
    assume('rev_growth', 'Revenue growth (YoY)', d.revenueGrowth, FMT.percent);
    assume('cogs_pct', 'COGS (% of revenue)', d.cogsPctRevenue, FMT.percent);
    assume('sga_pct', 'SG&A (% of revenue)', d.sgaPctRevenue, FMT.percent);
    assume('sga_fixed', 'SG&A (fixed)', d.sgaFixed, FMT.currency);
    assume('capex_pct', 'Capex (% of revenue)', d.capexPctRevenue, FMT.percent);
    assume('dep_rate', 'Depreciation (% of gross PP&E)', d.depreciationRate, FMT.percent);
    assume('dso', 'DSO (days)', d.dso, FMT.days);
    assume('dio', 'DIO (days)', d.dio, FMT.days);
    assume('dpo', 'DPO (days)', d.dpo, FMT.days);
    assume('tax_rate', 'Tax rate', d.taxRate, FMT.percent);
    assume('div_payout', 'Dividend payout (% of NI)', d.dividendPayoutPct, FMT.percent);

    section('Financing');
    assume('revolver_rate', 'Revolver interest rate', assumptions.debt.revolverRate, FMT.percent);
    assume('term_rate', 'Term-loan interest rate', assumptions.debt.termLoanRate, FMT.percent);
    assume('cash_rate', 'Interest rate on cash', assumptions.debt.cashInterestRate, FMT.percent);
    assume('term_amort_pct', 'Term-loan amort. (% of original)', assumptions.debt.termLoanAmortizationPct, FMT.percent);
    assume('min_cash', 'Minimum cash balance', assumptions.debt.minCashBalance, FMT.currency);
    assume('new_equity', 'New equity issued / year', assumptions.equity.newEquityIssuancePerYear, FMT.currency);
    assume('shares', 'Shares outstanding', assumptions.equity.sharesOutstanding, FMT.shares);

    section('Circularity');
    assume('circ_switch', 'Break circular (1 = beginning balances)', assumptions.circular.breakCircular ? 1 : 0, '0');
  }

  // ════════════════ Income Statement ═════════════════════════════════════════
  addSheet(SHEET.is, { tab: TAB_COLORS.statement });
  writeChrome(SHEET.is, false);
  layoutStatement(SHEET.is, [
    { key: 'revenue', label: 'Revenue', kind: 'line' },
    { key: 'cogs', label: 'Cost of goods sold', kind: 'line' },
    { key: 'grossProfit', label: 'Gross profit', kind: 'subtotal' },
    { key: 'sga', label: 'SG&A', kind: 'line' },
    { key: 'ebitda', label: 'EBITDA', kind: 'subtotal' },
    { key: 'depreciation', label: 'Depreciation', kind: 'line' },
    { key: 'ebit', label: 'EBIT', kind: 'subtotal' },
    { key: 'revolverInterest', label: 'Revolver interest', kind: 'line' },
    { key: 'termLoanInterest', label: 'Term-loan interest', kind: 'line' },
    { key: 'interestIncome', label: 'Interest income', kind: 'line' },
    { key: 'netInterest', label: 'Net interest expense', kind: 'subtotal' },
    { key: 'ebt', label: 'Pre-tax income (EBT)', kind: 'subtotal' },
    { key: 'tax', label: 'Income tax', kind: 'line' },
    { key: 'netIncome', label: 'Net income', kind: 'total' },
  ]);

  // ════════════════ Balance Sheet ════════════════════════════════════════════
  addSheet(SHEET.bs, { tab: TAB_COLORS.statement });
  writeChrome(SHEET.bs, true);
  layoutStatement(SHEET.bs, [
    { kind: 'section', label: 'Assets' },
    { key: 'cash', label: 'Cash & equivalents', kind: 'line' },
    { key: 'accountsReceivable', label: 'Accounts receivable', kind: 'line' },
    { key: 'inventory', label: 'Inventory', kind: 'line' },
    { key: 'otherCurrentAssets', label: 'Other current assets', kind: 'line' },
    { key: 'totalCurrentAssets', label: 'Total current assets', kind: 'subtotal' },
    { key: 'grossPPE', label: 'Gross PP&E', kind: 'line' },
    { key: 'accumulatedDepreciation', label: 'Accumulated depreciation', kind: 'line' },
    { key: 'netPPE', label: 'Net PP&E', kind: 'subtotal' },
    { key: 'otherAssets', label: 'Other assets', kind: 'line' },
    { key: 'totalAssets', label: 'Total assets', kind: 'total' },
    { kind: 'spacer' },
    { kind: 'section', label: 'Liabilities' },
    { key: 'accountsPayable', label: 'Accounts payable', kind: 'line' },
    { key: 'accruedLiabilities', label: 'Accrued liabilities', kind: 'line' },
    { key: 'revolver', label: 'Revolver', kind: 'line' },
    { key: 'totalCurrentLiabilities', label: 'Total current liabilities', kind: 'subtotal' },
    { key: 'termLoan', label: 'Term loan', kind: 'line' },
    { key: 'otherLongTermLiabilities', label: 'Other long-term liabilities', kind: 'line' },
    { key: 'totalLiabilities', label: 'Total liabilities', kind: 'total' },
    { kind: 'spacer' },
    { kind: 'section', label: 'Equity' },
    { key: 'commonEquity', label: 'Common equity', kind: 'line' },
    { key: 'retainedEarnings', label: 'Retained earnings', kind: 'line' },
    { key: 'totalEquity', label: 'Total equity', kind: 'total' },
    { kind: 'spacer' },
    { key: 'totalLiabilitiesAndEquity', label: 'Total liabilities & equity', kind: 'total' },
    { key: 'balanceCheck', label: 'Balance check (A − L&E)', kind: 'line' },
  ]);

  // ════════════════ Cash Flow ════════════════════════════════════════════════
  addSheet(SHEET.cf, { tab: TAB_COLORS.statement });
  writeChrome(SHEET.cf, false);
  layoutStatement(SHEET.cf, [
    { kind: 'section', label: 'Operating activities' },
    { key: 'netIncome', label: 'Net income', kind: 'line' },
    { key: 'depreciation', label: 'Depreciation', kind: 'line' },
    { key: 'incAR', label: '(Inc.) / dec. in receivables', kind: 'line' },
    { key: 'incInv', label: '(Inc.) / dec. in inventory', kind: 'line' },
    { key: 'incAP', label: 'Inc. / (dec.) in payables', kind: 'line' },
    { key: 'incAccrued', label: 'Inc. / (dec.) in accrued', kind: 'line' },
    { key: 'cfo', label: 'Cash from operations', kind: 'subtotal' },
    { kind: 'section', label: 'Investing activities' },
    { key: 'capex', label: 'Capital expenditures', kind: 'line' },
    { key: 'cfi', label: 'Cash from investing', kind: 'subtotal' },
    { kind: 'section', label: 'Financing activities' },
    { key: 'termRepay', label: 'Term-loan repayment', kind: 'line' },
    { key: 'dividends', label: 'Dividends paid', kind: 'line' },
    { key: 'equityIssuance', label: 'Equity issuance', kind: 'line' },
    { key: 'preRevolverCash', label: 'Pre-revolver cash (memo)', kind: 'line', indent: 2 },
    { key: 'revolverDraw', label: 'Revolver draw / (paydown)', kind: 'line' },
    { key: 'cff', label: 'Cash from financing', kind: 'subtotal' },
    { kind: 'spacer' },
    { key: 'netChangeInCash', label: 'Net change in cash', kind: 'subtotal' },
    { key: 'beginningCash', label: 'Beginning cash', kind: 'line' },
    { key: 'endingCash', label: 'Ending cash', kind: 'total' },
  ]);

  // ── balance-sheet subtotals (same formula shape for every column) ──────────
  const writeBalanceSubtotals = (t: number): void => {
    const b = (k: keyof BalanceSheet) => layout.ref(SHEET.bs, k, t);
    formula(SHEET.bs, 'totalCurrentAssets', t, `${b('cash')}+${b('accountsReceivable')}+${b('inventory')}+${b('otherCurrentAssets')}`, bsVal('totalCurrentAssets', t), 'formula', FMT.currency, { bold: true, topBorder: true });
    formula(SHEET.bs, 'netPPE', t, `${b('grossPPE')}-${b('accumulatedDepreciation')}`, bsVal('netPPE', t), 'formula', FMT.currency, { bold: true });
    formula(SHEET.bs, 'totalAssets', t, `${b('totalCurrentAssets')}+${b('netPPE')}+${b('otherAssets')}`, bsVal('totalAssets', t), 'formula', FMT.currency, { bold: true, topBorder: true, doubleBottom: true });
    formula(SHEET.bs, 'totalCurrentLiabilities', t, `${b('accountsPayable')}+${b('accruedLiabilities')}+${b('revolver')}`, bsVal('totalCurrentLiabilities', t), 'formula', FMT.currency, { bold: true, topBorder: true });
    formula(SHEET.bs, 'totalLiabilities', t, `${b('totalCurrentLiabilities')}+${b('termLoan')}+${b('otherLongTermLiabilities')}`, bsVal('totalLiabilities', t), 'formula', FMT.currency, { bold: true, topBorder: true });
    formula(SHEET.bs, 'totalEquity', t, `${b('commonEquity')}+${b('retainedEarnings')}`, bsVal('totalEquity', t), 'formula', FMT.currency, { bold: true, topBorder: true });
    formula(SHEET.bs, 'totalLiabilitiesAndEquity', t, `${b('totalLiabilities')}+${b('totalEquity')}`, bsVal('totalLiabilitiesAndEquity', t), 'formula', FMT.currency, { bold: true, topBorder: true, doubleBottom: true });
    formula(SHEET.bs, 'balanceCheck', t, `${b('totalAssets')}-${b('totalLiabilitiesAndEquity')}`, bsVal('balanceCheck', t), 'formula', FMT.currency);
  };

  // ── opening balance sheet: inputs + subtotals ──────────────────────────────
  const openInputs: Array<[keyof BalanceSheet, string]> = [
    ['cash', 'open_cash'],
    ['accountsReceivable', 'open_ar'],
    ['inventory', 'open_inv'],
    ['otherCurrentAssets', 'open_oca'],
    ['grossPPE', 'open_gross_ppe'],
    ['accumulatedDepreciation', 'open_accum_dep'],
    ['otherAssets', 'open_other_assets'],
    ['accountsPayable', 'open_ap'],
    ['accruedLiabilities', 'open_accrued'],
    ['revolver', 'open_revolver'],
    ['termLoan', 'open_termloan'],
    ['otherLongTermLiabilities', 'open_other_ltl'],
    ['commonEquity', 'open_common'],
    ['retainedEarnings', 'open_re'],
  ];
  for (const [key, name] of openInputs) input(SHEET.bs, key, 0, bsVal(key, 0), FMT.currency, name);
  writeBalanceSubtotals(0);

  // ── forecast periods ───────────────────────────────────────────────────────
  for (let t = 1; t <= N; t++) {
    const is = (k: keyof IncomeStatement) => layout.ref(SHEET.is, k, t);
    const b = (k: keyof BalanceSheet, tt: number) => layout.ref(SHEET.bs, k, tt);
    const c = (k: string, tt: number) => layout.ref(SHEET.cf, k, tt);

    // Income statement.
    formula(SHEET.is, 'revenue', t,
      t === 1 ? 'revenueBase*(1+rev_growth)' : `${layout.ref(SHEET.is, 'revenue', t - 1)}*(1+rev_growth)`,
      isVal('revenue', t), 'formula', FMT.currency);
    formula(SHEET.is, 'cogs', t, `${is('revenue')}*cogs_pct`, isVal('cogs', t), 'formula', FMT.currency);
    formula(SHEET.is, 'grossProfit', t, `${is('revenue')}-${is('cogs')}`, isVal('grossProfit', t), 'formula', FMT.currency, { bold: true, topBorder: true });
    formula(SHEET.is, 'sga', t, `${is('revenue')}*sga_pct+sga_fixed`, isVal('sga', t), 'formula', FMT.currency);
    formula(SHEET.is, 'ebitda', t, `${is('grossProfit')}-${is('sga')}`, isVal('ebitda', t), 'formula', FMT.currency, { bold: true, topBorder: true });
    formula(SHEET.is, 'depreciation', t, `MIN(dep_rate*${b('grossPPE', t - 1)},${b('grossPPE', t - 1)}-${b('accumulatedDepreciation', t - 1)})`, isVal('depreciation', t), 'link', FMT.currency);
    formula(SHEET.is, 'ebit', t, `${is('ebitda')}-${is('depreciation')}`, isVal('ebit', t), 'formula', FMT.currency, { bold: true, topBorder: true });
    formula(SHEET.is, 'revolverInterest', t, `revolver_rate*IF(circ_switch=1,${b('revolver', t - 1)},AVERAGE(${b('revolver', t - 1)},${b('revolver', t)}))`, isVal('revolverInterest', t), 'link', FMT.currency);
    formula(SHEET.is, 'termLoanInterest', t, `term_rate*AVERAGE(${b('termLoan', t - 1)},${b('termLoan', t)})`, isVal('termLoanInterest', t), 'link', FMT.currency);
    formula(SHEET.is, 'interestIncome', t, `cash_rate*IF(circ_switch=1,${b('cash', t - 1)},AVERAGE(${b('cash', t - 1)},${b('cash', t)}))`, isVal('interestIncome', t), 'link', FMT.currency);
    formula(SHEET.is, 'netInterest', t, `${is('revolverInterest')}+${is('termLoanInterest')}-${is('interestIncome')}`, isVal('netInterest', t), 'formula', FMT.currency, { bold: true, topBorder: true });
    formula(SHEET.is, 'ebt', t, `${is('ebit')}-${is('netInterest')}`, isVal('ebt', t), 'formula', FMT.currency, { bold: true });
    formula(SHEET.is, 'tax', t, `${is('ebt')}*tax_rate`, isVal('tax', t), 'formula', FMT.currency);
    formula(SHEET.is, 'netIncome', t, `${is('ebt')}-${is('tax')}`, isVal('netIncome', t), 'formula', FMT.currency, { bold: true, topBorder: true, doubleBottom: true });

    // Cash flow.
    formula(SHEET.cf, 'netIncome', t, is('netIncome'), cf(t).netIncome, 'link', FMT.currency);
    formula(SHEET.cf, 'depreciation', t, is('depreciation'), cf(t).depreciation, 'link', FMT.currency);
    formula(SHEET.cf, 'incAR', t, `-(${b('accountsReceivable', t)}-${b('accountsReceivable', t - 1)})`, -cf(t).changeInAR, 'link', FMT.currency);
    formula(SHEET.cf, 'incInv', t, `-(${b('inventory', t)}-${b('inventory', t - 1)})`, -cf(t).changeInInventory, 'link', FMT.currency);
    formula(SHEET.cf, 'incAP', t, `${b('accountsPayable', t)}-${b('accountsPayable', t - 1)}`, cf(t).changeInAP, 'link', FMT.currency);
    formula(SHEET.cf, 'incAccrued', t, `${b('accruedLiabilities', t)}-${b('accruedLiabilities', t - 1)}`, cf(t).changeInAccrued, 'link', FMT.currency);
    formula(SHEET.cf, 'cfo', t, `SUM(${layout.rangeInCol(SHEET.cf, 'netIncome', 'incAccrued', t)})`, cf(t).cfo, 'formula', FMT.currency, { bold: true, topBorder: true });
    formula(SHEET.cf, 'capex', t, `-${is('revenue')}*capex_pct`, -cf(t).capex, 'link', FMT.currency);
    formula(SHEET.cf, 'cfi', t, c('capex', t), cf(t).cfi, 'formula', FMT.currency, { bold: true, topBorder: true });
    formula(SHEET.cf, 'termRepay', t, `-MIN(${b('termLoan', t - 1)},term_amort_pct*open_termloan)`, -cf(t).termLoanRepayment, 'link', FMT.currency);
    formula(SHEET.cf, 'dividends', t, `-div_payout*MAX(0,${is('netIncome')})`, -cf(t).dividends, 'link', FMT.currency);
    formula(SHEET.cf, 'equityIssuance', t, 'new_equity', cf(t).equityIssuance, 'formula', FMT.currency);
    formula(SHEET.cf, 'preRevolverCash', t, `${b('cash', t - 1)}+${c('cfo', t)}+${c('cfi', t)}+${c('termRepay', t)}+${c('dividends', t)}+${c('equityIssuance', t)}`, cf(t).endingCash - cf(t).revolverDraw, 'link', FMT.currency);
    formula(SHEET.cf, 'revolverDraw', t, `${b('revolver', t)}-${b('revolver', t - 1)}`, cf(t).revolverDraw, 'link', FMT.currency);
    formula(SHEET.cf, 'cff', t, `${c('termRepay', t)}+${c('dividends', t)}+${c('equityIssuance', t)}+${c('revolverDraw', t)}`, cf(t).cff, 'formula', FMT.currency, { bold: true, topBorder: true });
    formula(SHEET.cf, 'netChangeInCash', t, `${c('cfo', t)}+${c('cfi', t)}+${c('cff', t)}`, cf(t).netChangeInCash, 'formula', FMT.currency, { bold: true, topBorder: true });
    formula(SHEET.cf, 'beginningCash', t, b('cash', t - 1), cf(t).beginningCash, 'link', FMT.currency);
    formula(SHEET.cf, 'endingCash', t, `${c('beginningCash', t)}+${c('netChangeInCash', t)}`, cf(t).endingCash, 'formula', FMT.currency, { bold: true, topBorder: true, doubleBottom: true });

    // Balance sheet line items, then subtotals.
    formula(SHEET.bs, 'cash', t, c('endingCash', t), bsVal('cash', t), 'link', FMT.currency);
    formula(SHEET.bs, 'accountsReceivable', t, `${is('revenue')}*dso/365`, bsVal('accountsReceivable', t), 'link', FMT.currency);
    formula(SHEET.bs, 'inventory', t, `${is('cogs')}*dio/365`, bsVal('inventory', t), 'link', FMT.currency);
    formula(SHEET.bs, 'otherCurrentAssets', t, b('otherCurrentAssets', t - 1), bsVal('otherCurrentAssets', t), 'formula', FMT.currency);
    formula(SHEET.bs, 'grossPPE', t, `${b('grossPPE', t - 1)}-${c('capex', t)}`, bsVal('grossPPE', t), 'link', FMT.currency);
    formula(SHEET.bs, 'accumulatedDepreciation', t, `${b('accumulatedDepreciation', t - 1)}+${is('depreciation')}`, bsVal('accumulatedDepreciation', t), 'link', FMT.currency);
    formula(SHEET.bs, 'otherAssets', t, b('otherAssets', t - 1), bsVal('otherAssets', t), 'formula', FMT.currency);
    formula(SHEET.bs, 'accountsPayable', t, `${is('cogs')}*dpo/365`, bsVal('accountsPayable', t), 'link', FMT.currency);
    formula(SHEET.bs, 'accruedLiabilities', t, b('accruedLiabilities', t - 1), bsVal('accruedLiabilities', t), 'formula', FMT.currency);
    formula(SHEET.bs, 'revolver', t, `MAX(0,${b('revolver', t - 1)}-${c('preRevolverCash', t)}+min_cash)`, bsVal('revolver', t), 'link', FMT.currency);
    formula(SHEET.bs, 'termLoan', t, `${b('termLoan', t - 1)}+${c('termRepay', t)}`, bsVal('termLoan', t), 'link', FMT.currency);
    formula(SHEET.bs, 'otherLongTermLiabilities', t, b('otherLongTermLiabilities', t - 1), bsVal('otherLongTermLiabilities', t), 'formula', FMT.currency);
    formula(SHEET.bs, 'commonEquity', t, `${b('commonEquity', t - 1)}+new_equity`, bsVal('commonEquity', t), 'formula', FMT.currency);
    formula(SHEET.bs, 'retainedEarnings', t, `${b('retainedEarnings', t - 1)}+${is('netIncome')}+${c('dividends', t)}`, bsVal('retainedEarnings', t), 'link', FMT.currency);
    writeBalanceSubtotals(t);
  }

  // ════════════════ DCF (optional) ═══════════════════════════════════════════
  if (dcf && dcfAssumptions) {
    writeDCF(addSheet(SHEET.dcf, { tab: TAB_COLORS.dcf }), wb, layout, model, dcfAssumptions, dcf, N);
  }

  // ════════════════ Checks ═══════════════════════════════════════════════════
  writeChecks(addSheet(SHEET.checks, { tab: TAB_COLORS.checks }), wb, layout, model, dcf, N);

  const buffer = await wb.xlsx.writeBuffer();
  return injectIterativeCalc(new Uint8Array(buffer as unknown as ArrayBuffer));
}

// ── DCF sheet ────────────────────────────────────────────────────────────────
function writeDCF(
  sheet: ExcelJS.Worksheet,
  wb: ExcelJS.Workbook,
  layout: Layout,
  model: Model,
  a: DCFAssumptions,
  dcf: DCFResult,
  N: number,
): void {
  sheet.getColumn(1).width = 42;
  for (let t = 0; t <= N; t++) sheet.getColumn(periodCol(t)).width = 13;
  sheet.mergeCells(TITLE_ROW, 1, TITLE_ROW, periodCol(N));
  const title = sheet.getCell(TITLE_ROW, 1);
  title.value = `${model.meta.company} — Discounted Cash Flow`;
  styleHeaderCell(title);

  const F = (row: number, col: number, f: string, result: number, role: CellRole, fmt: string): void => {
    const cell = sheet.getCell(row, col);
    cell.value = { formula: f, result };
    styleValue(cell, role, fmt);
  };
  const I = (row: number, label: string, value: number, fmt: string, name?: string): void => {
    sheet.getCell(row, 1).value = label;
    styleLabel(sheet.getCell(row, 1), { indent: 1 });
    const cell = sheet.getCell(row, 2);
    cell.value = value;
    styleValue(cell, 'input', fmt);
    if (name) wb.definedNames.add(`'${SHEET.dcf}'!$B$${row}`, name);
  };
  const lbl = (row: number, text: string, bold = false): void => {
    sheet.getCell(row, 1).value = text;
    styleLabel(sheet.getCell(row, 1), { bold, indent: bold ? 0 : 1 });
  };
  const section = (row: number, text: string): void => {
    sheet.mergeCells(row, 1, row, periodCol(N));
    const cc = sheet.getCell(row, 1);
    cc.value = text;
    styleSection(cc);
  };
  const name = (row: number, nm: string): void => {
    wb.definedNames.add(`'${SHEET.dcf}'!$B$${row}`, nm);
  };

  // CAPM / WACC block.
  let r = 3;
  section(r++, 'Cost of capital (CAPM / WACC)');
  const rfRow = r++; I(rfRow, 'Risk-free rate', a.riskFreeRate, FMT.percent, 'dcf_rf');
  const erpRow = r++; I(erpRow, 'Equity risk premium', a.equityRiskPremium, FMT.percent, 'dcf_erp');
  const betaRow = r++; I(betaRow, 'Beta', a.beta, FMT.factor, 'dcf_beta');
  const sizeRow = r++; I(sizeRow, 'Size premium', a.sizePremium, FMT.percent, 'dcf_size');
  const keRow = r++; lbl(keRow, 'Cost of equity', true); F(keRow, 2, 'dcf_rf+dcf_beta*dcf_erp+dcf_size', dcf.costOfEquity, 'formula', FMT.percent); name(keRow, 'ke');
  const kdRow = r++; I(kdRow, 'Pre-tax cost of debt', a.preTaxCostOfDebt, FMT.percent, 'dcf_kd');
  const taxRow = r++; I(taxRow, 'Tax rate', a.taxRate, FMT.percent, 'dcf_tax');
  const kdatRow = r++; lbl(kdatRow, 'After-tax cost of debt', true); F(kdatRow, 2, 'dcf_kd*(1-dcf_tax)', dcf.costOfDebtAfterTax, 'formula', FMT.percent); name(kdatRow, 'kd_at');
  const weRow = r++; I(weRow, 'Equity weight (E/V)', dcf.equityWeight, FMT.percent, 'dcf_we');
  const wdRow = r++; I(wdRow, 'Debt weight (D/V)', dcf.debtWeight, FMT.percent, 'dcf_wd');
  const waccRow = r++; lbl(waccRow, 'WACC', true); F(waccRow, 2, 'dcf_we*ke+dcf_wd*kd_at', dcf.wacc, 'formula', FMT.percent); name(waccRow, 'wacc');

  // Unlevered-FCF schedule.
  r++;
  section(r++, 'Unlevered free cash flow');
  const periodHdr = r++;
  for (let t = 1; t <= N; t++) {
    const cc = sheet.getCell(periodHdr, periodCol(t));
    cc.value = model.periods[t - 1]?.label ?? `Year ${t}`;
    stylePeriodHeader(cc);
  }
  const ebitRow = r++; lbl(ebitRow, 'EBIT');
  const nopatRow = r++; lbl(nopatRow, 'NOPAT = EBIT·(1−t)');
  const daRow = r++; lbl(daRow, '(+) Depreciation & amortization');
  const capexRow = r++; lbl(capexRow, '(−) Capital expenditures');
  const nwcRow = r++; lbl(nwcRow, '(−) Increase in net working capital');
  const ufcfRow = r++; lbl(ufcfRow, 'Unlevered free cash flow', true);
  const tRow = r++; lbl(tRow, 'Discount period (t)');
  const dfRow = r++; lbl(dfRow, 'Discount factor');
  const pvRow = r++; lbl(pvRow, 'PV of unlevered FCF', true);

  for (let t = 1; t <= N; t++) {
    const col = periodCol(t);
    const cl = periodColLetter(t);
    const dp = dcf.periods[t - 1]!;
    F(ebitRow, col, layout.ref(SHEET.is, 'ebit', t), dp.ebit, 'link', FMT.currency);
    F(nopatRow, col, `${cl}${ebitRow}*(1-dcf_tax)`, dp.nopat, 'formula', FMT.currency);
    F(daRow, col, layout.ref(SHEET.is, 'depreciation', t), dp.depreciation, 'link', FMT.currency);
    F(capexRow, col, `${layout.ref(SHEET.is, 'revenue', t)}*capex_pct`, dp.capex, 'link', FMT.currency);
    const dNwc =
      `(${layout.ref(SHEET.bs, 'accountsReceivable', t)}-${layout.ref(SHEET.bs, 'accountsReceivable', t - 1)})` +
      `+(${layout.ref(SHEET.bs, 'inventory', t)}-${layout.ref(SHEET.bs, 'inventory', t - 1)})` +
      `-(${layout.ref(SHEET.bs, 'accountsPayable', t)}-${layout.ref(SHEET.bs, 'accountsPayable', t - 1)})` +
      `-(${layout.ref(SHEET.bs, 'accruedLiabilities', t)}-${layout.ref(SHEET.bs, 'accruedLiabilities', t - 1)})`;
    F(nwcRow, col, dNwc, dp.changeInNWC, 'link', FMT.currency);
    F(ufcfRow, col, `${cl}${nopatRow}+${cl}${daRow}-${cl}${capexRow}-${cl}${nwcRow}`, dp.unleveredFCF, 'formula', FMT.currency);
    const tCell = sheet.getCell(tRow, col);
    tCell.value = dp.t;
    styleValue(tCell, 'input', FMT.factor);
    F(dfRow, col, `1/(1+wacc)^${cl}${tRow}`, dp.discountFactor, 'formula', FMT.factor);
    F(pvRow, col, `${cl}${ufcfRow}*${cl}${dfRow}`, dp.presentValue, 'formula', FMT.currency);
  }

  // Valuation block (values in column B).
  r++;
  section(r++, 'Valuation');
  const put = (label: string, f: string, result: number, fmt: string, bold = false): number => {
    const row = r++;
    lbl(row, label, bold);
    F(row, 2, f, result, 'formula', fmt);
    return row;
  };
  const isPerp = a.terminalMethod === 'perpetuity';
  const lastL = periodColLetter(N);
  const pvForecastRow = put('PV of forecast UFCF', `SUM(${periodColLetter(1)}${pvRow}:${lastL}${pvRow})`, dcf.pvOfForecast, FMT.currency, true);
  const gRow = r++; I(gRow, isPerp ? 'Terminal growth (g)' : 'Terminal growth (g) — unused', a.terminalGrowth, FMT.percent, 'dcf_g');
  const exitRow = r++; I(exitRow, isPerp ? 'Exit multiple — unused' : 'Exit multiple (EV/EBITDA)', a.exitMultiple, FMT.multiple, 'dcf_exit');
  const tvFormula = isPerp
    ? `${periodColLetter(N)}${ufcfRow}*(1+dcf_g)/(wacc-dcf_g)`
    : `${layout.ref(SHEET.is, 'ebitda', N)}*dcf_exit`;
  const tvRow = put('Terminal value', tvFormula, dcf.terminalValue, FMT.currency);
  const tvDfFormula = isPerp ? `${periodColLetter(N)}${dfRow}` : `1/(1+wacc)^${N}`;
  const tvDfRow = put('Terminal discount factor', tvDfFormula, dcf.terminalDiscountFactor, FMT.factor);
  const pvTvRow = put('PV of terminal value', `B${tvRow}*B${tvDfRow}`, dcf.pvOfTerminalValue, FMT.currency, true);
  const evRow = put('Enterprise value', `B${pvForecastRow}+B${pvTvRow}`, dcf.enterpriseValue, FMT.currency, true);
  const ndRow = put('Less: net debt', 'open_revolver+open_termloan-open_cash', dcf.netDebt, FMT.currency);
  const eqRow = put('Equity value', `B${evRow}-B${ndRow}`, dcf.equityValue, FMT.currency, true);
  put('Equity value per share', `IF(shares>0,B${eqRow}/shares,0)`, dcf.equityValuePerShare, FMT.price, true);
}

// ── Checks sheet ─────────────────────────────────────────────────────────────
function writeChecks(
  sheet: ExcelJS.Worksheet,
  wb: ExcelJS.Workbook,
  layout: Layout,
  model: Model,
  dcf: DCFResult | undefined,
  N: number,
): void {
  sheet.getColumn(1).width = 46;
  sheet.getColumn(2).width = 12;
  sheet.getColumn(3).width = 16;
  sheet.mergeCells(TITLE_ROW, 1, TITLE_ROW, 3);
  const title = sheet.getCell(TITLE_ROW, 1);
  title.value = `${model.meta.company} — Checks`;
  styleHeaderCell(title);
  sheet.getCell(UNITS_ROW, 1).value = 'Each check re-evaluates live as you edit the model.';
  sheet.getCell(UNITS_ROW, 1).font = { ...NOTE_FONT };
  for (const [i, h] of ['Check', 'Result', 'Difference'].entries()) {
    const cell = sheet.getCell(HEADER_ROW, i + 1);
    cell.value = h;
    stylePeriodHeader(cell);
    if (i === 0) cell.alignment = { horizontal: 'left' };
  }

  let r = FIRST_DATA_ROW;
  const tol = 0.01;
  const check = (label: string, diffFormula: string, diffResult: number): void => {
    sheet.getCell(r, 1).value = label;
    styleLabel(sheet.getCell(r, 1), { indent: 1 });
    const result = sheet.getCell(r, 2);
    result.value = { formula: `IF(ABS(C${r})<${tol},"OK","FAIL")`, result: Math.abs(diffResult) < tol ? 'OK' : 'FAIL' };
    result.alignment = { horizontal: 'center' };
    result.font = { name: FONT, size: 10, bold: true };
    const diff = sheet.getCell(r, 3);
    diff.value = { formula: diffFormula, result: diffResult };
    styleValue(diff, 'formula', FMT.currency);
    r++;
  };

  for (let t = 1; t <= N; t++) {
    const lbl = model.periods[t - 1]?.label ?? `Year ${t}`;
    const p = model.periods[t - 1]!;
    check(`Balance sheet balances — ${lbl}`, layout.ref(SHEET.bs, 'balanceCheck', t), p.balance.balanceCheck);
    check(
      `Cash flow ties to balance sheet — ${lbl}`,
      `${layout.ref(SHEET.cf, 'endingCash', t)}-${layout.ref(SHEET.bs, 'cash', t)}`,
      p.cashFlow.endingCash - p.balance.cash,
    );
  }
  if (dcf) {
    const ev = findDcfRow(wb, 'Enterprise value');
    const pf = findDcfRow(wb, 'PV of forecast UFCF');
    const pt = findDcfRow(wb, 'PV of terminal value');
    check(
      'DCF: EV = PV(forecast) + PV(terminal)',
      `'${SHEET.dcf}'!B${ev}-('${SHEET.dcf}'!B${pf}+'${SHEET.dcf}'!B${pt})`,
      dcf.enterpriseValue - (dcf.pvOfForecast + dcf.pvOfTerminalValue),
    );
  }
}

/** Locate a labeled valuation row on the DCF sheet by its column-A text. */
function findDcfRow(wb: ExcelJS.Workbook, label: string): number {
  const sheet = wb.getWorksheet(SHEET.dcf);
  if (!sheet) return 1;
  let found = 1;
  sheet.eachRow((row, rowNumber) => {
    if (row.getCell(1).value === label) found = rowNumber;
  });
  return found;
}

// ── Cover sheet ──────────────────────────────────────────────────────────────
function writeCover(sheet: ExcelJS.Worksheet, model: Model, hasDcf: boolean): void {
  sheet.getColumn(1).width = 30;
  sheet.getColumn(2).width = 52;
  sheet.mergeCells(1, 1, 1, 2);
  const title = sheet.getCell(1, 1);
  title.value = 'ProForma — Financial Model';
  styleHeaderCell(title, { center: true });
  title.font = { name: FONT, size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).height = 28;

  const balanced = model.periods.every((p) => Math.abs(p.balance.balanceCheck) < 0.01);
  const rows: Array<[string, string]> = [
    ['Company', model.meta.company],
    ['Currency / units', `${model.meta.currency} in ${model.meta.units}`],
    ['Forecast horizon', `${model.meta.years} years`],
    ['Statements', 'Income Statement · Balance Sheet · Cash Flow'],
    ['Valuation', hasDcf ? 'Discounted Cash Flow (DCF)' : '—'],
    ['Balance sheet ties out', balanced ? 'Yes' : 'See Checks tab'],
    ['Circular reference', 'Revolver ↔ interest, solved by iterative calc'],
  ];
  let r = 3;
  for (const [k, v] of rows) {
    sheet.getCell(r, 1).value = k;
    styleLabel(sheet.getCell(r, 1), { bold: true });
    sheet.getCell(r, 2).value = v;
    styleLabel(sheet.getCell(r, 2));
    r++;
  }
  r++;
  sheet.mergeCells(r, 1, r, 2);
  const disclaimer = sheet.getCell(r, 1);
  disclaimer.value =
    'Not investment advice. Educational tool; outputs depend entirely on the assumptions provided.';
  disclaimer.font = { ...NOTE_FONT };
  disclaimer.alignment = { wrapText: true };
}
