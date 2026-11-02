// The simplest form of a word (appearance → appear, communication → communicate):
// suggested words are shown and saved in their shortest, most basic form.
import { all, get, run, tx } from '../db/index.js';
import { cacheKey, readCache } from '../services/ai.js';
import { findVocabulary } from './vocabulary.js';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const lv = (l) => (LEVELS.includes(l) ? LEVELS.indexOf(l) : 9);
const familyOf = async (term) => (await readCache(cacheKey('word_forms_v2', `Word: ${term}`)))?.forms || null;
const wordOf = (f) => String(f.word || f.form || '').toLowerCase().trim().split(/[\s(/]/)[0];
const isVerb = (pos) => /فعل|verb/i.test(String(pos || '')) && !/adverb|ظرف/i.test(String(pos || ''));

// Only nouns made from a verb become that verb (appearance → appear, agreement → agree):
// the learner saves the short basic verb. Adjectives and adverbs stay as they are.
const SUFFIXES = [
  ['ation', ['ate', 'e', '']], ['ition', ['ite', 'e']], ['ization', ['ize']], ['isation', ['ise']], ['ment', ['']],
  ['ance', ['', 'e']], ['ence', ['', 'e']], ['ion', ['e', '']], ['al', ['e']], ['er', ['', 'e']], ['or', ['', 'e']],
];
function stems(term) {
  const out = new Set();
  for (const [suf, adds] of SUFFIXES) {
    if (!term.endsWith(suf) || term.length - suf.length < 3) continue;
    const root = term.slice(0, -suf.length);
    for (const a of adds) out.add(root + a);
    if (/([bdgmnprt])\1$/.test(root)) out.add(root.slice(0, -1)); // beginner → begin
  }
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
export async function simplestFor(v) {
  const term = String(v.term || '').toLowerCase();
  if (!/^[a-z]+$/.test(term) || term.length < 6) return null;
  const rank = await ranks();
  const ok = [];
  for (const w of stems(term)) {
    if (w.length < 3 || !rank.has(w)) continue; // a real, common word
    if (rank.has(term) && rank.get(w) > rank.get(term)) continue; // and more common than the long one
    const row = await findVocabulary(w);
    if (!row || row.term.toLowerCase() !== w || row.origin !== 'dictionary' || !isVerb(row.part_of_speech)) continue;
    if (!row.level || !v.level || lv(row.level) > lv(v.level)) continue; // never a harder word
    const fam = await familyOf(w);
    if (!fam?.some((f) => wordOf(f) === term)) continue; // the dictionary says they are one family
    ok.push({ term: w, id: row.id, arabic: row.arabic, pos: row.part_of_speech, level: row.level });
  }
  ok.sort((a, b) => a.term.length - b.term.length);
  return ok[0] || null;
}

const VERSION = '2';

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
      if (!memo.has(r.term)) memo.set(r.term, await simplestFor(r));
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
