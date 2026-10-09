// Transcript ↔ video synchronisation (pure functions — used by the reader and
// tested on the server). Everything is based on the caption timestamps:
//   line.start_seconds   when the sentence starts
//   line.duration        how long it lasts (else: until the next sentence)
//   line.words           [[ms, word], ...] word timings when YouTube gives them

/**
 * Build a sorted timeline once per transcript.
 * → [{ id, start, end, words: [{ start, end }] | null }] (seconds)
 */
export function buildTimeline(lines) {
  const timed = lines.filter((l) => Number.isFinite(l.start_seconds)).sort((a, b) => a.start_seconds - b.start_seconds);
  return timed.map((l, i) => {
    const next = timed[i + 1];
    const start = l.start_seconds;
    const lastWord = l.words?.length ? l.words[l.words.length - 1][0] / 1000 : null;
    let end = next ? next.start_seconds : start + (l.duration > 0 ? l.duration : Math.max(3, (lastWord ?? start) - start + 1.5));
    if (l.duration > 0 && next) end = Math.min(next.start_seconds, Math.max(start + l.duration, lastWord ?? 0));
    if (end <= start) end = start + 0.5;
    const words = l.words?.length
      ? l.words.map(([ms], k) => ({
        start: ms / 1000,
        end: k + 1 < l.words.length ? l.words[k + 1][0] / 1000 : Math.max(end, ms / 1000 + 0.3),
      }))
      : estimateWords(l.text, start, end);
    return { id: l.id, start, end, words, estimated: !l.words?.length };
  });
}

/**
 * Without word timings, spread the sentence's time over its words in
 * proportion to their length (speech takes longer for longer words), leaving
 * a short tail for the pause before the next sentence.
 */
export function estimateWords(text, start, end) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const span = Math.max(0.3, (end - start) * 0.92);
  const weight = words.map((w) => w.replace(/[^\p{L}\p{N}]/gu, '').length + 2);
  const total = weight.reduce((a, b) => a + b, 0);
  let t = start;
  return words.map((_, k) => {
    const s = t;
    t += (span * weight[k]) / total;
    return { start: s, end: t };
  });
}

/** Index of the last entry with start ≤ t (binary search), or -1. */
function lastStartingBefore(list, t) {
  let lo = 0;
  let hi = list.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].start <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/**
 * The sentence being spoken at time t (seconds): the last one that has
 * started. Before the first sentence → null. In a pause between two sentences
 * the previous one stays highlighted until the next begins.
 */
export function lineIndexAt(timeline, t) {
  if (!timeline.length || !Number.isFinite(t)) return -1;
  return lastStartingBefore(timeline, t + 0.05); // tiny lead so the highlight never lags the voice
}

/** The word being spoken at time t within a timeline entry, or -1. */
export function wordIndexAt(entry, t) {
  if (!entry?.words?.length || t < entry.words[0].start - 0.05) return -1;
  return lastStartingBefore(entry.words, t + 0.05);
}

/**
 * State for one moment: { line, word } indexes (−1 when none).
 * Cheap enough to run on every animation frame.
 */
export function positionAt(timeline, t) {
  const line = lineIndexAt(timeline, t);
  return { line, word: line >= 0 ? wordIndexAt(timeline[line], t) : -1 };
}

/**
 * For each character of a line's text, the index of the whitespace-separated
 * word it belongs to (or -1 for spaces). Word i of the text = timing i.
 */
export function wordIndexByChar(text) {
  const out = new Array(text.length).fill(-1);
  let k = -1;
  let inWord = false;
  for (let i = 0; i < text.length; i += 1) {
    const space = /\s/.test(text[i]);
    if (!space && !inWord) k += 1;
    inWord = !space;
    if (!space) out[i] = k;
  }
  return out;
}
