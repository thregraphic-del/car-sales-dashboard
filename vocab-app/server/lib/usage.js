// How common a word is, for the colour of the word: green = everyday and very useful,
// orange = less common / a bit advanced, red = rare, formal or specialised.
import { COMMON_WORDS } from './common-words.js';

const RANK = new Map(COMMON_WORDS.map((w, i) => [w, i]));
const ADV = { A1: 0, A2: 0, B1: 1, B2: 1, C1: 2, C2: 2 };

/** 'common' | 'medium' | 'rare' — from the CEFR level when known (A1–B1 / B2 / C1–C2), so the colour always matches the level. */
export function usageOf(term, level = null) {
  if (['A1', 'A2', 'B1'].includes(level)) return 'common';
  if (level === 'B2') return 'medium';
  if (level === 'C1' || level === 'C2') return 'rare';
  const t = String(term || '').toLowerCase().trim();
  const r = RANK.get(t);
  if (r !== undefined) return r < 2500 ? 'common' : r < 5000 ? 'medium' : (ADV[level] === 2 ? 'rare' : 'medium');
  const a = ADV[level];
  if (/\s/.test(t)) return a === 2 ? 'rare' : a === 1 ? 'medium' : 'common'; // expressions: by level
  return a === 2 ? 'rare' : 'medium';
}
