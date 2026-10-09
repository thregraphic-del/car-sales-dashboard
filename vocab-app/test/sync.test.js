// Live transcript sync: which sentence / word is spoken at a video time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline, lineIndexAt, wordIndexAt, positionAt, wordIndexByChar } from '../public/js/shared/sync.js';

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
