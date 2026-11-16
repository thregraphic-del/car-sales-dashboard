// 📚 Grammar spotting (patterns) + the fixed 30-rule catalog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRAMMAR, SUB_INDEX } from '../public/js/shared/grammar-catalog.js';
import { detectGrammar, setCategories, findPhrase } from '../public/js/shared/grammar-detect.js';

setCategories(GRAMMAR);
const top = (s) => detectGrammar(s).map((h) => h.sub);

test('catalog: 30 fixed categories, unique sub-rule ids, every rule explained', () => {
  assert.equal(GRAMMAR.length, 30);
  assert.equal(SUB_INDEX.size, GRAMMAR.reduce((a, c) => a + c.subs.length, 0));
  for (const c of GRAMMAR) for (const s of c.subs) assert.ok(s.ar && s.en && s.form && s.use && s.ex.pos, s.id);
});

test('patterns place common lines under the right rule', () => {
  assert.ok(top('I visited London last year.').includes('past_simple'));
  assert.ok(top('She is taller than her sister.').includes('comparative'));
  assert.ok(top('It is the best day of my life.').includes('superlative'));
  assert.ok(top('If I had studied, I would have passed.').includes('third_conditional'));
  assert.ok(top('The house was built in 1990.').includes('past_passive'));
  assert.ok(top('It can be done.').includes('modal_passive_present'));
  assert.ok(top('I have been studying for two hours.').includes('present_perfect_continuous'));
  assert.ok(top('Not only do they sing, they shine.').includes('inv_not_only'));
  assert.ok(top("You aren't tired, are you?").includes('tag_negative_positive'));
  assert.ok(top("I wished I'd had this information").includes('wish_past'));
  assert.ok(top('He told me to wait.').includes('reported_command'));
  assert.ok(top('The man who called is my uncle.').includes('rel_who'));
  assert.deepEqual(top('from 32.85 billion'), []);
});

test('one rule per family on the same words; AI phrases are found in the line', () => {
  const t = top('I have been studying for two hours.');
  assert.ok(!t.includes('present_perfect') && !t.includes('present_continuous'));
  assert.deepEqual(findPhrase("We're Winning the races", 'winning'), { start: 6, end: 13 });
});
