// The practice builder's choices, run on made-up words (the same code the page runs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectWords, DEFAULTS, videoList } from '../public/js/practice-builder.js';

const NOW = new Date('2026-11-05T12:00:00Z').getTime();
const DAY = 86400000;
const iso = (d) => new Date(NOW - d * DAY).toISOString();
const w = (id, o = {}) => ({ uv_id: id, term: `w${id}`, level: 'B1', usage: 'common', item_type: 'word', group_ids: [], saved_at: iso(1), review_count: 0, correct_count: 0, wrong_count: 0, mastery: 0, status: 'new', ...o });
const words = [
  w(1, { source: { id: 10, title: 'old video' }, saved_at: iso(20) }),
  w(2, { source: { id: 11, title: 'last video' }, saved_at: iso(0.1) }),
  w(3, { source: { id: 11, title: 'last video' }, saved_at: iso(0.2), last_wrong_at: iso(1), review_count: 3, wrong_count: 2, correct_count: 1, mastery: 20, status: 'learning' }),
  w(4, { level: 'C1', usage: 'rare', saved_at: iso(40), last_reviewed_at: iso(30), review_count: 2, correct_count: 2, mastery: 60, status: 'learning' }),
  w(5, { term: 'figure out', item_type: 'expression', saved_at: iso(2), review_count: 4, correct_count: 4, mastery: 90, status: 'mastered', last_reviewed_at: iso(0) }),
  w(6, { saved_at: iso(3), due: true, review_count: 1, correct_count: 1, mastery: 40, status: 'learning', next_review_at: iso(2), last_reviewed_at: iso(4) }),
];
const pick = (f) => selectWords(words, { ...DEFAULTS, count: 0, notToday: false, ...f }, NOW).list.map((x) => x.uv_id);

test('from where: last video, last 3 videos, chosen videos, groups', () => {
  assert.equal(videoList(words)[0].id, 11);
  assert.deepEqual(pick({ from: 'lastVideo' }).sort(), [2, 3]);
  assert.deepEqual(pick({ from: 'videos', sources: ['10'] }), [1]);
  assert.deepEqual(pick({ from: 'groups', groups: ['7'] }), []);
});

test('when: last N saved, today, this week, older than a month', () => {
  assert.deepEqual(pick({ when: 'lastN', lastN: 2 }).sort(), [2, 3]);
  assert.deepEqual(pick({ when: 'today' }).sort(), [2, 3]);
  assert.deepEqual(pick({ when: 'older' }), [4]);
});

test('performance: missed lately, never practised, due, about to be forgotten, mastered (any of them)', () => {
  assert.deepEqual(pick({ perf: ['wrong'] }), [3]);
  assert.deepEqual(pick({ perf: ['never'] }).sort(), [1, 2]);
  assert.deepEqual(pick({ perf: ['due'] }), [6]);
  assert.deepEqual(pick({ perf: ['fading'] }).sort(), [1, 4]);
  assert.deepEqual(pick({ perf: ['mastered'] }), [5]);
  assert.deepEqual(pick({ perf: ['wrong', 'due'] }).sort(), [3, 6]);
});

test('difficulty: level, how common, words or expressions', () => {
  assert.deepEqual(pick({ levels: ['C1'] }), [4]);
  assert.deepEqual(pick({ usage: ['rare'] }), [4]);
  assert.deepEqual(pick({ kind: 'expressions' }), [5]);
  assert.ok(!pick({ kind: 'words' }).includes(5));
});

test('how many and in what order: smart puts recent mistakes first; «not again today» skips today\'s words', () => {
  assert.equal(pick({ order: 'smart' })[0], 3);
  assert.equal(selectWords(words, { ...DEFAULTS, count: 2, order: 'smart', notToday: false }, NOW).list.length, 2);
  assert.ok(!selectWords(words, { ...DEFAULTS, count: 0, notToday: true }, NOW).list.some((x) => x.uv_id === 5));
  assert.deepEqual(pick({ order: 'old' })[0], 4);
});
