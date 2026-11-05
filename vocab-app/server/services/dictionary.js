// The built-in dictionary: the most frequent English words, with Arabic meanings,
// inflections and word families, stored once in the shared vocabulary so clicked
// words are explained instantly, without AI.
import { all, get, run, tx } from '../db/index.js';
import { COMMON_WORDS } from '../lib/common-words.js';
import { dictionaryBatchWithAi } from './extractor.js';
import { cacheKey, writeCache } from './ai.js';
import { findVocabulary, upsertVocabulary, addExample } from '../data/vocabulary.js';

const LEVEL = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const clean = (w) => String(w || '').toLowerCase().trim();

/** The dictionary word for an inflected form (went → go), if known. */
export async function lemmaOf(form) {
  return (await get('SELECT lemma FROM lemma_index WHERE form = ?', clean(form)))?.lemma || null;
}

export async function dictionaryStatus() {
  const done = Number((await get('SELECT COUNT(*) AS n FROM dictionary_done')).n);
  const forms = Number((await get('SELECT COUNT(*) AS n FROM lemma_index')).n);
  const words = Number((await get("SELECT COUNT(*) AS n FROM vocabulary WHERE origin = 'dictionary'")).n);
  return { list: COMMON_WORDS.length, processed: done, dictionary_words: words, forms };
}

/** Process the next `count` unprocessed words of the frequency list (from `offset`). */
export async function buildDictionaryStep({ offset = 0, count = 20, words = null } = {}) {
  if (Array.isArray(words) && words.length) return processWords(words.map(clean).filter((w) => /^[a-z]{2,}$/.test(w)).slice(0, 40), offset);
  const slice = COMMON_WORDS.slice(offset, offset + 200);
  const doneRows = slice.length ? await all(`SELECT word FROM dictionary_done WHERE word IN (${slice.map(() => '?').join(',')})`, ...slice) : [];
  const done = new Set(doneRows.map((r) => r.word));
  const todo = [];
  for (const w of slice) {
    if (todo.length >= count) break;
    if (done.has(w)) continue;
    if (await get('SELECT 1 AS x FROM lemma_index WHERE form = ?', w)) {
      await run('INSERT INTO dictionary_done (word) VALUES (?) ON CONFLICT (word) DO NOTHING', w);
      continue;
    }
    todo.push(w);
  }
  if (!todo.length) return { added: 0, processed: 0, next: offset + slice.length, finished: offset + slice.length >= COMMON_WORDS.length };
  return processWords(todo, offset);
}

async function processWords(todo, offset) {
  const items = await dictionaryBatchWithAi(todo);
  let added = 0;
  await tx(async () => {
    for (const it of items) {
      const input = clean(it.input);
      if (!todo.includes(input)) continue;
      await run('INSERT INTO dictionary_done (word) VALUES (?) ON CONFLICT (word) DO NOTHING', input);
      const lemma = clean(it.lemma);
      if (it.skip || !lemma || !/^[a-z][a-z' -]*$/.test(lemma) || !it.arabic) continue;
      const before = await findVocabulary(lemma);
      const { id } = await upsertVocabulary({
        term: lemma, part_of_speech: it.part_of_speech, level: it.level, arabic: it.arabic,
        simple_english: it.simple_english, pronunciation: it.pronunciation, origin: 'dictionary',
      });
      // The dictionary meaning replaces an earlier automatic one (a learner's own meaning is kept apart).
      if (before && before.origin !== 'user') {
        await run(`UPDATE vocabulary SET arabic = ?, simple_english = ?, level = ?, part_of_speech = ?, pronunciation = COALESCE(?, pronunciation), origin = 'dictionary' WHERE id = ?`,
          it.arabic, it.simple_english || before.simple_english, LEVEL.includes(it.level) ? it.level : before.level, it.part_of_speech || before.part_of_speech, it.pronunciation || null, id);
      }
      if (!before) added += 1;
      if (it.example && !before) await addExample(id, it.example, it.example_ar || null, 'easy');
      for (const f of new Set([input, lemma, ...it.inflections.map(clean)])) {
        if (/^[a-z][a-z'-]*$/.test(f)) await run('INSERT INTO lemma_index (form, lemma) VALUES (?, ?) ON CONFLICT (form) DO NOTHING', f, lemma);
      }
      // The word family, ready for the word panel (no AI call when it is opened).
      const forms = [
        { pos: posAr(it.part_of_speech), word: lemma, form: lemma, arabic: it.arabic, example: it.example || '', example_ar: it.example_ar || '' },
        ...it.family.filter((f) => clean(f.word) && clean(f.word) !== lemma).map((f) => ({ pos: f.pos, word: clean(f.word), form: clean(f.word), arabic: f.arabic, example: '', example_ar: '' })),
      ];
      if (forms.length > 1) await writeCache(cacheKey('word_forms_v2', `Word: ${lemma}`), 'word_forms_v2', { base: lemma, forms });
    }
  });
  return { added, processed: todo.length, answered: items.length, matched: items.filter((it) => todo.includes(clean(it.input))).map((it) => clean(it.input)), sample: items.slice(0, 3).map((it) => `${it.input}→${it.lemma}${it.skip ? ' (skip)' : ''}`), next: offset, finished: false };
}

function posAr(pos) {
  const p = String(pos || '').toLowerCase();
  if (p.includes('verb') && !p.includes('adverb')) return 'فعل';
  if (p.includes('adverb')) return 'ظرف';
  if (p.includes('adjective')) return 'صفة';
  if (p.includes('noun')) return 'اسم';
  return 'أخرى';
}

/* ------------------------------------------- word families, prepared ahead */

let dictTerms = null;
/** The dictionary's words, most common first. */
async function dictionaryTerms() {
  if (dictTerms) return dictTerms;
  const rows = await all("SELECT term FROM vocabulary WHERE origin = 'dictionary'");
  const rank = new Map(COMMON_WORDS.map((w, i) => [w, i]));
  dictTerms = rows.map((r) => clean(r.term)).filter((t) => /^[a-z]+$/.test(t)).sort((a, b) => (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9));
  return dictTerms;
}

/**
 * Prepare the complete word family (English forms, Arabic, an example each, how common)
 * of the next `count` dictionary words that do not have a good one yet, so the word panel
 * opens instantly.
 */
export async function buildFormsStep({ offset = 0, count = 8, span = 300 } = {}) {
  const { formsBatchWithAi, goodForms } = await import('./extractor.js');
  const { readCache } = await import('./ai.js');
  const terms = await dictionaryTerms();
  const todo = [];
  let i = offset;
  for (; i < terms.length && todo.length < count && i < offset + span; i++) {
    if (!goodForms(await readCache(cacheKey('word_forms_v2', `Word: ${terms[i]}`)).catch(() => null))) todo.push(terms[i]);
  }
  if (!todo.length) return { done: 0, next: i, total: terms.length, finished: i >= terms.length };
  const items = await formsBatchWithAi(todo);
  let done = 0;
  for (const it of items) {
    const w = clean(it.input);
    if (!todo.includes(w)) continue;
    const forms = it.forms.filter((f) => /^[a-z][a-z' -]*$/i.test(String(f.word || '').trim()) && f.example);
    if (forms.length < 1) continue;
    await writeCache(cacheKey('word_forms_v2', `Word: ${w}`), 'word_forms_v2', { base: clean(it.base) || w, forms });
    done += 1;
  }
  return { done, asked: todo.length, next: i, total: terms.length, finished: false };
}

/**
 * One run of the scheduled job (every minute): three batches of 10 words side by side,
 * continuing where the last run stopped. Two sweeps over the list (the second picks up
 * words that failed), then it rests.
 */
export async function scheduledFormsRun() {
  const KEY = 'forms-build';
  const st = JSON.parse((await get('SELECT value FROM app_settings WHERE key = ?', KEY))?.value || '{"cursor":0,"sweep":0}');
  const terms = await dictionaryTerms();
  if (st.sweep >= 2) return { resting: true, ...st };
  const slices = [0, 10, 20].map((d) => st.cursor + d).filter((o) => o < terms.length);
  const results = await Promise.allSettled(slices.map((o) => buildFormsStep({ offset: o, count: 10, span: 10 })));
  st.cursor += 30;
  if (st.cursor >= terms.length) { st.cursor = 0; st.sweep += 1; }
  st.done = (st.done || 0) + results.reduce((n, r) => n + (r.status === 'fulfilled' ? r.value.done || 0 : 0), 0);
  st.at = new Date().toISOString();
  await run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', KEY, JSON.stringify(st));
  return { ...st, errors: results.filter((r) => r.status === 'rejected').map((r) => String(r.reason?.message || r.reason).slice(0, 120)) };
}

/**
 * One step of re-levelling every word in the shared vocabulary by the learner dictionaries
 * (Oxford 3000/5000, English Vocabulary Profile). Continues after the last word done, so new
 * words from new videos are levelled too.
 */
export async function relevelStep({ batches = 2, size = 80 } = {}) {
  const { levelsWithAi } = await import('./extractor.js');
  const KEY = 'relevel';
  const st = JSON.parse((await get('SELECT value FROM app_settings WHERE key = ?', KEY))?.value || '{"cursor":0,"done":0}');
  const rows = await all('SELECT id, term FROM vocabulary WHERE id > ? ORDER BY id LIMIT ?', st.cursor, batches * size);
  if (!rows.length) return { idle: true, ...st };
  const parts = [];
  for (let i = 0; i < rows.length; i += size) parts.push(rows.slice(i, i + size));
  const results = await Promise.allSettled(parts.map((p) => levelsWithAi(p.map((r) => r.term))));
  let changed = 0;
  for (const [k, res] of results.entries()) {
    if (res.status !== 'fulfilled') continue;
    const byTerm = new Map(res.value.map((it) => [it.term.trim().toLowerCase(), it.level]));
    for (const r of parts[k]) {
      const lvl = byTerm.get(r.term.trim().toLowerCase());
      if (!LEVEL.includes(lvl)) continue;
      await run('UPDATE vocabulary SET level = ? WHERE id = ? AND (level IS NULL OR level <> ?)', lvl, r.id, lvl);
      changed += 1;
    }
  }
  // move on only past the batches that succeeded (a failed one is tried again next time)
  const okUpTo = results.findIndex((r) => r.status !== 'fulfilled');
  const lastOk = okUpTo === -1 ? rows.at(-1) : (okUpTo === 0 ? null : parts[okUpTo - 1].at(-1));
  if (lastOk) st.cursor = lastOk.id;
  st.done = (st.done || 0) + changed;
  st.at = new Date().toISOString();
  await run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', KEY, JSON.stringify(st));
  return { changed, ...st, errors: results.filter((r) => r.status === 'rejected').map((r) => String(r.reason?.message || r.reason).slice(0, 100)) };
}
