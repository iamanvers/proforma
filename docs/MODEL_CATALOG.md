# ProForma — IB/PE Model & Document Catalog

Scope of the financial-model and deliverable-document *types* in the investment-banking /
private-equity universe, and how ProForma will support each by **reusing the deterministic
3-statement core**. This is a planning map, not a commitment to dates.

> **Copyright guardrail (CLAUDE.md rule #4).** Everything here replicates *public* modeling
> conventions only. We never reproduce proprietary bank templates, training-program materials, or
> copyrighted book text. Worked numeric conventions become golden fixtures / validation rules — not
> pasted content.

---

## A. Core analytical models (the engine roadmap)

These are computed by `src/engine/` and validated by `src/validation/`. Each new type is a module
that **reuses the 3-statement core** (financials, schedules, circular solver) and adds its own Zod
schema, validation checks, and Excel sheet layout.

| # | Model | Status | What it adds on top of the 3-statement core | Key engine pieces |
|---|-------|--------|-----------------------------------------------|-------------------|
| 1 | **Integrated 3-statement** | ✅ done | IS/BS/CFS linkage; debt + revolver-as-plug; PP&E & working-capital schedules; revolver↔interest circularity | `threeStatement`, `schedules`, `circular` |
| 2 | **DCF** | ✅ done | UFCF, CAPM WACC, perpetuity + exit-multiple TV, mid-year, net-debt bridge, sensitivity | `dcf` |
| 3 | **LBO** | next | Sources & uses, purchase-price allocation, debt tranches (TLA/TLB/bonds/PIK) + cash sweep, management options, returns (IRR/MOIC), credit stats (leverage, coverage), covenant headroom | `lbo`, reuse `circular` for the sweep |
| 4 | **Trading comps** | planned | Public-company set; LTM/calendarization; EV & equity-value multiples (EV/EBITDA, EV/EBIT, P/E, EV/Revenue); mean/median/quartiles; implied valuation range | `comps`, `marketData` adapters |
| 5 | **Precedent transactions** | planned | Deal set; announced-deal multiples; control premia; implied range | `precedents` (shares comp infra) |
| 6 | **M&A accretion / dilution** | planned | Pro-forma combination; cash/stock/mix consideration; synergies; new debt; goodwill & PPA; EPS accretion/dilution; breakeven synergies/premium | `mna`, reuse `threeStatement` for pro-forma combine |
| 7 | **Sum-of-the-parts (SOTP)** | later | Segment-level valuation, holdco discount, net-debt allocation | `sotp` (composes DCF/comps per segment) |
| 8 | **Dividend discount / DDM** | later | For financials where FCF is ill-defined | `ddm` |
| 9 | **Three-statement → credit view** | later | Credit-agreement ratios, fixed-charge coverage, leverage grid | extends `validation` + `lbo` |

**Sensitivity & scenario tooling** (cross-cutting): one- and two-way data tables (DCF already has
the WACC × terminal grid), scenario toggles (base / upside / downside), and tornado inputs — all
deterministic.

---

## B. Valuation "football field"

A summary chart/range that aggregates the outputs of #2, #4, #5 (and #3 implied equity) into a
single comparison of valuation ranges. ProForma deliverable: a **Valuation Summary** workbook tab +
a README section. Pure composition over existing model outputs — no new math primitives.

---

## C. Deliverable documents (LLM writes prose; engine owns every number)

These are the *documents* an analyst produces around the models. In ProForma the **engine supplies
all figures and the validated tables**; the **LLM only drafts the surrounding prose** (and always
from engine output, never inventing numbers). All are export targets (Markdown/README first; richer
formats later).

| Document | Audience | ProForma support | Numbers come from |
|----------|----------|------------------|-------------------|
| **Model README / methodology note** | internal / reviewer | ✅ planned (MVP) | engine + validation report |
| **Investment Committee (IC) / deal memo** | IC, deal team | planned | model outputs + comps/LBO |
| **One-page teaser** (no-name) | prospective buyers | planned | summary financials only |
| **Confidential Information Memorandum (CIM)** outline | buyers (NDA) | later | full model + segment detail |
| **Management presentation** outline | buyers / lenders | later | model highlights |
| **Lender / credit memo** | financing sources | later (with LBO) | LBO credit stats |
| **Fairness-opinion support** schedule | board | later | comps + precedents + DCF range |
| **Valuation summary / football field** | all | planned | §B |

**Hard rule:** the LLM never computes or "adjusts" a figure for a document. It receives the
engine's validated tables and writes explanation only. Each generated document carries the
validation status (ties out / warnings) so a reviewer sees the model's health inline.

---

## D. Input artifacts ProForma must *ingest* (parse, not author)

Handled by `src/inputs/` + `src/llm/` (parsing/extraction only; user reviews every extracted value
before it reaches the engine):

- Company filings / financial statements (PDF text via pdf.js; scanned via Tesseract.js OCR).
- Investor decks / CIMs (PDF, docx via mammoth; images via a free vision model when available).
- Historical financials (xlsx/CSV) to seed actuals and back-test driver assumptions.
- Cap tables, debt schedules, term sheets → LBO/credit inputs.

---

## E. Bank-convention formatting standard (applies to every workbook)

Replicated public conventions, enforced by `src/excel/`:

- **Color code:** blue = hard-coded input; black = in-sheet formula; green = cross-sheet link;
  red (sparingly) = external/file link or check failure.
- **Structure:** cover/contents tab → assumptions/drivers → statements → schedules → valuation →
  **Checks** tab; consistent units header ("US\$ in millions unless noted"); period columns aligned
  across sheets; named ranges for drivers.
- **Hygiene:** no hard-codes inside formula cells; one input lives in exactly one place; circularity
  isolated behind a breaker switch; a visible Checks tab that re-validates live as the user edits.
- **Templates (`src/templates/`):** a few **bank-inspired starter presets** (e.g. SaaS / software,
  industrial / manufacturing, consumer / retail) — public-convention driver sets that produce a
  clean, balancing model out of the box for demos and as sensible form defaults. Not copied from any
  proprietary template.

---

## F. Reuse principle (why this scales)

Every model above is the **same 3-statement spine** plus a thin, model-specific layer:

```
inputs → [3-statement core + schedules + circular] → model-specific module (DCF/LBO/comps/…)
       → validation (math/circular/assumptions/logic/excel) → Excel + README
```

Adding a model type = new `src/engine/<type>.ts` + Zod schema + validation checks + Excel layout +
golden fixtures. No model is allowed to ship without tie-out checks and a balancing property test.
