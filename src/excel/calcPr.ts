import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

/**
 * Inject iterative-calculation settings into a generated `.xlsx`.
 *
 * ExcelJS can set `fullCalcOnLoad` but cannot emit the iterative-calc attributes
 * Excel needs to open a workbook with circular references (the revolver↔interest
 * loop) without a warning. So we post-process the zip: unzip, patch
 * `xl/workbook.xml`'s `<calcPr>` element, and rezip.
 *
 * Schema order in `CT_Workbook` puts `<calcPr>` after `<sheets>` and
 * `<definedNames>`, so when no element exists yet we insert it there.
 */
export interface IterativeCalcOptions {
  iterateCount?: number;
  iterateDelta?: number;
}

export function injectIterativeCalc(
  xlsx: Uint8Array,
  opts: IterativeCalcOptions = {},
): Uint8Array {
  const iterateCount = opts.iterateCount ?? 100;
  const iterateDelta = opts.iterateDelta ?? 0.001;

  const files = unzipSync(xlsx);
  const wbBytes = files['xl/workbook.xml'];
  if (!wbBytes) throw new Error('xl/workbook.xml not found in the generated workbook');

  const xml = strFromU8(wbBytes);
  const calcPr =
    `<calcPr calcId="191029" iterate="1" iterateCount="${iterateCount}" ` +
    `iterateDelta="${iterateDelta}" fullCalcOnLoad="1"/>`;

  let patched: string;
  if (/<calcPr\b[^>]*\/>/.test(xml)) {
    patched = xml.replace(/<calcPr\b[^>]*\/>/, calcPr);
  } else if (/<calcPr\b[^>]*>[\s\S]*?<\/calcPr>/.test(xml)) {
    patched = xml.replace(/<calcPr\b[^>]*>[\s\S]*?<\/calcPr>/, calcPr);
  } else if (/<\/definedNames>/.test(xml)) {
    patched = xml.replace('</definedNames>', `</definedNames>${calcPr}`);
  } else if (/<\/sheets>/.test(xml)) {
    patched = xml.replace('</sheets>', `</sheets>${calcPr}`);
  } else {
    patched = xml.replace('</workbook>', `${calcPr}</workbook>`);
  }

  files['xl/workbook.xml'] = strToU8(patched);
  return zipSync(files);
}

/** Read back the raw `xl/workbook.xml` (used by tests to assert calcPr flags). */
export function readWorkbookXml(xlsx: Uint8Array): string {
  const files = unzipSync(xlsx);
  const wbBytes = files['xl/workbook.xml'];
  if (!wbBytes) throw new Error('xl/workbook.xml not found');
  return strFromU8(wbBytes);
}
