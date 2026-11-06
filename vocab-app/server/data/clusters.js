// "الأوضح" (clearest): the learner's words with the same meaning, gathered under the
// simplest, most common one. Words are joined when they share an Arabic meaning or
// list each other as similar words.
import { listWords } from './words.js';
import { sameMeaningWithAi, aiAvailable } from '../services/extractor.js';

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
  const pickAr = (w) => ({ term: w.term, arabic: w.user_arabic || w.arabic || '' });
  const posOf = (w) => {
    const p = String(w.part_of_speech || '').toLowerCase();
    if (/adverb/.test(p)) return 'adv';
    if (/verb/.test(p)) return 'verb';
    if (/adj/.test(p)) return 'adj';
    if (/noun/.test(p)) return 'noun';
    return null;
  };
  const keys = words.map((w) => meaningKeys(w.user_arabic || w.arabic));
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
  const score = (w) => lv(w.level) * 10000 + (rank.get(w.term.toLowerCase()) ?? 9000) + w.term.length * 50;
  // ⭐ Star groups, no chains: the simplest word heads a group, and only words close to IT
  // join (never a friend of a friend). Each group is checked once by AI: only true synonyms
  // of the head stay; when AI isn't available or unsure, a word stays on its own.
  const cand = (i, j) => {
    const sim = (words[i].similar || []).some((s) => String(s.term || s).toLowerCase() === words[j].term.toLowerCase())
      || (words[j].similar || []).some((s) => String(s.term || s).toLowerCase() === words[i].term.toLowerCase());
    return close(i, j) || sim;
  };
  // only words sharing a meaning (or listed as similar) are ever compared — fast on long lists
  const byKey = new Map();
  keys.forEach((ks, i) => { for (const k of new Set(ks)) { if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(i); } });
  const byTerm = new Map(words.map((w, i) => [w.term.toLowerCase(), i]));
  const nb = words.map((w, i) => {
    const set = new Set();
    for (const k of keys[i]) for (const j of byKey.get(k) || []) if (j !== i) set.add(j);
    for (const x of w.similar || []) { const j = byTerm.get(String(x.term || x).toLowerCase()); if (j !== undefined && j !== i) set.add(j); }
    return [...set];
  });
  nb.forEach((list, i) => list.forEach((j) => { if (!nb[j].includes(i)) nb[j].push(i); }));
  const order = words.map((_, i) => i).sort((a, b) => score(words[a]) - score(words[b]));
  const rankIdx = new Map(order.map((i, k) => [i, k]));
  const byOrder = (a, b) => rankIdx.get(a) - rankIdx.get(b);
  const used = new Set();
  const started = Date.now();
  const out = [];
  for (const h of order) {
    if (used.has(h)) continue;
    used.add(h);
    // direct candidates, plus theirs (one step further) — the AI check decides, so no chains slip in
    const d1 = nb[h].filter((j) => !used.has(j) && cand(h, j)).sort(byOrder);
    const d2 = [...new Set(d1.flatMap((i) => nb[i].filter((j) => j !== h && !used.has(j) && !d1.includes(j) && cand(i, j))))].sort(byOrder);
    const near = [...d1, ...d2].slice(0, 8);
    let keep = [];
    if (near.length && aiAvailable() && Date.now() - started < 15000) {
      try {
        const same = await sameMeaningWithAi(pickAr(words[h]), near.map((j) => pickAr(words[j])));
        keep = near.filter((j) => same.has(words[j].term.toLowerCase()));
      } catch { keep = []; }
    }
    keep.forEach((j) => used.add(j));
    out.push([words[h], ...keep.map((j) => words[j])]);
  }
  const pick = (w) => ({ uv_id: w.uv_id, vocabulary_id: w.vocabulary_id, term: w.term, level: w.level, arabic: w.user_arabic || w.arabic, status: w.status, mastery: w.mastery });
  return out
    .map((list) => {
      const sorted = [...list].sort((a, b) => score(a) - score(b));
      return { head: pick(sorted[0]), members: sorted.map(pick).sort((a, b) => lv(a.level) - lv(b.level)) };
    })
    .sort((a, b) => b.members.length - a.members.length || a.head.term.localeCompare(b.head.term));
}
