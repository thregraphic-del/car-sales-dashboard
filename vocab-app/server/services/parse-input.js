// Understands whatever the learner pastes — word lists, "word = معنى",
// word + example, messy notes, or a full English text — without requiring
// any format. Purely deterministic; AI only fills missing details later.
import { ARABIC_RE, LATIN_RE, matchKey, lemmaCandidates } from '../../public/js/shared/text.js';

const POS_HINTS = {
  n: 'noun', noun: 'noun', v: 'verb', verb: 'verb', adj: 'adjective', adjective: 'adjective', adv: 'adverb',
  adverb: 'adverb', phr: 'phrase', phrase: 'phrase', 'phr v': 'phrasal verb', 'phrasal verb': 'phrasal verb',
  idiom: 'idiom', prep: 'preposition', conj: 'conjunction',
};
const SEP = /\s*(?:=|:|—|–|->|→|\||\t| - )\s*/;

const words = (s) => s.trim().split(/\s+/).filter(Boolean);

/** Is this English line a sentence (example / text) rather than a vocabulary item? */
export function isSentence(s) {
  const n = words(s).length;
  if (n >= 6) return true;
  if (n >= 3 && /[.!?]["”']?$/.test(s.trim())) return true;
  return false;
}

function stripBullet(line) {
  return line.replace(/^\s*(?:[-*•·▪◦–]|\d{1,3}[.)-]|[a-z][.)])\s+/i, '').trim();
}

function splitPos(term) {
  // "accurate (adj)", "accurate adj.", "improve [v]"
  const m = term.match(/^(.*?)[\s,]*[([]?\s*(n|noun|v|verb|adj|adjective|adv|adverb|phr v|phrasal verb|phr|phrase|idiom|prep|conj)\.?\s*[)\]]?$/i);
  if (m && m[1] && words(m[1]).length >= 1 && (term.includes('(') || term.includes('[') || /\s(adj|adv|n|v)\.$/i.test(term))) {
    return { term: m[1].trim(), pos: POS_HINTS[m[2].toLowerCase()] };
  }
  return { term, pos: null };
}

function cleanTerm(s) {
  return s.replace(/^["'“”‘’(]+|["'“”‘’),.;:!?]+$/g, '').replace(/\s+/g, ' ').trim();
}

const cleanArabic = (s) => s.replace(/^[\s(=:—–|-]+|[\s)=:—–|-]+$/g, '').trim();

/** Does the sentence use the term (any inflection)? */
export function sentenceUses(sentence, term) {
  const key = matchKey(term);
  if (!key) return false;
  const tokens = sentence.toLowerCase().match(/[a-z']+/g) || [];
  const lemmas = tokens.map((t) => new Set(lemmaCandidates(t)));
  const parts = key.split(' ').filter((w) => w !== "one's");
  // every word of the item appears, in order, allowing gaps (separable phrases)
  let from = 0;
  for (const p of parts) {
    let found = -1;
    for (let i = from; i < lemmas.length; i += 1) {
      if (lemmas[i].has(p)) {
        found = i;
        break;
      }
    }
    if (found < 0) return false;
    from = found + 1;
  }
  return true;
}

/**
 * Parse free-form input.
 * @returns {{items: Array<{term, arabic, pos, simple_english, examples:Array<{sentence, arabic}>}>,
 *            passage: string, unclear: string[]}}
 *   items   — vocabulary the learner listed explicitly
 *   passage — English running text to read and extract words from
 *   unclear — lines we could not interpret (shown, never guessed)
 */
export function parseInput(raw) {
  const lines = String(raw || '').replace(/\r/g, '').split('\n').map(stripBullet).filter((l) => l && !/^[-=_*#~]{3,}$/.test(l));
  const items = [];
  const passage = [];
  const unclear = [];
  let current = null; // last item, for attaching meaning / example
  let lastExample = null; // last example sentence, for attaching its Arabic

  const pushItem = (term, { arabic = null, pos = null, simple = null } = {}) => {
    const sp = splitPos(cleanTerm(term));
    const key = matchKey(sp.term);
    if (!key || !LATIN_RE.test(key)) return null;
    let item = items.find((i) => matchKey(i.term) === key);
    if (!item) {
      item = { term: sp.term, arabic: null, pos: null, simple_english: null, examples: [] };
      items.push(item);
    }
    if (arabic && !item.arabic) item.arabic = arabic;
    if (sp.pos || pos) item.pos = item.pos || sp.pos || pos;
    if (simple && !item.simple_english) item.simple_english = simple;
    current = item;
    lastExample = null;
    return item;
  };

  const attachSentence = (sentence, arabic = null) => {
    if (current && sentenceUses(sentence, current.term) && current.examples.length < 3) {
      const ex = { sentence, arabic };
      current.examples.push(ex);
      lastExample = ex;
      return;
    }
    // A sentence that uses an earlier listed item (notes in a different order).
    const owner = [...items].reverse().find((i) => sentenceUses(sentence, i.term) && i.examples.length < 3);
    if (owner) {
      const ex = { sentence, arabic };
      owner.examples.push(ex);
      lastExample = ex;
      return;
    }
    passage.push(sentence);
    lastExample = null;
  };

  for (const line of lines) {
    const hasAr = ARABIC_RE.test(line);
    const hasEn = LATIN_RE.test(line);

    if (hasAr && hasEn) {
      // Split English and Arabic: by a separator, else at the script boundary.
      let en;
      let ar;
      const parts = line.split(SEP);
      if (parts.length >= 2 && LATIN_RE.test(parts[0]) && ARABIC_RE.test(parts.slice(1).join(' '))) {
        en = parts[0];
        ar = parts.slice(1).join(' ');
      } else {
        const firstAr = line.search(ARABIC_RE);
        const firstEn = line.search(LATIN_RE);
        if (firstEn < firstAr) {
          en = line.slice(0, firstAr);
          ar = line.slice(firstAr);
        } else {
          // Arabic first: "دقيق accurate"
          ar = line.slice(0, firstEn);
          en = line.slice(firstEn);
        }
      }
      en = en.trim();
      ar = cleanArabic(ar);
      if (isSentence(en)) attachSentence(en, ar || null);
      else pushItem(en, { arabic: ar || null });
      continue;
    }

    if (hasAr) {
      const ar = cleanArabic(line);
      if (lastExample && !lastExample.arabic) lastExample.arabic = ar; // translation of the example above
      else if (current && !current.arabic) current.arabic = ar; // meaning on its own line
      else unclear.push(line);
      continue;
    }

    if (!hasEn) {
      unclear.push(line);
      continue;
    }

    // English only.
    const parts = line.split(SEP);
    if (parts.length === 2 && !isSentence(parts[0]) && words(parts[1]).length >= 2) {
      // "accurate - correct and exact" → term + English definition
      pushItem(parts[0], { simple: parts[1].trim() });
      continue;
    }
    if (isSentence(line)) {
      attachSentence(line.trim());
      continue;
    }
    // Comma-separated short list: "apple, improve, accurate"
    const commaParts = line.split(/\s*[,،;]\s*/).filter(Boolean);
    if (commaParts.length > 1 && commaParts.every((p) => words(p).length <= 3)) {
      commaParts.forEach((p) => pushItem(p));
      current = null;
      continue;
    }
    if (words(line).length <= 5) pushItem(line);
    else unclear.push(line);
  }

  return { items, passage: passage.join(' ').trim(), unclear };
}

/** Rough check that the whole input is just a YouTube link. */
export function looksLikeUrl(raw) {
  return /^\s*(https?:\/\/)?(www\.|m\.)?(youtube\.com|youtu\.be)\/\S+\s*$/i.test(String(raw || ''));
}
