// Turns a transcript into a short list of vocabulary worth learning for an
// intermediate (B1–B2) Arabic-speaking learner.
//
// Two engines:
//   * claude      — context-aware extraction with Claude (needs ANTHROPIC_API_KEY
//                   or another Anthropic credential on the server). Arabic meanings
//                   follow the actual sentence in the video.
//   * dictionary  — offline fallback: matches the transcript against a curated
//                   B1–C1 lexicon. Meanings are the dictionary's general sense.
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { RICH } from './lexicon-rich.js';
import { COMPACT } from './lexicon-compact.js';
import { normaliseTerm } from './db.js';

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
const TOPICS = ['business', 'work', 'academic', 'daily', 'media', 'tech', 'emotions', 'health', 'travel', 'society'];
const TYPES = ['word', 'phrasal verb', 'idiom', 'collocation', 'expression'];

export function claudeConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);
}

/* ------------------------------------------------------------ sentences */

/**
 * Merge caption segments into sentences, each with the start time of the
 * segment where the sentence begins. Auto-captions often have no punctuation,
 * so we also cut long runs at ~28 words.
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
    const clean = seg.text.replace(/\[(?:music|applause|laughter)\]/gi, '').replace(/>>/g, '').trim();
    if (!clean) continue;
    const parts = clean.split(/(?<=[.!?])\s+/);
    for (const part of parts) {
      if (start === null) start = seg.start;
      buf.push(part);
      const words = buf.join(' ').split(' ').length;
      if (/[.!?]["”’)]?$/.test(part) || words >= 28) flush();
    }
  }
  flush();
  return out;
}

const fmt = (s) => {
  if (s === null || s === undefined) return '--:--';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};

/* --------------------------------------------------------------- claude */

const SimilarSchema = z.object({ word: z.string(), arabic: z.string(), note: z.string() });
const ItemSchema = z.object({
  term: z.string().min(1),
  item_type: z.enum(TYPES),
  part_of_speech: z.string(),
  level: z.enum(['B1', 'B2', 'C1']),
  usefulness: z.number(),
  pronunciation: z.string(),
  arabic: z.string(),
  arabic_general: z.string(),
  simple_english: z.string(),
  context: z.string(),
  context_arabic: z.string(),
  timestamp_seconds: z.number().nullable(),
  topic: z.enum(TOPICS),
  example: z.string(),
  example_arabic: z.string(),
  easy_example: z.string(),
  easy_example_arabic: z.string(),
  similar: z.array(SimilarSchema),
});
const ResultSchema = z.object({ items: z.array(ItemSchema) });

const str = { type: 'string' };
const JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'term', 'item_type', 'part_of_speech', 'level', 'usefulness', 'pronunciation', 'arabic', 'arabic_general',
          'simple_english', 'context', 'context_arabic', 'timestamp_seconds', 'topic', 'example', 'example_arabic',
          'easy_example', 'easy_example_arabic', 'similar',
        ],
        properties: {
          term: str,
          item_type: { type: 'string', enum: TYPES },
          part_of_speech: str,
          level: { type: 'string', enum: ['B1', 'B2', 'C1'] },
          usefulness: { type: 'integer' },
          pronunciation: str,
          arabic: str,
          arabic_general: str,
          simple_english: str,
          context: str,
          context_arabic: str,
          timestamp_seconds: { type: ['integer', 'null'] },
          topic: { type: 'string', enum: TOPICS },
          example: str,
          example_arabic: str,
          easy_example: str,
          easy_example_arabic: str,
          similar: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['word', 'arabic', 'note'],
              properties: { word: str, arabic: str, note: str },
            },
          },
        },
      },
    },
  },
};

const SYSTEM = `You are an expert English teacher who builds vocabulary lessons for an intermediate (B1–B2) English learner whose first language is Arabic. You read a YouTube transcript and choose only the vocabulary that is genuinely worth this learner's time.

Choose items that:
- are CEFR B1, B2 or C1, and useful in real conversation, university, work, media or everyday English;
- include multi-word items as ONE item when they carry one meaning: phrasal verbs ("come across", "figure something out"), idioms ("take something for granted"), collocations and fixed expressions. Write separable phrasal verbs and idioms in dictionary form with "something"/"someone" slots.

Never include: very basic or obvious words (A1–A2), names of people, brands, places, numbers, filler words ("um", "like", "you know"), duplicates or inflected variants of an item you already chose, extremely rare or archaic words, or narrow technical jargon the learner won't reuse.

Quality matters far more than quantity. A typical 10-minute video yields roughly 12–25 items; never pad the list.

For every item:
- term: dictionary form (lemma); for phrases use the canonical form.
- usefulness: 0–100, how much learning this item will help this learner in real life.
- pronunciation: IPA in slashes, British or American consistently.
- arabic: the Arabic meaning AS USED IN THIS VIDEO'S SENTENCE (Modern Standard Arabic, short, may give two close options separated by " / "). Do not just give the first dictionary sense — read the context.
- arabic_general: the most common general Arabic meaning.
- simple_english: a simple definition using easier words than the term.
- context: copy the sentence from the transcript exactly where the item appears (fix only obvious caption spacing).
- context_arabic: natural Arabic translation of that context sentence.
- timestamp_seconds: the start time in seconds of the transcript line containing the context (use the [time] markers; null if the transcript has none).
- example: a new, natural example sentence (different from the context).
- easy_example: a very short, easy example sentence (A2–B1 words around the target).
- similar: 1–3 EASIER words or phrases with similar meaning, each with Arabic; if not an exact synonym, explain the difference in a short English note, otherwise note "".
- topic: the best-fitting topic.

Order items from most to least useful.`;

function transcriptForPrompt(sentences) {
  return sentences.map((s) => `[${s.start === null ? '--:--' : `${fmt(s.start)} | ${Math.floor(s.start)}s`}] ${s.text}`).join('\n');
}

export class ExtractionError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

async function callClaude(params) {
  const client = new Anthropic();
  try {
    // Opt into server-side refusal fallbacks: if the model declines, the API reroutes.
    const stream = client.beta.messages.stream({
      ...params,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    return await stream.finalMessage();
  } catch (err) {
    if (err instanceof Anthropic.BadRequestError && /fallback/i.test(err.message)) {
      // Account/platform without server-side fallbacks: retry plainly.
      return client.messages.stream(params).finalMessage();
    }
    throw err;
  }
}

async function extractWithClaude({ title, channel, sentences }) {
  const transcript = transcriptForPrompt(sentences);
  let message;
  try {
    message = await callClaude({
      model: MODEL,
      max_tokens: 64000,
      system: SYSTEM,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: JSON_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: `Video title: ${title}\nChannel: ${channel || 'unknown'}\n\n<transcript>\n${transcript}\n</transcript>\n\nExtract the vocabulary items worth learning.`,
        },
      ],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new ExtractionError('The AI key on the server is invalid. Check ANTHROPIC_API_KEY.', 500);
    if (err instanceof Anthropic.RateLimitError) throw new ExtractionError('The AI service is busy (rate limit). Please try again in a minute.', 503);
    if (err instanceof Anthropic.APIConnectionError) throw new ExtractionError('Could not reach the AI service from the server.', 503);
    if (err instanceof Anthropic.APIError) throw new ExtractionError(`AI analysis failed: ${err.message}`, 502);
    throw err;
  }
  if (message.stop_reason === 'refusal') throw new ExtractionError('The AI declined to analyse this transcript.', 422);
  if (message.stop_reason === 'max_tokens') throw new ExtractionError('The transcript produced too much output to analyse in one pass.', 422);
  const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let parsed;
  try {
    parsed = ResultSchema.parse(JSON.parse(text));
  } catch {
    throw new ExtractionError('The AI returned an unexpected format. Please try again.', 502);
  }
  return parsed.items.map((it) => ({
    ...it,
    usefulness: Math.max(0, Math.min(100, Math.round(it.usefulness))),
    contextual_meaning: it.arabic,
    arabic: it.arabic_general || it.arabic,
    similar: it.similar.map((s) => (s.note ? s : { word: s.word, arabic: s.arabic })),
  }));
}

/* ----------------------------------------------------------- dictionary */

const IRREGULAR = {
  be: ['be', 'is', 'are', 'am', 'was', 'were', 'been', 'being'],
  take: ['take', 'takes', 'took', 'taken', 'taking'],
  come: ['come', 'comes', 'came', 'coming'],
  get: ['get', 'gets', 'got', 'gotten', 'getting'],
  give: ['give', 'gives', 'gave', 'given', 'giving'],
  go: ['go', 'goes', 'went', 'gone', 'going'],
  bring: ['bring', 'brings', 'brought', 'bringing'],
  keep: ['keep', 'keeps', 'kept', 'keeping'],
  put: ['put', 'puts', 'putting'],
  make: ['make', 'makes', 'made', 'making'],
  run: ['run', 'runs', 'ran', 'running'],
  set: ['set', 'sets', 'setting'],
  stand: ['stand', 'stands', 'stood', 'standing'],
  break: ['break', 'breaks', 'broke', 'broken', 'breaking'],
  cut: ['cut', 'cuts', 'cutting'],
  catch: ['catch', 'catches', 'caught', 'catching'],
  let: ['let', 'lets', 'letting'],
  deal: ['deal', 'deals', 'dealt', 'dealing'],
  overcome: ['overcome', 'overcomes', 'overcame', 'overcoming'],
  undertake: ['undertake', 'undertakes', 'undertook', 'undertaken', 'undertaking'],
  underestimate: ['underestimate', 'underestimates', 'underestimated', 'underestimating'],
  seek: ['seek', 'seeks', 'sought', 'seeking'],
  think: ['think', 'thinks', 'thought', 'thinking'],
};

function inflections(word, pos) {
  if (IRREGULAR[word]) return IRREGULAR[word];
  const forms = new Set([word]);
  const isVerb = !pos || pos.includes('verb');
  const isNoun = !pos || pos.includes('noun');
  if (isNoun || isVerb) {
    if (/(s|x|z|ch|sh)$/.test(word)) forms.add(`${word}es`);
    else if (/[^aeiou]y$/.test(word)) forms.add(`${word.slice(0, -1)}ies`);
    else forms.add(`${word}s`);
  }
  if (isVerb) {
    if (word.endsWith('e')) {
      forms.add(`${word}d`);
      forms.add(`${word.slice(0, -1)}ing`);
    } else if (/[^aeiou]y$/.test(word)) {
      forms.add(`${word.slice(0, -1)}ied`);
      forms.add(`${word}ing`);
    } else {
      forms.add(`${word}ed`);
      forms.add(`${word}ing`);
      if (/^[^aeiou]*[aeiou][^aeiouwxy]$/.test(word)) {
        const last = word.at(-1);
        forms.add(`${word}${last}ed`);
        forms.add(`${word}${last}ing`);
      }
    }
  }
  if (pos === 'adjective' && word.endsWith('e')) forms.add(`${word}r`);
  return [...forms];
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const OBJ = "(?:it|them|him|her|me|us|you|this|that|these|those|things|everything|something|someone|[a-z']+(?:\\s+[a-z']+){0,2})";
const PRONOUN_OBJ = '(?:it|them|him|her|me|us|you|this|that|things|everything)';

function buildPattern(term, pos, type) {
  const words = term.toLowerCase().split(/\s+/);
  let body = '';
  words.forEach((w, i) => {
    let part;
    if (w === 'something' || w === 'someone') {
      // Slots are optional: "figure out how…" and "figure the problem out" both match.
      body += `(?:\\s+${OBJ})?`;
      return;
    }
    if (w === 'your') part = "(?:my|your|his|her|our|their|its|one's)";
    else if (i === 0 && words.length > 1) part = `(?:${inflections(w, 'verb').map(esc).join('|')})`;
    else if (words.length === 1) part = `(?:${inflections(w, pos).map(esc).join('|')})`;
    else part = esc(w);
    body += i === 0 ? part : `\\s+${part}`;
  });
  // Separable two-word phrasal verbs: "turn it down", "point this out".
  if (type === 'phrasal verb' && words.length === 2) {
    const [verb, particle] = words;
    body = `(?:${inflections(verb, 'verb').map(esc).join('|')})(?:\\s+${PRONOUN_OBJ})?\\s+${esc(particle)}`;
  }
  return new RegExp(`\\b${body}\\b`, 'i');
}

let DICTIONARY;
function dictionary() {
  if (DICTIONARY) return DICTIONARY;
  const map = new Map();
  for (const r of RICH) map.set(normaliseTerm(r.term), { ...r, rich: true });
  for (const [term, level, pos, type, arabic, simple, topic, usefulness] of COMPACT) {
    const key = normaliseTerm(term);
    if (map.has(key)) continue;
    map.set(key, { term, level, part_of_speech: pos, item_type: type, arabic, simple_english: simple, topic, usefulness, similar: [] });
  }
  DICTIONARY = [...map.values()].map((entry) => ({ entry, re: buildPattern(entry.term, entry.part_of_speech, entry.item_type) }));
  return DICTIONARY;
}

function extractWithDictionary({ sentences }) {
  const hits = new Map();
  for (const { entry, re } of dictionary()) {
    for (const s of sentences) {
      if (!re.test(s.text)) continue;
      const key = normaliseTerm(entry.term);
      const h = hits.get(key);
      if (h) h.count += 1;
      else hits.set(key, { entry, sentence: s, count: 1 });
    }
  }
  // Prefer a phrase over a single word it contains (e.g. "figure out" vs "figure").
  const items = [...hits.values()]
    .map(({ entry, sentence, count }) => ({
      term: entry.term,
      item_type: entry.item_type,
      part_of_speech: entry.part_of_speech,
      level: entry.level,
      usefulness: Math.min(100, entry.usefulness + Math.min(6, (count - 1) * 2)),
      pronunciation: entry.pronunciation || null,
      arabic: entry.arabic,
      contextual_meaning: entry.arabic,
      simple_english: entry.simple_english,
      context: sentence.text,
      context_arabic: null,
      timestamp_seconds: sentence.start === null ? null : Math.floor(sentence.start),
      topic: entry.topic,
      example: entry.example || null,
      example_arabic: entry.example_arabic || null,
      easy_example: entry.easy_example || null,
      easy_example_arabic: entry.easy_example_arabic || null,
      similar: entry.similar || [],
    }))
    .sort((a, b) => b.usefulness - a.usefulness);
  return items.slice(0, 40);
}

/* ---------------------------------------------------------------- main */

/** Locate the transcript sentence that best matches the model's context. */
function alignTimestamp(item, sentences) {
  if (!sentences.length || sentences[0].start === null) return item.timestamp_seconds ?? null;
  const target = normaliseTerm(item.context).slice(0, 60);
  const found = sentences.find((s) => normaliseTerm(s.text).includes(target.slice(0, 40)));
  if (found) return Math.floor(found.start);
  return item.timestamp_seconds ?? null;
}

/**
 * @returns {{items: object[], engine: 'claude'|'dictionary', word_count: number}}
 */
export async function extractVocabulary({ title, channel, segments, engine = 'auto' }) {
  const sentences = toSentences(segments);
  const wordCount = sentences.reduce((n, s) => n + s.text.split(/\s+/).length, 0);
  if (wordCount < 30) throw new ExtractionError('The transcript is too short to analyse.', 422);

  const useClaude = engine === 'claude' || (engine === 'auto' && claudeConfigured());
  let items;
  if (useClaude) {
    items = await extractWithClaude({ title, channel, sentences });
    items = items.map((it) => ({ ...it, timestamp_seconds: alignTimestamp(it, sentences) }));
  } else {
    items = extractWithDictionary({ sentences });
  }
  // De-duplicate by normalised term.
  const seen = new Set();
  items = items.filter((it) => {
    const key = normaliseTerm(it.term);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { items, engine: useClaude ? 'claude' : 'dictionary', word_count: wordCount };
}
