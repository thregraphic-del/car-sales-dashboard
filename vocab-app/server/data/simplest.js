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

/** The basic verb a noun is made from, or null. Strict: a wrong change is worse than none. */
export async function simplestFor(v) {
  const term = String(v.term || '').toLowerCase();
  if (!/^[a-z]+$/.test(term) || term.length < 6) return null;
  const cands = new Map();
  for (const w of verbsBehind(term)) cands.set(w, null);
  for (const f of (await familyOf(term)) || []) {
    const w = wordOf(f);
    if (isVerb(f.pos) && /^[a-z]+$/.test(w)) cands.set(w, f);
  }
  const ok = [];
  for (const [w, fam] of cands) {
    if (w === term || w.length >= term.length || !derived(w).has(term)) continue;
    const row = await findVocabulary(w);
    if (row && row.term.toLowerCase() !== w) continue;
    if (row && row.part_of_speech && !isVerb(row.part_of_speech) && !fam) continue;
    if (!row && !fam?.arabic) continue; // unknown word: only when the dictionary family names it as the verb
    if (row?.level && v.level && lv(row.level) > lv(v.level) + 1) continue; // not a much harder word
    // and the dictionary says they are one family (importance is not from "import")
    if (!fam && !((await familyOf(w)) || []).some((f) => wordOf(f) === term)) continue;
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

const VERSION = '3';

/**
 * Point a video's suggested words at their simplest forms (once per video).
 * Version 1 changed too much (integrity → integral), so its changes are undone first:
 * every word goes back to the word actually said in the video.
 */
export async function simplifySourceWords(sourceId, { dry = false } = {}) {
  const flag = (await get('SELECT value FROM app_settings WHERE key = ?', `simplest:${sourceId}`))?.value || null;
  const changes = [];
  let restored = 0;
  const load = () => all(
    `SELECT o.id, o.vocabulary_id, o.line_id, o.char_start, o.char_end, v.term, v.level, v.item_type, l.text
     FROM occurrences o JOIN vocabulary v ON v.id = o.vocabulary_id LEFT JOIN transcript_lines l ON l.id = o.line_id
     WHERE o.source_id = ? AND o.suggested = 1`, sourceId);
  const move = async (r, toId) => {
    const dup = (await all('SELECT id, line_id FROM occurrences WHERE source_id = ? AND vocabulary_id = ?', sourceId, toId)).find((d) => d.line_id === r.line_id);
    if (dup) await run('DELETE FROM occurrences WHERE id = ?', r.id);
    else await run('UPDATE occurrences SET vocabulary_id = ?, contextual_meaning = NULL, context_note = NULL WHERE id = ?', toId, r.id);
  };
  await tx(async () => {
    if (flag === '1' && !dry) {
      for (const r of await load()) {
        if (r.item_type === 'expression' || /\s/.test(r.term) || r.char_start == null || !r.text) continue;
        const said = r.text.slice(r.char_start, r.char_end).toLowerCase().replace(/[’']s$/, '');
        if (!/^[a-z]+$/.test(said)) continue;
        const lemma = (await get('SELECT lemma FROM lemma_index WHERE form = ?', said))?.lemma || said;
        const term = r.term.toLowerCase();
        if (term === lemma || term === said || term.slice(0, 3) !== said.slice(0, 3) || term.length >= said.length) continue;
        const back = (await findVocabulary(lemma)) || (await findVocabulary(said));
        if (!back || back.id === r.vocabulary_id) continue;
        await move(r, back.id);
        restored += 1;
      }
    }
    const memo = new Map();
    for (const r of await load()) {
      if (r.item_type === 'expression' || /\s/.test(r.term)) continue;
      if (!memo.has(r.term)) memo.set(r.term, await (dry ? simplestFor(r) : simplestVocab(r)));
      const base = memo.get(r.term);
      if (!base || base.id === r.vocabulary_id) continue;
      changes.push(`${r.term}→${base.term}`);
      if (!dry) await move(r, base.id);
    }
    if (!dry) await run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', `simplest:${sourceId}`, VERSION);
  });
  return { simplified: changes.length, restored, changes: [...new Set(changes)], redo_dictionary: flag === '1' && !dry };
}

export async function isSimplified(sourceId) {
  return (await get('SELECT value FROM app_settings WHERE key = ?', `simplest:${sourceId}`))?.value === VERSION;
}
