import { useState } from 'react';
import {
  buildModel,
  computeDCF,
  DCFAssumptionsSchema,
  parseAssumptions,
  type DCFResult,
  type Model,
} from '../engine/index.ts';
import { validateModel, type ValidationReport } from '../validation/index.ts';
import { buildReadme } from '../export/index.ts';
import { PRESETS } from '../templates/index.ts';
import {
  chat,
  getKey,
  getModel,
  llmAvailable,
  setKey,
  setModel,
  type ChatMessage,
} from '../llm/client.ts';
import { buildSuggestionMessages, extractSuggestion } from '../llm/assumptions.ts';
import {
  presetToForm,
  toInputs,
  mergeSuggestion,
  REVIEW_GROUPS,
  commonEquityPlug,
  type FormState,
} from './model-form.ts';
import {
  Bubble,
  Button,
  Card,
  Chip,
  Field,
  NumberInput,
  Section,
  Spinner,
  Stat,
  StatusPill,
  TextArea,
  TextInput,
} from './components.tsx';
import { downloadBytes, downloadText, money, mult, pct, price, slug } from './lib.ts';

type Phase = 'type' | 'describe' | 'review' | 'result';
interface Msg {
  id: number;
  from: 'assistant' | 'user';
  text: string;
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

let msgId = 0;

export default function Chat() {
  const [phase, setPhase] = useState<Phase>('type');
  const [messages, setMessages] = useState<Msg[]>([
    { id: msgId++, from: 'assistant', text: 'Hi — I’ll help you build a validated financial model. What would you like to create?' },
  ]);
  const [description, setDescription] = useState('');
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Generated | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [keyInput, setKeyInput] = useState(getKey());
  const [modelInput, setModelInput] = useState(getModel());
  const [hasKey, setHasKey] = useState(llmAvailable());

  const say = (from: Msg['from'], text: string): void =>
    setMessages((m) => [...m, { id: msgId++, from, text }]);
  const update = <K extends keyof FormState>(k: K, v: FormState[K]): void =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const saveKey = (): void => {
    setKey(keyInput);
    setModel(modelInput);
    setHasKey(llmAvailable());
    setShowKey(false);
    if (llmAvailable()) say('assistant', 'Key saved — AI suggestions are on. Describe your company whenever you’re ready.');
  };

  const chooseThreeStatement = (): void => {
    say('user', '3-statement model + DCF');
    say('assistant', 'Great. Describe the company — industry, rough revenue, growth, leverage, anything notable. Or start from a template below.');
    setPhase('describe');
  };

  const startFromPreset = (id: string): void => {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    setForm(presetToForm(p));
    say('user', `Start from the ${p.name} template`);
    say('assistant', `Loaded the ${p.name} template. Review the key assumptions below and edit anything, then generate.`);
    setError(null);
    setPhase('review');
  };

  const suggest = async (): Promise<void> => {
    const desc = description.trim();
    if (!desc) return;
    say('user', desc);
    setDescription('');
    if (!llmAvailable()) {
      say('assistant', 'Add an OpenRouter key (top-right) to use AI suggestions — or pick a template above to continue without one.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const messagesForLlm: ChatMessage[] = buildSuggestionMessages(desc);
      const content = await chat(messagesForLlm, { temperature: 0.2 });
      const patch = extractSuggestion(content);
      const base = presetToForm(PRESETS[1]!); // industrial as a neutral base
      if (!patch) {
        setForm(base);
        say('assistant', 'I couldn’t parse a clean set of assumptions from the model, so I’ve loaded a sensible baseline. Please review and edit below.');
      } else {
        const merged = mergeSuggestion(base, patch);
        setForm(merged);
        const note = typeof patch._note === 'string' ? patch._note : '';
        say('assistant', `Here’s a starting point${note ? ` — ${note}` : ''}. Review the key values below and edit anything, then generate.`);
      }
      setPhase('review');
    } catch (e) {
      say('assistant', `The assistant hit an error: ${e instanceof Error ? e.message : String(e)}. You can retry or start from a template.`);
    } finally {
      setBusy(false);
    }
  };

  const generate = async (): Promise<void> => {
    if (!form) return;
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
      const readme = buildReadme(model, a, dcfRes, report, { generatedOn: new Date().toLocaleDateString('en-US') });
      const { buildWorkbook } = await import('../excel/index.ts');
      const bytes = await buildWorkbook(model, a, dcfA);
      setResult({ model, dcf: dcfRes, report, bytes, filename: `${base}.xlsx`, readme, readmeFilename: `${base}_README.md` });
      setPhase('result');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = (): void => {
    setResult(null);
    setForm(null);
    setPhase('type');
    setMessages([{ id: msgId++, from: 'assistant', text: 'Fresh start — what would you like to build?' }]);
  };

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-citi-400 shadow-[0_0_10px_2px] shadow-citi-400/50" />
          <span className="text-sm font-semibold text-ink">ProForma Assistant</span>
        </div>
        <button
          onClick={() => setShowKey((s) => !s)}
          className="rounded-full border border-line bg-white/5 px-3 py-1 text-xs text-muted transition hover:text-ink"
        >
          {hasKey ? 'AI: connected' : 'Connect OpenRouter'}
        </button>
      </div>

      {/* Key settings */}
      {showKey && (
        <div className="space-y-3 border-b border-line bg-white/[0.02] px-5 py-4">
          <Field label="OpenRouter API key" help="Stored only in this browser (localStorage) and sent directly to OpenRouter. Never commit it. Get one at openrouter.ai/keys.">
            <TextInput value={keyInput} onChange={setKeyInput} placeholder="sk-or-v1-…" />
          </Field>
          <Field label="Model" help="Defaults to the free model.">
            <TextInput value={modelInput} onChange={setModelInput} placeholder="openrouter/free" />
          </Field>
          <div className="flex gap-2">
            <Button size="sm" onClick={saveKey}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowKey(false)}>Close</Button>
          </div>
        </div>
      )}

      {/* Conversation */}
      <div className="space-y-3 px-5 py-5">
        {messages.map((m) => (
          <Bubble key={m.id} from={m.from}>{m.text}</Bubble>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Spinner /> Thinking…
          </div>
        )}

        {/* Phase: choose model type */}
        {phase === 'type' && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Chip active onClick={chooseThreeStatement}>3-statement model + DCF</Chip>
            <Chip title="Available in the engine; chat support next">LBO · soon</Chip>
          </div>
        )}

        {/* Phase: describe */}
        {phase === 'describe' && (
          <div className="space-y-3 pt-1">
            <TextArea
              value={description}
              onChange={setDescription}
              rows={3}
              placeholder="e.g. A $400m ARR vertical SaaS company growing ~25%, ~78% gross margin, lightly levered…"
              onSubmit={suggest}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={suggest} disabled={busy || !description.trim()}>
                {hasKey ? 'Suggest assumptions' : 'Continue'}
              </Button>
              <span className="text-xs text-muted">or start from a template:</span>
              {PRESETS.map((p) => (
                <Chip key={p.id} onClick={() => startFromPreset(p.id)} title={p.description}>
                  {p.name}
                </Chip>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Phase: review */}
      {phase === 'review' && form && (
        <Review form={form} update={update} onGenerate={generate} busy={busy} error={error} />
      )}

      {/* Phase: result */}
      {phase === 'result' && result && (
        <Results result={result} onReset={reset} onRefine={() => setPhase('review')} />
      )}
    </Card>
  );
}

function Review({
  form,
  update,
  onGenerate,
  busy,
  error,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  onGenerate: () => void;
  busy: boolean;
  error: string | null;
}) {
  const plug = commonEquityPlug(form);
  return (
    <div className="border-t border-line px-5 py-5">
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Field label="Company">
          <TextInput value={form.company} onChange={(v) => update('company', v)} />
        </Field>
        <Field label="Forecast years" unit="yrs">
          <NumberInput value={form.years} step={1} unit onChange={(v) => update('years', v)} />
        </Field>
        <Field label="Currency">
          <TextInput value={form.currency} onChange={(v) => update('currency', v)} />
        </Field>
      </div>

      {REVIEW_GROUPS.map((g) => (
        <div key={g.title} className="mb-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-citi-300/80">{g.title}</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {g.fields.map((f) => (
              <Field key={f.key} label={f.label} unit={f.unit}>
                <NumberInput
                  value={form[f.key] as number}
                  step={f.step}
                  unit={!!f.unit}
                  onChange={(v) => update(f.key, v as FormState[typeof f.key])}
                />
              </Field>
            ))}
          </div>
        </div>
      ))}

      <p className="text-xs text-muted">
        Opening common equity is auto-plugged to <span className="tabular text-ink">{money(plug)}</span> so the
        balance sheet ties out.
      </p>

      {error && (
        <div className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xs text-muted">Runs in your browser — the engine does the math, not the AI.</span>
        <Button onClick={onGenerate} disabled={busy}>
          {busy ? 'Generating…' : 'Generate model'}
        </Button>
      </div>
    </div>
  );
}

function Results({ result, onReset, onRefine }: { result: Generated; onReset: () => void; onRefine: () => void }) {
  const { model, dcf, report } = result;
  const final = model.periods[model.periods.length - 1]!;
  const margin = final.income.ebitda / final.income.revenue;

  return (
    <div className="border-t border-line px-5 py-5">
      <Section
        title={`${model.meta.company} — results`}
        subtitle="Computed and validated by the deterministic engine."
        right={
          <div className="flex flex-wrap gap-2">
            <StatusPill status="pass">{report.summary.pass} passed</StatusPill>
            {report.summary.warn > 0 && <StatusPill status="warn">{report.summary.warn} warnings</StatusPill>}
            <StatusPill status={report.summary.fail === 0 ? 'pass' : 'fail'}>
              {report.summary.fail === 0 ? 'Ties out' : `${report.summary.fail} failures`}
            </StatusPill>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Enterprise value" value={money(dcf.enterpriseValue)} hint={`${model.meta.currency} ${model.meta.units}`} />
          <Stat label="Equity value" value={money(dcf.equityValue)} hint={`net debt ${money(dcf.netDebt)}`} />
          <Stat label="Value / share" value={dcf.sharesOutstanding > 0 ? price(dcf.equityValuePerShare) : '—'} />
          <Stat label="WACC" value={pct(dcf.wacc)} hint={dcf.terminalMethod === 'perpetuity' ? `${pct(dcf.impliedPerpetuityGrowth)} g` : mult(dcf.impliedExitMultiple)} />
          <Stat label={`Revenue (Y${model.meta.years})`} value={money(final.income.revenue)} />
          <Stat label="EBITDA margin" value={pct(margin)} hint={money(final.income.ebitda)} />
          <Stat label={`Net income (Y${model.meta.years})`} value={money(final.income.netIncome)} />
          <Stat label="Ending cash" value={money(final.balance.cash)} hint={`revolver ${money(final.balance.revolver)}`} />
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Button onClick={() => downloadBytes(result.bytes, result.filename)}>Download Excel (.xlsx)</Button>
          <Button variant="subtle" onClick={() => downloadText(result.readme, result.readmeFilename)}>Download README</Button>
          <Button variant="ghost" onClick={onRefine}>Refine assumptions</Button>
          <Button variant="ghost" onClick={onReset}>Start over</Button>
        </div>
      </Section>
    </div>
  );
}
