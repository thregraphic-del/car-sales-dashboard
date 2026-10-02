import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyReview, statusOf, isDifficult } from '../server/srs.js';
import { parseYoutubeId, parsePastedTranscript } from '../server/youtube.js';
import { extractVocabulary, toSentences } from '../server/extractor.js';

const fresh = () => ({ review_count: 0, correct_count: 0, wrong_count: 0, streak_correct: 0, lapses: 0, ease: 2.5, interval_days: 0, mastery: 0, next_review_at: null });

test('parses YouTube URL formats', () => {
  assert.equal(parseYoutubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30'), 'dQw4w9WgXcQ');
  assert.equal(parseYoutubeId('https://youtu.be/dQw4w9WgXcQ?si=x'), 'dQw4w9WgXcQ');
  assert.equal(parseYoutubeId('youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parseYoutubeId('https://m.youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parseYoutubeId('https://example.com/watch?v=abc'), null);
  assert.equal(parseYoutubeId('not a url'), null);
});

test('correct answers space reviews out; wrong answers bring them back', () => {
  const now = new Date('2026-01-01T10:00:00Z');
  let uv = fresh();
  uv = applyReview(uv, 'good', { now });
  assert.equal(uv.interval_days, 1);
  uv = applyReview(uv, 'good', { now });
  assert.equal(uv.interval_days, 3);
  uv = applyReview(uv, 'easy', { now });
  assert.ok(uv.interval_days > 7);
  const before = uv.interval_days;
  uv = applyReview(uv, 'hard', { now });
  assert.equal(uv.interval_days, 0);
  assert.equal(uv.lapses, 1);
  assert.ok(new Date(uv.next_review_at) - now <= 10 * 60 * 1000);
  assert.ok(before > 0);
  assert.equal(statusOf(uv), 'learning');
});

test('repeated mistakes mark a word difficult', () => {
  let uv = fresh();
  for (const g of ['hard', 'good', 'hard', 'hard']) uv = applyReview(uv, g);
  assert.ok(isDifficult(uv));
});

test('consistent success reaches mastered', () => {
  let uv = fresh();
  let t = new Date('2026-01-01T10:00:00Z');
  for (let i = 0; i < 6; i += 1) {
    uv = applyReview(uv, 'easy', { now: t });
    t = new Date(uv.next_review_at);
  }
  assert.equal(statusOf(uv), 'mastered');
});

test('game answers on not-yet-due words do not reschedule', () => {
  let uv = applyReview(fresh(), 'good');
  const next = uv.next_review_at;
  uv = applyReview(uv, 'good', { scheduling: false });
  assert.equal(uv.next_review_at, next);
  assert.equal(uv.correct_count, 2);
});

test('pasted transcript keeps timestamps', () => {
  const segs = parsePastedTranscript('0:05 Hello there.\n[1:02:03] Later line\nno time here');
  assert.deepEqual(segs.map((s) => s.start), [5, 3723, null]);
});

test('sentence builder splits on punctuation and keeps start times', () => {
  const s = toSentences([{ start: 1, text: 'One sentence. Two' }, { start: 4, text: 'continues here.' }]);
  assert.equal(s.length, 2);
  assert.equal(s[1].text, 'Two continues here.');
  assert.equal(s[1].start, 1);
});

test('dictionary extractor finds phrases, skips basic words and duplicates', async () => {
  const text = [
    '0:05 I was reluctant at first, and honestly it took a while to figure it out.',
    '0:12 Most people take their health for granted until something goes wrong.',
    '0:20 I came across a great book and the house was big and nice and good.',
    '0:30 She turned it down because she was overwhelmed. Reluctant again, reluctantly.',
  ].join('\n');
  const { items, engine } = await extractVocabulary({ title: 't', segments: parsePastedTranscript(text), engine: 'dictionary' });
  const terms = items.map((i) => i.term);
  assert.equal(engine, 'dictionary');
  for (const t of ['reluctant', 'figure something out', 'take something for granted', 'come across', 'turn down', 'overwhelmed']) {
    assert.ok(terms.includes(t), `missing ${t}`);
  }
  assert.ok(!terms.includes('house') && !terms.includes('big'));
  assert.equal(terms.filter((t) => t === 'reluctant').length, 1);
  const r = items.find((i) => i.term === 'take something for granted');
  assert.equal(r.timestamp_seconds, 12);
});
