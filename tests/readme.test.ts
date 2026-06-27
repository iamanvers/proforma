import { describe, expect, it } from 'vitest';
import {
  buildModel,
  computeDCF,
  DCFAssumptionsSchema,
  parseAssumptions,
} from '../src/engine/index.ts';
import { validateModel } from '../src/validation/index.ts';
import { buildReadme } from '../src/export/index.ts';
import { getPreset } from '../src/templates/index.ts';

function buildFor(id: string) {
  const preset = getPreset(id)!;
  const a = parseAssumptions(preset.assumptions);
  const model = buildModel(a);
  const dcf = computeDCF(model, DCFAssumptionsSchema.parse(preset.dcf));
  const report = validateModel(model, a, dcf);
  return { a, model, dcf, report };
}

describe('README export', () => {
  it('produces a Markdown note with the headline sections and figures', () => {
    const { a, model, dcf, report } = buildFor('industrial');
    const md = buildReadme(model, a, dcf, report);

    expect(md).toContain(`# ${a.meta.company} — Financial Model`);
    expect(md).toContain('## Validation status');
    expect(md).toContain('## Key outputs');
    expect(md).toContain('## Forecast summary');
    expect(md).toContain('Enterprise value');
    expect(md).toContain('WACC');
    // A row for every forecast year appears in the summary table.
    for (const p of model.periods) expect(md).toContain(`| ${p.label} |`);
    // Healthy preset ⇒ ties out, no failures reported.
    expect(md).toContain('The model ties out.');
    expect(md).toContain('Not investment advice');
  });

  it('omits DCF sections when no valuation is supplied', () => {
    const { a, model } = buildFor('saas');
    const md = buildReadme(model, a);
    expect(md).not.toContain('## Valuation (DCF)');
    expect(md).toContain('## Operating assumptions');
  });

  it('is deterministic for the same inputs', () => {
    const { a, model, dcf, report } = buildFor('retail');
    expect(buildReadme(model, a, dcf, report)).toEqual(buildReadme(model, a, dcf, report));
  });
});
