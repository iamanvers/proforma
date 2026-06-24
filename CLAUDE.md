# CLAUDE.md — ProForma

Guidance for AI assistants and developers working in this repo. Read this before editing.

## What this is
A **static** (GitHub Pages) browser app that generates **validated IB/PE financial models** and
exports them as **live `.xlsx`** workbooks. MVP = integrated **3-statement model + DCF**.

## Non-negotiable architectural rules
1. **The engine is deterministic; the LLM NEVER does the math.** All financial figures come from
   `src/engine/` (pure TypeScript, no DOM, no network). The LLM (`src/llm/`) only parses uploads,
   *suggests* assumptions (user reviews them), and writes prose. The model must be fully
   generable with **zero LLM calls**.
2. **Static-only runtime.** No server. Everything runs in the browser (TS/WASM). Secrets live only
   in the **Cloudflare Worker** (`worker/`); the front-end uses the Worker proxy or BYOK.
3. **Numbers are IEEE-754 doubles** (plain TS `number`) — to match Excel's own arithmetic. Do
   **not** introduce a decimal library; handle cents via display rounding + validation tolerance.
4. **Books are spec + test oracle, not content.** Reference worked numeric examples become Vitest
   golden fixtures and validation rules. **Never** paste book text or proprietary bank templates
   into the repo (copyright). Replicate public conventions only.
5. **Validation is first-class.** Anything the engine emits must be checked by `src/validation/`
   and reflected on the workbook's **Checks** tab.

## Key gotchas
- **ExcelJS can't cleanly set iterative calc.** For circular references (revolver↔interest), we:
  (a) write engine-computed **cached `result`** on every formula cell, (b) set
  `workbook.calcProperties.fullCalcOnLoad = true`, (c) **post-process the `.xlsx` zip** to inject
  `<calcPr iterate="1" iterateCount="100" iterateDelta="0.001" .../>` into `xl/workbook.xml`
  (`src/excel/`), and (d) include a **circularity-breaker switch** cell.
- **The revolver is the plug** and creates a circular reference; solve it with the fixed-point
  iterator in `src/engine/circular.ts`, not by hoping a spreadsheet lib handles cycles
  (HyperFormula returns `#CYCLE`).
- **OpenRouter free tier:** 20 req/min; 50/day (<\$10) or 1000/day (≥\$10 once); failed calls
  count; vision is scarce. Parallelize only *fuzzy* sub-tasks with concurrency limits + backoff.

## Layout
```
src/engine/{schema,threeStatement,schedules,circular,dcf,layout}.ts
src/validation/   src/excel/   src/llm/{client,queue,agents}   src/inputs/   src/ui/
worker/           tests/       docs/{PRD,README}.md
```

## Commands
```bash
npm run dev | build | preview
npm run typecheck | lint
npm run test | test:run
# Worker:
cd worker && npx wrangler dev | deploy
```

## How to extend
- **Add a model type:** new module in `src/engine/`, reuse the 3-statement core; add its Zod
  schema, validation checks, and Excel sheet layout; add golden-fixture tests.
- **Add a validation check:** add to the catalog in `src/validation/` with an id, severity,
  condition, message, and cell ref; add a self-test that injects a failing model.
- **Add a workbook tab:** extend `src/excel/`; keep bank conventions (blue inputs / black formulas
  / green cross-sheet links) and named ranges.

## Verification expectations
Engine reproduces golden fixtures exactly; balance sheet always balances (property test);
generated `.xlsx` parses back with `calcPr` flags present and cached results equal to engine
values within tolerance.
