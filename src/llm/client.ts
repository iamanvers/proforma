/**
 * OpenRouter client (browser-side).
 *
 * BYOK by default: the user's key lives only in `localStorage`, never in the
 * bundle or repo. If a Worker proxy URL is configured (VITE_WORKER_URL), it is
 * used instead so no key is needed in the browser.
 *
 * The LLM only converses and *suggests* assumptions — the deterministic engine
 * does all math.
 */

const KEY_LS = 'pf_openrouter_key';
const MODEL_LS = 'pf_openrouter_model';
const DEFAULT_MODEL = 'openrouter/free';
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const WORKER_URL = (import.meta.env.VITE_WORKER_URL as string | undefined) ?? '';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export const getKey = (): string => localStorage.getItem(KEY_LS) ?? '';
export const setKey = (k: string): void => localStorage.setItem(KEY_LS, k.trim());
export const getModel = (): string => localStorage.getItem(MODEL_LS) || DEFAULT_MODEL;
export const setModel = (m: string): void => localStorage.setItem(MODEL_LS, m.trim() || DEFAULT_MODEL);

/** True when the assistant can be used (a key, or a configured Worker proxy). */
export const llmAvailable = (): boolean => !!getKey() || !!WORKER_URL;

interface CompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

export async function chat(messages: ChatMessage[], opts: { temperature?: number } = {}): Promise<string> {
  const key = getKey();
  if (!key && !WORKER_URL) {
    throw new Error('Add your OpenRouter API key to use the assistant.');
  }

  const body = JSON.stringify({
    model: getModel(),
    messages,
    temperature: opts.temperature ?? 0.3,
  });

  const url = key ? ENDPOINT : `${WORKER_URL.replace(/\/$/, '')}/chat`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) {
    headers.Authorization = `Bearer ${key}`;
    headers['HTTP-Referer'] = location.origin;
    headers['X-Title'] = 'ProForma';
  }

  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers, body });
  } catch {
    throw new Error('Network error reaching OpenRouter. Check your connection.');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let detail = text.slice(0, 240);
    try {
      const j = JSON.parse(text) as CompletionResponse;
      detail = j.error?.message ?? detail;
    } catch {
      /* keep raw text */
    }
    if (res.status === 401) throw new Error('OpenRouter rejected the key (401). Check or rotate it.');
    if (res.status === 429) throw new Error('Rate limited (429). The free tier is busy — wait and retry.');
    throw new Error(`OpenRouter error ${res.status}: ${detail}`);
  }

  const data = (await res.json()) as CompletionResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(data.error?.message ?? 'The model returned an empty response.');
  return content;
}
