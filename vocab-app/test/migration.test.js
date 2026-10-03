// A database created by the previous version (schema v1) must upgrade in
// place without losing the learner's words, reviews or campaigns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexitube-mig-'));
const file = path.join(dir, 'v1.db');

// Build a v1 database exactly as the old app did.
const old = new DatabaseSync(file);
old.exec(fs.readFileSync(path.join(here, '..', 'db', 'schema-v1.sql'), 'utf8'));
old.exec(`
  INSERT INTO users (id, name, daily_goal) VALUES (1, 'Sara', 12);
  INSERT INTO videos (id, youtube_id, url, title, channel) VALUES (1, 'abcdefghijk', 'https://youtu.be/abcdefghijk', 'Old video', 'Chan');
  INSERT INTO vocabulary (id, term, term_key, item_type, part_of_speech, level, usefulness, arabic, simple_english)
    VALUES (1, 'figure out', 'figure out', 'phrasal verb', 'verb', 'B1', 90, 'يكتشف', 'to understand'),
           (2, 'figure something out', 'figure something out', 'phrasal verb', 'verb phrase', 'B1', 90, 'يفهم', 'to understand'),
           (3, 'reluctant', 'reluctant', 'word', 'adjective', 'B2', 88, 'متردد', 'not wanting');
  INSERT INTO examples (vocabulary_id, kind, sentence) VALUES (3, 'easy', 'I was reluctant to ask.'), (3, 'easy', 'I was reluctant to ask.');
  INSERT INTO video_vocabulary (id, video_id, vocabulary_id, context_sentence, context_arabic, contextual_meaning, timestamp_seconds, rank)
    VALUES (1, 1, 1, 'I finally figured it out.', 'فهمتها أخيرًا', 'فهم', 30, 0),
           (2, 1, 3, 'She was reluctant to accept.', 'كانت مترددة في القبول.', 'مترددة', 12, 1);
  INSERT INTO user_vocabulary (id, user_id, vocabulary_id, video_vocabulary_id, source_video_id, state, review_count, correct_count, wrong_count, streak_correct, lapses, ease, interval_days, mastery)
    VALUES (1, 1, 1, 1, 1, 'saved', 5, 3, 2, 0, 1, 2.1, 0, 30),
           (2, 1, 3, 2, 1, 'saved', 1, 1, 0, 1, 0, 2.5, 1, 20);
  INSERT INTO review_logs (user_id, user_vocabulary_id, source, grade, correct, created_at)
    VALUES (1, 1, 'flashcard', 'good', 1, '2026-09-01T10:00:00.000Z'), (1, 1, 'flashcard', 'good', 1, '2026-09-02T10:00:00.000Z'),
           (1, 1, 'game:x', 'hard', 0, '2026-09-03T10:00:00.000Z'), (1, 1, 'game:x', 'good', 1, '2026-09-04T10:00:00.000Z'),
           (1, 1, 'game:x', 'hard', 0, '2026-09-05T10:00:00.000Z'), (1, 2, 'flashcard', 'good', 1, '2026-09-05T11:00:00.000Z');
  INSERT INTO campaigns (id, user_id, name, source_type) VALUES (1, 1, 'Work', 'topic'), (2, 1, 'work', 'selection');
  INSERT INTO campaign_items VALUES (1, 1), (1, 2), (2, 2);
`);
old.close();

delete process.env.DATABASE_URL;
delete process.env.NETLIFY_DB_URL;
process.env.DATABASE_PATH = file;
const { driver } = await import('../server/db/index.js');
const { listWords } = await import('../server/data/words.js');
const { listGroups } = await import('../server/data/learning.js');

test('v1 database upgrades to the current schema and keeps the learner data', async () => {
  const db = (await driver()).raw;
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 4);
  assert.equal(db.prepare('SELECT name FROM users WHERE id=1').get().name, 'Sara');

  // "figure out" + "figure something out" were the same item → merged.
  const vocab = db.prepare('SELECT term, match_key FROM vocabulary ORDER BY id').all();
  assert.deepEqual(vocab.map((v) => v.match_key), ['figure out', 'reluctant']);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM examples').get().n, 1, 'duplicate examples removed');

  // Video → source with transcript lines rebuilt from the saved contexts.
  const src = db.prepare('SELECT * FROM sources').get();
  assert.equal(src.youtube_id, 'abcdefghijk');
  const lines = db.prepare('SELECT text, start_seconds FROM transcript_lines ORDER BY idx').all();
  assert.deepEqual(lines.map((l) => l.start_seconds), [12, 30]);

  // Saved words, progress and history intact; new signals derived from history.
  const words = await listWords(1);
  assert.equal(words.length, 2);
  const fig = words.find((w) => w.term === 'figure out');
  assert.equal(fig.review_count, 5);
  assert.equal(fig.recent, '11010');
  assert.ok(fig.difficulty > 0);
  assert.equal(fig.context_sentence, 'I finally figured it out.');
  assert.equal(fig.arabic, 'فهم', 'contextual meaning survives');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM review_logs').get().n, 6);

  // Campaigns → groups (name clash resolved), membership kept.
  const groups = await listGroups(1);
  assert.deepEqual(groups.map((g) => g.name).sort(), ['Work', 'work (2)']);
  assert.equal(groups.find((g) => g.name === 'Work').count, 2);
});

test('migration is idempotent', async () => {
  const { migrate } = await import('../server/db/sqlite.js');
  migrate((await driver()).raw);
  assert.equal((await listWords(1)).length, 2);
});
