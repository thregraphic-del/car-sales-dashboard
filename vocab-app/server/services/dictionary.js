// The built-in dictionary: the most frequent English words, with Arabic meanings,
// inflections and word families, stored once in the shared vocabulary so clicked
// words are explained instantly, without AI.
import { all, get, run, tx } from '../db/index.js';
import { COMMON_WORDS } from '../lib/common-words.js';
import { dictionaryBatchWithAi } from './extractor.js';
import { cacheKey, writeCache } from './ai.js';
import { findVocabulary, upsertVocabulary, addExample } from '../data/vocabulary.js';

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
export async function buildDictionaryStep({ offset = 0, count = 20 } = {}) {
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
  return { added, processed: todo.length, next: offset, finished: false };
}

function posAr(pos) {
  const p = String(pos || '').toLowerCase();
  if (p.includes('verb') && !p.includes('adverb')) return 'فعل';
  if (p.includes('adverb')) return 'ظرف';
  if (p.includes('adjective')) return 'صفة';
  if (p.includes('noun')) return 'اسم';
  return 'أخرى';
}
