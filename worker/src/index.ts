/**
 * ProForma LLM proxy — Cloudflare Worker.
 *
 * Holds the shared OpenRouter key as a Worker secret so the static GitHub Pages
 * front-end never ships a key. Responsibilities: CORS (restricted to the Pages
 * origin), optional Turnstile bot verification, per-IP rate limiting, and a
 * streaming pass-through to OpenRouter.
 *
 * Routes:
 *   OPTIONS *            -> CORS preflight
 *   GET  /models         -> proxied OpenRouter model list (for free/vision discovery)
 *   POST /chat           -> proxied OpenRouter chat/completions (streaming)
 *
 * Secrets (wrangler secret put):  OPENROUTER_API_KEY, TURNSTILE_SECRET
 * Vars (wrangler.toml):           ALLOWED_ORIGIN
 * Binding (wrangler.toml):        RATE_LIMITER (Cloudflare Rate Limiting API)
 */

export interface Env {
  OPENROUTER_API_KEY: string;
  TURNSTILE_SECRET?: string;
  ALLOWED_ORIGIN?: string;
  RATE_LIMITER?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
}

const OPENROUTER = 'https://openrouter.ai/api/v1';

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Turnstile-Token',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(obj: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

async function verifyTurnstile(
  secret: string,
  token: string | null,
  ip: string,
): Promise<boolean> {
  if (!token) return false;
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
  });
  const data = (await res.json()) as { success?: boolean };
  return data.success === true;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = env.ALLOWED_ORIGIN || '*';
    const headers = corsHeaders(origin);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    const url = new URL(request.url);

    // Model discovery (no auth needed upstream; proxied for CORS + a single origin).
    if (request.method === 'GET' && url.pathname === '/models') {
      const upstream = await fetch(`${OPENROUTER}/models`);
      return new Response(upstream.body, {
        status: upstream.status,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    if (request.method !== 'POST' || url.pathname !== '/chat') {
      return json({ error: 'Not found' }, 404, headers);
    }

    const ip = request.headers.get('CF-Connecting-IP') ?? 'anon';

    // Bot protection.
    if (env.TURNSTILE_SECRET) {
      const ok = await verifyTurnstile(
        env.TURNSTILE_SECRET,
        request.headers.get('X-Turnstile-Token'),
        ip,
      );
      if (!ok) return json({ error: 'Turnstile verification failed' }, 403, headers);
    }

    // Per-IP rate limiting (rations the shared free-tier pool).
    if (env.RATE_LIMITER) {
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) {
        return json(
          { error: 'Rate limit exceeded — slow down or switch to your own OpenRouter key.' },
          429,
          headers,
        );
      }
    }

    // Stream the chat completion back to the browser.
    const upstream = await fetch(`${OPENROUTER}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': origin,
        'X-Title': 'ProForma',
      },
      body: await request.text(),
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...headers,
        'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
      },
    });
  },
};
