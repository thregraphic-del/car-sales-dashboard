// 📚 «القواعد»: the learner's grammar library + the AI fallback for lines the patterns could not place.
// The library is one small JSON value per learner (no new table, like «خلاصاتي»):
//   { subs: { [subId]: { status, seen, examples: [{ id, en, ar, source_id, title, url, t, at }] } } }
// Every example sits under its fixed category → sub-rule (never an unclassified list).
import { Router } from 'express';
import { z } from 'zod';
import { wrap } from '../http.js';
import { httpError } from '../lib/errors.js';
import { get, run } from '../db/index.js';
import { jsonCall, AiError } from '../services/ai.js';
import { GRAMMAR, SUB_INDEX } from '../../public/js/shared/grammar-catalog.js';

const router = Router();
const key = (userId) => `grammar:${userId}`;
const STATUS = ['new', 'learning', 'mastered'];
const MAX_EXAMPLES = 200;
const clean = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

async function load(userId) {
  const row = await get('SELECT value FROM app_settings WHERE key = ?', key(userId));
  try {
    const v = JSON.parse(row?.value || '{}');
    return v && typeof v.subs === 'object' && v.subs ? v : { subs: {} };
  } catch {
    return { subs: {} };
  }
}
async function save(userId, lib) {
  await run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key(userId), JSON.stringify(lib));
}
const entry = (lib, sub) => {
  lib.subs[sub] ||= { status: 'new', seen: 0, examples: [] };
  return lib.subs[sub];
};
const validSub = (sub) => {
  if (!SUB_INDEX.has(sub)) throw httpError(400, 'قاعدة غير معروفة.');
  return sub;
};

/** The whole library. */
router.get('/', wrap(async (req) => load(req.userId)));

/** Save an example under its sub-rule (the same sentence from the same video is kept once). */
router.post('/examples', wrap(async (req) => {
  const b = req.body || {};
  const sub = validSub(String(b.sub || ''));
  const en = clean(b.en, 500);
  if (!en) throw httpError(400, 'ما فيه جملة.');
  const sourceId = Number(b.source_id) || null;
  let title = '';
  let url = '';
  if (sourceId) {
    const s = await get('SELECT title, youtube_id, url FROM sources WHERE id = ? AND user_id = ?', sourceId, req.userId);
    title = s?.title || '';
    url = s?.youtube_id && !String(s.youtube_id).startsWith('demo') ? `https://www.youtube.com/watch?v=${s.youtube_id}` : (s?.url || '');
  }
  const t = Number.isFinite(Number(b.t)) && b.t !== null && b.t !== '' ? Math.max(0, Math.round(Number(b.t))) : null;
  const lib = await load(req.userId);
  const e = entry(lib, sub);
  const dup = e.examples.find((x) => x.en.toLowerCase() === en.toLowerCase() && (x.source_id || null) === sourceId);
  if (!dup) {
    e.examples.unshift({ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, en, ar: clean(b.ar, 500), source_id: sourceId, title: clean(title, 200), url, t, at: new Date().toISOString() });
    e.examples = e.examples.slice(0, MAX_EXAMPLES);
  }
  e.seen = (Number(e.seen) || 0) + 1;
  if (e.status === 'new') e.status = 'learning';
  await save(req.userId, lib);
  return { ok: true, duplicate: !!dup, entry: e };
}));

/** The learner opened a rule's explanation in a video (counts how often it was met). */
router.post('/seen', wrap(async (req) => {
  const sub = validSub(String(req.body?.sub || ''));
  const lib = await load(req.userId);
  const e = entry(lib, sub);
  e.seen = (Number(e.seen) || 0) + 1;
  await save(req.userId, lib);
  return { ok: true };
}));

/** Not learned / learning / mastered. */
router.put('/status', wrap(async (req) => {
  const sub = validSub(String(req.body?.sub || ''));
  const status = String(req.body?.status || '');
  if (!STATUS.includes(status)) throw httpError(400, 'حالة غير معروفة.');
  const lib = await load(req.userId);
  entry(lib, sub).status = status;
  await save(req.userId, lib);
  return { ok: true };
}));

router.delete('/examples', wrap(async (req) => {
  const sub = validSub(String(req.body?.sub || ''));
  const lib = await load(req.userId);
  const e = entry(lib, sub);
  e.examples = e.examples.filter((x) => x.id !== String(req.body?.id || ''));
  await save(req.userId, lib);
  return { ok: true };
}));

// 🤖 AI fallback: up to 40 lines the patterns could not place → their rule (from the fixed list only).
// Cached by the exact lines (ai_cache), so the same lines are never asked about twice — for anyone.
const RULE_LIST = GRAMMAR.flatMap((c) => c.subs.map((s) => `${s.id} = ${c.en} › ${s.en}`)).join('\n');
const AiZ = z.object({ items: z.array(z.object({ i: z.number().int(), sub: z.string(), phrase: z.string() })) });
const AI_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items'],
  properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['i', 'sub', 'phrase'], properties: { i: { type: 'integer' }, sub: { type: 'string' }, phrase: { type: 'string' } } } } },
};
router.post('/detect', wrap(async (req, res) => {
  const lines = (Array.isArray(req.body?.lines) ? req.body.lines : []).slice(0, 40)
    .map((l) => ({ i: Number(l?.i), text: clean(l?.text, 300) }))
    .filter((l) => Number.isInteger(l.i) && l.text);
  if (!lines.length) return { items: [] };
  try {
    const out = await jsonCall({
      task: 'grammar_detect_v1',
      system: `You label English sentences (from video captions, often fragments) with the most useful grammar rule they show, for Arabic-speaking learners.
Use ONLY these rule ids:
${RULE_LIST}
For each line give at most 2 items: the rule id and the exact words of the line that show it (copied from the line). Prefer tenses, modals, clauses, comparisons, passive, conditionals and other structures over articles or pronouns. Skip a line that shows nothing worth teaching.`,
      user: lines.map((l) => `${l.i}: ${l.text}`).join('\n'),
      schema: AI_SCHEMA,
      zod: AiZ,
      maxTokens: 2500,
    });
    const ids = new Set(lines.map((l) => l.i));
    return { items: out.items.filter((x) => ids.has(x.i) && SUB_INDEX.has(x.sub)).slice(0, 80) };
  } catch (err) {
    if (!(err instanceof AiError)) throw err;
    res.status(200);
    return { items: [], ai: false };
  }
}));

export default router;
