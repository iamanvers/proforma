# ProForma — Session Handoff

Last updated: 2026-06-26. This captures current state, decisions, and what's next so any
contributor (or a fresh session) can continue without re-deriving context.

## Status — green
`npm run typecheck`, `npm run lint`, `npm run test:run` (60 tests), `npm run build` all pass.
Pushed to `main` (latest: builder UI). The full path **forms → engine → validation → live `.xlsx`**
works end-to-end, entirely client-side, with **zero LLM calls**.

## What's built
- **Engine** (`src/engine/`, pure TS): 3-statement model + schedules + revolver-as-plug circular
  solver; **DCF** (UFCF, CAPM WACC, perpetuity + exit-multiple terminal value, mid-year, net-debt
  bridge, per-share, `buildSensitivity`). DCF reuses the 3-statement core.
- **Validation** (`src/validation/`): math / circular / logic / assumptions + DCF checks.
  `validateModel(model, assumptions?, dcf?)`.
- **Excel** (`src/excel/`): `buildWorkbook(model, assumptions, dcfAssumptions?) → Uint8Array`.
  Bank-grade: Arial, gridlines off, accountant number formats, color-coded tabs, named ranges,
  print setup, live formulas with cached results, revolver circularity as live formulas, calcPr
  iterate injected via fflate, live Checks tab. Reusable foundation: `style.ts`, `cells.ts`
  (`Layout`), `calcPr.ts`.
- **Templates** (`src/templates/presets.ts`): SaaS / Industrial / Retail starter presets (public
  conventions only); openings balance by construction (common equity = plug).
- **README export** (`src/export/readme.ts`): deterministic Markdown methodology note from the
  model + validation report (no LLM) — validation status, key outputs, assumptions, DCF method,
  per-year forecast table, methodology, disclaimer.
- **UI** (`src/ui/` + `App.tsx`): light Citi-blue theme with a soft light **aurora** backdrop,
  builder form with template picker, in-browser generate → results (EV/equity/per-share/WACC +
  final-year snapshot + validation notes) → one-click **.xlsx and README** download. ExcelJS is
  lazy-loaded (dynamic import) so first load is light (~86 kB gzip).
- **Docs**: `PRD.md`, `MODEL_CATALOG.md` (full IB/PE model & document universe + reuse plan),
  `README.md`, this file.

## Decisions & conventions
- **Light theme, Citi blue, Georgia display + clean sans for data.** No dark theme. Fonts: the
  prior session set Georgia; kept it for headings, paired with a system sans for dense forms/data.
  *If the intended font suggestion was different, this is the place to change it* (`src/index.css`
  `@theme` `--font-display` / `--font-sans`).
- **The engine never uses an LLM.** The LLM (not yet built) will only parse uploads, *suggest*
  reviewable assumptions, and write prose — never compute a figure.
- **Excel gotchas (learned):** (1) ExcelJS `load()` wants a real `ArrayBuffer`, not a Node Buffer
  (its `Buffer` type is module-local `extends ArrayBuffer`). (2) ExcelJS drops the cached `<v>`
  when a formula result is exactly `0`, so zero cells read back without a result — harmless (Excel
  recalcs on open via `fullCalcOnLoad` + iterate); don't assert cached==0, compare nonzero
  subtotals instead.
- **`remember` plugin auto-extraction is broken on this machine** (`call-haiku error`), so durable
  cross-session memory lives in `~/.claude/projects/.../memory/` files, not `.remember/`.

## How to run
```
npm run dev          # local app
npm run test:run     # 60 tests (vitest)
npm run typecheck | lint | build
```

## Next steps (rough priority)
1. **UI polish / a11y**: keyboard/focus states, mobile spacing, input validation messages, a
   compact statements preview table; consider a component smoke test (needs `@testing-library/react`,
   `environment: jsdom`).
2. **`src/inputs/`**: guided uploads (pdf.js text, Tesseract OCR, mammoth docx, xlsx/CSV historicals)
   → suggested assumptions the user reviews.
4. **`src/llm/`**: OpenRouter client via Worker proxy / BYOK, queue with backoff, assumption
   suggestions + prose. Worker already scaffolded in `worker/`.
5. **Next engine model: LBO** (`src/engine/lbo.ts`) — sources & uses, debt tranches + cash sweep
   (reuse `circular`), returns (IRR/MOIC), credit stats. Then comps / precedents / M&A. See
   `MODEL_CATALOG.md`.

## Deployment (see also README §Deployment)
- **GitHub Pages (needed now):** repo Settings → Pages → Source = "GitHub Actions". `deploy.yml`
  builds + deploys `dist/` on push to `main`. URL: `https://iamanvers.github.io/proforma/`
  (`base: './'` already handles the subpath). The deterministic app needs nothing else.
- **Cloudflare Worker / OpenRouter / Turnstile (only for future LLM features):**
  - `worker/`: set `ALLOWED_ORIGIN` = `https://iamanvers.github.io` (origin only, no path);
    `wrangler secret put OPENROUTER_API_KEY` (+ optional `TURNSTILE_SECRET`); `wrangler deploy`.
  - Put the Worker URL + Turnstile site key in repo **Settings → Variables** as `VITE_WORKER_URL`
    / `VITE_TURNSTILE_SITE_KEY` (public). BYOK works with no Worker.
  - OpenRouter free tier: 20 req/min; 50/day under \$10; 1000/day once \$10+ funded.
