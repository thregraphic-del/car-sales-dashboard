// ✨ Suggested sentences live inside their group only: the plain word list leaves them out, the group (and ids) show them.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDatabase, startApp } from './helpers.js';

const db = freshDatabase('lexitube-sent-');
delete process.env.SESSION_SECRET;
delete process.env.OPENROUTER_API_KEY;
let app;
const call = async (method, url, body) => {
  const res = await fetch(app.base + url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
};
before(async () => { app = await startApp({ seed: false }); });
after(async () => { await app?.close(); db.cleanup(); });

test('sentences saved into a group stay out of the main list, and a second save adds to the same group', async () => {
  const g = (await call('POST', '/api/groups', { name: 'عمل وإدارة' })).body;
  const mk = (t) => ({ term: t, arabic: 'ترجمة', level: 'B1', meaning_from: 'ai', item_type: 'sentence', examples: [] });
  await call('POST', '/api/import/save', { items: [mk('Can you share the latest sales figures with me?'), { term: 'procrastinate', arabic: 'يماطل', level: 'B2' }], group_ids: [g.id] });
  const main = (await call('GET', '/api/words')).body;
  assert.ok(main.some((w) => w.term === 'procrastinate'), 'a normal word stays in the list');
  assert.ok(main.some((w) => /sales figures/.test(w.term)), 'the words page gets the sentences too (it hides them itself) so a group can show them');
  await call('POST', '/api/import/save', { items: [mk("Let's review the action items from our last meeting.")], group_ids: [g.id] });
  const inGroup = (await call('GET', `/api/words?group_id=${g.id}`)).body;
  assert.equal(inGroup.filter((w) => w.item_type === 'sentence').length, 2, 'both sentences are inside the group');
});

test('an older saved item that reads like a sentence is moved into the group «جمل» and hidden from the plain list', async () => {
  await call('POST', '/api/import/save', { items: [{ term: 'What challenges are we facing this quarter?', arabic: 'ما التحديات؟', level: 'B1', item_type: 'expression' }] });
  const first = (await call('GET', '/api/words')).body; // the first load tidies it into the group
  const groups = (await call('GET', '/api/groups')).body;
  const g = groups.find((x) => x.name === 'جمل');
  assert.ok(g, 'the group «جمل» exists');
  const inG = (await call('GET', `/api/words?group_id=${g.id}`)).body;
  assert.ok(inG.some((w) => /challenges are we facing/.test(w.term)), 'the old sentence is inside «جمل»');
  assert.ok(first.some((w) => /challenges are we facing/.test(w.term)), 'the words page still receives it (hides it itself)');
});
