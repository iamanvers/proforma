# ProForma — Product Requirements (PRD)

## 1. Summary
ProForma is a **static web app (GitHub Pages)** that turns a few inputs — typed into forms or
extracted from uploaded docs/images — into a **validated, IB/PE-grade financial model** delivered
as a **live `.xlsx`** workbook (real formulas, not a dead snapshot) plus a **README** that explains
it. MVP covers the **integrated 3-statement model + DCF**; the LBO, trading comps, precedent
transactions, and M&A accretion/dilution models follow, all reusing the 3-statement core.

## 2. Problem
Good models are slow and error-prone to build by hand, and a model is only as good as whether it
**ties out** (balances, reconciles, no broken circular references). Existing AI tools tend to let
the LLM "do the math," which produces inconsistent financials. ProForma separates concerns: a
deterministic engine does the math, the LLM only does fuzzy work, and a validation engine proves
the result is internally consistent.

## 3. Users
- Investment banking / private equity / equity research analysts (and interview candidates).
- Finance students learning model mechanics.
- Founders / operators who need a defensible first model.

## 4. Goals
- Produce a **correct, internally consistent** model (balance sheet balances; CFS ties to BS;
  roll-forwards reconcile; circular references converge).
- Output a **live, editable** Excel workbook following **bank conventions** (blue inputs / black
  formulas / green links; standard tabs; a Checks tab).
- Run **fast** and **offline-capable**: the deterministic path (forms → engine → validation →
  Excel) needs **no network and no LLM**.
- Make the **validation engine** a first-class, visible feature.
- Generate a plain-English **README** explaining the model and its assumptions.

## 5. Non-goals
- Not investment advice; not a data terminal; not a live market-data feed.
- No redistribution of proprietary bank templates or copyrighted book content.
- The LLM never computes financial figures.

## 6. Hard constraints (and resolutions)
1. **Static hosting (GitHub Pages), no server.** All runtime logic is browser-side (TypeScript /
   WASM). A shared API key cannot be embedded safely. → A tiny **Cloudflare Worker** (free, edge)
   holds the OpenRouter key and proxies requests; **BYOK** (user's own free key) is the fallback.
2. **Free OpenRouter tier limits** (20 req/min; 50/day under \$10 credits, 1000/day once \$10+ is
   bought once; failed calls count; vision scarce). → Fund \$10 once for the shared pool; discover
   free/vision models at runtime; per-IP rate limit in the Worker; client-side OCR first; BYOK
   fallback.

## 7. Functional requirements
- **Inputs:** guided forms (defaults + tooltips); uploads (PDF text via pdf.js, OCR via
  Tesseract.js, docx via mammoth, optional xlsx/CSV historicals); images via a free vision model
  when available. LLM-suggested assumptions are **always reviewed/edited by the user** before
  generation.
- **Engine (deterministic):** 3-statement model with full linkages; supporting schedules (debt
  incl. revolver-as-plug + term loans + cash sweep, PP&E/depreciation, working capital);
  revolver↔interest **circular reference** solved by fixed-point iteration; DCF (UFCF, WACC/CAPM,
  terminal value via Gordon **and** exit multiple, net-debt bridge, sensitivity table).
- **Validation engine:** five categories — math/tie-out, circular-reference convergence,
  assumption sanity, financial logic, Excel mechanics — surfaced as a report and embedded as live
  Checks-tab cells.
- **Excel export:** formulas + engine-computed cached results; full formatting, named ranges, data
  validation on inputs; `calcPr iterate` injected so circular refs open clean; circularity switch.
- **README export:** LLM-written explanation of the model, drivers, and validation status.

## 8. Success metrics
- 100% of generated MVP models pass all **math/tie-out** checks (balance sheet balances; CFS ties).
- Generated `.xlsx` opens in Excel and **recalculates without circular-reference warnings**.
- Deterministic generation completes in **< 1s** with no network.
- Engine reproduces the reference worked examples (golden fixtures) exactly.

## 9. Risks & mitigations
See the approved plan, §14 — free-tier capacity, vision scarcity, ExcelJS iterative-calc gap,
headless-recalc flakiness, and LLM JSON reliability, each with a mitigation.

## 10. Roadmap
MVP (3-statement + DCF) → LBO → trading comps (with LTM/calendarization) → precedent transactions
→ M&A accretion/dilution.
