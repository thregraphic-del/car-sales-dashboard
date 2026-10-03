// Orchestration of the learning loop: sources → understanding → user choices.
// Combines deterministic logic (repo, matcher, importer) with optional AI.
import * as repo from './repo.js';
import { get, all, run } from './db.js';
import { parseYoutubeId, getVideoWithTranscript, getVideoMeta, parsePastedTranscript, TranscriptError } from './youtube.js';
import {
  extractVocabulary, toSentences, claudeConfigured, lookupWithClaude, enrichWithClaude, dictionaryDetails, translateWithClaude, ExtractionError,
} from './extractor.js';
import { parseInput } from './importer.js';
import { matchKey, lemmaCandidates, quickTier, sentenceKey, singularCandidates, sameArabicMeaning, BASIC_WORDS } from '../public/js/shared/text.js';

/* ================================================================ sources */

function toLines(segments) {
  return toSentences(segments).map((s, idx) => ({ idx, start: s.start, text: s.text }));
}

/**
 * Analyse a YouTube video (or its pasted transcript). Stores the complete
 * transcript + extracted items, then translates subtitles in the background.
 */
export async function analyzeYoutube({ url, transcript, force }, userId) {
  const youtubeId = parseYoutubeId(url);
  if (!youtubeId) throw repo.httpError(400, 'هذا لا يبدو رابط فيديو يوتيوب.');
  const existing = repo.findSourceByYoutubeId(youtubeId);
  if (existing && !force && !transcript?.trim()) {
    const lines = all('SELECT COUNT(*) AS n FROM transcript_lines WHERE source_id=?', existing.id)[0].n;
    if (lines) return { source_id: existing.id, cached: true };
  }
  let meta;
  let segments;
  let source;
  if (transcript?.trim()) {
    segments = parsePastedTranscript(transcript);
    source = 'pasted';
    try {
      meta = await getVideoMeta(youtubeId);
    } catch {
      meta = { youtube_id: youtubeId, url: `https://www.youtube.com/watch?v=${youtubeId}`, title: 'YouTube video', thumbnail_url: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg` };
    }
  } else {
    ({ meta, segments, source } = await getVideoWithTranscript(youtubeId)); // throws TranscriptError
  }
  const lines = toLines(segments);
  const { items, engine, word_count } = await extractVocabulary({ title: meta.title, channel: meta.channel, lines });
  const sourceId = repo.saveSource({ ...meta, kind: 'youtube', transcript_source: source, extractor: engine, word_count }, lines, items, userId);
  startTranslation(sourceId);
  return { source_id: sourceId, cached: false };
}

/** Turn pasted English text into a readable source with suggested words. */
export async function analyzeText(text, userId, title) {
  const clean = String(text || '').trim();
  const sentences = clean.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const lines = sentences.map((s, idx) => ({ idx, start: null, text: s }));
  const firstWords = clean.split(/\s+/).slice(0, 7).join(' ');
  let items = [];
  let engine = 'dictionary';
  let wordCount = clean.split(/\s+/).length;
  try {
    ({ items, engine, word_count: wordCount } = await extractVocabulary({ title: title || firstWords, lines }));
  } catch (err) {
    if (!(err instanceof ExtractionError) || err.status !== 422) throw err; // very short text: keep it readable anyway
  }
  const sourceId = repo.saveSource(
    { kind: 'text', title: title || `${firstWords}${clean.split(/\s+/).length > 7 ? '…' : ''}`, transcript_source: 'text', extractor: engine, word_count: wordCount },
    lines, items, userId,
  );
  startTranslation(sourceId);
  return { source_id: sourceId };
}

/* ======================================================== translations */

const jobs = new Map();

/** Translate untranslated lines in batches (one job per source, idempotent). */
export function startTranslation(sourceId) {
  if (!claudeConfigured()) {
    const src = repo.getSource(sourceId);
    if (src && src.translation_status === 'none') {
      const missing = get('SELECT COUNT(*) AS n FROM transcript_lines WHERE source_id=? AND text_ar IS NULL', sourceId).n;
      run('UPDATE sources SET translation_status=? WHERE id=?', missing ? 'unavailable' : 'done', sourceId);
    }
    return;
  }
  if (jobs.has(sourceId)) return;
  const job = (async () => {
    run(`UPDATE sources SET translation_status='running' WHERE id=?`, sourceId);
    const src = repo.getSource(sourceId);
    try {
      for (;;) {
        const batch = all('SELECT id, idx, text FROM transcript_lines WHERE source_id=? AND text_ar IS NULL ORDER BY idx LIMIT 60', sourceId);
        if (!batch.length) break;
        const map = await translateWithClaude(batch, src?.title);
        let wrote = 0;
        for (const l of batch) {
          const ar = map.get(l.idx);
          if (ar) {
            run('UPDATE transcript_lines SET text_ar=? WHERE id=?', ar, l.id);
            run('UPDATE occurrences SET sentence_ar=COALESCE(sentence_ar, ?) WHERE line_id=?', ar, l.id);
            wrote += 1;
          }
        }
        if (!wrote) throw new Error('translation returned nothing');
      }
      run(`UPDATE sources SET translation_status='done' WHERE id=?`, sourceId);
    } catch (err) {
      console.error('translation failed', sourceId, err.message);
      run(`UPDATE sources SET translation_status='failed' WHERE id=?`, sourceId);
    } finally {
      jobs.delete(sourceId);
    }
  })();
  jobs.set(sourceId, job);
}

export function translationStatus(sourceId) {
  const src = repo.getSource(sourceId);
  if (!src) throw repo.httpError(404, 'لم نجد هذا المصدر.');
  const c = get('SELECT COUNT(*) AS total, SUM(text_ar IS NOT NULL) AS done FROM transcript_lines WHERE source_id=?', sourceId);
  return { status: src.translation_status, total: c.total, done: c.done || 0 };
}

export const _jobs = jobs;

/* ============================================================ lookup */

const lookupCache = new Map(); // in-flight dedupe: same click twice → one AI call

/**
 * Explain a word the learner clicked in a line, in context.
 * Order: phrase/word already known in DB → offline lexicon → AI (cached into DB).
 */
export async function lookup({ line_id, word, vocabulary_id }, userId) {
  const line = line_id ? get('SELECT * FROM transcript_lines WHERE id=?', line_id) : null;
  const sentence = line?.text || '';
  let vocab = vocabulary_id ? get('SELECT * FROM vocabulary WHERE id=?', vocabulary_id) : null;
  const tier = word ? quickTier(word) : null;

  if (!vocab && word) {
    for (const c of lemmaCandidates(word)) {
      vocab = repo.findVocabulary(c);
      if (vocab) break;
    }
  }
  if (!vocab && word) {
    for (const c of lemmaCandidates(word)) {
      const d = dictionaryDetails(c);
      if (d) {
        vocab = get('SELECT * FROM vocabulary WHERE id=?', repo.upsertVocabulary({ ...d, origin: 'dictionary' }).id);
        break;
      }
    }
  }

  let occurrence = vocab && line ? repo.occurrenceFor(vocab.id, line.id) : null;
  const needsAi = claudeConfigured() && line && (!vocab || (!occurrence?.contextual_meaning && !vocab.arabic) || !line.text_ar);

  if (needsAi && word) {
    const key = `${line.id}:${matchKey(word)}`;
    try {
      if (!lookupCache.has(key)) lookupCache.set(key, lookupWithClaude({ word, sentence }).finally(() => setTimeout(() => lookupCache.delete(key), 60000)));
      const ai = await lookupCache.get(key);
      const { id } = repo.upsertVocabulary(ai);
      vocab = get('SELECT * FROM vocabulary WHERE id=?', id);
      occurrence = repo.occurrenceFor(vocab.id, line.id, { contextual_meaning: ai.contextual_meaning, sentence_ar: ai.sentence_arabic });
    } catch (err) {
      if (!vocab) return { found: false, word, tier, sentence, error: err.message };
    }
  }

  if (!vocab) {
    return { found: false, word, tier, sentence, sentence_ar: line?.text_ar || null, ai: claudeConfigured() };
  }
  const ex = all('SELECT kind, sentence, arabic FROM examples WHERE vocabulary_id=? ORDER BY id', vocab.id);
  const state = repo.userStateFor(userId, vocab.id);
  return {
    found: true,
    ...repo.vocabularyPublic(vocab),
    tier: vocab.band || tier,
    arabic: state.user_arabic || occurrence?.contextual_meaning || vocab.arabic,
    contextual: !!occurrence?.contextual_meaning,
    occurrence_id: occurrence?.id || null,
    context_sentence: occurrence?.sentence || sentence || null,
    context_arabic: occurrence?.sentence_ar || line?.text_ar || null,
    timestamp_seconds: occurrence?.timestamp_seconds ?? (line?.start_seconds != null ? Math.floor(line.start_seconds) : null),
    examples: ex,
    ...state,
  };
}

/* ============================================================ import */

/**
 * Understand pasted input: listed words (with any meaning/examples the learner
 * typed), plus running text which becomes a readable source.
 */
export async function importPreview(text, userId) {
  const parsed = parseInput(text);
  const rows = parsed.items.map((it) => {
    const typed = it.term;
    const existing = repo.findVocabulary(it.term);
    const state = existing ? repo.userStateFor(userId, existing.id) : { state: null };
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
    const knownExamples = existing ? new Set(all('SELECT sentence_key FROM examples WHERE vocabulary_id=?', existing.id).map((r) => r.sentence_key)) : new Set();
    const newExamples = it.examples.filter((e) => !knownExamples.has(sentenceKey(e.sentence)));
    const newInfo = [];
    if (state.state === 'saved') {
      if (newExamples.length) newInfo.push('example');
      if (it.arabic && !sameArabicMeaning(it.arabic, state.user_arabic || base.arabic)) newInfo.push('meaning');
    }
    return {
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
  });

  // Fill gaps with AI in one batch call (only for words still missing details).
  let aiError = null;
  const missing = rows.filter((r) => !r.arabic || !r.level || !r.simple_english);
  if (claudeConfigured() && missing.length) {
    try {
      const map = await enrichWithClaude(missing.map((r) => ({ term: r.input, arabic: r.meaning_from === 'you' ? r.arabic : null, example: r.examples[0]?.sentence })));
      for (const r of missing) {
        const ai = map.get(r.input);
        if (!ai) continue;
        if (!ai.recognized) {
          r.recognized = false;
          r.unsure = true;
          continue;
        }
        r.recognized = true;
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
        if (r.examples[0] && !r.examples[0].arabic && ai.example_arabic) r.examples[0].arabic = ai.example_arabic;
      }
    } catch (err) {
      aiError = err.message;
    }
  }
  for (const r of rows) {
    // Low confidence is shown, never hidden behind invented data.
    if (!r.recognized && !r.arabic) r.unsure = true;
  }

  let source = null;
  if (parsed.passage && parsed.passage.split(/\s+/).length >= 6) {
    const { source_id } = await analyzeText(parsed.passage, userId);
    const view = repo.sourceView(source_id, userId);
    source = { id: source_id, title: view.source.title, items: view.items.length };
  }
  return { items: rows, source, unclear: parsed.unclear, ai: claudeConfigured(), ai_error: aiError };
}

/**
 * Save the items the learner kept. Existing words are never duplicated:
 * new examples / their own meaning are added to the existing record.
 * @returns {Array<{term, result: 'added'|'updated'|'unchanged', uv_id}>}
 */
export function importSave(items, { groupIds = [] } = {}, userId) {
  const results = [];
  for (const it of items) {
    if (!it?.term || !matchKey(it.term)) continue;
    const before = repo.findVocabulary(it.term);
    const stateBefore = before ? repo.userStateFor(userId, before.id) : { state: null };
    const { id: vocabId, created } = repo.upsertVocabulary({
      term: it.term,
      item_type: it.item_type,
      part_of_speech: it.part_of_speech,
      level: it.level,
      band: it.band,
      pronunciation: it.pronunciation,
      // The learner's own meaning becomes the global meaning only for brand-new words.
      arabic: it.meaning_from === 'you' ? (before ? null : it.arabic) : it.arabic,
      simple_english: it.simple_english,
      topic: it.topic,
      easy_example: it.easy_example,
      easy_example_arabic: it.easy_example_arabic,
      origin: it.meaning_from === 'ai' ? 'ai' : it.meaning_from === 'dictionary' ? 'dictionary' : 'user',
    });
    let addedExample = false;
    for (const ex of it.examples || []) addedExample = repo.addExample(vocabId, ex.sentence, ex.arabic, 'user') || addedExample;
    const userArabic = it.meaning_from === 'you' && before && it.arabic && !sameArabicMeaning(it.arabic, before.arabic) ? it.arabic : null;
    const hadUserArabic = stateBefore.user_arabic;
    const groupsBefore = new Set(stateBefore.groups || []);
    const { uv_id, already } = repo.saveWord(userId, vocabId, { userArabic, groupIds });
    const joinedGroup = groupIds.some((g) => !groupsBefore.has(Number(g)));
    let result = 'added';
    if (already) result = addedExample || (userArabic && !hadUserArabic) || joinedGroup ? 'updated' : 'unchanged';
    results.push({ term: it.term, result, uv_id, created });
  }
  return results;
}

export { TranscriptError };
