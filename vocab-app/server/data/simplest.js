// The simplest form of a word (appearance → appear, communication → communicate):
// suggested words are shown and saved in their shortest, most basic form.
import { all, get, run, tx } from '../db/index.js';
import { cacheKey, readCache } from '../services/ai.js';
import { upsertVocabulary, findVocabulary } from './vocabulary.js';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const lv = (l) => (LEVELS.includes(l) ? LEVELS.indexOf(l) : 9);
const familyOf = async (term) => (await readCache(cacheKey('word_forms_v2', `Word: ${term}`)))?.forms || null;
const wordOf = (f) => String(f.word || f.form || '').toLowerCase().trim().split(/[\s(/]/)[0];
const isVerb = (pos) => /فعل|verb/i.test(String(pos || '')) && !/adverb|ظرف/i.test(String(pos || ''));

// candidate stems by removing common derivational endings
const SUFFIXES = [
  ['ation', ['ate', 'e', '']], ['ition', ['ite', 'e', '']], ['ization', ['ize']], ['isation', ['ise']], ['ment', ['']], ['ness', ['', 'y']],
  ['ity', ['e', '', 'ous']], ['ance', ['', 'e']], ['ence', ['', 'e']], ['ancy', ['ant']], ['ency', ['ent']], ['ion', ['e', '']], ['ure', ['', 'e']],
  ['ally', ['al', '']], ['ily', ['y']], ['ly', ['', 'e']], ['ful', ['']], ['less', ['']], ['ive', ['e', '']], ['al', ['', 'e']],
  ['able', ['', 'e']], ['ible', ['', 'e']], ['er', ['', 'e']], ['or', ['', 'e']], ['ist', ['', 'y']], ['ism', ['', 'e']],
  ['ed', ['', 'e']], ['ing', ['', 'e']], ['ied', ['y']], ['ies', ['y']], ['ous', ['', 'e']], ['ic', ['', 'y']], ['y', ['', 'e']],
];
function stems(term) {
  const out = new Set();
  for (const [suf, adds] of SUFFIXES) {
    if (!term.endsWith(suf) || term.length - suf.length < 3) continue;
    const root = term.slice(0, -suf.length);
    for (const a of adds) out.add(root + a);
    if (/(.)\1$/.test(root)) out.add(root.slice(0, -1)); // stopping → stop
  }
  out.delete(term);
  return [...out];
}

/** term → { term, id?, arabic, pos } of its simplest form, or null when the word already is. */
export async function simplestFor(v) {
  const term = String(v.term || '').toLowerCase();
  if (!/^[a-z][a-z-]+$/.test(term) || term.length < 5) return null;
  const cands = new Map(); // word → {pos, arabic, sure}
  const own = await familyOf(term);
  for (const f of own || []) {
    const w = wordOf(f);
    if (w && w !== term && /^[a-z][a-z-]+$/.test(w)) cands.set(w, { pos: f.pos, arabic: f.arabic, sure: true });
  }
  for (const s of stems(term)) if (!cands.has(s)) cands.set(s, { sure: false });
  const ok = [];
  for (const [w, c] of cands) {
    if (w.length >= term.length || w.slice(0, 3) !== term.slice(0, 3)) continue;
    const row = await findVocabulary(w);
    if (!c.sure) {
      // a guessed stem must be a real dictionary word that lists this word in its family
      if (!row) continue;
      const fam = await familyOf(w);
      if (!fam?.some((f) => wordOf(f) === term)) continue;
    }
    if (row && v.level && row.level && lv(row.level) > lv(v.level)) continue; // never a harder word
    if (!row && !c.arabic) continue;
    ok.push({ term: w, id: row?.id || null, arabic: row?.arabic || c.arabic, pos: row?.part_of_speech || c.pos, verb: isVerb(row?.part_of_speech || c.pos), level: row?.level || v.level });
  }
  if (!ok.length) return null;
  ok.sort((a, b) => (b.verb - a.verb) || a.term.length - b.term.length);
  return ok[0];
}

const POS_EN = { فعل: 'verb', اسم: 'noun', صفة: 'adjective', ظرف: 'adverb' };

/** Point a video's suggested words at their simplest forms (done once per video). */
export async function simplifySourceWords(sourceId) {
  const rows = await all(
    `SELECT o.id, o.vocabulary_id, o.line_id, v.term, v.level, v.item_type FROM occurrences o JOIN vocabulary v ON v.id = o.vocabulary_id
     WHERE o.source_id = ? AND o.suggested = 1`, sourceId);
  const memo = new Map();
  let changed = 0;
  await tx(async () => {
    for (const r of rows) {
      if (r.item_type === 'expression' || /\s/.test(r.term)) continue;
      if (!memo.has(r.term)) memo.set(r.term, await simplestFor(r));
      const base = memo.get(r.term);
      if (!base) continue;
      if (!base.id) {
        base.id = (await upsertVocabulary({ term: base.term, arabic: base.arabic, part_of_speech: POS_EN[base.pos] || base.pos || null, level: base.level, origin: 'ai' })).id;
      }
      if (base.id === r.vocabulary_id) continue;
      const dup = (await all('SELECT id, line_id FROM occurrences WHERE source_id = ? AND vocabulary_id = ?', sourceId, base.id)).find((d) => d.line_id === r.line_id);
      if (dup) await run('DELETE FROM occurrences WHERE id = ?', r.id);
      else await run('UPDATE occurrences SET vocabulary_id = ?, contextual_meaning = NULL, context_note = NULL WHERE id = ?', base.id, r.id);
      changed += 1;
    }
    await run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', `simplest:${sourceId}`, '1');
  });
  return { simplified: changed };
}

export async function isSimplified(sourceId) {
  return !!(await get('SELECT 1 AS x FROM app_settings WHERE key = ?', `simplest:${sourceId}`));
}
