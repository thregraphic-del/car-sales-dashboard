// Deterministic matching of vocabulary items inside text (inflections,
// separable phrasal verbs, "something/someone" slots) + the offline lexicon.
import { RICH } from './lexicon-rich.js';
import { COMPACT } from './lexicon-compact.js';
import { matchKey } from '../public/js/shared/text.js';

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

export function buildPattern(term, pos, type) {
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

/** First match of a vocabulary item in a line → {start, end, text} or null. */
const PARTICLES = new Set(['up', 'down', 'out', 'off', 'in', 'on', 'over', 'back', 'away', 'through', 'around', 'apart', 'aside']);

function guessType(term) {
  const words = term.trim().toLowerCase().split(/\s+/);
  if (words.length === 1) return 'word';
  if (words.length === 2 && PARTICLES.has(words[1])) return 'phrasal verb';
  return 'expression';
}

export function findSpan(term, text, { pos, type } = {}) {
  const t = type && type !== 'word' && type !== 'expression' ? type : guessType(term);
  const re = buildPattern(term, pos, t);
  const m = re.exec(text);
  return m ? { start: m.index, end: m.index + m[0].length, text: m[0] } : null;
}

let LEXICON;
/** Curated offline lexicon keyed by match key (rich entries win). */
export function lexicon() {
  if (LEXICON) return LEXICON;
  LEXICON = new Map();
  for (const r of RICH) LEXICON.set(matchKey(r.term), { ...r, origin: 'dictionary' });
  for (const [term, level, pos, type, arabic, simple, topic, usefulness] of COMPACT) {
    const key = matchKey(term);
    if (LEXICON.has(key)) continue;
    LEXICON.set(key, { term, level, part_of_speech: pos, item_type: type, arabic, simple_english: simple, topic, usefulness, similar: [], origin: 'dictionary' });
  }
  return LEXICON;
}

let PATTERNS;
export function lexiconPatterns() {
  if (!PATTERNS) PATTERNS = [...lexicon().values()].map((entry) => ({ entry, re: buildPattern(entry.term, entry.part_of_speech, entry.item_type) }));
  return PATTERNS;
}
