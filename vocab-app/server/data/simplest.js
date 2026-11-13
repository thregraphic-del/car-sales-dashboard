// The simplest form of a word (appearance → appear, communication → communicate):
// suggested words are shown and saved in their shortest, most basic form.
import { all, get, run, tx } from '../db/index.js';
import { cacheKey, readCache } from '../services/ai.js';
import { findVocabulary, upsertVocabulary } from './vocabulary.js';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const lv = (l) => (LEVELS.includes(l) ? LEVELS.indexOf(l) : 9);
const familyOf = async (term) => (await readCache(cacheKey('word_forms_v2', `Word: ${term}`)))?.forms || null;
const wordOf = (f) => String(f.word || f.form || '').toLowerCase().trim().split(/[\s(/]/)[0];
const isVerb = (pos) => /فعل|verb/i.test(String(pos || '')) && !/adverb|ظرف/i.test(String(pos || ''));

// Only nouns made from a verb become that verb (decision → decide, explanation → explain,
// improvement → improve, communication → communicate). A noun is accepted only when it is
// built from the verb by a known English pattern, so look-alikes (integrity/integrate) never change.
const RULES = [
  // [verb ending to drop, noun ending to add]
  ['', 'ment'], ['', 'ion'], ['e', 'ion'], ['', 'ation'], ['e', 'ation'], ['y', 'ication'], ['ize', 'ization'], ['ise', 'isation'],
  ['', 'ance'], ['e', 'ance'], ['', 'ence'], ['e', 'ence'], ['e', 'al'], ['de', 'sion'], ['d', 'sion'], ['t', 'ssion'], ['it', 'ission'],
  ['ain', 'anation'], ['ibe', 'iption'], ['eive', 'eption'], ['uce', 'uction'], ['ume', 'umption'], ['ve', 'ution'], ['ounce', 'unciation'], ['d', 'tion'],
  ['ain', 'ention'], ['y', 'iance'], ['er', 'rance'], ['ear', 'earance'], ['ify', 'ification'], ['ate', 'ation'],
];
export const derived = (verb) => new Set(RULES.filter(([cut]) => verb.endsWith(cut)).map(([cut, add]) => verb.slice(0, verb.length - cut.length) + add));
// possible verbs behind a noun: undo each rule
export function verbsBehind(term) {
  const out = new Set();
  for (const [cut, add] of RULES) if (term.endsWith(add) && term.length - add.length >= 3) out.add(term.slice(0, -add.length) + cut);
  out.delete(term);
  return [...out];
}

let rankOf = null;
async function ranks() {
  if (!rankOf) {
    const { COMMON_WORDS } = await import('../lib/common-words.js');
    rankOf = new Map(COMMON_WORDS.map((w, i) => [w, i]));
  }
  return rankOf;
}

/** The basic verb a noun is made from, or null. Strict: a wrong change is worse than none. */
export async function simplestFor(v, trace = null) {
  const why = (w, r) => trace?.push(`${w}: ${r}`);
  const term = String(v.term || '').toLowerCase();
  if (!/^[a-z]+$/.test(term) || term.length < 6) return null;
  const rank = await ranks();
  const cands = new Map();
  for (const w of verbsBehind(term)) cands.set(w, null);
  for (const f of (await familyOf(term)) || []) {
    const w = wordOf(f);
    if (isVerb(f.pos) && /^[a-z]+$/.test(w)) cands.set(w, f);
  }
  const ok = [];
  for (const [w, fam] of cands) {
    if (w === term || w.length >= term.length || !derived(w).has(term)) { why(w, 'not derived'); continue; }
    // a common English word, not much rarer than the noun (no "situate", "opt", "sess")
    if (!rank.has(w) || (rank.has(term) && rank.get(w) > rank.get(term) * 2.5 + 1000)) { why(w, 'rare'); continue; }
    const row = await findVocabulary(w);
    if (row && row.term.toLowerCase() !== w) { why(w, `row ${row.term}`); continue; }
    if (row && row.part_of_speech && !isVerb(row.part_of_speech) && !fam) { why(w, `pos ${row.part_of_speech}`); continue; }
    if (!row && !fam?.arabic) { why(w, 'unknown'); continue; } // unknown word: only when the dictionary family names it as the verb
    if (row?.level && v.level && lv(row.level) > lv(v.level) + 1) { why(w, 'harder'); continue; } // not a much harder word
    // and the dictionary says they are one family (importance is not from "import")
    if (!fam) {
      // a family counts only when it names other English words (some were saved in Arabic)
      const english = (f, self) => (f?.some((x) => /^[a-z]+$/.test(wordOf(x)) && wordOf(x) !== self) ? f : null);
      const famW = english(await familyOf(w), w);
      const famT = english(await familyOf(term), term);
      const linked = [famW, famT].some((f) => f?.some((x) => [term, w].includes(wordOf(x)) && wordOf(x) !== (f === famW ? w : term)));
      if ((famW || famT) && !linked) { why(w, `not linked ${JSON.stringify([famW, famT].map((f) => f?.map(wordOf)))}`); continue; } // the dictionary knows these words and does not join them
    }
    ok.push({ term: w, id: row?.id || null, arabic: row?.arabic || fam?.arabic, pos: row?.part_of_speech || 'verb', level: row?.level || null });
  }
  ok.sort((a, b) => (b.id ? 1 : 0) - (a.id ? 1 : 0) || a.term.length - b.term.length);
  return ok[0] || null;
}

/** The vocabulary row of the simplest form (creating it from the dictionary family when needed). */
export async function simplestVocab(v) {
  const base = await simplestFor(v);
  if (!base) return null;
  if (!base.id) base.id = (await upsertVocabulary({ term: base.term, arabic: base.arabic, part_of_speech: 'verb', origin: 'ai' })).id;
  return base;
}

/* ---------------------------------------------- inflections and doers */

// words that only look like an inflection or a "doer" noun
const STOP = new Set(('career being evening morning during ceiling string spring king wedding pudding sibling darling nothing something anything everything '
  + 'news means series species lens always sometimes perhaps its his has was does thanks glasses physics politics economics '
  + 'former latter flower tower master sister brother mother father water paper number order corner finger power other under over after '
  + 'never ever rather whether together however either neither matter member letter better later dinner summer winter offer answer cover '
  + 'consider remember wonder enter monster computer super proper eager clever silver shower bitter liver river butter ladder '
  + 'hundred red bed need speed seed feed indeed naked wicked sacred kindred').split(' '));

async function known(w) {
  const rank = await ranks();
  if (rank.has(w)) return true;
  const row = await findVocabulary(w);
  return !!row && row.term.toLowerCase() === w;
}

/** The dictionary form of one inflected word (struggling → struggle, years → year), or the word itself. */
export async function lemmaWord(word) {
  const w = String(word || '').toLowerCase();
  if (!/^[a-z]+$/.test(w) || STOP.has(w)) return w;
  const hit = (await get('SELECT lemma FROM lemma_index WHERE form = ?', w))?.lemma;
  if (hit && /^[a-z]+$/.test(hit)) return hit;
  const tries = [];
  const root = (suf) => (w.endsWith(suf) && w.length - suf.length >= 2 ? w.slice(0, -suf.length) : null);
  let r;
  if ((r = root('ying'))) tries.push(`${r}y`, `${r}ie`); // dying → die
  if ((r = root('ing'))) tries.push(`${r}e`, r, /([bdgmnprt])\1$/.test(r) ? r.slice(0, -1) : null);
  if ((r = root('ied'))) tries.push(`${r}y`);
  if ((r = root('ed'))) tries.push(`${r}e`, r, /([bdgmnprt])\1$/.test(r) ? r.slice(0, -1) : null);
  if ((r = root('ies'))) tries.push(`${r}y`);
  if ((r = root('es')) && /(s|x|z|ch|sh|o)$/.test(r)) tries.push(r);
  if ((r = w.length >= 4 && w.endsWith('s') && !/(ss|us|is)$/.test(w) ? w.slice(0, -1) : null)) tries.push(r);
  for (const t of tries) if (t && t.length >= 3 && t !== w && (await known(t))) return t;
  // plural of a long noun, even when the dictionary does not know it yet (improvements → improvement)
  if (/(ment|tion|sion|ness|ity|ance|ence|ist|ship)s$/.test(w)) return w.slice(0, -1);
  return w;
}

/** The verb behind a "doer" noun (researcher → research, user → use, runner → run), if common. */
async function doerVerb(w) {
  if (STOP.has(w) || !/(er|or)$/.test(w) || w.length < 5) return null;
  const rank = await ranks();
  const r = w.slice(0, -2);
  for (const t of [r, `${r}e`, /([bdgmnprt])\1$/.test(r) ? r.slice(0, -1) : null]) {
    if (!t || t.length < 3 || !rank.has(t)) continue;
    // the noun must be exactly verb + er/or (speak → speaker, use → user, run → runner; care ↛ career)
    const ends = [`${t}er`, `${t}or`, `${t}r`, `${t}${t.at(-1)}er`];
    if (!ends.includes(w) || (w.endsWith('r') && !t.endsWith('e') && w === `${t}r`)) continue;
    if (rank.has(w) && rank.get(t) > rank.get(w) * 2.5 + 1000) continue;
    const row = await findVocabulary(t);
    if (row && row.term.toLowerCase() === t && isVerb(row.part_of_speech) && row.arabic) return row;
  }
  return null;
}

/** The shorter word inside an adjective / adverb / -ness noun (delusional → delusion,
 * happiness → happy, quickly → quick, dangerous → danger), only when that word is common and has
 * its own card with an Arabic meaning. */
const ADJ_STOP = new Set('only early likely family supply apply reply rely belly jelly holy ugly silly lonely lovely friendly costly deadly elderly weekly daily monthly yearly fly ally rally bully july italy reality quality usually totally really finally actually generally especially natural normal total final local legal general central mental medical musical animal original official rural royal loyal several individual festival terminal journal signal capital hospital metal pedal crystal brutal vital fatal dental moral literal liberal federal mineral neutral plural spiral tribal oral nervous serious obvious various previous curious anxious jealous famous enormous tremendous gorgeous business witness harness wilderness'.split(' '));
async function adjBase(w) {
  if (w.length < 6 || ADJ_STOP.has(w)) return null;
  const tries = [];
  let r;
  if (w.endsWith('ional') || w.endsWith('mental') || w.endsWith('ural')) { r = w.slice(0, -2); tries.push(r, `${r}e`); }
  if (w.endsWith('iness')) tries.push(`${w.slice(0, -5)}y`);
  else if (w.endsWith('ness')) tries.push(w.slice(0, -4));
  if (w.endsWith('ically')) tries.push(w.slice(0, -4));
  else if (w.endsWith('ily')) tries.push(`${w.slice(0, -3)}y`);
  else if (w.endsWith('ly')) tries.push(w.slice(0, -2), `${w.slice(0, -2)}e`);
  if (w.endsWith('ous') && !w.endsWith('ious')) tries.push(w.slice(0, -3), `${w.slice(0, -3)}e`);
  const rank = await ranks();
  for (const t of tries) {
    if (!t || t.length < 4) continue;
    const row = await findVocabulary(t);
    // a known word with its own Arabic meaning (common, or already in the site's dictionary)
    if (row && row.term.toLowerCase() === t && row.arabic && (rank.has(t) || row.level)) return row;
  }
  return null;
}

/**
 * The shortest basic form to show and save for an extracted word or expression:
 * inflections go (struggling → struggle, changed the way → change the way) and keep their meaning;
 * a doer noun or a noun made from a verb becomes that verb (researcher → research, decision → decide)
 * but only when the verb is a known word with its own meaning.
 * @returns {Promise<{term:string, kind:'same'|'inflection'|'derived', row?:object}>}
 */
export async function simpleTerm(term) {
  const t = String(term || '').trim();
  if (!t) return { term: t, kind: 'same' };
  if (/\s/.test(t)) {
    // expression: only its first word (the verb) loses its ending
    const [first, ...rest] = t.split(/\s+/);
    const lower = first.toLowerCase();
    const l = /^[a-z]+$/.test(lower) && /(ed|ing|s)$/.test(lower) ? await lemmaWord(lower) : lower;
    return l !== lower ? { term: [l, ...rest].join(' '), kind: 'inflection' } : { term: t, kind: 'same' };
  }
  const lower = t.toLowerCase();
  const lemma = await lemmaWord(lower);
  const doer = await doerVerb(lemma);
  if (doer) return { term: doer.term, kind: 'derived', row: doer };
  const adj = await adjBase(lemma);
  if (adj) {
    // delusional → delusion, and then a verb-made noun one step further only if the dictionary agrees
    const deeper = await simplestFor({ term: adj.term, level: adj.level || null });
    const row = deeper?.id ? await findVocabulary(deeper.term) : null;
    return row ? { term: row.term, kind: 'derived', row } : { term: adj.term, kind: 'derived', row: adj };
  }
  const lemmaRow = lemma !== lower ? await findVocabulary(lemma) : null;
  const derived = await simplestFor({ term: lemma, level: lemmaRow?.level || null });
  if (derived?.id) return { term: derived.term, kind: 'derived', row: await findVocabulary(derived.term) };
  return lemma !== lower ? { term: lemma, kind: 'inflection' } : { term: t, kind: 'same' };
}

const VERSION = '8'; // 8: adjectives / adverbs / -ness too

/**
 * Point a video's suggested words at their simplest forms (once per video).
 * Version 1 changed too much (integrity → integral), so its changes are undone first:
 * every word goes back to the word actually said in the video.
 */
const memoTerms = new Map(); // simplest forms already worked out (per function instance)
async function simpleTermCached(term) {
  const k = String(term || '').toLowerCase();
  if (!memoTerms.has(k)) {
    if (memoTerms.size > 20000) memoTerms.clear();
    // most words cannot be shortened: answer those without asking the database
    memoTerms.set(k, MAYBE.test(k) ? await simpleTerm(term) : { term, kind: 'same' });
  }
  return memoTerms.get(k);
}

/**
 * Point a video's suggested words at their simplest forms, in short steps (each call
 * stops after `budgetMs` and says whether more is left), so no request runs too long.
 */
export async function simplifySourceWords(sourceId, { dry = false, budgetMs = 15000 } = {}) {
  const started = Date.now();
  const curKey = `simplest-cursor:${sourceId}`;
  let cursor = dry ? 0 : Number((await get('SELECT value FROM app_settings WHERE key = ?', curKey))?.value) || 0;
  const changes = [];
  const move = async (r, toId, keepMeaning = false) => {
    const dup = (await all('SELECT id, line_id FROM occurrences WHERE source_id = ? AND vocabulary_id = ?', sourceId, toId)).find((d) => d.line_id === r.line_id);
    if (dup) await run('DELETE FROM occurrences WHERE id = ?', r.id);
    else if (keepMeaning) await run('UPDATE occurrences SET vocabulary_id = ? WHERE id = ?', toId, r.id);
    else await run('UPDATE occurrences SET vocabulary_id = ?, contextual_meaning = NULL, context_note = NULL WHERE id = ?', toId, r.id);
  };
  let more = true;
  while (Date.now() - started < budgetMs) {
    const rows = await all(
      `SELECT o.id, o.vocabulary_id, o.line_id, v.term, v.level, v.item_type
       FROM occurrences o JOIN vocabulary v ON v.id = o.vocabulary_id
       WHERE o.source_id = ? AND o.suggested = 1 AND o.id > ? ORDER BY o.id LIMIT 60`, sourceId, cursor);
    if (!rows.length) { more = false; break; }
    await tx(async () => {
      for (const r of rows) {
        cursor = r.id;
        const base = await simpleTermCached(r.term);
        if (base.kind === 'same' || base.term.toLowerCase() === r.term.toLowerCase()) continue;
        changes.push(`${r.term}→${base.term}`);
        if (dry) continue;
        let to = base.row || (await findVocabulary(base.term));
        if (to && to.term.toLowerCase() !== base.term.toLowerCase()) to = null;
        if (!to) {
          if (base.kind !== 'inflection') continue;
          // same meaning, shorter form: copy the card of the long form
          const from = await get('SELECT * FROM vocabulary WHERE id = ?', r.vocabulary_id);
          to = { id: (await upsertVocabulary({ term: base.term, item_type: from.item_type, part_of_speech: from.part_of_speech, level: from.level,
            arabic: from.arabic, simple_english: from.simple_english, pronunciation: null, topic: from.topic, origin: from.origin || 'ai' })).id };
        }
        if (to.id !== r.vocabulary_id) await move(r, to.id, base.kind === 'inflection');
      }
      if (!dry) await run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', curKey, String(cursor));
    });
  }
  if (!more && !dry) await run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', `simplest:${sourceId}`, VERSION);
  return { simplified: changes.length, more, changes: [...new Set(changes)].slice(0, 100) };
}

export async function isSimplified(sourceId) {
  return (await get('SELECT value FROM app_settings WHERE key = ?', `simplest:${sourceId}`))?.value === VERSION;
}

/* ------------------------------------------------------ the learner's words */

const MAYBE = /(s|ed|ing|er|or|ion|ment|ance|ence|al|ness|ly|ous)$|\s/;

/** The vocabulary id to save for a word: its simplest form (created for an inflection). */
export async function baseVocabId(v) {
  if (!v?.term || !MAYBE.test(v.term.toLowerCase())) return v?.id;
  const s = await simpleTerm(v.term);
  if (s.kind === 'same' || s.term.toLowerCase() === v.term.toLowerCase()) return v.id;
  let to = s.row || (await findVocabulary(s.term));
  if (to && to.term.toLowerCase() !== s.term.toLowerCase()) to = null;
  if (to) return to.id;
  if (s.kind !== 'inflection') return v.id;
  return (await upsertVocabulary({ term: s.term, item_type: v.item_type, part_of_speech: v.part_of_speech, level: v.level,
    arabic: v.arabic, simple_english: v.simple_english, topic: v.topic, origin: v.origin || 'ai' })).id;
}

const WORDS_VERSION = '2'; // 2: delusional → delusion, happiness → happy …

/**
 * Move the learner's saved words to their simplest forms, a slice at a time
 * (the words page calls again until done). Progress, groups and meanings are kept;
 * two cards of the same word become one (the one with more practice stays).
 */
export async function simplifyUserWords(userId, { limit = 120 } = {}) {
  const key = `words-simplest:${userId}`;
  const state = (await get('SELECT value FROM app_settings WHERE key = ?', key))?.value || '';
  const [ver, last] = state.split(':');
  if (ver === WORDS_VERSION && last === 'done') return { done: true, changed: 0 };
  const after = ver === WORDS_VERSION ? Number(last) || 0 : 0;
  const rows = await all(
    `SELECT uv.id AS uv_id, uv.state, uv.review_count, v.* FROM user_vocabulary uv JOIN vocabulary v ON v.id = uv.vocabulary_id
     WHERE uv.user_id = ? AND uv.id > ? ORDER BY uv.id LIMIT ?`, userId, after, limit);
  const changes = [];
  await tx(async () => {
    for (const r of rows) {
      if (r.state !== 'saved') continue;
      const to = await baseVocabId(r);
      if (!to || to === r.id) continue;
      const other = await get('SELECT id, state, review_count FROM user_vocabulary WHERE user_id = ? AND vocabulary_id = ?', userId, to);
      if (other && other.state === 'saved') {
        // the same word twice: keep the card with more practice, carry the groups over
        const [keep, drop] = Number(other.review_count) >= Number(r.review_count) ? [other.id, r.uv_id] : [r.uv_id, other.id];
        for (const g of await all('SELECT group_id FROM word_group_items WHERE user_vocabulary_id = ?', drop)) {
          await run('INSERT INTO word_group_items (group_id, user_vocabulary_id) VALUES (?, ?) ON CONFLICT DO NOTHING', g.group_id, keep);
        }
        await run('DELETE FROM user_vocabulary WHERE id = ?', drop);
        if (keep === r.uv_id) await run('UPDATE user_vocabulary SET vocabulary_id = ? WHERE id = ?', to, r.uv_id);
      } else {
        if (other) await run('DELETE FROM user_vocabulary WHERE id = ?', other.id); // an old "not useful" mark
        await run('UPDATE user_vocabulary SET vocabulary_id = ? WHERE id = ?', to, r.uv_id);
      }
      changes.push(`${r.term}→${(await get('SELECT term FROM vocabulary WHERE id = ?', to)).term}`);
    }
    const done = rows.length < limit;
    await run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      key, `${WORDS_VERSION}:${done ? 'done' : rows.at(-1).uv_id}`);
  });
  return { done: rows.length < limit, changed: changes.length, changes };
}
