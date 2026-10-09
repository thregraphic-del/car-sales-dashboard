// OpenRouter client (server-side only — the key never reaches the browser).
//
//   OPENROUTER_API_KEY       required to enable AI (Netlify environment variable / local .env)
//   OPENROUTER_MODEL         optional, e.g. openai/gpt-4o-mini (default: openrouter/auto)
//   AI_DAILY_LIMIT_PER_USER  requests per learner per day (default 300; cached answers are free)
//
// Only the few lines a task needs are sent (a clicked word with its sentence,
// a selected phrase, 15–25 transcript lines) — never a whole transcript.
//
// Every successful answer is cached in the ai_cache table, so the same word /
// sentence / batch never calls the API twice. When OpenRouter is unreachable
// the app keeps working offline and retries later.
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { get, all, run } from '../db/index.js';
import { config } from '../config.js';
export const OFFLINE_MESSAGE = 'شرح الذكاء الاصطناعي غير متاح — نستخدم القاموس المحلي.';
export const MISSING_KEY_MESSAGE = 'الذكاء الاصطناعي غير مفعّل: لم يُضبط مفتاح OpenRouter على الخادم (OPENROUTER_API_KEY).';

/** Who is asking (set per request by the app) — for the per-learner daily limit. */
export const aiContext = new AsyncLocalStorage();
export const OFFLINE_MESSAGE_EN = 'AI explanation is unavailable — using offline dictionary.';

let pausedUntil = 0;
let lastError = null;

export const aiModel = () => config.ai.model();
export const aiConfigured = () => Boolean(config.ai.apiKey());

// Simple per-instance budget so a runaway client can't spend the OpenRouter credit.
const calls = [];
function withinBudget() {
  const now = Date.now();
  while (calls.length && now - calls[0] > 60000) calls.shift();
  if (calls.length >= config.ai.maxCallsPerMinute) return false;
  calls.push(now);
  return true;
}
/** Configured and not temporarily paused after a failure. */
export const aiAvailable = () => aiConfigured() && Date.now() >= pausedUntil;

export function aiStatus() {
  return {
    configured: aiConfigured(),
    available: aiAvailable(),
    provider: 'openrouter',
    model: aiConfigured() ? aiModel() : null,
    model_available: aiConfigured() ? modelCheck.ok : null,
    last_error: lastError,
    message: aiConfigured() ? null : MISSING_KEY_MESSAGE,
    daily_limit: config.ai.dailyLimitPerUser,
  };
}

/* ---------------------------------------------------- model availability */

// Is OPENROUTER_MODEL a model OpenRouter offers? (Public list, checked every 6 hours.)
const modelCheck = { ok: null, at: 0, model: null };
export async function checkModel({ force = false } = {}) {
  if (!aiConfigured()) return null;
  const model = aiModel();
  if (!force && modelCheck.model === model && Date.now() - modelCheck.at < 6 * 3600000) return modelCheck.ok;
  if (model === 'openrouter/auto') {
    Object.assign(modelCheck, { ok: true, at: Date.now(), model });
    return true;
  }
  try {
    const ctrl = AbortSignal.timeout(4000);
    const res = await fetch(`${config.ai.baseUrl}/models`, { signal: ctrl, headers: { Authorization: `Bearer ${config.ai.apiKey()}` } });
    if (!res.ok) return modelCheck.ok;
    const list = (await res.json())?.data || [];
    const ok = list.some((m) => m.id === model || m.canonical_slug === model);
    Object.assign(modelCheck, { ok, at: Date.now(), model });
    if (!ok) lastError = `model "${model}" is not offered by OpenRouter`;
    return ok;
  } catch {
    return modelCheck.ok; // unknown: don't block AI because the list couldn't be read
  }
}

/* ----------------------------------------------------- per-learner quota */

const today = () => new Date().toISOString().slice(0, 10);

/** Count one AI request for the current learner; throws when today's limit is reached. */
async function useQuota() {
  const userId = aiContext.getStore()?.userId;
  const limit = config.ai.dailyLimitPerUser;
  if (!userId || !(limit > 0)) return;
  const rows = await all(
    'INSERT INTO ai_usage (user_id, day, calls) VALUES (?, ?, 1) ON CONFLICT (user_id, day) DO UPDATE SET calls = ai_usage.calls + 1 RETURNING calls',
    userId, today(),
  );
  if (Number(rows[0]?.calls) > limit) {
    throw new AiError(`وصلت إلى حد استخدام الذكاء الاصطناعي اليوم (${limit} طلب). القاموس المحلي يعمل، ويتجدد الحد غدًا.`, 429, { offline: false });
  }
}

/** Add tokens and cost (USD, reported by OpenRouter) to the learner's day. */
async function recordUsage(usage) {
  const userId = aiContext.getStore()?.userId;
  if (!userId || !usage) return;
  await run(
    `INSERT INTO ai_usage (user_id, day, calls, prompt_tokens, completion_tokens, cost) VALUES (?, ?, 0, ?, ?, ?)
     ON CONFLICT (user_id, day) DO UPDATE SET prompt_tokens = ai_usage.prompt_tokens + ?, completion_tokens = ai_usage.completion_tokens + ?, cost = ai_usage.cost + ?`,
    userId, today(), ...[0, 1].flatMap(() => [Number(usage.prompt_tokens) || 0, Number(usage.completion_tokens) || 0, Number(usage.cost) || 0]),
  ).catch(() => {});
}

/** One video fetched through the paid transcript service. */
export async function recordTranscript() {
  const userId = aiContext.getStore()?.userId;
  if (!userId) return;
  await run('INSERT INTO ai_usage (user_id, day, calls, transcripts) VALUES (?, ?, 0, 1) ON CONFLICT (user_id, day) DO UPDATE SET transcripts = ai_usage.transcripts + 1', userId, today()).catch(() => {});
}

const SUMS = 'COALESCE(SUM(calls),0) AS calls, COALESCE(SUM(prompt_tokens),0) AS prompt_tokens, COALESCE(SUM(completion_tokens),0) AS completion_tokens, COALESCE(SUM(cost),0) AS cost, COALESCE(SUM(transcripts),0) AS transcripts';

/** Usage of one learner (today / this month / all time) and, for the administrator, everyone. */
export async function usageReport(userId, { admin = false } = {}) {
  const day = today();
  const month = `${day.slice(0, 7)}-01`;
  const one = async (from) => get(`SELECT ${SUMS} FROM ai_usage WHERE user_id = ? AND day >= ?`, userId, from);
  const report = { me: { today: await one(day), month: await one(month), total: await one('0000') } };
  if (admin) {
    report.site = {
      month: await get(`SELECT ${SUMS} FROM ai_usage WHERE day >= ?`, month),
      total: await get(`SELECT ${SUMS} FROM ai_usage`),
      users: await all(`SELECT u.username, u.name, ${SUMS} FROM users u JOIN ai_usage a ON a.user_id = u.id WHERE a.day >= ? GROUP BY u.id, u.username, u.name ORDER BY cost DESC`, month),
    };
    // The key's own spending and limit, straight from OpenRouter.
    try {
      const res = await fetch(`${config.ai.baseUrl}/key`, { headers: { Authorization: `Bearer ${config.ai.apiKey()}` }, signal: AbortSignal.timeout(4000) });
      const k = res.ok ? (await res.json()).data : null;
      if (k) report.openrouter = { usage: k.usage, limit: k.limit, limit_remaining: k.limit_remaining, is_free_tier: k.is_free_tier };
    } catch { /* shown as unavailable */ }
  }
  return report;
}

export async function usageToday(userId) {
  return Number((await get('SELECT calls FROM ai_usage WHERE user_id = ? AND day = ?', userId, today()))?.calls || 0);
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

async function readCache(key) {
  const row = await get('SELECT response FROM ai_cache WHERE key = ?', key);
  return row ? JSON.parse(row.response) : null;
}

async function writeCache(key, task, value) {
  await run(
    `INSERT INTO ai_cache (key, task, model, response, created_at) VALUES (?,?,?,?,?)
     ON CONFLICT (key) DO UPDATE SET model = excluded.model, response = excluded.response, created_at = excluded.created_at`,
    key, task, aiModel(), JSON.stringify(value), new Date().toISOString(),
  );
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

/** POST to OpenRouter; the timeout covers the whole response body. → {status, ok, data} */
async function post(body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.max(1000, timeoutMs));
  try {
    const res = await fetch(`${config.ai.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.ai.apiKey()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.URL || 'http://localhost',
        'X-Title': 'LexiTube',
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    let data = null;
    if (res.ok) {
      try {
        data = await res.json();
      } catch (err) {
        if (err.name === 'AbortError') throw err;
      }
    } else {
      await res.body?.cancel().catch(() => {});
    }
    return { status: res.status, ok: res.ok, data };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ask the model for JSON matching `schema`, validated with `zod`.
 * Cached by (task, user input). Throws AiError (with an Arabic message) when
 * AI is not configured, paused, unreachable or returns something unusable.
 */
export async function jsonCall({ task, system, user, schema, zod, maxTokens = 4000, timeoutMs = config.ai.timeoutMs, cache = true }) {
  if (!aiConfigured()) throw new AiError(MISSING_KEY_MESSAGE);
  const key = cacheKey(task, user);
  if (cache) {
    const hit = await readCache(key);
    if (hit) {
      try {
        return zod.parse(hit);
      } catch {
        /* stale cache shape → ask again */
      }
    }
  }
  if (!aiAvailable()) throw new AiError(OFFLINE_MESSAGE);
  if (!withinBudget()) throw new AiError('خدمة الذكاء الاصطناعي مشغولة الآن — نستخدم القاموس المحلي. حاول بعد قليل.', 429);
  await useQuota();

  // On serverless hosting the whole call (including format retries) must
  // finish before the function's time limit.
  const limit = config.app.production ? Math.min(timeoutMs, config.ai.timeoutMs) : timeoutMs;
  const started = Date.now();
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
      res = await post({ model: aiModel(), messages, max_tokens: maxTokens, temperature: 0.2, usage: { include: true }, ...(format ? { response_format: format } : {}) }, limit - (Date.now() - started));
    } catch (err) {
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        // Slow answer: not a reason to stop using AI for the next request.
        lastError = 'timeout';
        throw new AiError('تأخر رد الذكاء الاصطناعي — نستخدم القاموس المحلي.', 504);
      }
      pause(config.ai.pauseAfterNetworkErrorMs, 'network');
      throw new AiError(OFFLINE_MESSAGE);
    }
    lastStatus = res.status;
    if (res.status !== 400 || limit - (Date.now() - started) < 1500) break;
  }

  if (!res.ok) {
    if (lastStatus === 401 || lastStatus === 403) {
      pause(config.ai.pauseAfterAuthErrorMs, 'invalid key');
      throw new AiError('مفتاح OpenRouter غير صحيح — نستخدم القاموس المحلي.');
    }
    if (lastStatus === 402) {
      pause(config.ai.pauseAfterAuthErrorMs, 'no credits');
      throw new AiError('رصيد OpenRouter غير كافٍ — نستخدم القاموس المحلي.');
    }
    if (lastStatus === 429) {
      pause(config.ai.pauseAfterRateLimitMs, 'rate limited');
      throw new AiError('خدمة الذكاء الاصطناعي مشغولة الآن — نستخدم القاموس المحلي. حاول بعد قليل.');
    }
    if (lastStatus === 400 || lastStatus === 404) {
      lastError = `model "${aiModel()}" rejected the request (HTTP ${lastStatus})`;
      throw new AiError('النموذج المحدد في OPENROUTER_MODEL غير متاح أو لا يقبل الطلب — نستخدم القاموس المحلي.', 503);
    }
    pause(config.ai.pauseAfterServerErrorMs, `HTTP ${lastStatus}`);
    throw new AiError(OFFLINE_MESSAGE);
  }

  const { data } = res;
  if (!data) throw new AiError(OFFLINE_MESSAGE);
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
  await recordUsage(data.usage);
  if (cache) await writeCache(key, task, parsed);
  return parsed;
}

/** For tests: forget a pause. */
export function _resetAi() {
  pausedUntil = 0;
  calls.length = 0;
  lastError = null;
  Object.assign(modelCheck, { ok: null, at: 0, model: null });
}
