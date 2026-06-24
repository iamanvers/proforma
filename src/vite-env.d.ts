/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL of the Cloudflare Worker LLM proxy. Empty = BYOK-only mode. */
  readonly VITE_WORKER_URL?: string;
  /** Cloudflare Turnstile site key (public). */
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
