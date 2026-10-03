// Explaining a word the learner clicked:
//   1. their words / the database   2. offline dictionary   3. OpenRouter —
//   only when the dictionary can't give enough (unknown word, missing
//   fields), or when the learner asks for the meaning in this exact sentence.
// AI answers are cached (ai_cache + vocabulary + occurrence), so a word in a
// given sentence is only ever sent once.
import { all, get } from '../db/index.js';
import { lookupWithAi, dictionaryDetails } from './extractor.js';
import { aiConfigured, aiAvailable, AiError, OFFLINE_MESSAGE } from './ai.js';
import { matchKey, lemmaCandidates, quickTier } from '../../public/js/shared/text.js';
import { findVocabulary, upsertVocabulary, vocabularyPublic, getVocabulary } from '../data/vocabulary.js';
import { occurrenceFor, getLine } from '../data/sources.js';
import { userStateFor } from '../data/words.js';

const inFlight = new Map(); // same click twice → one AI call

const complete = (v) => !!(v && v.arabic && v.simple_english && v.level && v.part_of_speech);

export async function lookup({ line_id, word, vocabulary_id, context = false }, userId) {
  const line = line_id ? await getLine(line_id) : null;
  const sentence = line?.text || '';
  let vocab = vocabulary_id ? await getVocabulary(vocabulary_id) : null;
  const tier = word ? quickTier(word) : null;

  if (!vocab && word) {
    for (const c of lemmaCandidates(word)) {
      vocab = await findVocabulary(c);
      if (vocab) break;
    }
  }
  if (!vocab && word) {
    for (const c of lemmaCandidates(word)) {
      const d = dictionaryDetails(c);
      if (d) {
        vocab = await getVocabulary((await upsertVocabulary({ ...d, origin: 'dictionary' })).id);
        break;
      }
    }
  }
  if (vocab && !complete(vocab)) {
    const d = dictionaryDetails(vocab.term); // fill gaps offline first
    if (d) {
      await upsertVocabulary({ ...d, term: vocab.term });
      vocab = await getVocabulary(vocab.id);
    }
  }

  let occurrence = vocab && line ? await occurrenceFor(vocab.id, line.id) : null;
  const needsAi = line && aiConfigured() && tier !== 'function'
    && (!vocab || !complete(vocab) || (context && !occurrence?.contextual_meaning));
  let aiError = null;

  if (needsAi && (word || vocab)) {
    const asked = word || vocab.term;
    const key = `${line.id}:${matchKey(asked)}`;
    try {
      if (!inFlight.has(key)) inFlight.set(key, lookupWithAi({ word: asked, sentence }).finally(() => inFlight.delete(key)));
      const ai = await inFlight.get(key);
      const { id } = await upsertVocabulary(ai); // fills gaps only, never overwrites
      vocab = await getVocabulary(id);
      occurrence = await occurrenceFor(vocab.id, line.id, { contextual_meaning: ai.contextual_meaning, sentence_ar: ai.sentence_arabic, context_note: ai.context_note });
    } catch (err) {
      if (!(err instanceof AiError)) throw err;
      aiError = err.message;
    }
  }

  const lineAr = line ? (await get('SELECT text_ar FROM transcript_lines WHERE id=?', line.id))?.text_ar || null : null;
  if (!vocab) {
    return {
      found: false, word, tier, sentence, sentence_ar: lineAr,
      ai: aiAvailable(), ai_error: aiError || (aiConfigured() || tier === 'function' || tier === 'basic' ? null : OFFLINE_MESSAGE),
    };
  }
  const examples = await all('SELECT kind, sentence, arabic FROM examples WHERE vocabulary_id=? ORDER BY id', vocab.id);
  const state = await userStateFor(userId, vocab.id);
  return {
    found: true,
    ...vocabularyPublic(vocab),
    tier: vocab.band || tier,
    arabic: state.user_arabic || occurrence?.contextual_meaning || vocab.arabic,
    contextual: !!occurrence?.contextual_meaning,
    context_note: occurrence?.context_note || null,
    can_explain: !!line && aiConfigured() && !occurrence?.contextual_meaning,
    ai_error: aiError,
    occurrence_id: occurrence?.id || null,
    context_sentence: occurrence?.sentence || sentence || null,
    context_arabic: occurrence?.sentence_ar || lineAr,
    timestamp_seconds: occurrence?.timestamp_seconds ?? (line?.start_seconds != null ? Math.floor(line.start_seconds) : null),
    examples,
    ...state,
  };
}
