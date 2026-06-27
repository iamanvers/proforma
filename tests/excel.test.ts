import ExcelJS from 'exceljs';
import { describe, expect, it, beforeAll } from 'vitest';
import {
  buildModel,
  computeDCF,
  DCFAssumptionsSchema,
  parseAssumptions,
} from '../src/engine/index.ts';
import type { DCFResult, Model, ModelAssumptions } from '../src/engine/index.ts';
import { buildWorkbook, periodCol, readWorkbookXml } from '../src/excel/index.ts';
import { getPreset } from '../src/templates/index.ts';

const preset = getPreset('industrial')!;
let assumptions: ModelAssumptions;
let model: Model;
let dcf: DCFResult;
let bytes: Uint8Array;
let wb: ExcelJS.Workbook;

beforeAll(async () => {
  assumptions = parseAssumptions(preset.assumptions);
  model = buildModel(assumptions);
  const dcfA = DCFAssumptionsSchema.parse(preset.dcf);
  dcf = computeDCF(model, dcfA);
  bytes = await buildWorkbook(model, assumptions, dcfA);
  wb = new ExcelJS.Workbook();
  // exceljs's `load` param is structurally an ArrayBuffer; pass a definite one.
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  await wb.xlsx.load(ab);
});

/** Cached value of a cell (formula cells return { formula, result }). */
function cached(ws: ExcelJS.Worksheet, row: number, col: number): unknown {
  const v = ws.getCell(row, col).value;
  return v !== null && typeof v === 'object' && 'result' in v ? v.result : v;
}

function findRow(ws: ExcelJS.Worksheet, match: (label: string) => boolean): number {
  let found = -1;
  ws.eachRow((row, n) => {
    const v = row.getCell(1).value;
    if (typeof v === 'string' && match(v)) found = n;
  });
  if (found < 0) throw new Error('row not found');
  return found;
}

const N = () => model.periods.length;

describe('Excel export — structure', () => {
  it('contains the expected bank-style tabs in order', () => {
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Cover',
      'Assumptions',
      'Income Statement',
      'Balance Sheet',
      'Cash Flow',
      'Ratios',
      'DCF',
      'Checks',
    ]);
  });

  it('registers named ranges for drivers and WACC', () => {
    expect(wb.definedNames.getRanges('rev_growth').ranges.length).toBeGreaterThan(0);
    expect(wb.definedNames.getRanges('wacc').ranges.length).toBeGreaterThan(0);
    expect(wb.definedNames.getRanges('open_termloan').ranges.length).toBeGreaterThan(0);
  });
});

describe('Excel export — iterative calc (calcPr)', () => {
  it('injects iterate flags into xl/workbook.xml', () => {
    const xml = readWorkbookXml(bytes);
    expect(xml).toMatch(/<calcPr\b[^>]*iterate="1"/);
    expect(xml).toMatch(/iterateCount="100"/);
    expect(xml).toMatch(/iterateDelta="0\.001"/);
    expect(xml).toMatch(/fullCalcOnLoad="1"/);
  });
});

describe('Excel export — cached results equal the engine', () => {
  it('income statement: net income matches every period', () => {
    const is = wb.getWorksheet('Income Statement')!;
    const row = findRow(is, (l) => l === 'Net income');
    for (let t = 1; t <= N(); t++) {
      expect(cached(is, row, periodCol(t))).toBeCloseTo(model.periods[t - 1]!.income.netIncome, 4);
    }
  });

  it('balance sheet: total assets match and balance (A = L&E) every period', () => {
    const bs = wb.getWorksheet('Balance Sheet')!;
    const taRow = findRow(bs, (l) => l === 'Total assets');
    const leRow = findRow(bs, (l) => l === 'Total liabilities & equity');
    for (let t = 1; t <= N(); t++) {
      const ta = cached(bs, taRow, periodCol(t)) as number;
      const le = cached(bs, leRow, periodCol(t)) as number;
      expect(ta).toBeCloseTo(model.periods[t - 1]!.balance.totalAssets, 3);
      expect(Math.abs(ta - le)).toBeLessThan(0.01);
    }
  });

  it('cash flow: ending cash matches the balance sheet cash', () => {
    const cfWs = wb.getWorksheet('Cash Flow')!;
    const row = findRow(cfWs, (l) => l === 'Ending cash');
    for (let t = 1; t <= N(); t++) {
      expect(cached(cfWs, row, periodCol(t))).toBeCloseTo(model.periods[t - 1]!.balance.cash, 3);
    }
  });

  it('ratios: EBITDA margin matches the engine every period', () => {
    const r = wb.getWorksheet('Ratios')!;
    const row = findRow(r, (l) => l === 'EBITDA margin');
    for (let t = 1; t <= N(); t++) {
      const p = model.periods[t - 1]!;
      expect(cached(r, row, periodCol(t))).toBeCloseTo(p.income.ebitda / p.income.revenue, 6);
    }
  });

  it('DCF: enterprise value and WACC match the engine', () => {
    const dcfWs = wb.getWorksheet('DCF')!;
    const evRow = findRow(dcfWs, (l) => l === 'Enterprise value');
    const waccRow = findRow(dcfWs, (l) => l === 'WACC');
    expect(cached(dcfWs, evRow, 2)).toBeCloseTo(dcf.enterpriseValue, 2);
    expect(cached(dcfWs, waccRow, 2)).toBeCloseTo(dcf.wacc, 6);
  });
});

describe('Excel export — Checks tab is live', () => {
  it('writes IF-based formulas that cache to OK for a healthy model', () => {
    const checks = wb.getWorksheet('Checks')!;
    let okFormulas = 0;
    checks.eachRow((row) => {
      const cell = row.getCell(2).value;
      if (cell !== null && typeof cell === 'object' && 'formula' in cell) {
        expect(String(cell.formula)).toContain('IF(');
        if (cell.result === 'OK') okFormulas++;
      }
    });
    expect(okFormulas).toBeGreaterThan(0);
  });
});
