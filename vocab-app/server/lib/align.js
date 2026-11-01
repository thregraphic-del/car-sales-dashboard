// Turn AI phrase chunks into character ranges of the original line, so the
// reader can show each English phrase and its Arabic side by side.
const norm = (w) => w.toLowerCase().replace(/[’']/g, "'").replace(/[^\p{L}\p{N}']/gu, '');

/**
 * text: the line; chunks: [{en, ar}] in order.
 * → [[from, to, ar], ...] covering the whole line, or null if the chunks don't
 * reproduce the line's words exactly (then the line is shown as before).
 */
export function chunkRanges(text, chunks) {
  return exactRanges(text, chunks) || looseRanges(text, chunks);
}

function exactRanges(text, chunks) {
  const tokens = [...String(text).matchAll(/\S+/g)].map((m) => ({ w: norm(m[0]), start: m.index }))
    .filter((t) => t.w);
  if (!tokens.length || !Array.isArray(chunks) || !chunks.length) return null;
  const starts = [];
  let t = 0;
  for (const c of chunks) {
    const words = String(c.en || '').split(/\s+/).map(norm).filter(Boolean);
    if (!words.length) continue;
    if (t + words.length > tokens.length) return null;
    for (let k = 0; k < words.length; k += 1) if (tokens[t + k].w !== words[k]) return null;
    starts.push({ at: tokens[t].start, ar: String(c.ar || '').trim() });
    t += words.length;
  }
  if (t !== tokens.length || !starts.length) return null;
  starts[0].at = 0;
  return starts.map((s, i) => [s.at, i + 1 < starts.length ? starts[i + 1].at : text.length, s.ar]);
}

/**
 * When the AI changed a word or two (spelling, a dropped "--"), place the phrase
 * borders by word count, as long as almost all words still match in order.
 */
function looseRanges(text, chunks) {
  const tokens = [...String(text).matchAll(/\S+/g)].map((m) => ({ w: norm(m[0]), start: m.index })).filter((t) => t.w);
  const parts = (Array.isArray(chunks) ? chunks : []).map((c) => ({ words: String(c.en || '').split(/\s+/).map(norm).filter(Boolean), ar: String(c.ar || '').trim() }))
    .filter((c) => c.words.length);
  const total = parts.reduce((n, c) => n + c.words.length, 0);
  if (!tokens.length || !parts.length || Math.abs(total - tokens.length) > 2) return null;
  const flat = parts.flatMap((c) => c.words);
  let same = 0;
  for (let i = 0; i < Math.min(flat.length, tokens.length); i += 1) if (flat[i] === tokens[i].w) same += 1;
  if (same / tokens.length < 0.8) return null;
  const starts = [];
  let t = 0;
  for (const c of parts) {
    if (t >= tokens.length) break;
    starts.push({ at: tokens[t].start, ar: c.ar });
    t += c.words.length;
  }
  starts[0].at = 0;
  return starts.map((s, i) => [s.at, i + 1 < starts.length ? starts[i + 1].at : text.length, s.ar]);
}

/**
 * Align a whole batch at once, ignoring which line the AI put each phrase in:
 * the phrases are laid over the lines' words in order. A phrase that runs over
 * the end of a line is cut there (its Arabic stays with the bigger part).
 * → one [[from, to, ar], ...] (or null) per line.
 */
export function batchRanges(lines, chunkLists) {
  const lineTokens = lines.map((l) => [...String(l.text).matchAll(/\S+/g)].map((m) => ({ w: norm(m[0]), start: m.index })).filter((t) => t.w));
  const chunks = chunkLists.flat().map((c) => ({ words: String(c?.en || '').split(/\s+/).map(norm).filter(Boolean), ar: String(c?.ar || '').trim() }))
    .filter((c) => c.words.length);
  const allTokens = lineTokens.flat();
  const allWords = chunks.flatMap((c) => c.words);
  if (!allTokens.length || Math.abs(allWords.length - allTokens.length) > Math.max(2, allTokens.length * 0.03)) return lines.map(() => null);
  let same = 0;
  for (let i = 0; i < Math.min(allWords.length, allTokens.length); i += 1) if (allWords[i] === allTokens[i].w) same += 1;
  if (same / allTokens.length < 0.85) return lines.map(() => null);
  let ci = 0;
  let used = 0; // words of chunks[ci] already placed
  return lines.map((line, li) => {
    const toks = lineTokens[li];
    if (!toks.length) return null;
    const segs = [];
    let t = 0;
    while (t < toks.length && ci < chunks.length) {
      const c = chunks[ci];
      const n = Math.min(c.words.length - used, toks.length - t);
      const isFirst = used === 0;
      const whole = c.words.length;
      const keepAr = isFirst ? n >= whole - n : n > whole - (used + n) && n > used;
      segs.push({ t, n, ar: keepAr ? c.ar : '' });
      t += n;
      used += n;
      if (used >= whole) { ci += 1; used = 0; }
    }
    if (t < toks.length) segs.push({ t, n: toks.length - t, ar: '' });
    // A part without its own Arabic joins its neighbour in the same line.
    const merged = [];
    for (const s of segs) {
      if (!s.ar && merged.length) merged[merged.length - 1].n += s.n;
      else merged.push({ ...s });
    }
    if (merged.length > 1 && !merged[0].ar) {
      merged[1].t = merged[0].t;
      merged[1].n += merged[0].n;
      merged.shift();
    }
    if (!merged.some((s) => s.ar)) return null;
    return merged.map((s, i) => [i === 0 ? 0 : toks[s.t].start, i + 1 < merged.length ? toks[merged[i + 1].t].start : line.text.length, s.ar]);
  });
}
