// The learner's sync correction moves every line and word together; the end of speech uses real word times when there are some.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline, positionAt, speechEnd } from '../public/js/shared/sync.js';

const lines = [
  { id: 1, start_seconds: 0, duration: 4, text: 'one two three four' },
  { id: 2, start_seconds: 5, duration: 4, text: 'five six seven eight' },
];

test('shift moves starts, ends and words together', () => {
  const a = buildTimeline(lines);
  const b = buildTimeline(lines, 0.5);
  assert.equal(b[0].start, a[0].start + 0.5);
  assert.equal(b[0].end, a[0].end + 0.5);
  assert.equal(b[1].words[0].start, a[1].words[0].start + 0.5);
  // at 5.2 s the second line has started with no shift, but not yet with +0.5
  assert.equal(positionAt(a, 5.2).line, 1);
  assert.equal(positionAt(b, 5.2).line, 0);
  assert.equal(positionAt(b, 5.6).line, 1);
  assert.deepEqual(buildTimeline(lines, 0), a);
});

test('speechEnd: real word times end the speech at the last word, estimated ones use the line end', () => {
  const est = buildTimeline(lines)[0];
  assert.equal(speechEnd(est), est.end);
  const real = buildTimeline([{ id: 9, start_seconds: 10, duration: 6, text: 'a b c', words: [[10000, 'a'], [10400, 'b'], [10900, 'c']] }, { id: 10, start_seconds: 20, text: 'next line here' }])[0];
  assert.ok(speechEnd(real) < real.end, 'stops before the silence that follows');
  assert.ok(speechEnd(real) >= 10.9 && speechEnd(real) < 12);
});
