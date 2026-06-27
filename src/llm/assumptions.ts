import type { ChatMessage } from './client.ts';

/**
 * Prompt + parser for turning a plain-English company description into a set of
 * *suggested* model assumptions (display units: percentages as plain numbers,
 * e.g. 25 = 25%). The user always reviews and edits these; the engine does the
 * math.
 */

const FIELD_GUIDE = `
Numeric fields (percentages as plain numbers, e.g. 25 means 25%):
- company (string), years (1-10), currency (e.g. "USD"), units (e.g. "millions")
- revenueBase: most recent annual revenue, in the chosen units
- revenueGrowth: YoY % (e.g. 12)
- cogs: COGS as % of revenue;  sga: SG&A as % of revenue
- capex: capex as % of revenue;  dep: depreciation as % of beginning gross PP&E
- dso, dio, dpo: working-capital days (receivables / inventory / payables)
- tax: tax rate %;  div: dividend payout % of net income
- revolverRate, termRate, cashRate: interest rates %;  termAmort: term-loan amortization % per year
- minCash: minimum cash balance (units);  shares: shares outstanding (units)
- Opening balance sheet (units): oCash, oAR, oInv, oGross (gross PP&E), oAccum (accumulated dep),
  oAP, oRev (revolver), oTerm (term loan), oRE (retained earnings)
- DCF: rf (risk-free %), erp (equity risk premium %), beta, kd (pre-tax cost of debt %),
  dcfTax (tax %), terminalMethod ("perpetuity" or "exitMultiple"), g (terminal growth %), exit (EV/EBITDA x)
- _note: one short sentence explaining your key choices`;

const SYSTEM = `You are a financial-modeling assistant for an IB/PE app. A deterministic engine builds the
3-statement model and DCF and checks that it ties out — you NEVER compute the model yourself. Your job
is to propose realistic, internally consistent starting assumptions for the company the user describes,
appropriate to its industry, size, and stage.

Return ONLY a single JSON object (no markdown, no prose outside the JSON) with these fields:
${FIELD_GUIDE}

Make the opening balance sheet roughly consistent with the operating assumptions (e.g. receivables ≈
revenue×DSO/365). Use sensible industry conventions. Output strictly valid JSON.`;

export function buildSuggestionMessages(description: string): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `Company description:\n${description}\n\nReturn the JSON assumptions object now.`,
    },
  ];
}

/** Extract the first JSON object from a model response (tolerates code fences/prose). */
export function extractSuggestion(content: string): Record<string, unknown> | null {
  let text = content.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) text = fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  const slice = text.slice(start, end + 1);
  try {
    const parsed: unknown = JSON.parse(slice);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
