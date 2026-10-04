// "Add" box: understand pasted input (word lists, `word = معنى`, notes,
// paragraphs) and save the items the learner keeps — never duplicating.
//   preview()  — instant: parsing + your words + offline dictionary
//   enrich()   — optional AI completion of missing details, ≤ 10 rows per call
//   save()     — explicit save of the rows the learner kept
import { config } from '../config.js';
import { enrichWithAi, dictionaryDetails } from './extractor.js';
import { aiAvailable, AiError, OFFLINE_MESSAGE } from './ai.js';
import { parseInput } from './parse-input.js';
import { analyzeText } from './sources.js';
import { matchKey, quickTier, sentenceKey, singularCandidates, sameArabicMeaning, BASIC_WORDS } from '../../public/js/shared/text.js';
import { findVocabulary, upsertVocabulary, addExample, examplesOf } from '../data/vocabulary.js';
import { userStateFor, saveWord } from '../data/words.js';
import { sourceView } from '../data/sources.js';

export const ENRICH_BATCH = 10;
const needsDetails = (r) => !r.arabic || !r.level || !r.simple_english;

async function previewRow(it, userId) {
  const typed = it.term;
  const existing = await findVocabulary(it.term);
  const state = existing ? await userStateFor(userId, existing.id) : { state: null };
  let dict = existing ? null : dictionaryDetails(it.term);
  if (!existing && !dict && !it.term.includes(' ')) {
    // "reports" → "report": use the singular when we know it.
    for (const c of singularCandidates(it.term)) {
      dict = dictionaryDetails(c);
      if (dict) break;
      if (BASIC_WORDS.has(c)) {
        it.term = c;
        break;
      }
    }
  }
  const base = existing || dict || {};
  const knownExamples = existing ? new Set((await examplesOf(existing.id, userId)).map((e) => sentenceKey(e.sentence))) : new Set();
  const newExamples = it.examples.filter((e) => !knownExamples.has(sentenceKey(e.sentence)));
  const newInfo = [];
  if (state.state === 'saved') {
    if (newExamples.length) newInfo.push('example');
    if (it.arabic && !sameArabicMeaning(it.arabic, state.user_arabic || base.arabic)) newInfo.push('meaning');
  }
  const row = {
    input: typed,
    term: existing?.term || dict?.term || it.term,
    vocabulary_id: existing?.id || null,
    status: state.state === 'saved' ? 'saved' : existing ? 'known' : 'new',
    new_info: newInfo,
    arabic: it.arabic || base.arabic || null,
    meaning_from: it.arabic ? 'you' : base.arabic ? (existing ? 'saved' : 'dictionary') : null,
    level: base.level || null,
    part_of_speech: it.pos || base.part_of_speech || null,
    item_type: base.item_type || (it.term.includes(' ') ? 'expression' : 'word'),
    simple_english: it.simple_english || base.simple_english || null,
    pronunciation: base.pronunciation || null,
    topic: base.topic || null,
    band: base.band || null,
    examples: it.examples,
    tier: quickTier(it.term),
    recognized: !!(existing || dict || quickTier(it.term)),
  };
  // Low confidence is shown, never hidden behind invented data.
  if (!row.recognized && !row.arabic) row.unsure = true;
  return row;
}

/** Understand pasted input: listed words plus running text (which becomes a readable source). */
export async function preview(text, userId) {
  const parsed = parseInput(text);
  const rows = [];
  for (const it of parsed.items) rows.push(await previewRow(it, userId));
  let source = null;
  if (parsed.passage && parsed.passage.split(/\s+/).length >= 6) {
    const { source_id } = await analyzeText(parsed.passage, userId);
    const view = await sourceView(source_id, userId);
    source = { id: source_id, title: view.source.title, items: view.items.length };
  }
  const pending = rows.filter(needsDetails).length;
  return {
    items: rows,
    source,
    unclear: parsed.unclear,
    ai: aiAvailable(),
    needs_ai: aiAvailable() ? pending : 0,
    enrich_batch: ENRICH_BATCH,
    ai_error: pending && !aiAvailable() ? OFFLINE_MESSAGE : null,
  };
}

/** Complete missing details of up to ENRICH_BATCH preview rows with AI. */
export async function enrich(rows) {
  const list = (Array.isArray(rows) ? rows : []).slice(0, ENRICH_BATCH);
  const missing = list.filter(needsDetails);
  if (!missing.length) return { items: list, ai_error: null };
  if (!aiAvailable()) return { items: list, ai_error: OFFLINE_MESSAGE };
  let map;
  try {
    map = await enrichWithAi(missing.map((r) => ({ term: r.input, arabic: r.meaning_from === 'you' ? r.arabic : null, example: r.examples?.[0]?.sentence })));
  } catch (err) {
    if (!(err instanceof AiError)) throw err;
    return { items: list, ai_error: err.message };
  }
  for (const r of missing) {
    const ai = map.get(r.input);
    if (!ai) continue;
    if (!ai.recognized) {
      r.recognized = false;
      r.unsure = true;
      continue;
    }
    r.recognized = true;
    r.unsure = false;
    r.term = r.vocabulary_id ? r.term : ai.term || r.term;
    r.arabic = r.arabic || ai.arabic || null;
    if (!r.meaning_from && ai.arabic) r.meaning_from = 'ai';
    r.level = r.level || ai.level;
    r.part_of_speech = r.part_of_speech || ai.part_of_speech;
    r.item_type = ai.item_type || r.item_type;
    r.simple_english = r.simple_english || ai.simple_english || null;
    r.pronunciation = r.pronunciation || ai.pronunciation || null;
    r.band = ai.band;
    r.topic = ai.topic;
    r.easy_example = ai.easy_example;
    r.easy_example_arabic = ai.easy_example_arabic;
    if (r.examples?.[0] && !r.examples[0].arabic && ai.example_arabic) r.examples[0].arabic = ai.example_arabic;
  }
  return { items: list, ai_error: null };
}

/**
 * Save the items the learner kept. Existing words are never duplicated:
 * new examples / their own meaning are added to the existing record.
 * @returns {Promise<Array<{term, result: 'added'|'updated'|'unchanged', uv_id}>>}
 */
export async function save(items, { groupIds = [] } = {}, userId) {
  const results = [];
  for (const it of items.slice(0, config.limits.importItems)) {
    if (!it?.term || !matchKey(it.term)) continue;
    const before = await findVocabulary(it.term);
    const stateBefore = before ? await userStateFor(userId, before.id) : { state: null };
    const { id: vocabId, created } = await upsertVocabulary({
      term: String(it.term).slice(0, 120),
      item_type: it.item_type,
      part_of_speech: it.part_of_speech,
      level: it.level,
      band: it.band,
      pronunciation: it.pronunciation,
      // The learner's own meaning is private (user_arabic); the shared dictionary
      // only takes meanings from the dictionary or AI.
      arabic: it.meaning_from === 'you' ? null : it.arabic,
      simple_english: it.simple_english,
      topic: it.topic,
      easy_example: it.easy_example,
      easy_example_arabic: it.easy_example_arabic,
      origin: it.meaning_from === 'ai' ? 'ai' : it.meaning_from === 'dictionary' ? 'dictionary' : 'user',
    });
    let addedExample = false;
    for (const ex of (it.examples || []).slice(0, 10)) addedExample = (await addExample(vocabId, ex.sentence, ex.arabic, 'user', userId)) || addedExample;
    const userArabic = it.meaning_from === 'you' && it.arabic && !sameArabicMeaning(it.arabic, before?.arabic) ? it.arabic : null;
    const hadUserArabic = stateBefore.user_arabic;
    const groupsBefore = new Set(stateBefore.groups || []);
    const { uv_id, already } = await saveWord(userId, vocabId, { userArabic, groupIds });
    const joinedGroup = groupIds.some((g) => !groupsBefore.has(Number(g)));
    let result = 'added';
    if (already) result = addedExample || (userArabic && !hadUserArabic) || joinedGroup ? 'updated' : 'unchanged';
    results.push({ term: it.term, result, uv_id, created });
  }
  return results;
}
