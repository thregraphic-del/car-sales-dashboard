// Backups and moving data between installations.
//   snapshot()     everything as one JSON document (format "lexitube-backup")
//   storeBackup()  a snapshot kept on the server (automatic before an import)
//   import         begin (backup + empty the tables) → rows (chunks) → finish
import { all, get, run, insert, tx, bulkInsert, resetSequences } from '../db/index.js';
import { httpError } from '../lib/errors.js';
import { ensureUser } from './users.js';

// Parents before children (the same order as public/js/data-transfer.js).
export const TABLES = ['sources', 'transcript_lines', 'vocabulary', 'examples', 'occurrences', 'user_vocabulary', 'review_logs',
  'daily_plans', 'daily_plan_items', 'word_groups', 'word_group_items', 'ai_cache'];

// Columns accepted on import, per table (anything else in a row is ignored).
const COLUMNS = {
  sources: ['id', 'kind', 'youtube_id', 'url', 'title', 'channel', 'duration_seconds', 'thumbnail_url', 'transcript_source', 'extractor', 'word_count',
    'is_demo', 'translation_status', 'ai_cursor', 'created_at', 'analyzed_at'],
  transcript_lines: ['id', 'source_id', 'idx', 'start_seconds', 'duration', 'text', 'text_ar'],
  vocabulary: ['id', 'term', 'match_key', 'item_type', 'part_of_speech', 'level', 'band', 'usefulness', 'pronunciation', 'arabic', 'simple_english',
    'similar_json', 'topic', 'origin', 'created_at'],
  examples: ['id', 'vocabulary_id', 'kind', 'sentence', 'sentence_key', 'arabic'],
  occurrences: ['id', 'vocabulary_id', 'source_id', 'line_id', 'char_start', 'char_end', 'sentence', 'sentence_ar', 'contextual_meaning', 'context_note',
    'timestamp_seconds', 'suggested', 'rank'],
  user_vocabulary: ['id', 'user_id', 'vocabulary_id', 'occurrence_id', 'source_id', 'state', 'user_arabic', 'saved_at', 'review_count', 'correct_count',
    'wrong_count', 'streak_correct', 'lapses', 'ease', 'interval_days', 'mastery', 'difficulty', 'recent', 'last_wrong_at', 'last_reviewed_at', 'next_review_at'],
  review_logs: ['id', 'user_id', 'user_vocabulary_id', 'source', 'grade', 'correct', 'interval_after', 'created_at'],
  daily_plans: ['id', 'user_id', 'plan_date', 'created_at'],
  daily_plan_items: ['id', 'plan_id', 'user_vocabulary_id', 'bucket', 'position', 'completed_at'],
  word_groups: ['id', 'user_id', 'name', 'color', 'created_at'],
  word_group_items: ['group_id', 'user_vocabulary_id', 'added_at'],
  ai_cache: ['key', 'task', 'model', 'response', 'created_at'],
};
const WITH_USER = new Set(['user_vocabulary', 'review_logs', 'daily_plans', 'word_groups']);
const WITH_ID = TABLES.filter((t) => COLUMNS[t].includes('id'));
const KEEP_BACKUPS = 10;

export async function counts() {
  const out = {};
  for (const t of TABLES) out[t] = (await get(`SELECT COUNT(*) AS n FROM ${t}`)).n;
  return out;
}

const orderBy = (t) => (COLUMNS[t].includes('id') ? 'id' : COLUMNS[t][0] === 'key' ? 'key' : 'group_id, user_vocabulary_id');

/** Everything as one JSON document. The password hash is never included. */
export async function snapshot() {
  const users = (await all('SELECT id, name, daily_goal, speak_arabic, speech_rate, created_at FROM users ORDER BY id'));
  const tables = { users };
  for (const t of TABLES) tables[t] = await all(`SELECT * FROM ${t} ORDER BY ${orderBy(t)}`);
  return { format: 'lexitube-backup', version: 4, exported_at: new Date().toISOString(), tables };
}

export async function storeBackup(reason = 'manual') {
  const payload = JSON.stringify(await snapshot());
  const id = await insert('INSERT INTO backups (reason, payload, created_at) VALUES (?,?,?)', reason, payload, new Date().toISOString());
  const old = await all('SELECT id FROM backups ORDER BY id DESC LIMIT 1000 OFFSET ?', KEEP_BACKUPS);
  for (const b of old) await run('DELETE FROM backups WHERE id = ?', b.id);
  return { id, reason, ...(await get('SELECT created_at, length(payload) AS size FROM backups WHERE id = ?', id)) };
}

export async function listBackups() {
  return all('SELECT id, reason, created_at, length(payload) AS size FROM backups ORDER BY id DESC');
}

export async function getBackup(id) {
  const row = await get('SELECT payload FROM backups WHERE id = ?', id);
  if (!row) throw httpError(404, 'لم نجد هذه النسخة الاحتياطية.');
  return row.payload;
}

/** Back up, then empty the learning tables. The account (login) is kept. */
export async function beginImport(userId, profile = {}) {
  const previous = await counts();
  const backup = await storeBackup('before-import');
  await tx(async () => {
    for (const t of [...TABLES].reverse()) await run(`DELETE FROM ${t}`);
    await ensureUser(userId);
    if (typeof profile.name === 'string' && profile.name.trim()) await run('UPDATE users SET name = ? WHERE id = ?', profile.name.trim().slice(0, 60), userId);
    const goal = Number(profile.daily_goal);
    if (Number.isInteger(goal) && goal > 0 && goal <= 100) await run('UPDATE users SET daily_goal = ? WHERE id = ?', goal, userId);
    if (profile.speak_arabic !== undefined && profile.speak_arabic !== null) await run('UPDATE users SET speak_arabic = ? WHERE id = ?', profile.speak_arabic ? 1 : 0, userId);
    const rate = Number(profile.speech_rate);
    if (Number.isFinite(rate) && rate >= 0.5 && rate <= 1.5) await run('UPDATE users SET speech_rate = ? WHERE id = ?', rate, userId);
  });
  return { backup_id: backup.id, previous };
}

/** Insert one chunk of rows into a table (rows keep their ids). */
export async function importRows(userId, table, rows) {
  if (!TABLES.includes(table)) throw httpError(400, 'جدول غير معروف.');
  if (!rows.length) return 0;
  const allowed = COLUMNS[table];
  const present = new Set();
  for (const r of rows) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) throw httpError(400, 'بيانات غير صالحة.');
    for (const k of Object.keys(r)) if (allowed.includes(k)) present.add(k);
  }
  const columns = allowed.filter((c) => present.has(c) || (c === 'user_id' && WITH_USER.has(table)));
  if (!columns.length) throw httpError(400, 'بيانات غير صالحة.');
  const clean = rows.map((r) => {
    const o = {};
    for (const c of columns) {
      const v = r[c];
      o[c] = c === 'user_id' ? userId : v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
    }
    return o;
  });
  return tx(() => bulkInsert(table, columns, clean, { conflict: 'ON CONFLICT DO NOTHING' }));
}

/** After the last chunk: move id counters past the imported ids, return the counts. */
export async function finishImport() {
  await resetSequences(WITH_ID);
  return counts();
}
