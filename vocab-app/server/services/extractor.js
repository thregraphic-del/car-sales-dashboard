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
export function toSentences(segments) {
  const out = [];
  let buf = [];
  let start = null;
  const flush = () => {
    const text = buf.join(' ').replace(/\s+/g, ' ').trim();
    if (text) out.push({ text, start });
    buf = [];
    start = null;
  };
  for (const seg of segments) {
    const clean = String(seg.text).replace(/\[(?:music|applause|laughter)\]/gi, '').replace(/>>/g, '').trim();
    if (!clean) continue;
    for (const part of clean.split(/(?<=[.!?])\s+/)) {
      if (start === null) start = seg.start ?? null;
      buf.push(part);
      if (/[.!?]["”’)]?$/.test(part) || buf.join(' ').split(' ').length >= 28) flush();
    }
  }
  flush();
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

const EXTRACT_SYSTEM = `You are an expert English teacher building vocabulary lessons for an intermediate (B1–B2) English learner whose first language is Arabic. You read a numbered transcript and choose the vocabulary worth this learner's time.

Basic A1–A2 words and grammar words are handled separately — do not list them. Choose:
- B1–C2 words and expressions useful in conversation, university, work, media and everyday life (band "useful" for B1–B2, "advanced" for C1–C2);
- domain terms that are central to this video and reusable in its field (band "specialized", e.g. finance or data terms);
- multi-word items as ONE item when they carry one meaning (phrasal verbs, idioms, collocations, fixed expressions), written in dictionary form with "something"/"someone" slots.
Never include names of people, brands or places, numbers, filler words, duplicates or inflected variants of an item already chosen, or archaic words.

Quality over quantity: roughly 2 items per minute of video, never padding the list.

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
    task: 'extract_chunk',
    system: `${EXTRACT_SYSTEM}\n\nYou receive one part of a longer transcript. Choose only from these lines; at most one item per two lines. Leave out example fields — they are not needed here.`,
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

/** Translate a batch of transcript lines → Map(idx → Arabic). */
export async function translateWithAi(lines, title = '') {
  const r = await jsonCall({
    task: 'translate_lines',
    system: 'Translate English video subtitles into natural Modern Standard Arabic for a learner reading along. Translate each numbered line separately, keeping the numbering; keep the meaning faithful and concise. Use the surrounding lines for context.',
    user: `${title ? `Video: ${title}\n` : ''}${lines.map((l) => `[${l.idx}] ${l.text}`).join('\n')}`,
    schema: TRANSLATE_SCHEMA,
    zod: TranslateZ,
    maxTokens: Math.min(32000, 120 * lines.length + 1000),
  });
  return new Map(r.lines.map((l) => [l.i, l.ar]));
}

export { findSpan, aiConfigured, aiAvailable, AiError };
