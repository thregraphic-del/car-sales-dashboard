// OpenRouter client (server-side only — the key never reaches the browser).
//
//   OPENROUTER_API_KEY   required to enable AI (read from .env)
//   OPENROUTER_MODEL     optional, e.g. openai/gpt-4o-mini (default: openrouter/auto)
//
// Every successful answer is cached in the ai_cache table, so the same word /
// sentence / batch never calls the API twice. When OpenRouter is unreachable
// the app keeps working offline and retries later.
import crypto from 'node:crypto';
import { get, run } from './db.js';

const BASE_URL = 'https://openrouter.ai/api/v1';
export const OFFLINE_MESSAGE = 'شرح الذكاء الاصطناعي غير متاح — نستخدم القاموس المحلي.';
export const OFFLINE_MESSAGE_EN = 'AI explanation is unavailable — using offline dictionary.';

let pausedUntil = 0;
let lastError = null;

export const aiModel = () => (process.env.OPENROUTER_MODEL || '').trim() || 'openrouter/auto';
export const aiConfigured = () => Boolean((process.env.OPENROUTER_API_KEY || '').trim());
/** Configured and not temporarily paused after a failure. */
export const aiAvailable = () => aiConfigured() && Date.now() >= pausedUntil;

export function aiStatus() {
  return {
    configured: aiConfigured(),
    available: aiAvailable(),
    provider: 'openrouter',
    model: aiConfigured() ? aiModel() : null,
    last_error: lastError,
  };
}

export class AiError extends Error {
  constructor(message, status = 503, { offline = true } = {}) {
    super(message);
    this.status = status;
    this.offline = offline;
    this.expose = true; // written for the learner — safe to show
  }
}

function pause(ms, message) {
  pausedUntil = Date.now() + ms;
  lastError = message;
}

const cacheKey = (task, input) => crypto.createHash('sha256').update(`${task}\n${input}`).digest('hex');

function readCache(key) {
  const row = get('SELECT response FROM ai_cache WHERE key = ?', key);
  return row ? JSON.parse(row.response) : null;
}

function writeCache(key, task, value) {
  run('INSERT OR REPLACE INTO ai_cache (key, task, model, response) VALUES (?,?,?,?)', key, task, aiModel(), JSON.stringify(value));
}

/** Pull the JSON object out of a model reply (handles ```json fences / extra text). */
export function extractJson(text) {
  const s = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(s);
  } catch {
    const a = s.indexOf('{');
    const b = s.lastIndexOf('}');
    if (a >= 0 && b > a) return JSON.parse(s.slice(a, b + 1));
    throw new Error('no JSON in reply');
  }
}

async function post(body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY.trim()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost',
        'X-Title': 'LexiTube',
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ask the model for JSON matching `schema`, validated with `zod`.
 * Cached by (task, user input). Throws AiError (with an Arabic message) when
 * AI is not configured, paused, unreachable or returns something unusable.
 */
export async function jsonCall({ task, system, user, schema, zod, maxTokens = 4000, timeoutMs = 60000, cache = true }) {
  if (!aiConfigured()) throw new AiError(OFFLINE_MESSAGE);
  const key = cacheKey(task, user);
  if (cache) {
    const hit = readCache(key);
    if (hit) {
      try {
        return zod.parse(hit);
      } catch {
        /* stale cache shape → ask again */
      }
    }
  }
  if (!aiAvailable()) throw new AiError(OFFLINE_MESSAGE);

  const messages = [
    { role: 'system', content: `${system}\n\nReply with ONLY one JSON object (no markdown) that matches this JSON Schema:\n${JSON.stringify(schema)}` },
    { role: 'user', content: user },
  ];
  // Not every model supports strict JSON schema; fall back to plain JSON mode.
  const formats = [
    { type: 'json_schema', json_schema: { name: task, strict: true, schema } },
    { type: 'json_object' },
    null,
  ];
  let res;
  let lastStatus = 0;
  for (const format of formats) {
    try {
      res = await post({ model: aiModel(), messages, max_tokens: maxTokens, temperature: 0.2, ...(format ? { response_format: format } : {}) }, timeoutMs);
    } catch {
      pause(2 * 60 * 1000, 'network');
      throw new AiError(OFFLINE_MESSAGE);
    }
    lastStatus = res.status;
    if (res.status !== 400) break;
  }

  if (!res.ok) {
    if (lastStatus === 401 || lastStatus === 403) {
      pause(10 * 60 * 1000, 'invalid key');
      throw new AiError('مفتاح OpenRouter غير صحيح — نستخدم القاموس المحلي.');
    }
    if (lastStatus === 402) {
      pause(10 * 60 * 1000, 'no credits');
      throw new AiError('رصيد OpenRouter غير كافٍ — نستخدم القاموس المحلي.');
    }
    if (lastStatus === 429) {
      pause(30 * 1000, 'rate limited');
      throw new AiError('خدمة الذكاء الاصطناعي مشغولة الآن — نستخدم القاموس المحلي. حاول بعد قليل.');
    }
    if (lastStatus === 400 || lastStatus === 404) {
      lastError = `model "${aiModel()}" rejected the request (HTTP ${lastStatus})`;
      throw new AiError('النموذج المحدد في OPENROUTER_MODEL لا يقبل الطلب — نستخدم القاموس المحلي.', 503);
    }
    pause(60 * 1000, `HTTP ${lastStatus}`);
    throw new AiError(OFFLINE_MESSAGE);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new AiError(OFFLINE_MESSAGE);
  }
  if (data.error) {
    lastError = String(data.error.message || data.error).slice(0, 200);
    throw new AiError(OFFLINE_MESSAGE);
  }
  const choice = data.choices?.[0];
  if (choice?.finish_reason === 'length') throw new AiError('النص طويل جدًا لمعالجته دفعة واحدة.', 422);
  let parsed;
  try {
    parsed = zod.parse(extractJson(choice?.message?.content));
  } catch {
    lastError = 'unexpected reply format';
    throw new AiError('أعاد الذكاء الاصطناعي نتيجة غير متوقعة — نستخدم القاموس المحلي.', 502);
  }
  lastError = null;
  if (cache) writeCache(key, task, parsed);
  return parsed;
}

/** For tests: forget a pause. */
export function _resetAi() {
  pausedUntil = 0;
  lastError = null;
}
