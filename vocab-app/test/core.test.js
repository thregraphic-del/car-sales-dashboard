import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyReview, statusOf, isDifficult, computeDifficulty } from '../server/srs.js';
import { parseYoutubeId, parsePastedTranscript } from '../server/youtube.js';
import { extractVocabulary, toSentences } from '../server/extractor.js';

const fresh = () => ({ review_count: 0, correct_count: 0, wrong_count: 0, streak_correct: 0, lapses: 0, ease: 2.5, interval_days: 0, mastery: 0, next_review_at: null, recent: '', difficulty: 0 });

test('parses YouTube URL formats', () => {
  assert.equal(parseYoutubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30'), 'dQw4w9WgXcQ');
  assert.equal(parseYoutubeId('https://youtu.be/dQw4w9WgXcQ?si=x'), 'dQw4w9WgXcQ');
  assert.equal(parseYoutubeId('youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parseYoutubeId('https://m.youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parseYoutubeId('https://example.com/watch?v=abc'), null);
  assert.equal(parseYoutubeId('not a url'), null);
});

test('SRS: correct answers space reviews out; wrong answers bring them back', () => {
  const now = new Date('2026-01-01T10:00:00Z');
  let uv = fresh();
  uv = applyReview(uv, 'good', { now });
  assert.equal(uv.interval_days, 1);
  uv = applyReview(uv, 'good', { now });
  assert.equal(uv.interval_days, 3);
  uv = applyReview(uv, 'easy', { now });
  assert.ok(uv.interval_days > 7);
  uv = applyReview(uv, 'hard', { now });
  assert.equal(uv.interval_days, 0);
  assert.equal(uv.lapses, 1);
  assert.ok(new Date(uv.next_review_at) - now <= 10 * 60 * 1000);
  assert.equal(uv.recent, '1110');
  assert.equal(statusOf(uv), 'learning');
});

test('difficulty: recent mistakes count more than old ones, and words recover', () => {
  let uv = fresh();
  for (const g of ['good', 'good', 'good', 'good', 'hard', 'hard']) uv = applyReview(uv, g);
  assert.ok(isDifficult(uv), 'two misses in a row → difficult now');
  const hardNow = uv.difficulty;
  for (let i = 0; i < 6; i += 1) uv = applyReview(uv, 'good');
  assert.ok(uv.difficulty < hardNow, 'difficulty decreases after correct answers');
  assert.ok(!isDifficult(uv), 'a word recovers after consistent success');
  // Same totals, but old mistakes → less difficult than recent mistakes.
  const old = computeDifficulty({ correct_count: 4, wrong_count: 2, lapses: 0, recent: '001111' });
  const recent = computeDifficulty({ correct_count: 4, wrong_count: 2, lapses: 0, recent: '111100' });
  assert.ok(recent > old);
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

test('game answers on not-yet-due words do not reschedule, but mistakes always do', () => {
  let uv = applyReview(fresh(), 'good');
  const next = uv.next_review_at;
  uv = applyReview(uv, 'good', { scheduling: false });
  assert.equal(uv.next_review_at, next);
  uv = applyReview(uv, 'hard', { scheduling: false });
  assert.notEqual(uv.next_review_at, next);
  assert.equal(uv.interval_days, 0);
});

test('YouTube transcript processing keeps every word, order and timestamps', () => {
  const segs = parsePastedTranscript('0:05 Hello there.\n[1:02:03] Later line\nno time here');
  assert.deepEqual(segs.map((s) => s.start), [5, 3723, null]);
  const s = toSentences([{ start: 1, text: 'One sentence. Two' }, { start: 4, text: 'continues here.' }, { start: 9, text: '[Music] Last one!' }]);
  assert.deepEqual(s.map((x) => x.text), ['One sentence.', 'Two continues here.', 'Last one!']);
  assert.deepEqual(s.map((x) => x.start), [1, 1, 9]);
});

test('offline extraction finds phrases with their line, skips basic words and duplicates', async () => {
  const lines = [
    'I was reluctant at first, and honestly it took a while to figure it out.',
    'Most people take their health for granted until something goes wrong.',
    'I came across a great book and the house was big and nice and good.',
    'She turned it down because she was overwhelmed. Reluctant again.',
  ].map((text, idx) => ({ idx, start: idx * 10, text }));
  const { items, engine } = await extractVocabulary({ title: 't', lines, engine: 'dictionary' });
  const terms = items.map((i) => i.term);
  assert.equal(engine, 'dictionary');
  for (const t of ['reluctant', 'figure something out', 'take something for granted', 'come across', 'turn down', 'overwhelmed']) {
    assert.ok(terms.includes(t), `missing ${t}`);
  }
  assert.ok(!terms.includes('house') && !terms.includes('big'));
  assert.equal(terms.filter((t) => t === 'reluctant').length, 1);
  assert.equal(items.find((i) => i.term === 'take something for granted').line, 1);
  assert.equal(items.find((i) => i.term === 'reluctant').contextual_meaning, null, 'offline meanings are not claimed to be contextual');
});
