// Backups and moving a learner's data between installations.
//   snapshot()     the learner's data as one JSON document (format "lexitube-backup")
//   storeBackup()  a snapshot kept on the server (automatic before an import)
//   import         begin (backup + empty the learner's data) → rows (chunks) → finish
//
// Everything is per learner. Imported rows get new ids in this database
// (other learners' rows may already use the old ones); import_map remembers
// old → new ids so child rows (lines, contexts, reviews…) stay connected.
import { all, get, run, insert, tx, dialect } from '../db/index.js';
import { httpError } from '../lib/errors.js';
import { matchKey } from '../../public/js/shared/text.js';
import { clearLearningData } from './demo.js';

// Parents before children (the same order as public/js/data-transfer.js).
export const TABLES = ['sources', 'transcript_lines', 'vocabulary', 'examples', 'occurrences', 'user_vocabulary', 'review_logs',
  'daily_plans', 'daily_plan_items', 'word_groups', 'word_group_items'];

// Columns taken from imported rows (ids and foreign keys are remapped below).
const COLUMNS = {
  sources: ['kind', 'youtube_id', 'url', 'title', 'channel', 'duration_seconds', 'thumbnail_url', 'transcript_source', 'extractor', 'word_count',
    'is_demo', 'translation_status', 'ai_cursor', 'created_at', 'analyzed_at'],
  transcript_lines: ['source_id', 'idx', 'start_seconds', 'duration', 'text', 'text_ar', 'words_json'],
  vocabulary: ['term', 'match_key', 'item_type', 'part_of_speech', 'level', 'band', 'usefulness', 'pronunciation', 'arabic', 'simple_english',
    'similar_json', 'topic', 'origin', 'created_at'],
  examples: ['vocabulary_id', 'kind', 'sentence', 'sentence_key', 'arabic'],
  occurrences: ['vocabulary_id', 'source_id', 'line_id', 'char_start', 'char_end', 'sentence', 'sentence_ar', 'contextual_meaning', 'context_note',
    'timestamp_seconds', 'suggested', 'rank'],
  user_vocabulary: ['vocabulary_id', 'occurrence_id', 'source_id', 'state', 'user_arabic', 'saved_at', 'review_count', 'correct_count',
    'wrong_count', 'streak_correct', 'lapses', 'ease', 'interval_days', 'mastery', 'difficulty', 'recent', 'last_wrong_at', 'last_reviewed_at', 'next_review_at'],
  review_logs: ['user_vocabulary_id', 'source', 'grade', 'correct', 'interval_after', 'created_at'],
  daily_plans: ['plan_date', 'created_at'],
  daily_plan_items: ['plan_id', 'user_vocabulary_id', 'bucket', 'position', 'completed_at'],
  word_groups: ['name', 'color', 'created_at'],
  word_group_items: ['group_id', 'user_vocabulary_id', 'added_at'],
};
// Foreign keys → the table whose ids they refer to. required = row is skipped without it.
const REFS = {
  transcript_lines: { source_id: ['sources', true] },
  examples: { vocabulary_id: ['vocabulary', true] },
  occurrences: { vocabulary_id: ['vocabulary', true], source_id: ['sources', true], line_id: ['transcript_lines', false] },
  user_vocabulary: { vocabulary_id: ['vocabulary', true], occurrence_id: ['occurrences', false], source_id: ['sources', false] },
  review_logs: { user_vocabulary_id: ['user_vocabulary', true] },
  daily_plan_items: { plan_id: ['daily_plans', true], user_vocabulary_id: ['user_vocabulary', true] },
  word_group_items: { group_id: ['word_groups', true], user_vocabulary_id: ['user_vocabulary', true] },
};
const WITH_USER = new Set(['sources', 'user_vocabulary', 'review_logs', 'daily_plans', 'word_groups']);
const KEEP_BACKUPS = 10;

// The learner's rows of each table: [FROM/WHERE clause, number of userId parameters].
const VOCAB_IDS = `(SELECT vocabulary_id FROM user_vocabulary WHERE user_id = ?
   UNION SELECT o.vocabulary_id FROM occurrences o JOIN sources s ON s.id = o.source_id WHERE s.user_id = ?
   UNION SELECT vocabulary_id FROM examples WHERE user_id = ?)`;
const SCOPE = {
  sources: ['sources t WHERE t.user_id = ?', 1],
  transcript_lines: ['transcript_lines t JOIN sources s ON s.id = t.source_id WHERE s.user_id = ?', 1],
  vocabulary: [`vocabulary t WHERE t.id IN ${VOCAB_IDS}`, 3],
  examples: [`examples t WHERE t.vocabulary_id IN ${VOCAB_IDS} AND (t.user_id IS NULL OR t.user_id = ?)`, 4],
  occurrences: ['occurrences t JOIN sources s ON s.id = t.source_id WHERE s.user_id = ?', 1],
  user_vocabulary: ['user_vocabulary t WHERE t.user_id = ?', 1],
  review_logs: ['review_logs t WHERE t.user_id = ?', 1],
  daily_plans: ['daily_plans t WHERE t.user_id = ?', 1],
  daily_plan_items: ['daily_plan_items t JOIN daily_plans p ON p.id = t.plan_id WHERE p.user_id = ?', 1],
  word_groups: ['word_groups t WHERE t.user_id = ?', 1],
  word_group_items: ['word_group_items t JOIN word_groups g ON g.id = t.group_id WHERE g.user_id = ?', 1],
};
const scoped = (table, userId) => [SCOPE[table][0], Array(SCOPE[table][1]).fill(userId)];

export async function counts(userId) {
  const out = {};
  for (const t of TABLES) {
    const [from, params] = scoped(t, userId);
    out[t] = (await get(`SELECT COUNT(*) AS n FROM ${from}`, ...params)).n;
  }
  return out;
}

const ORDER = { word_group_items: 't.group_id, t.user_vocabulary_id' };

/** The learner's data as one JSON document. Never includes a password hash. */
export async function snapshot(userId) {
  const users = await all('SELECT id, name, daily_goal, speak_arabic, speech_rate, created_at FROM users WHERE id = ?', userId);
  const tables = { users };
  for (const t of TABLES) {
    const [from, params] = scoped(t, userId);
    tables[t] = await all(`SELECT t.* FROM ${from} ORDER BY ${ORDER[t] || 't.id'}`, ...params);
  }
  return { format: 'lexitube-backup', version: 5, exported_at: new Date().toISOString(), tables };
}

export async function storeBackup(userId, reason = 'manual') {
  const payload = JSON.stringify(await snapshot(userId));
  const id = await insert('INSERT INTO backups (user_id, reason, payload, created_at) VALUES (?,?,?,?)', userId, reason, payload, new Date().toISOString());
  const old = await all('SELECT id FROM backups WHERE user_id = ? ORDER BY id DESC LIMIT 1000 OFFSET ?', userId, KEEP_BACKUPS);
  for (const b of old) await run('DELETE FROM backups WHERE id = ?', b.id);
  return { id, reason, ...(await get('SELECT created_at, length(payload) AS size FROM backups WHERE id = ?', id)) };
}

export async function listBackups(userId) {
  return all('SELECT id, reason, created_at, length(payload) AS size FROM backups WHERE user_id = ? ORDER BY id DESC', userId);
}

export async function getBackup(id, userId) {
  const row = await get('SELECT payload FROM backups WHERE id = ? AND user_id = ?', id, userId);
  if (!row) throw httpError(404, 'لم نجد هذه النسخة الاحتياطية.');
  return row.payload;
}

/** Back up, then empty the learner's data. The account (login) is kept. */
export async function beginImport(userId, profile = {}) {
  const previous = await counts(userId);
  const backup = await storeBackup(userId, 'before-import');
  await clearLearningData(userId);
  await tx(async () => {
    await run('DELETE FROM import_map WHERE user_id = ?', userId);
    if (typeof profile.name === 'string' && profile.name.trim()) await run('UPDATE users SET name = ? WHERE id = ?', profile.name.trim().slice(0, 60), userId);
    const goal = Number(profile.daily_goal);
    if (Number.isInteger(goal) && goal > 0 && goal <= 100) await run('UPDATE users SET daily_goal = ? WHERE id = ?', goal, userId);
    if (profile.speak_arabic !== undefined && profile.speak_arabic !== null) await run('UPDATE users SET speak_arabic = ? WHERE id = ?', profile.speak_arabic ? 1 : 0, userId);
    const rate = Number(profile.speech_rate);
    if (Number.isFinite(rate) && rate >= 0.5 && rate <= 1.5) await run('UPDATE users SET speech_rate = ? WHERE id = ?', rate, userId);
  });
  return { backup_id: backup.id, previous };
}

const placeholders = (n) => Array(n).fill('?').join(',');

/** old id → new id for one table (only ids imported by this learner). */
async function mapOf(userId, table, oldIds) {
  const map = new Map();
  const ids = [...new Set(oldIds.filter((x) => x !== null && x !== undefined).map(String))];
  for (let i = 0; i < ids.length; i += 500) {
    const part = ids.slice(i, i + 500);
    const rows = await all(`SELECT old_id, new_id FROM import_map WHERE user_id = ? AND tbl = ? AND old_id IN (${placeholders(part.length)})`, userId, table, ...part);
    for (const r of rows) map.set(r.old_id, r.new_id);
  }
  return map;
}

/** Reserve n fresh ids for a table (inside the import transaction). */
async function reserveIds(table, n) {
  if (!n) return [];
  if ((await dialect()) === 'postgres') {
    const rows = await all(`SELECT nextval(pg_get_serial_sequence('${table}', 'id')) AS id FROM generate_series(1, ?)`, n);
    return rows.map((r) => Number(r.id));
  }
  const max = Math.max(
    Number((await get(`SELECT COALESCE(MAX(id), 0) AS m FROM ${table}`)).m),
    Number((await get('SELECT COALESCE(MAX(seq), 0) AS m FROM sqlite_sequence WHERE name = ?', table))?.m || 0),
  );
  return Array.from({ length: n }, (_, i) => max + 1 + i);
}

/** INSERT many rows; returns the inserted rows' `returning` column (conflicts are skipped). */
async function insertMany(table, columns, rows, returning) {
  const out = [];
  const per = Math.max(1, Math.floor(30000 / columns.length));
  for (let i = 0; i < rows.length; i += per) {
    const part = rows.slice(i, i + per);
    const values = part.map(() => `(${placeholders(columns.length)})`).join(',');
    const params = part.flatMap((r) => columns.map((c) => r[c]));
    const sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES ${values} ON CONFLICT DO NOTHING${returning ? ` RETURNING ${returning}` : ''}`;
    if (returning) out.push(...(await all(sql, ...params)));
    else await run(sql, ...params);
  }
  return out;
}

async function remember(userId, table, pairs) {
  if (!pairs.length) return;
  await insertMany('import_map', ['user_id', 'tbl', 'old_id', 'new_id'], pairs.map(([o, n]) => ({ user_id: userId, tbl: table, old_id: String(o), new_id: n })));
}

const clean = (v) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v === undefined ? null : v);

/** Shared dictionary rows: reuse an existing entry (same match key) or add it. */
async function importVocabulary(userId, rows) {
  const keyOf = (r) => String(r.match_key || matchKey(r.term || '') || '').slice(0, 200);
  const usable = rows.filter((r) => r.term && keyOf(r));
  const keys = [...new Set(usable.map(keyOf))];
  const existing = new Map();
  for (let i = 0; i < keys.length; i += 500) {
    const part = keys.slice(i, i + 500);
    for (const v of await all(`SELECT id, match_key FROM vocabulary WHERE match_key IN (${placeholders(part.length)})`, ...part)) existing.set(v.match_key, v.id);
  }
  const fresh = [];
  const seen = new Set();
  for (const r of usable) {
    const k = keyOf(r);
    if (existing.has(k) || seen.has(k)) continue;
    seen.add(k);
    fresh.push(r);
  }
  const ids = await reserveIds('vocabulary', fresh.length);
  const cols = ['id', ...COLUMNS.vocabulary];
  const inserted = await insertMany('vocabulary', cols, fresh.map((r, i) => {
    const o = { id: ids[i] };
    for (const c of COLUMNS.vocabulary) o[c] = clean(r[c]);
    o.match_key = keyOf(r);
    o.similar_json = typeof r.similar_json === 'string' ? r.similar_json : '[]';
    return o;
  }), 'id, match_key');
  for (const v of inserted) existing.set(v.match_key, Number(v.id));
  const missing = keys.filter((k) => !existing.has(k)); // created meanwhile by someone else
  for (const k of missing) {
    const v = await get('SELECT id FROM vocabulary WHERE match_key = ?', k);
    if (v) existing.set(k, v.id);
  }
  const pairs = usable.filter((r) => existing.has(keyOf(r)) && r.id !== undefined).map((r) => [r.id, existing.get(keyOf(r))]);
  await remember(userId, 'vocabulary', pairs);
  return pairs.length;
}

/** Insert one chunk of rows into one of the learner's tables. Returns how many were stored. */
export async function importRows(userId, table, rows) {
  if (!TABLES.includes(table)) throw httpError(400, 'جدول غير معروف.');
  if (!rows.length) return 0;
  for (const r of rows) if (!r || typeof r !== 'object' || Array.isArray(r)) throw httpError(400, 'بيانات غير صالحة.');
  return tx(async () => {
    if (table === 'vocabulary') return importVocabulary(userId, rows);
    const hasId = table !== 'word_group_items';
    // A chunk sent twice (network retry) is not imported twice.
    const done = hasId ? await mapOf(userId, table, rows.map((r) => r.id)) : new Map();
    let todo = rows.filter((r) => !hasId || (r.id !== undefined && r.id !== null && !done.has(String(r.id))));
    // Remap foreign keys; rows whose required parent is missing are skipped.
    const refs = REFS[table] || {};
    const maps = {};
    for (const [col, [parent]] of Object.entries(refs)) maps[col] = await mapOf(userId, parent, todo.map((r) => r[col]));
    todo = todo.filter((r) => Object.entries(refs).every(([col, [, required]]) => !required || maps[col].has(String(r[col]))));
    if (table === 'examples') {
      // Only sentences the learner cannot already see (shared examples stay shared).
      const vocabIds = [...new Set(todo.map((r) => maps.vocabulary_id.get(String(r.vocabulary_id))))];
      const visible = new Set();
      for (let i = 0; i < vocabIds.length; i += 500) {
        const part = vocabIds.slice(i, i + 500);
        const ex = await all(`SELECT vocabulary_id, sentence_key FROM examples WHERE vocabulary_id IN (${placeholders(part.length)}) AND (user_id IS NULL OR user_id = ?)`, ...part, userId);
        for (const e of ex) visible.add(`${e.vocabulary_id}|${e.sentence_key}`);
      }
      todo = todo.filter((r) => r.sentence && r.sentence_key && !visible.has(`${maps.vocabulary_id.get(String(r.vocabulary_id))}|${r.sentence_key}`));
    }
    if (!todo.length) return 0;
    const ids = hasId ? await reserveIds(table, todo.length) : [];
    const columns = [...(hasId ? ['id'] : []), ...COLUMNS[table], ...(WITH_USER.has(table) || table === 'examples' ? ['user_id'] : [])];
    const prepared = todo.map((r, i) => {
      const o = {};
      if (hasId) o.id = ids[i];
      for (const c of COLUMNS[table]) {
        if (refs[c]) o[c] = r[c] === null || r[c] === undefined ? null : maps[c].get(String(r[c])) ?? null;
        else o[c] = clean(r[c]);
      }
      if (WITH_USER.has(table) || table === 'examples') o.user_id = userId;
      return o;
    });
    // Columns the source rows don't have keep the database defaults.
    const present = new Set(['id', 'user_id', ...Object.keys(refs)]);
    for (const r of todo) for (const k of Object.keys(r)) present.add(k);
    const cols = columns.filter((c) => present.has(c));
    const inserted = await insertMany(table, cols, prepared, hasId ? 'id' : 'group_id');
    if (!hasId) return inserted.length;
    const back = new Map(prepared.map((o, i) => [o.id, todo[i].id]));
    const stored = inserted.map((r) => Number(r.id));
    await remember(userId, table, stored.map((id) => [back.get(id), id]));
    return stored.length;
  });
}

/** After the last chunk: forget the id map, return the learner's counts. */
export async function finishImport(userId) {
  await run('DELETE FROM import_map WHERE user_id = ?', userId);
  return counts(userId);
}
