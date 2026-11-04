// Language intelligence. Each job uses the simplest reliable tool:
//   * deterministic: sentence splitting, tiers (function/basic), matching, timestamps
//   * OpenRouter AI (when OPENROUTER_API_KEY is set): choosing learnable items, contextual Arabic,
//     looking up a clicked word, enriching imported words, translating subtitles
// Without an AI key the offline lexicon is used and gaps stay empty (never invented).
import { z } from 'zod';
import { jsonCall, aiConfigured, aiAvailable, AiError } from './ai.js';
import { matchKey } from '../../public/js/shared/text.js';
import { lexicon, lexiconPatterns, findSpan } from '../lib/matcher.js';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const TOPICS = ['business', 'work', 'academic', 'daily', 'media', 'tech', 'emotions', 'health', 'travel', 'society', 'finance', 'data'];
const TYPES = ['word', 'phrasal verb', 'idiom', 'collocation', 'expression'];
const BANDS = ['basic', 'useful', 'advanced', 'specialized'];

export class ExtractionError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
    this.expose = true; // written for the learner — safe to show
  }
}

/* ------------------------------------------------------------ sentences */

/**
 * Merge caption fragments into sentences (the transcript lines we store),
 * each keeping the start time of its first fragment. The words themselves are
 * never changed. Auto-captions without punctuation are cut at ~28 words.
 */
/**
 * Caption segments → sentence lines {text, start, words?}.
 * A segment may carry word timings (seg.words = [{t, text}], t in seconds,
 * from YouTube auto-captions). When every word of a line is timed, the line
 * keeps them as words = [[ms, word], ...] and its text is exactly those words
 * joined by spaces, so word i of the text is timing i.
 */
/** Words of a segment without word timings: times spread evenly over the segment. */
function untimedWords(seg) {
  const words = String(seg.text || '').replace(/\[(?:music|applause|laughter)\]/gi, ' ').replace(/>>/g, ' ').split(/\s+/).filter(Boolean);
  const start = seg.start ?? null;
  const dur = Number(seg.dur) > 0 ? Number(seg.dur) : 0;
  return words.map((text, i) => ({ text, t: start === null ? null : start + (dur * i) / words.length, timed: false }));
}

export function toSentences(segments) {
  const out = [];
  let buf = [];
  const noise = /^(?:\[(?:music|applause|laughter|silence|inaudible)\]|>>|\[[^\]]*\])$/i;
  const flush = () => {
    if (!buf.length) return;
    const text = buf.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();
    const timed = buf.every((w) => w.timed);
    const first = buf.find((w) => w.t !== null && w.t !== undefined)?.t;
    const start = first === undefined ? null : Math.round(first * 100) / 100;
    if (text) out.push(timed ? { text, start, words: buf.map((w) => [Math.round(w.t * 1000), w.text]) } : { text, start });
    buf = [];
  };
  // Auto-generated captions have no punctuation: then each caption (or a few
  // short ones together) becomes a line, so every line keeps its own time.
  const ends = segments.filter((g) => /[.!?]["”’)]?\s*$/.test(String(g.text || '').trim())).length;
  const punctuated = segments.length < 3 || ends / segments.length >= 0.25;
  for (const [si, seg] of segments.entries()) {
    // Auto-captions overlap: a caption "lasts" only until the next one starts.
    const nextStart = segments[si + 1]?.start;
    const dur = Number.isFinite(nextStart) && Number.isFinite(seg.start) && Number(seg.dur) > 0 ? Math.max(0, Math.min(seg.dur, nextStart - seg.start)) : seg.dur;
    if (!punctuated && buf.length >= 3) flush();
    const raw = seg.words?.length
      ? seg.words.map((w) => ({ text: String(w.text).replace(/\s+/g, ' ').trim(), t: w.t, timed: Number.isFinite(w.t) }))
      : untimedWords({ ...seg, dur });
    // A timed segment may hold several words in one piece ("of the"): split, sharing the time.
    const tokens = raw.flatMap((w) => (w.text.includes(' ') ? w.text.split(' ').map((text) => ({ ...w, text })) : [w]))
      .filter((w) => w.text && !noise.test(w.text));
    for (const w of tokens) {
      buf.push(w);
      if (/[.!?]["”’)]?$/.test(w.text) || buf.length >= 28) flush();
    }
  }
  flush();
  // Lines in reading order always start at or after the line before.
  let floor = -Infinity;
  for (const l of out) {
    if (l.start === null || l.start === undefined) continue;
    if (l.start < floor) l.start = floor;
    floor = l.start;
  }
  return out;
}

const fmt = (s) => {
  if (s === null || s === undefined) return '--:--';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};

/* ------------------------------------------------------------------ ai */

const str = { type: 'string' };
const obj = (properties) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const SIMILAR = { type: 'array', items: obj({ word: str, arabic: str, note: str }) };
const SimilarZ = z.array(z.object({ word: z.string(), arabic: z.string(), note: z.string() }));
const cleanSimilar = (list) => list.map((s) => (s.note ? s : { word: s.word, arabic: s.arabic }));

/* ------------------------------------------------- 1. source extraction */

const EXTRACT_SCHEMA = obj({
  items: {
    type: 'array',
    items: obj({
      term: str, item_type: { type: 'string', enum: TYPES }, part_of_speech: str, level: { type: 'string', enum: LEVELS },
      band: { type: 'string', enum: ['useful', 'advanced', 'specialized'] }, usefulness: { type: 'integer' }, pronunciation: str,
      arabic: str, arabic_general: str, simple_english: str, line: { type: 'integer' }, context_arabic: str,
      topic: { type: 'string', enum: TOPICS }, example: str, example_arabic: str, easy_example: str, easy_example_arabic: str, similar: SIMILAR,
    }),
  },
});
const ExtractZ = z.object({
  items: z.array(z.object({
    term: z.string().min(1), item_type: z.enum(TYPES), part_of_speech: z.string(), level: z.enum(LEVELS),
    band: z.enum(['useful', 'advanced', 'specialized']), usefulness: z.number(), pronunciation: z.string(), arabic: z.string(),
    arabic_general: z.string(), simple_english: z.string(), line: z.number().int(), context_arabic: z.string(), topic: z.enum(TOPICS),
    example: z.string(), example_arabic: z.string(), easy_example: z.string(), easy_example_arabic: z.string(), similar: SimilarZ,
  })),
});

const EXTRACT_SYSTEM = `You are an expert English teacher building vocabulary lessons for an English learner whose first language is Arabic. You read a numbered transcript and choose the vocabulary worth this learner's time, from EVERY level A1 to C2.

Grammar words (the, is, of, and, it…) are never listed. Choose a balanced mix across all levels:
- A1–A2: important, frequent content words and expressions a learner must know (nouns, verbs, adjectives, adverbs, everyday phrases) — only the ones that matter in this video, not every simple word (band "useful");
- B1–B2 words and expressions useful in conversation, university, work, media and everyday life (band "useful");
- C1–C2 words and expressions (band "advanced");
- domain terms that are central to this video and reusable in its field (band "specialized", e.g. finance or data terms);
- multi-word items as ONE item when they carry one meaning (phrasal verbs, idioms, collocations, fixed expressions), written in dictionary form with "something"/"someone" slots.
Never include names of people, brands or places, numbers, filler words, duplicates or inflected variants of an item already chosen, or archaic words.

Quality over quantity: roughly 3 items per minute of video, every level represented when the video has it, never padding the list.

For each item:
- line: the number of the transcript line where it appears (use the [n] markers exactly).
- arabic: the Arabic meaning AS USED IN THAT LINE (short; two close options separated by " / " at most). Read the context — do not take the first dictionary sense.
- arabic_general: the most common general Arabic meaning.
- simple_english: a definition using easier words than the term.
- pronunciation: IPA in slashes.
- context_arabic: a natural Arabic translation of that line.
- example: a new natural sentence; easy_example: a very short easy sentence; both with Arabic translations.
- similar: 1–3 EASIER words or phrases with similar meaning, each with Arabic; if not an exact synonym, explain the difference in a short English note, otherwise "".
- usefulness: 0–100 for this learner.
Order items from most to least useful.`;

async function extractWithAi({ title, channel, lines }) {
  const transcript = lines.map((l) => `[${l.idx}] (${fmt(l.start)}) ${l.text}`).join('\n');
  const out = await jsonCall({
    task: 'extract_vocabulary',
    system: EXTRACT_SYSTEM,
    user: `Title: ${title}\nChannel: ${channel || 'unknown'}\n\n<transcript>\n${transcript}\n</transcript>`,
    schema: EXTRACT_SCHEMA,
    zod: ExtractZ,
    maxTokens: 16000,
    timeoutMs: 180000,
  });
  const valid = new Set(lines.map((l) => l.idx));
  return out.items
    .filter((it) => valid.has(it.line))
    .map((it) => ({
      ...it,
      usefulness: Math.max(0, Math.min(100, Math.round(it.usefulness))),
      contextual_meaning: it.arabic,
      arabic: it.arabic_general || it.arabic,
      similar: cleanSimilar(it.similar),
      origin: 'ai',
    }));
}

/* ------------------------------------- 1b. chunked selection (serverless) */

// A light schema so one chunk of ~25 lines finishes well inside a serverless
// time limit. Examples / similar words are filled later on click if needed.
const CHUNK_SCHEMA = obj({
  items: {
    type: 'array',
    items: obj({
      term: str, item_type: { type: 'string', enum: TYPES }, part_of_speech: str, level: { type: 'string', enum: LEVELS },
      band: { type: 'string', enum: ['useful', 'advanced', 'specialized'] }, usefulness: { type: 'integer' }, pronunciation: str,
      arabic: str, arabic_general: str, simple_english: str, line: { type: 'integer' }, topic: { type: 'string', enum: TOPICS },
    }),
  },
});
const ChunkZ = z.object({
  items: z.array(z.object({
    term: z.string().min(1), item_type: z.enum(TYPES), part_of_speech: z.string(), level: z.enum(LEVELS),
    band: z.enum(['useful', 'advanced', 'specialized']), usefulness: z.number(), pronunciation: z.string(), arabic: z.string(),
    arabic_general: z.string(), simple_english: z.string(), line: z.number().int(), topic: z.enum(TOPICS),
  })),
});

/**
 * Choose the learnable items in one chunk of transcript lines.
 * `context` = a few earlier lines (not numbered) so meanings stay accurate.
 */
export async function extractChunkWithAi({ title, lines }) {
  const transcript = lines.map((l) => `[${l.idx}] ${l.text}`).join('\n');
  const out = await jsonCall({
    task: 'extract_chunk_v3',
    system: `${EXTRACT_SYSTEM}\n\nYou receive one part of a longer transcript. Choose only from these lines. Return 8–12 items spread over ALL levels present: at least 2–3 important A1–A2 words, 2–3 at B1, 2–3 at B2, and the C1–C2 words and expressions that appear. Set "level" honestly for each. Leave out example fields — they are not needed here.`,
    user: `Title: ${title}\n\n<transcript>\n${transcript}\n</transcript>`,
    schema: CHUNK_SCHEMA,
    zod: ChunkZ,
    maxTokens: 2500,
  });
  const valid = new Set(lines.map((l) => l.idx));
  const seen = new Set();
  return out.items
    .filter((it) => valid.has(it.line))
    .filter((it) => {
      const k = matchKey(it.term);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((it) => ({
      ...it,
      usefulness: Math.max(0, Math.min(100, Math.round(it.usefulness))),
      contextual_meaning: it.arabic,
      arabic: it.arabic_general || it.arabic,
      similar: [],
      origin: 'ai',
    }));
}

export function extractWithDictionary({ lines }) {
  const hits = new Map();
  for (const { entry, re } of lexiconPatterns()) {
    for (const l of lines) {
      if (!re.test(l.text)) continue;
      const key = matchKey(entry.term);
      const h = hits.get(key);
      if (h) h.count += 1;
      else hits.set(key, { entry, line: l, count: 1 });
    }
  }
  return [...hits.values()]
    .map(({ entry, line, count }) => ({
      term: entry.term,
      item_type: entry.item_type,
      part_of_speech: entry.part_of_speech,
      level: entry.level,
      band: entry.level === 'C1' || entry.level === 'C2' ? 'advanced' : 'useful',
      usefulness: Math.min(100, entry.usefulness + Math.min(6, (count - 1) * 2)),
      pronunciation: entry.pronunciation || null,
      arabic: entry.arabic,
      contextual_meaning: null, // general meaning only — not context-aware offline
      simple_english: entry.simple_english,
      line: line.idx,
      context_arabic: null,
      topic: entry.topic,
      example: entry.example || null,
      example_arabic: entry.example_arabic || null,
      easy_example: entry.easy_example || null,
      easy_example_arabic: entry.easy_example_arabic || null,
      similar: entry.similar || [],
      origin: 'dictionary',
    }))
    .sort((a, b) => b.usefulness - a.usefulness)
    .slice(0, 60);
}

/**
 * lines: [{idx, start, text}] (already sentence-split).
 * Returns {items, engine, word_count}; each item has `line` (an idx in lines).
 */
export async function extractVocabulary({ title, channel, lines, engine = 'dictionary' }) {
  const wordCount = lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0);
  if (wordCount < 12) throw new ExtractionError('النص قصير جدًا للتحليل.', 422);
  // engine 'ai' asks for the whole transcript in one call (local tools only);
  // the app itself starts with the dictionary and refines with AI in chunks.
  let useAi = engine === 'ai' || (engine === 'auto' && aiAvailable());
  let items;
  let aiError = null;
  if (useAi) {
    try {
      items = await extractWithAi({ title, channel, lines });
    } catch (err) {
      if (!(err instanceof AiError)) throw err;
      aiError = err.message;
      useAi = false;
    }
  }
  if (!useAi) items = extractWithDictionary({ lines });
  const seen = new Set();
  items = items.filter((it) => {
    const key = matchKey(it.term);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { items, engine: useAi ? 'ai' : 'dictionary', word_count: wordCount, ai_error: aiError };
}

/* ---------------------------------------------------- 2. click lookup */

const LOOKUP_SCHEMA = obj({
  term: str, item_type: { type: 'string', enum: TYPES }, part_of_speech: str, level: { type: 'string', enum: LEVELS },
  band: { type: 'string', enum: BANDS }, pronunciation: str, arabic: str, arabic_general: str, simple_english: str,
  sentence_arabic: str, context_note: str, topic: { type: 'string', enum: TOPICS }, example: str, example_arabic: str,
  easy_example: str, easy_example_arabic: str, similar: SIMILAR,
});
const LookupZ = z.object({
  term: z.string().min(1), item_type: z.enum(TYPES), part_of_speech: z.string(), level: z.enum(LEVELS), band: z.enum(BANDS),
  pronunciation: z.string(), arabic: z.string(), arabic_general: z.string(), simple_english: z.string(), sentence_arabic: z.string(),
  context_note: z.string(), topic: z.enum(TOPICS), example: z.string(), example_arabic: z.string(),
  easy_example: z.string(), easy_example_arabic: z.string(), similar: SimilarZ,
});

/** Explain one clicked word inside its sentence (result is cached by the caller). */
export async function lookupWithAi({ word, sentence }) {
  const r = await jsonCall({
    task: 'word_in_context',
    system: 'You explain English vocabulary to an intermediate Arabic-speaking learner. Answer about the clicked word AS USED IN THE GIVEN SENTENCE. If the clicked word is part of a phrasal verb or fixed expression in that sentence, explain the whole expression and put its dictionary form (with something/someone slots) in "term"; otherwise use the lemma. Fields: "arabic" = the Arabic meaning in THIS sentence (short); "arabic_general" = the most common general Arabic meaning; "context_note" = one short Arabic sentence explaining what the word means here; "sentence_arabic" = natural Arabic translation of the whole sentence; "simple_english" = a definition with easier words; "level" = CEFR A1–C2; "part_of_speech" in English; "example" = a new natural example sentence with the same meaning, "easy_example" = a very short easy one, each with Arabic translation; "similar" = 0–3 easier words, with a short English note when not an exact synonym (else "").',
    user: `Clicked word: ${word}\nSentence: ${sentence}`,
    schema: LOOKUP_SCHEMA,
    zod: LookupZ,
    maxTokens: 1500,
  });
  return { ...r, contextual_meaning: r.arabic, arabic: r.arabic_general || r.arabic, similar: cleanSimilar(r.similar), origin: 'ai' };
}

/* ------------------------------------------------- 3. import enrichment */

const ENRICH_SCHEMA = obj({
  items: {
    type: 'array',
    items: obj({
      input: str, term: str, recognized: { type: 'boolean' }, item_type: { type: 'string', enum: TYPES }, part_of_speech: str,
      level: { type: 'string', enum: LEVELS }, band: { type: 'string', enum: BANDS }, pronunciation: str, arabic: str,
      simple_english: str, example_arabic: str, easy_example: str, easy_example_arabic: str, topic: { type: 'string', enum: TOPICS },
    }),
  },
});
const EnrichZ = z.object({
  items: z.array(z.object({
    input: z.string(), term: z.string(), recognized: z.boolean(), item_type: z.enum(TYPES), part_of_speech: z.string(),
    level: z.enum(LEVELS), band: z.enum(BANDS), pronunciation: z.string(), arabic: z.string(), simple_english: z.string(),
    example_arabic: z.string(), easy_example: z.string(), easy_example_arabic: z.string(), topic: z.enum(TOPICS),
  })),
});

/**
 * Fill missing details for imported words in ONE call.
 * items: [{term, arabic?, example?}] → Map(inputTerm → details)
 */
export async function enrichWithAi(items) {
  if (!items.length) return new Map();
  const list = items.map((it) => `- ${it.term}${it.arabic ? ` (learner's meaning: ${it.arabic})` : ''}${it.example ? ` | example: ${it.example}` : ''}`).join('\n');
  const r = await jsonCall({
    task: 'enrich_import',
    system: 'You complete vocabulary cards for an intermediate Arabic-speaking English learner. For each input return one item (keep "input" exactly as given). "term" is the dictionary form (fix only obvious typos). If the learner gave an Arabic meaning, choose the sense that matches it; if they gave an example, choose the sense used there. If the input is not a real English word or expression, set recognized=false and leave the other text fields empty. example_arabic translates the learner\'s example when one is given, else "".',
    user: list,
    schema: ENRICH_SCHEMA,
    zod: EnrichZ,
    maxTokens: Math.min(32000, 600 * items.length + 1000),
  });
  return new Map(r.items.map((it) => [it.input, { ...it, origin: 'ai' }]));
}

/** Offline details for a term from the curated lexicon (or null). */
export function dictionaryDetails(term) {
  const e = lexicon().get(matchKey(term));
  return e ? { ...e } : null;
}

/* -------------------------------------------------- 4. subtitle translation */

const TRANSLATE_SCHEMA = obj({ lines: { type: 'array', items: obj({ i: { type: 'integer' }, ar: str }) } });
const TranslateZ = z.object({ lines: z.array(z.object({ i: z.number().int(), ar: z.string() })) });

const TRANSLATE_RULES = 'Translate English video subtitles into natural Modern Standard Arabic for a learner reading along, line by line. IMPORTANT: each numbered line is a FRAGMENT of speech, often cut in the middle of a sentence. Translate ONLY the words of that line, in the same order, even when the fragment is incomplete (e.g. "It makes them" → "إنه يجعلهم"). Never move words to or from the neighbouring lines, never merge, split, summarise or skip lines, never leave English words untranslated (names may stay). Return exactly one item per input line, with its number. Use the surrounding lines only to choose the right meaning.';

/**
 * Lines whose Arabic does not belong to them: missing, English left in, or far too long/short
 * for the line (a sign that the model moved a whole sentence into one fragment).
 */
export function suspiciousTranslations(lines, ar) {
  const bad = new Set();
  for (const l of lines) {
    const a = String(ar.get(l.idx) || '').trim();
    const en = String(l.text || '').split(/\s+/).filter(Boolean).length;
    const n = a.split(/\s+/).filter(Boolean).length;
    if (!a) { bad.add(l.idx); continue; }
    if (/\b[a-z]{4,}\b/.test(a)) bad.add(l.idx); // an English word left in the Arabic
    if (en >= 2 && (n > en * 2 + 3 || (en >= 6 && n < en * 0.3))) bad.add(l.idx);
  }
  return bad;
}

/** Translate a batch of transcript lines → Map(idx → Arabic), one line each; asked again strictly if lines got shifted. */
export async function translateWithAi(lines, title = '') {
  const ask = async (strict) => {
    const r = await jsonCall({
      task: 'translate_lines_v2',
      system: TRANSLATE_RULES,
      user: `${strict ? 'Check carefully: one Arabic line per English fragment, nothing moved between lines.\n' : ''}${title ? `Video: ${title}\n` : ''}${lines.map((l) => `[${l.idx}] ${l.text}`).join('\n')}`,
      schema: TRANSLATE_SCHEMA,
      zod: TranslateZ,
      maxTokens: Math.min(32000, 120 * lines.length + 1000),
    });
    return new Map(r.lines.map((l) => [l.i, l.ar]));
  };
  const first = await ask(false);
  const bad = suspiciousTranslations(lines, first);
  if (!bad.size) return first;
  const second = await ask(true).catch(() => null);
  if (!second) return first;
  return suspiciousTranslations(lines, second).size <= bad.size ? second : first;
}

export { findSpan, aiConfigured, aiAvailable, AiError };

/* ------------------------------------------- 4. explain a selected text */

const EXPLAIN_SCHEMA = obj({
  arabic: str, explanation: str, simple_english: str, grammar_note: str,
  key_words: { type: 'array', items: obj({ term: str, arabic: str, level: { type: 'string', enum: LEVELS }, note: str }) },
});
const ExplainZ = z.object({
  arabic: z.string(), explanation: z.string(), simple_english: z.string(), grammar_note: z.string(),
  key_words: z.array(z.object({ term: z.string(), arabic: z.string(), level: z.enum(LEVELS), note: z.string() })),
});

/**
 * Explain a phrase or sentence the learner selected, using only that text and
 * its own sentence as context (never the whole transcript).
 */
export async function explainWithAi({ text, sentence = '', title = '' }) {
  const r = await jsonCall({
    task: 'explain_selection',
    system: 'You help an intermediate Arabic-speaking learner understand English. Explain ONLY the selected text, as used in its sentence. Fields: "arabic" = natural Arabic translation of the selected text in this context; "explanation" = 1–3 short Arabic sentences explaining the meaning, tone and any idiom or phrasal verb; "simple_english" = the same meaning in easy English; "grammar_note" = one short Arabic note about a useful grammar point in it, or ""; "key_words" = 0–6 words or expressions from the selection worth learning (skip very basic words), each with its dictionary form in "term", short Arabic meaning, CEFR level and a short Arabic note (or "").',
    user: `${title ? `Video: ${title}\n` : ''}${sentence && sentence !== text ? `Sentence: ${sentence}\n` : ''}Selected text: ${text}`,
    schema: EXPLAIN_SCHEMA,
    zod: ExplainZ,
    maxTokens: 900,
  });
  return { ...r, key_words: r.key_words.slice(0, 6) };
}

const POS = ['فعل', 'اسم', 'صفة', 'ظرف', 'اسم فاعل', 'أخرى'];
const FORMS_SCHEMA = obj({
  base: str,
  forms: { type: 'array', items: obj({ pos: { type: 'string', enum: POS }, word: str, form: str, arabic: str, example: str, example_ar: str, usage: { type: 'string', enum: ['common', 'medium', 'rare'] } }) },
});
const FormsZ = z.object({
  base: z.string(),
  forms: z.array(z.object({ pos: z.enum(POS), word: z.string(), form: z.string(), arabic: z.string(), example: z.string(), example_ar: z.string(), usage: z.enum(['common', 'medium', 'rare']).optional() })),
});

const isEnglishForm = (f) => /^[a-z][a-z' -]*$/i.test(String(f.word || f.form || '').trim().split(/[(/]/)[0].trim());
/** A stored family is usable when every form is an English word and most have an example. */
export function goodForms(r) {
  const forms = r?.forms || [];
  if (forms.length < 2 || !forms.every(isEnglishForm)) return false;
  return forms.filter((f) => f.example).length >= Math.ceil(forms.length * 0.75);
}

/** Word family: the word as verb / noun / adjective / adverb…, each with an example. Cached per word. */
export async function formsWithAi(word) {
  const { cacheKey, readCache, writeCache } = await import('./ai.js');
  const oldKey = cacheKey('word_forms_v2', `Word: ${word}`);
  const old = await readCache(oldKey).catch(() => null);
  if (goodForms(old)) return { base: old.base, forms: old.forms.filter((f) => f.form || f.word).slice(0, 8) };
  let r;
  try {
    r = await jsonCall({
    task: 'word_forms_v3',
    system: 'You help an Arabic-speaking learner of English. Give the COMPLETE word family of the given English word: every common form as a verb (فعل), noun (اسم), adjective (صفة), adverb (ظرف), person noun (اسم فاعل, e.g. survivor) or other (أخرى) — e.g. survive → survive (فعل), survival (اسم), survivor (اسم فاعل), surviving (صفة). Include every real, commonly used form (2–8), the simplest form first. "base" = the shortest dictionary form. For each form: "word" = the ENGLISH headword only (never Arabic, no slashes or brackets); "form" = the English form (for verbs add past and past participle, e.g. "survive (survived, survived)"); "arabic" = its short Arabic meaning; "example" = one short natural English sentence using exactly that form (REQUIRED for every form); "example_ar" = its Arabic translation (REQUIRED); "usage" = how common that form is in everyday English: "common" (very common, everyday, important), "medium" (less common or a bit advanced), "rare" (rare, formal, technical or not worth learning early).',
    user: `Word: ${word}`,
    schema: FORMS_SCHEMA,
    zod: FormsZ,
    maxTokens: 1100,
    });
  } catch (err) {
    // AI unavailable: show what we have, English forms only
    const keep = (old?.forms || []).filter(isEnglishForm);
    if (keep.length) return { base: old.base, forms: keep };
    throw err;
  }
  const forms = r.forms.filter((f) => (f.form || f.word) && isEnglishForm(f)).slice(0, 8);
  const out = { base: r.base, forms };
  // replace the old family so the whole app (simplest forms, the word panel) uses the good one
  if (forms.length) await writeCache(oldKey, 'word_forms_v2', out).catch(() => {});
  return out;
}

/* ------------------------------------------- words from a photo or a PDF */

const FILE_SCHEMA = obj({
  items: { type: 'array', items: obj({ term: str, arabic: str, level: { type: 'string', enum: LEVELS } }) },
});
const FileZ = z.object({ items: z.array(z.object({ term: z.string(), arabic: z.string(), level: z.enum(LEVELS) })) });

/**
 * Read the English words in an attached photo or PDF.
 * kind: 'image' (data URL) | 'pdf' (data URL).
 */
export async function extractFromFileWithAi({ kind, data, name = 'file.pdf' }) {
  const attachments = kind === 'image'
    ? [{ type: 'image_url', image_url: { url: data } }]
    : [{ type: 'file', file: { filename: name, file_data: data } }];
  const r = await jsonCall({
    task: 'extract_file',
    system: 'You help an intermediate Arabic-speaking learner of English. Read the attached photo or document. If it is a list of words (a vocabulary list, notes, a page of a word book), return every English word or expression in it, in order. If it is running text, return the English words and expressions worth learning for an intermediate learner (skip very basic words like "the", "is", "good"), up to 80. Use the dictionary form (e.g. "decide", not "decided"; keep phrasal verbs and idioms whole). "arabic" = a short natural Arabic meaning; if the document already gives an Arabic meaning, use it. "level" = CEFR level. Return at most 150 items. If there is no English text, return an empty list.',
    user: `Attached ${kind === 'image' ? 'photo' : 'document'}: ${name}`,
    attachments,
    extra: kind === 'pdf' ? { plugins: [{ id: 'file-parser', pdf: { engine: 'pdf-text' } }] } : {},
    schema: FILE_SCHEMA,
    zod: FileZ,
    maxTokens: 6000,
  });
  const seen = new Set();
  return r.items.filter((it) => {
    const k = it.term.trim().toLowerCase();
    if (!k || seen.has(k) || !/[a-z]/i.test(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 150);
}

/* ------------------------------------------------------- a short story */

const STORY_SCHEMA = obj({
  title: str, title_ar: str,
  sentences: { type: 'array', items: obj({ en: str, ar: str }) },
});
const StoryZ = z.object({ title: z.string(), title_ar: z.string(), sentences: z.array(z.object({ en: z.string(), ar: z.string() })) });

/** A short, natural story that uses the learner's words, with an Arabic line under each sentence. */
export async function storyWithAi({ words, level = 'B1' }) {
  const list = words.slice(0, 30).map((w) => `${w.term}${w.arabic ? ` (${w.arabic})` : ''}`).join('\n');
  const n = Math.min(30, words.length);
  const [lo, hi] = n <= 12 ? [10, 16] : [Math.round(n * 0.8), Math.min(36, n + 6)];
  const r = await jsonCall({
    task: 'story',
    system: `You write short stories for an Arabic-speaking learner of English at about ${level} level. Write one coherent, interesting story of ${lo}–${hi} sentences that uses EVERY given word or expression naturally (in the sense of its Arabic meaning), each at least once, in any grammatical form. Keep sentences clear (8–20 words), everyday vocabulary around the target words, no lists. "title" = short English title; "title_ar" = its Arabic; "sentences" = the story in order, each with a natural Arabic translation "ar".`,
    user: `Words:\n${list}`,
    schema: STORY_SCHEMA,
    zod: StoryZ,
    maxTokens: Math.min(9000, 150 * hi + 800),
    cache: false,
  });
  return { ...r, sentences: r.sentences.filter((s) => s.en.trim()).slice(0, 40) };
}

/* ---------------------------------------------------- video suggestions */

const SUGGEST_SCHEMA = obj({
  topics: { type: 'array', items: obj({ query: str, label_ar: str }) },
  videos: { type: 'array', items: obj({ title: str, channel: str, youtube_id: str, minutes: { type: 'number' }, why_ar: str }) },
});
const SuggestZ = z.object({
  topics: z.array(z.object({ query: z.string(), label_ar: z.string() })),
  videos: z.array(z.object({ title: z.string(), channel: z.string(), youtube_id: z.string(), minutes: z.number(), why_ar: z.string() })),
});

/** Ideas for the next videos: similar topics and length, for an intermediate learner. */
export async function suggestVideosWithAi({ titles, duration, day, fresh = false, channel = '' }) {
  const span = { short: 'under 5 minutes', medium: '5 to 20 minutes', long: 'over 20 minutes' }[duration] || '5 to 20 minutes';
  return jsonCall({
    task: 'suggest_videos',
    system: 'You recommend YouTube videos for an intermediate Arabic-speaking learner of English. Recommend real, popular, well-known videos with clear English and English captions (TED, TED-Ed, Kurzgesagt, BBC Learning English, Vox, popular educational channels, etc.) on topics similar to the videos the learner watched, matching the requested length. "youtube_id" = the 11-character video id only if you are confident it is correct, else an empty string. "minutes" = approximate length. "why_ar" = one short Arabic sentence on why it suits the learner. Also give 6 short YouTube search queries ("query", English) on related topics with an Arabic label ("label_ar"). Up to 10 videos.',
    user: `Requested length: ${span}\nDate: ${day}${fresh ? `\nVariant: ${Date.now()}` : ''}${channel ? `\nOnly videos from the YouTube channel: ${channel} (any length)` : ''}\nVideos the learner watched recently:\n${titles.length ? titles.map((t) => `- ${t}`).join('\n') : '- (none yet: suggest varied general-interest topics)'}`,
    schema: SUGGEST_SCHEMA,
    zod: SuggestZ,
    maxTokens: 1800,
  });
}

/* ------------------------------------- phrase-by-phrase Arabic alignment */

const ALIGN_SCHEMA = obj({
  lines: { type: 'array', items: obj({ i: { type: 'integer' }, chunks: { type: 'array', items: obj({ en: str, ar: str }) } }) },
});
const AlignZ = z.object({ lines: z.array(z.object({ i: z.number().int(), chunks: z.array(z.object({ en: z.string(), ar: z.string() })) })) });

/** For each line: short meaning units with their Arabic, in order. → Map(idx → chunks) */
export async function alignWithAi(lines, title = '') {
  const r = await jsonCall({
    task: 'align_lines',
    system: 'You help an Arabic-speaking learner follow English video subtitles phrase by phrase, like parallel subtitles. For each numbered line, split the English into consecutive short units of about 2–7 words: always break at commas, full stops, question marks, dashes and at every "‖" (where the speaker pauses; never include "‖" in the output), and otherwise at natural meaning boundaries (keep phrasal verbs, idioms and names together). Copy the English words EXACTLY and in order: do not add, drop, reorder or change any word (punctuation may stay attached). Give each unit its Arabic meaning ("ar") so that reading the Arabic units in order gives a natural, faithful Modern Standard Arabic translation of the line. Keep the numbering in "i".',
    user: `${title ? `Video: ${title}\n` : ''}${lines.map((l) => `[${l.idx}] ${l.text}`).join('\n')}`,
    schema: ALIGN_SCHEMA,
    zod: AlignZ,
    maxTokens: Math.min(16000, 220 * lines.length + 800),
  });
  return new Map(r.lines.map((l) => [l.i, l.chunks]));
}

/* ------------------------------------------------- new words to learn */

const SUGGEST_WORDS_SCHEMA = obj({
  items: { type: 'array', items: obj({ term: str, arabic: str, level: { type: 'string', enum: LEVELS }, example: str, example_ar: str }) },
});
const SuggestWordsZ = z.object({ items: z.array(z.object({ term: z.string(), arabic: z.string(), level: z.enum(LEVELS), example: z.string(), example_ar: z.string() })) });

/** Useful words in a field, avoiding words the learner already has. */
export async function suggestWordsWithAi({ count, topic = '', level = '', avoid = [] }) {
  return jsonCall({
    task: 'suggest_words',
    system: 'You suggest English vocabulary for an Arabic-speaking learner of English. Suggest useful, commonly used words and expressions (single words, phrasal verbs, collocations) for the requested field and level, varied, in dictionary form, none of the listed words to avoid. "arabic" = short natural Arabic meaning; "example" = one natural example sentence (8–16 words); "example_ar" = its Arabic translation.',
    user: `Number of items: ${count}\nField: ${topic || 'general everyday English'}\nLevel: ${level || 'a balanced mix of ALL levels A1, A2, B1, B2, C1 and C2'}\nVariant: ${Date.now()}\nAvoid: ${avoid.slice(0, 400).join(', ') || '(none)'}`,
    schema: SUGGEST_WORDS_SCHEMA,
    zod: SuggestWordsZ,
    maxTokens: Math.min(12000, 160 * count + 600),
    cache: false,
  });
}

/* ------------------------------------------ building the built-in dictionary */

const DICT_SCHEMA = obj({
  items: {
    type: 'array',
    items: obj({
      input: str, skip: { type: 'boolean' }, lemma: str, part_of_speech: str, level: { type: 'string', enum: LEVELS },
      arabic: str, simple_english: str, pronunciation: str, example: str, example_ar: str,
      inflections: { type: 'array', items: str },
      family: { type: 'array', items: obj({ pos: { type: 'string', enum: POS }, word: str, arabic: str }) },
    }),
  },
});
const DictZ = z.object({
  items: z.array(z.object({
    input: z.string(), skip: z.boolean(), lemma: z.string(), part_of_speech: z.string(), level: z.enum(LEVELS),
    arabic: z.string(), simple_english: z.string(), pronunciation: z.string(), example: z.string(), example_ar: z.string(),
    inflections: z.array(z.string()), family: z.array(z.object({ pos: z.enum(POS), word: z.string(), arabic: z.string() })),
  })),
});

/** Dictionary entries for frequent words (one per input), for an Arabic-speaking learner. */
export async function dictionaryBatchWithAi(words) {
  const r = await jsonCall({
    task: 'dictionary_batch',
    system: 'You write a bilingual English–Arabic learner dictionary. For EACH input word return one item (keep "input" exactly). Set skip=true (other fields empty) for personal names, place names, brands, interjections and fillers (uh, hey), fragments of contractions (don, didn), vulgar words and non-English tokens. Otherwise: "lemma" = the dictionary form of the input (went→go, children→child, better→good only if it is the comparative; keep words like "completely" or "decision" as their own lemma); "part_of_speech" in English (noun, verb, adjective, adverb, phrasal verb…); "level" = CEFR A1–C2; "arabic" = the most common Arabic meanings, natural and accurate, up to three separated by " / "; "simple_english" = a short easy definition; "pronunciation" = IPA in slashes; "example" = one short natural sentence, "example_ar" = its Arabic; "inflections" = the lemma\'s inflected forms (plural, -s, past, past participle, -ing, comparative, superlative) that exist; "family" = the other common words of the same family with a different part of speech (فعل، اسم، صفة، ظرف، اسم فاعل), each with a short Arabic meaning — up to 5.',
    user: words.join('\n'),
    schema: DICT_SCHEMA,
    zod: DictZ,
    maxTokens: Math.min(16000, 260 * words.length + 600),
    timeoutMs: 50000,
    cache: false,
  });
  return r.items;
}

/* ------------------------------------------------------- video summary */

const SUMMARY_SCHEMA = obj({
  idea: str, benefit: str,
  points: { type: 'array', items: str },
  steps: { type: 'array', items: str },
  quotes: { type: 'array', items: obj({ en: str, ar: str }) },
});
const SummaryZ = z.object({
  idea: z.string(), benefit: z.string(), points: z.array(z.string()), steps: z.array(z.string()),
  quotes: z.array(z.object({ en: z.string(), ar: z.string() })),
});

/** A complete Arabic summary of a video: idea, value, key points, practical steps, quotes. Cached per transcript. */
export async function summaryWithAi({ title, text }) {
  return jsonCall({
    task: 'video_summary',
    system: 'You summarise English videos for an Arabic-speaking learner, in clear Modern Standard Arabic. Fields: "idea" = the main idea in 2–3 sentences; "benefit" = what the viewer gains from this video, 1–2 sentences; "points" = 3–7 key points (one sentence each); "steps" = practical, actionable steps the video recommends, in order (empty list if it has none); "quotes" = 2–5 memorable sentences or pieces of wisdom quoted EXACTLY from the transcript in English ("en") with a natural Arabic translation ("ar"). Be faithful to the transcript; do not invent content.',
    user: `Title: ${title}\n\nTranscript:\n${text.slice(0, 60000)}`,
    schema: SUMMARY_SCHEMA,
    zod: SummaryZ,
    maxTokens: 2500,
    timeoutMs: 50000,
  });
}

/* ------------------------------------------------- similar channels */

const CHANNELS_SCHEMA = obj({ channels: { type: 'array', items: obj({ name: str, handle: str, field: str, why_ar: str }) } });
const ChannelsZ = z.object({ channels: z.array(z.object({ name: z.string(), handle: z.string(), field: z.string(), why_ar: z.string() })) });

/** Real, popular English-language YouTube channels like the learner's. */
export async function suggestChannelsWithAi({ names }) {
  return jsonCall({
    task: 'suggest_channels',
    system: 'You recommend real, popular English-language YouTube channels with clear speech and captions, similar to the channels the learner watches, for an Arabic-speaking learner of English. Up to 10, not the given ones. "handle" = the channel\'s @handle without "@" only if you are sure, else "". "field" = a short Arabic topic name. "why_ar" = one short Arabic sentence.',
    user: `Channels the learner watches:\n${names.map((n) => `- ${n}`).join('\n')}`,
    schema: CHANNELS_SCHEMA,
    zod: ChannelsZ,
    maxTokens: 1200,
    cache: false,
  });
}

const LADDER_SCHEMA = obj({ items: { type: 'array', items: obj({ term: str, level: { type: 'string', enum: LEVELS }, arabic: str, note_ar: str, example: str }) } });
const LadderZ = z.object({ items: z.array(z.object({ term: z.string(), level: z.enum(LEVELS), arabic: z.string(), note_ar: z.string(), example: z.string() })) });

/** Words with the same meaning from simple to advanced (big → large → huge → enormous → colossal). */
export async function ladderWithAi({ term, arabic }) {
  return jsonCall({
    task: 'meaning_ladder',
    system: 'You help an Arabic-speaking learner of English. For the given word, list 4–7 English words or short expressions with the SAME core meaning, from the simplest everyday word (A1/A2) to formal or advanced ones (C1/C2), including the given word. Use dictionary forms (the shortest basic form, e.g. "decide" not "decision" when the meaning allows). "level" = CEFR; "arabic" = short Arabic meaning; "note_ar" = a very short Arabic note on when to use it (formal, spoken, stronger…); "example" = one short natural English sentence. Order from simplest to most advanced.',
    user: `Word: ${term}${arabic ? `\nArabic meaning: ${arabic}` : ''}`,
    schema: LADDER_SCHEMA,
    zod: LadderZ,
    maxTokens: 900,
  });
}

const FORMS_BATCH_SCHEMA = obj({ items: { type: 'array', items: obj({ input: str, base: str, forms: FORMS_SCHEMA.properties.forms }) } });
const FormsBatchZ = z.object({ items: z.array(z.object({ input: z.string(), base: z.string(), forms: FormsZ.shape.forms })) });

/** The complete word family of several words at once (to prepare the built-in dictionary). */
export async function formsBatchWithAi(words) {
  const r = await jsonCall({
    task: 'forms_batch',
    system: 'You help Arabic-speaking learners of English. For EACH input word (keep "input" exactly) give its COMPLETE word family: every common form as a verb (فعل), noun (اسم), adjective (صفة), adverb (ظرف), person noun (اسم فاعل) or other (أخرى) — e.g. survive → survive, survival, survivor, surviving. 2–7 real forms, the simplest form first; "base" = the shortest dictionary form. For each form: "word" = the ENGLISH headword only (never Arabic); "form" = the English form (verbs: add past and past participle, e.g. "survive (survived, survived)"); "arabic" = short Arabic meaning; "example" = one short natural English sentence using exactly that form; "example_ar" = its Arabic translation; "usage" = "common" (everyday, important), "medium" (less common / a bit advanced) or "rare" (rare, formal, technical, not worth learning early).',
    user: words.join('\n'),
    schema: FORMS_BATCH_SCHEMA,
    zod: FormsBatchZ,
    maxTokens: Math.min(16000, 520 * words.length + 400),
    timeoutMs: 50000,
    cache: false,
  });
  return r.items;
}

const SYN_SCHEMA = obj({ items: { type: 'array', items: obj({ word: str, arabic: str, level: { type: 'string', enum: LEVELS } }) } });
const SynZ = z.object({ items: z.array(z.object({ word: z.string(), arabic: z.string(), level: z.enum(LEVELS) })) });

/** 1–5 easier, more common English words with the same meaning (shortest basic forms), each with a short Arabic meaning. */
export async function synonymsWithAi(word) {
  const r = await jsonCall({
    task: 'easy_synonyms',
    system: 'You help an Arabic-speaking learner of English. For the given English word, give 1–5 EASIER and MORE COMMON English words or very short phrases with the same core meaning, easiest and most common first. Use the shortest basic dictionary form (e.g. "decide", "help", "big"). Never repeat the given word. "arabic" = a very short Arabic meaning (one or two words). "level" = CEFR.',
    user: `Word: ${word}`,
    schema: SYN_SCHEMA,
    zod: SynZ,
    maxTokens: 300,
  });
  const seen = new Set([word.toLowerCase()]);
  return r.items.filter((it) => {
    const w = it.word.trim().toLowerCase();
    if (!w || seen.has(w) || !/^[a-z][a-z' -]*$/.test(w)) return false;
    seen.add(w);
    return true;
  }).slice(0, 5);
}

const RECAP_SCHEMA = obj({ text: str });
const RecapZ = z.object({ text: z.string() });

/** A very short recap of a part of the video in casual, everyday Saudi Arabic (readable in ~15 seconds). */
export async function recapWithAi({ title, text }) {
  const r = await jsonCall({
    task: 'recap_saudi',
    system: 'You summarise part of an English video for a Saudi viewer. Write ONE short, natural paragraph in casual everyday Saudi Arabic (white Saudi dialect, friendly and spontaneous, like telling a friend "السالفة باختصار…"), saying what the speaker is really getting at, concretely, with no bullet points, no English and no emojis. Maximum 30 words, readable in 15 seconds.',
    user: `${title ? `Video: ${title}\n` : ''}Part of the transcript:\n${text.slice(0, 6000)}`,
    schema: RECAP_SCHEMA,
    zod: RecapZ,
    maxTokens: 250,
  });
  return r.text.trim();
}
