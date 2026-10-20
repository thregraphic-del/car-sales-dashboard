// Turn AI phrase chunks into character ranges of the original line, so the
// reader can show each English phrase and its Arabic side by side.
const norm = (w) => w.toLowerCase().replace(/[’']/g, "'").replace(/[^\p{L}\p{N}']/gu, '');

/**
 * text: the line; chunks: [{en, ar}] in order.
 * → [[from, to, ar], ...] covering the whole line, or null if the chunks don't
 * reproduce the line's words exactly (then the line is shown as before).
 */
export function chunkRanges(text, chunks) {
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
