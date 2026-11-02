// "الأوضح" (clearest): the learner's words with the same meaning, gathered under the
// simplest, most common one. Words are joined when they share an Arabic meaning or
// list each other as similar words.
import { listWords } from './words.js';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const lv = (l) => (LEVELS.includes(l) ? LEVELS.indexOf(l) : 3);
let rankOf = null;
async function ranks() {
  if (!rankOf) {
    const { COMMON_WORDS } = await import('../lib/common-words.js');
    rankOf = new Map(COMMON_WORDS.map((w, i) => [w, i]));
  }
  return rankOf;
}

// one Arabic meaning, without diacritics, "ال", small words and brackets
export function meaningKeys(arabic) {
  return String(arabic || '')
    .replace(/[ً-ْـ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .split(/[\/،,؛;|]| أو /)
    .map((m) => m.trim().replace(/^ال/, '').replace(/[أإآ]/g, 'ا').replace(/ة\b/g, 'ه').replace(/ى\b/g, 'ي').replace(/\s+/g, ' '))
    .filter((m) => m.length >= 3 && !/^(شيء|شخص|بشكل|جدا|عن|في|من)$/.test(m));
}

export async function wordClusters(userId) {
  const words = (await listWords(userId)).filter((w) => w.item_type !== 'expression' || !/\s.*\s/.test(w.term));
  const rank = await ranks();
  const parent = words.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const join = (a, b) => { parent[find(a)] = find(b); };
  const posOf = (w) => {
    const p = String(w.part_of_speech || '').toLowerCase();
    if (/adverb/.test(p)) return 'adv';
    if (/verb/.test(p)) return 'verb';
    if (/adj/.test(p)) return 'adj';
    if (/noun/.test(p)) return 'noun';
    return null;
  };
  const keys = words.map((w) => meaningKeys(w.user_arabic || w.arabic));
  const byTerm = new Map(words.map((w, i) => [w.term.toLowerCase(), i]));
  const byKey = new Map();
  words.forEach((w, i) => {
    for (const k of new Set(keys[i])) {
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(i);
    }
    for (const s of w.similar || []) {
      const j = byTerm.get(String(s.term || s).toLowerCase());
      if (j !== undefined) join(i, j);
    }
  });
  // same part of speech, and the same main meaning (or two meanings in common)
  const close = (i, j) => {
    const a = posOf(words[i]);
    const b = posOf(words[j]);
    if (a && b && a !== b) return false;
    if (keys[i][0] && keys[i][0] === keys[j][0]) return true;
    const shared = keys[i].filter((k) => keys[j].includes(k));
    if (shared.length >= 2) return true;
    // one word's main meaning is another meaning of the other (huge "كبير / ضخم" ~ enormous "ضخم")
    return !!(a && b) && shared.some((k) => k === keys[i][0] || k === keys[j][0]);
  };
  for (const list of byKey.values()) {
    if (list.length < 2 || list.length > 8) continue; // a very common meaning would join everything
    for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) if (close(list[x], list[y])) join(list[x], list[y]);
  }
  const groups = new Map();
  words.forEach((w, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(w);
  });
  const score = (w) => lv(w.level) * 10000 + (rank.get(w.term.toLowerCase()) ?? 9000) + w.term.length * 50;
  const pick = (w) => ({ uv_id: w.uv_id, vocabulary_id: w.vocabulary_id, term: w.term, level: w.level, arabic: w.user_arabic || w.arabic, status: w.status, mastery: w.mastery });
  return [...groups.values()]
    .map((list) => {
      const sorted = [...list].sort((a, b) => score(a) - score(b));
      return { head: pick(sorted[0]), members: sorted.map(pick).sort((a, b) => lv(a.level) - lv(b.level)) };
    })
    .sort((a, b) => b.members.length - a.members.length || a.head.term.localeCompare(b.head.term));
}
