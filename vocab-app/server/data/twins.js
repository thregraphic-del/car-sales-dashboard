// Word Twins: after the game, the learner may keep the twin groups in «كلماتي» — a group named «المتشابهات».
// The words are saved exactly as they are (never merged into a simpler form: passed ≠ pass), nothing is saved without a request,
// and a word that is already saved is not duplicated (it only joins the group).
import { get, run, insert, tx } from '../db/index.js';
import { createGroup, addToGroup } from './groups.js';
import { upsertVocabulary } from './vocabulary.js';
import { TWINS } from '../../public/js/data/twins-data.js';

export const GROUP_NAME = 'المتشابهات';
const KNOWN = new Map(TWINS.flatMap((g) => g.words.map((w) => [w.term.toLowerCase(), { ...w, level: g.level }])));
/** Is this term one of the curated twins? (the «simplest form» tidy-up leaves them alone) */
export const isTwinTerm = (t) => KNOWN.has(String(t || '').toLowerCase());

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const clean = (s, n) => String(s || '').trim().slice(0, n);

/**
 * groups: [[{term, arabic?, ipa?, def?, level?}, …], …] — the data of the curated file wins when the term is in it.
 * @returns {{added:number, existed:number, groups:number, group_id:number}}
 */
export async function saveTwins(userId, groups) {
  const list = (Array.isArray(groups) ? groups : []).slice(0, 120).map((g) => (Array.isArray(g) ? g : []).slice(0, 6));
  return tx(async () => {
    const grp = await createGroup(userId, GROUP_NAME);
    let added = 0;
    let existed = 0;
    let used = 0;
    const now = new Date().toISOString();
    for (const g of list) {
      const items = g.map((w) => {
        const term = clean(w?.term, 60);
        const k = KNOWN.get(term.toLowerCase());
        return { term, arabic: clean(k?.ar ?? w?.arabic, 120), ipa: clean(k?.ipa ?? w?.ipa, 60), def: clean(k?.def ?? w?.def, 160), level: k?.level ?? w?.level };
      }).filter((x) => /^[A-Za-z][A-Za-z' -]{0,58}$/.test(x.term));
      if (items.length < 2) continue;
      used += 1;
      for (const it of items) {
        const others = items.filter((o) => o !== it).map((o) => o.term);
        const { id: vid } = await upsertVocabulary({
          term: it.term, arabic: it.arabic || null, pronunciation: it.ipa || null, simple_english: it.def || null,
          level: LEVELS.includes(it.level) ? it.level : null, similar: others, origin: 'twins',
        });
        const have = await get('SELECT id, state, user_arabic FROM user_vocabulary WHERE user_id = ? AND vocabulary_id = ?', userId, vid);
        let uv;
        if (have) {
          uv = have.id;
          if (have.state === 'saved') existed += 1;
          else { await run(`UPDATE user_vocabulary SET state = 'saved', saved_at = ? WHERE id = ?`, now, uv); added += 1; }
          if (!have.user_arabic && it.arabic) await run('UPDATE user_vocabulary SET user_arabic = ? WHERE id = ? AND user_arabic IS NULL', it.arabic, uv);
        } else {
          uv = await insert(`INSERT INTO user_vocabulary (user_id, vocabulary_id, state, user_arabic, saved_at) VALUES (?,?, 'saved', ?, ?)`, userId, vid, it.arabic || null, now);
          added += 1;
        }
        await addToGroup(userId, grp.id, [uv]);
      }
    }
    return { added, existed, groups: used, group_id: grp.id };
  });
}
