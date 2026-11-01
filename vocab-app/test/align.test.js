// Phrase alignment: AI phrases laid exactly over the transcript's words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkRanges, batchRanges } from '../server/lib/align.js';

test('exact phrases → ranges covering the whole line', () => {
  const t = 'Many employees are reluctant to share their ideas.';
  const r = chunkRanges(t, [{ en: 'Many employees', ar: 'أ' }, { en: 'are reluctant', ar: 'ب' }, { en: 'to share their ideas.', ar: 'ج' }]);
  assert.deepEqual(r.map(([a, b]) => t.slice(a, b).trim()), ['Many employees', 'are reluctant', 'to share their ideas.']);
  assert.equal(r.at(-1)[1], t.length);
});

test('different words are refused; one changed word is tolerated', () => {
  const t = 'humans are not supposed to pull two all-nighters';
  assert.equal(chunkRanges(t, [{ en: 'people should never stay up', ar: 'x' }]), null);
  assert.ok(chunkRanges(t, [{ en: 'humans are not supposed', ar: 'أ' }, { en: 'to pull two all nighters', ar: 'ب' }]));
});

test('a sentence running over two lines does not break the following lines', () => {
  const lines = [{ text: 'wrote 90 pages, sprinted across campus, dove' }, { text: 'motion, and got it in just at the deadline.' }, { text: 'I thought that was the end of everything.' }];
  const ai = [
    [{ en: 'wrote 90 pages,', ar: 'أ' }, { en: 'sprinted across campus,', ar: 'ب' }],
    [{ en: 'dove motion,', ar: 'ج' }, { en: 'and got it in just at the deadline.', ar: 'د' }],
    [{ en: 'I thought that was', ar: 'هـ' }, { en: 'the end of everything.', ar: 'و' }],
  ];
  const r = batchRanges(lines, ai);
  assert.ok(r.every(Boolean));
  assert.deepEqual(r[2].map(([a, b, ar]) => [lines[2].text.slice(a, b).trim(), ar]), [['I thought that was', 'هـ'], ['the end of everything.', 'و']]);
  assert.equal(r[1][0][0], 0);
});
