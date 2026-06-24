```
██████ ██████ ██████ ██████ ██████ ██████ ██  ██ ██████
██  ██ ██  ██ ██  ██ ██     ██  ██ ██  ██ ██████ ██  ██
██████ ██████ ██  ██ █████  ██  ██ ██████ ██████ ██████
██     ██ ██  ██  ██ ██     ██  ██ ██ ██  ██  ██ ██  ██
██     ██  ██ ██████ ██     ██████ ██  ██ ██  ██ ██  ██

  ✻  ProForma — AI-assisted, validated financial models → Excel
     Deterministic engine · the LLM never does the math · runs in your browser
```

**AI-assisted, validated financial models — straight to Excel.**

ProForma turns a few inputs into an IB/PE-grade financial model (3-statement + DCF to start),
checks that it *ties out*, and exports a **live `.xlsx`** workbook (real formulas) plus a README
explaining it. It runs entirely in the browser and is hosted on GitHub Pages.

> **Not investment advice.** Educational tool; outputs depend entirely on your assumptions.

## How it works
1. **You provide inputs** — via forms, or by uploading a doc/image (parsed in your browser).
2. **A deterministic engine** builds and links the model. **The LLM never does the math** — it
   only parses uploads, suggests assumptions (which you review), and writes the explanation.
3. **The validation engine** confirms the model balances, reconciles, and has no broken circular
   references.
4. **You download** a live Excel workbook + a README.

## Using the AI features (LLM)
The deterministic model works with **no AI at all**. AI features (parsing uploads, suggesting
assumptions, writing the README) use **free OpenRouter models** via one of:
- **Default:** a hosted Cloudflare Worker proxy — no key needed (subject to a shared free-tier
  pool with per-user rate limits).
- **Bring your own key (BYOK):** paste your own free [OpenRouter](https://openrouter.ai) key
  (stored only in your browser's `localStorage`) for your own throughput. Used automatically when
  the shared pool is exhausted.

## Local development
```bash
npm install
npm run dev        # start the app
npm run test       # watch tests   (npm run test:run for CI)
npm run typecheck  # tsc --noEmit
npm run lint
npm run build      # production build to dist/
```

## Configuration (env)
Set in `.env` (see `.env.example`):
- `VITE_WORKER_URL` — URL of the deployed Cloudflare Worker proxy (empty = BYOK-only).
- `VITE_TURNSTILE_SITE_KEY` — public Cloudflare Turnstile site key (bot protection).

## Deployment
- **Front-end → GitHub Pages:** the GitHub Actions workflow builds and deploys `dist/` on push to
  `main`. Asset paths are relative (`base: './'`) so it works under a project subpath.
- **Proxy → Cloudflare Worker** (`worker/`): `wrangler deploy`; set secrets with
  `wrangler secret put OPENROUTER_API_KEY` (and the Turnstile secret). The Worker is restricted to
  the Pages origin via CORS and enforces per-IP rate limiting.

## Project layout
```
src/engine/       deterministic financial engine (pure TS, fully tested)
src/validation/   the validation engine (5 check categories)
src/excel/        ExcelJS writer + calcPr zip post-processor
src/llm/          OpenRouter client (Worker/BYOK), orchestrator, agents
src/inputs/       form + upload parsing (pdf.js, Tesseract.js, mammoth, vision)
src/ui/           React UI
worker/           Cloudflare Worker proxy
docs/             PRD.md, README.md, CLAUDE.md
tests/            Vitest suites (golden fixtures, property, round-trip)
```

## License
MIT (see `LICENSE`). Third-party libraries (ExcelJS, pdf.js, Tesseract.js, mammoth, etc.) retain
their own licenses. No proprietary bank templates or copyrighted book content are included.
