// Live transcript sync: which sentence / word is spoken at a video time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline, lineIndexAt, wordIndexAt, positionAt, wordIndexByChar, speechEnd } from '../public/js/shared/sync.js';

const LINES = [
  { id: 11, start_seconds: 30, duration: 8, text: 'Today I want to talk about data analysis.' },
  { id: 12, start_seconds: 40, duration: 6, text: 'One of the most important skills is asking the right question.',
    words: [[40000, 'One'], [40300, 'of'], [40500, 'the'], [40700, 'most'], [41000, 'important'], [41600, 'skills'], [42000, 'is'],
      [42300, 'asking'], [42800, 'the'], [43000, 'right'], [43400, 'question.']] },
  { id: 13, start_seconds: 47, duration: 5, text: 'Before building a dashboard, we need to understand the problem.' },
];
const tl = buildTimeline(LINES);

test('00:42 is inside the second sentence', () => {
  assert.equal(tl[lineIndexAt(tl, 42)].id, 12);
});

test('before the first sentence nothing is highlighted; pauses keep the previous sentence', () => {
  assert.equal(lineIndexAt(tl, 5), -1);
  assert.equal(tl[lineIndexAt(tl, 30)].id, 11);
  assert.equal(tl[lineIndexAt(tl, 39.5)].id, 11, 'gap between sentences');
  assert.equal(tl[lineIndexAt(tl, 47)].id, 13);
  assert.equal(tl[lineIndexAt(tl, 500)].id, 13, 'after the end: last sentence');
});

test('seeking backwards and forwards jumps straight to the right sentence', () => {
  const order = [44, 31, 48, 40.2, 30].map((t) => tl[lineIndexAt(tl, t)].id);
  assert.deepEqual(order, [12, 11, 13, 12, 11]);
});

test('word-level highlighting follows the word timings', () => {
  const second = tl[1];
  assert.equal(wordIndexAt(second, 39.96), 0, 'tiny lead: the first word lights up as it starts');
  assert.equal(wordIndexAt(second, 39.5), -1);
  assert.equal(wordIndexAt(second, 41.2), 4); // "important"
  assert.equal(wordIndexAt(second, 43.5), 10); // "question."
  // No word timings: words are spread over the sentence by length.
  const est = tl[0];
  assert.equal(est.estimated, true);
  assert.equal(wordIndexAt(est, 30), 0);
  assert.equal(wordIndexAt(est, 37.5), est.words.length - 1, 'last word near the end');
  for (let k = 1; k < est.words.length; k += 1) assert.ok(est.words[k].start > est.words[k - 1].start);
  assert.deepEqual(positionAt(tl, 42.5), { line: 1, word: 7 }); // "asking"
  assert.deepEqual(positionAt(tl, 2), { line: -1, word: -1 });
});

test('ends: duration when given, else the next start; lines without time are ignored', () => {
  const t2 = buildTimeline([{ id: 1, start_seconds: 0, duration: 2, text: 'a' }, { id: 2, start_seconds: null, text: 'b' }, { id: 3, start_seconds: 10, text: 'c' }]);
  assert.deepEqual(t2.map((x) => [x.id, x.start, x.end]), [[1, 0, 2], [3, 10, 13]]);
  assert.equal(lineIndexAt([], 3), -1);
  assert.equal(lineIndexAt(t2, NaN), -1);
});

test('characters map to word indexes, matching the word timings', () => {
  const text = LINES[1].text;
  const map = wordIndexByChar(text);
  assert.equal(map[0], 0);
  assert.equal(map[text.indexOf('important')], 4);
  assert.equal(map[text.indexOf(' important')], -1);
  assert.equal(map[text.length - 1], 10);
  assert.equal(Math.max(...map) + 1, LINES[1].words.length);
});

test('a long transcript stays fast (binary search)', () => {
  const many = Array.from({ length: 5000 }, (_, i) => ({ id: i, start_seconds: i * 3, text: 'x' }));
  const big = buildTimeline(many);
  const t0 = performance.now();
  for (let k = 0; k < 10000; k += 1) lineIndexAt(big, (k * 7) % 15000);
  assert.ok(performance.now() - t0 < 200);
  assert.equal(big[lineIndexAt(big, 3001)].id, 1000);
});

test('highlight only moves forward: overlapping caption times and clock jitter', async () => {
  const { steadyPosition } = await import('../public/js/shared/sync.js');
  // Line 2 got a later start than line 3 (overlapping auto-captions).
  const tl2 = buildTimeline([
    { id: 1, start_seconds: 10, text: 'one two three' },
    { id: 2, start_seconds: 16, text: 'four five' },
    { id: 3, start_seconds: 14, text: 'six seven' },
  ]);
  assert.deepEqual(tl2.map((x) => x.id), [1, 2, 3], 'reading order kept');
  assert.deepEqual(tl2.map((x) => x.start), [10, 16, 16.8], 'times never go back, and line 2 still gets a moment of its own');
  // Walking through time, the line index never decreases.
  let prev = null;
  const seen = [];
  for (let t = 9; t < 20; t += 0.1) {
    prev = steadyPosition(tl2, t, prev, { playing: true });
    seen.push(prev.line);
  }
  assert.ok(seen.every((v, i) => i === 0 || v >= seen[i - 1]));
  // Jitter (0.3 s back) keeps the highlight; a real seek back moves it.
  const at = steadyPosition(tl, 42, null);
  assert.deepEqual(steadyPosition(tl, 41.7, at, { playing: true }), at);
  assert.equal(tl[steadyPosition(tl, 31, at, { playing: true }).line].id, 11);
});

test('server: overlapping captions give lines in time order', async () => {
  const { toSentences } = await import('../server/services/extractor.js');
  const lines = toSentences([
    { start: 0, dur: 6, text: 'so today we will talk about' },
    { start: 2, dur: 6, text: 'learning faster and better' },
    { start: 4, dur: 6, text: 'with some simple tricks' },
  ]);
  for (let i = 1; i < lines.length; i += 1) assert.ok(lines[i].start >= lines[i - 1].start, JSON.stringify(lines));
});

test('dedupeLines drops rolling-caption repeats and repoints their words', async () => {
  const { dedupeLines } = await import('../public/js/shared/sync.js');
  const d = { lines: [
    { id: 1, text: 'that will be providing homes with', start_seconds: 10 },
    { id: 2, text: 'electricity powered by those', start_seconds: 12 },
    { id: 3, text: 'That will be providing homes with,', start_seconds: 13 },
    { id: 4, text: 'that will be providing homes with', start_seconds: 60 },
  ], items: [{ line_id: 3 }] };
  const r = dedupeLines(d);
  assert.deepEqual(r.lines.map((l) => l.id), [1, 2, 4]);
  assert.equal(r.items[0].line_id, 1);
});

// ---- the learner's sync correction and the real end of speech ----
const SHIFT_LINES = [
  { id: 1, start_seconds: 0, duration: 4, text: 'one two three four' },
  { id: 2, start_seconds: 5, duration: 4, text: 'five six seven eight' },
];

test('shift moves starts, ends and words together', () => {
  const a = buildTimeline(SHIFT_LINES);
  const b = buildTimeline(SHIFT_LINES, 0.5);
  assert.equal(b[0].start, a[0].start + 0.5);
  assert.equal(b[0].end, a[0].end + 0.5);
  assert.equal(b[1].words[0].start, a[1].words[0].start + 0.5);
  // at 5.2 s the second line has started with no shift, but not yet with +0.5
  assert.equal(positionAt(a, 5.2).line, 1);
  assert.equal(positionAt(b, 5.2).line, 0);
  assert.equal(positionAt(b, 5.6).line, 1);
  assert.deepEqual(buildTimeline(SHIFT_LINES, 0), a);
});

test('speechEnd: real word times end the speech at the last word, estimated ones use the line end', () => {
  const est = buildTimeline(SHIFT_LINES)[0];
  assert.equal(speechEnd(est), est.end);
  const real = buildTimeline([{ id: 9, start_seconds: 10, duration: 6, text: 'a b c', words: [[10000, 'a'], [10400, 'b'], [10900, 'c']] }, { id: 10, start_seconds: 20, text: 'next line here' }])[0];
  assert.ok(speechEnd(real) < real.end, 'stops before the silence that follows');
  assert.ok(speechEnd(real) >= 10.9 && speechEnd(real) < 12);
});
