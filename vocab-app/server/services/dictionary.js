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
 * Give the words that still have an old, unchecked level their level from the learner
 * dictionaries (Oxford 3000/5000, English Vocabulary Profile) — ONCE: the level is saved
 * with level_checked = 1 and never asked again. Called when the learner opens a video or
 * «كلماتي», for those words only (at most `limit` per call), so nothing runs in the background.
 */
export async function ensureLevels(ids, { limit = 80 } = {}) {
  const { levelsWithAi } = await import('./extractor.js');
  // words already levelled by the earlier background pass count as checked
  const old = await get('SELECT value FROM app_settings WHERE key = ?', 'relevel');
  if (old) {
    const cursor = Number(JSON.parse(old.value || '{}').cursor) || 0;
    if (cursor) await run('UPDATE vocabulary SET level_checked = 1 WHERE id <= ? AND level_checked = 0', cursor);
    await run('DELETE FROM app_settings WHERE key = ?', 'relevel');
  }
  const want = [...new Set(ids.map(Number).filter(Boolean))];
  if (!want.length) return { levelled: 0, more: false };
  const rows = [];
  for (let i = 0; i < want.length && rows.length < limit; i += 400) {
    const part = want.slice(i, i + 400);
    rows.push(...await all(`SELECT id, term FROM vocabulary WHERE level_checked = 0 AND id IN (${part.map(() => '?').join(',')}) LIMIT ?`, ...part, limit - rows.length));
  }
  if (!rows.length) return { levelled: 0, more: false };
  const items = await levelsWithAi(rows.map((r) => r.term));
  const byTerm = new Map(items.map((it) => [it.term.trim().toLowerCase(), it.level]));
  let levelled = 0;
  await tx(async () => {
    for (const r of rows) {
      const lvl = byTerm.get(r.term.trim().toLowerCase());
      if (LEVEL.includes(lvl)) { await run('UPDATE vocabulary SET level = ?, level_checked = 1 WHERE id = ?', lvl, r.id); levelled += 1; }
    }
  });
  return { levelled, more: rows.length >= limit };
}
