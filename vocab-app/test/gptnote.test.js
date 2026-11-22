// The summary pasted from ChatGPT is kept under the video's name in «أفكار»: made if missing, replaced, removed with empty text.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDatabase, startApp } from './helpers.js';

const db = freshDatabase();
delete process.env.OPENROUTER_API_KEY;
delete process.env.SESSION_SECRET;

let app;
const call = async (method, url, body) => {
  const res = await fetch(app.base + url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
};

before(async () => { app = await startApp(); });
after(async () => { await app?.close(); db.cleanup(); });

test('keeps a ChatGPT summary under the clip, then removes it with empty text', async () => {
  const made = await call('POST', '/api/sources/text', { text: 'The cat sat on the warm mat. It was a very quiet afternoon in the town.', title: 'Quiet cat' });
  assert.equal(made.status, 200);
  const id = made.body.source_id;
  const kept = await call('PUT', `/api/notes/${id}/gpt`, { text: '  الزبدة: القطة هادئة.  ' });
  assert.equal(kept.status, 200);
  assert.equal(kept.body.note.gpt, 'الزبدة: القطة هادئة.');
  const list = (await call('GET', '/api/notes')).body.notes;
  assert.equal(list.length, 1);
  assert.equal(list[0].title, 'Quiet cat');
  assert.equal(list[0].gpt, 'الزبدة: القطة هادئة.');
  const gone = await call('PUT', `/api/notes/${id}/gpt`, { text: '' });
  assert.equal(gone.status, 200);
  assert.equal((await call('GET', '/api/notes')).body.notes.length, 0);
});

test('an unknown clip is refused', async () => {
  assert.equal((await call('PUT', '/api/notes/999999/gpt', { text: 'x' })).status, 404);
});

test('a note can be written for a clip that has nothing kept yet; empty text keeps nothing', async () => {
  const made = await call('POST', '/api/sources/text', { text: 'Habits are built slowly. Small steps matter every single day.', title: 'Habits clip' });
  const id = made.body.source_id;
  assert.equal((await call('PUT', `/api/notes/${id}`, { note: '   ', refs: [] })).body.note, null);
  assert.equal((await call('GET', '/api/notes')).body.notes.some((n) => n.source_id === id), false);
  const r = await call('PUT', `/api/notes/${id}`, { note: 'فكرة أعجبتني: الخطوات الصغيرة', refs: [] });
  assert.equal(r.status, 200);
  assert.equal(r.body.note.title, 'Habits clip');
  const mine = (await call('GET', '/api/notes')).body.notes.find((n) => n.source_id === id);
  assert.equal(mine.note, 'فكرة أعجبتني: الخطوات الصغيرة');
  assert.equal((await call('PUT', '/api/notes/999999', { note: 'x', refs: [] })).status, 404);
});
