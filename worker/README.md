# ProForma LLM proxy (Cloudflare Worker)

Holds the shared OpenRouter key so the static front-end never ships a secret. Adds CORS
(locked to the Pages origin), optional Turnstile bot verification, per-IP rate limiting, and a
streaming pass-through.

## Deploy
```bash
cd worker
npm install
# Edit wrangler.toml -> [vars].ALLOWED_ORIGIN = your GitHub Pages origin
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put TURNSTILE_SECRET   # optional (enables bot protection)
npx wrangler deploy
```
Then set the repo variable `VITE_WORKER_URL` to the deployed Worker URL so the front-end uses it.

## Notes
- Free pool capacity is governed by OpenRouter's free tier (≈20 rpm; 50/day under \$10 credits,
  1000/day once \$10+ purchased). Fund \$10 once to unlock the higher cap; the `RATE_LIMITER`
  binding rations it per IP. When exhausted, the front-end falls back to BYOK.
- The Worker is intentionally tiny and stateless. No request bodies are logged.
