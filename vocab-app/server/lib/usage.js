// How common a word is, for the colour of the word: green = everyday and very useful,
// orange = less common / a bit advanced, red = rare, formal or specialised.
import { COMMON_WORDS } from './common-words.js';

const RANK = new Map(COMMON_WORDS.map((w, i) => [w, i]));
const ADV = { A1: 0, A2: 0, B1: 1, B2: 1, C1: 2, C2: 2 };

/** 'common' | 'medium' | 'rare' */
export function usageOf(term, level = null) {
  const t = String(term || '').toLowerCase().trim();
  const r = RANK.get(t);
  if (r !== undefined) return r < 2500 ? 'common' : r < 5000 ? 'medium' : (ADV[level] === 2 ? 'rare' : 'medium');
  const a = ADV[level];
  if (/\s/.test(t)) return a === 2 ? 'rare' : a === 1 ? 'medium' : 'common'; // expressions: by level
  return a === 2 ? 'rare' : 'medium';
}
