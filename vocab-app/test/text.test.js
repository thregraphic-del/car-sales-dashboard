// Deterministic text layer: duplicate keys, lemmas, tiers, tokenising, import parsing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchKey, singularCandidates, lemmaCandidates, tokenize, quickTier, sameArabicMeaning, sentenceKey,
} from '../public/js/shared/text.js';
import { parseInput, sentenceUses } from '../server/importer.js';
import { findSpan } from '../server/matcher.js';

test('duplicate keys ignore case, punctuation, spaces, slots and "to"', () => {
  const same = ['Figure something out', 'figure out', '  Figure-out. ', 'figure  sth  out'];
  for (const t of same) assert.equal(matchKey(t), 'figure out', t);
  assert.equal(matchKey('to improve'), 'improve');
  assert.equal(matchKey('Take YOUR time'), "take one's time");
  assert.equal(matchKey('“Reliable,”'), 'reliable');
  assert.notEqual(matchKey('turn down'), matchKey('turn up'));
});

test('plural handling is conservative', () => {
  assert.deepEqual(singularCandidates('reports'), ['report']);
  assert.ok(singularCandidates('studies').includes('study'));
  assert.ok(singularCandidates('boxes').includes('box'));
  for (const w of ['news', 'analysis', 'business', 'process', 'bias', 'status', 'whereas']) assert.deepEqual(singularCandidates(w), [], w);
});

test('lemma candidates cover common inflections', () => {
  const has = (w, l) => assert.ok(lemmaCandidates(w).includes(l), `${w} → ${l}`);
  has('decided', 'decide');
  has('worked', 'work');
  has('stopped', 'stop');
  has('making', 'make');
  has('getting', 'get');
  has('reliably', 'reliable');
  has('easily', 'easy');
  has('took', 'take');
  has('studies', 'study');
});

test('tiers: function words and basic words are recognised without AI', () => {
  assert.equal(quickTier('the'), 'function');
  assert.equal(quickTier('because'), 'function');
  assert.equal(quickTier('houses'), 'basic');
  assert.equal(quickTier('reluctant'), null);
});

test('tokenize keeps the exact original characters', () => {
  const line = "It's a well-known fact — isn't it?";
  const toks = tokenize(line);
  assert.equal(toks.map((t) => t.text).join(''), line);
  assert.deepEqual(toks.filter((t) => t.word).map((t) => t.text), ["It's", 'a', 'well-known', 'fact', "isn't", 'it']);
});

test('Arabic meanings compare loosely (diacritics, letter variants, containment)', () => {
  assert.ok(sameArabicMeaning('متردد', 'متردد / غير راغب'));
  assert.ok(sameArabicMeaning('يُحسِّن', 'يحسن'));
  assert.ok(sameArabicMeaning('أداة', 'اداه'));
  assert.ok(!sameArabicMeaning('دقيق', 'موثوق'));
  assert.equal(sentenceKey('The report is accurate.'), sentenceKey('  the REPORT is accurate '));
});

test('phrase matching finds inflected and separated phrases', () => {
  assert.equal(findSpan('figure something out', 'I finally figured it out today').text, 'figured it out');
  assert.equal(findSpan('take something for granted', 'We take so much for granted.').text, 'take so much for granted');
  assert.equal(findSpan('turn down', 'She turned the offer down.'), null, 'long objects are not guessed');
  assert.equal(findSpan('turn down', 'She turned it down.').text, 'turned it down');
});

/* ---------------------------------------------------------- text import */

const terms = (r) => r.items.map((i) => i.term);

test('import A: English words only', () => {
  const r = parseInput('apple\nimprove\naccurate\nreliable');
  assert.deepEqual(terms(r), ['apple', 'improve', 'accurate', 'reliable']);
  assert.equal(r.passage, '');
});

test('import B: English = Arabic', () => {
  const r = parseInput('accurate = دقيق\nreliable = موثوق\nimprove = يحسن');
  assert.deepEqual(r.items.map((i) => [i.term, i.arabic]), [['accurate', 'دقيق'], ['reliable', 'موثوق'], ['improve', 'يحسن']]);
});

test('import C/D: word (+ Arabic) + example on the next line', () => {
  const c = parseInput('accurate\nThe report is accurate.');
  assert.deepEqual(c.items[0].examples, [{ sentence: 'The report is accurate.', arabic: null }]);
  const d = parseInput('accurate — دقيق\nThe report is accurate.');
  assert.equal(d.items[0].arabic, 'دقيق');
  assert.equal(d.items[0].examples.length, 1);
});

test('import E: full English text becomes a passage, not a word list', () => {
  const r = parseInput('"I need to improve the accuracy of this report because the current data is not reliable."');
  assert.equal(r.items.length, 0);
  assert.match(r.passage, /improve the accuracy/);
});

test('import F: messy notes — mixed scripts, missing meanings, example for an earlier word', () => {
  const r = parseInput('accurate دقيق\nreliable موثوق\nimprove يحسن\nimportant\nThe data is accurate.');
  assert.deepEqual(terms(r), ['accurate', 'reliable', 'improve', 'important']);
  assert.equal(r.items[3].arabic, null);
  assert.equal(r.items[0].examples[0].sentence, 'The data is accurate.', 'example attached to the word it uses');
});

test('import: bullets, POS hints, Arabic on its own line, example translation, English definitions, Arabic first', () => {
  const r = parseInput('1. figure something out (phr v)\nيكتشف\nI finally figured it out.\nفهمتها أخيرًا\n- turn down: refuse an offer\nدقيق accurate\napple, banana, pear');
  const f = r.items[0];
  assert.equal(f.term, 'figure something out');
  assert.equal(f.pos, 'phrasal verb');
  assert.equal(f.arabic, 'يكتشف');
  assert.deepEqual(f.examples[0], { sentence: 'I finally figured it out.', arabic: 'فهمتها أخيرًا' });
  assert.equal(r.items[1].simple_english, 'refuse an offer');
  assert.deepEqual([r.items[2].term, r.items[2].arabic], ['accurate', 'دقيق']);
  assert.deepEqual(terms(r).slice(3), ['apple', 'banana', 'pear']);
});

test('import: duplicates inside one paste are merged; unclear lines are reported, not guessed', () => {
  const r = parseInput('Accurate\naccurate = دقيق\n???\n12345');
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].arabic, 'دقيق');
  assert.deepEqual(r.unclear, ['???', '12345']);
});

test('sentenceUses understands inflections and separated phrases', () => {
  assert.ok(sentenceUses('She decided to leave.', 'decide'));
  assert.ok(sentenceUses('I figured the whole thing out.', 'figure something out'));
  assert.ok(!sentenceUses('The weather is nice.', 'accurate'));
});

test('subtitle sync picks the line being spoken', async () => {
  const { lineAt } = await import('../public/js/shared/text.js');
  const lines = [{ id: 1, start_seconds: 0 }, { id: 2, start_seconds: 4.5 }, { id: 3, start_seconds: null }, { id: 4, start_seconds: 9 }];
  assert.equal(lineAt(lines, 0).id, 1);
  assert.equal(lineAt(lines, 4.3).id, 2, 'small lead: shows the line as it starts');
  assert.equal(lineAt(lines, 8.9).id, 4);
  assert.equal(lineAt(lines, 120).id, 4);
  assert.equal(lineAt([{ id: 1, start_seconds: 5 }], 1), null, 'nothing before the first line');
});
