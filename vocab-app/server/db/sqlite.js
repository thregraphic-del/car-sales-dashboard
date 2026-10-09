// SQLite driver (local development). Uses node:sqlite, built into Node 22.
// Opening an older database upgrades it in place (v1 → v2 → v3 → v4 → v5).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchKey, sentenceKey } from '../../public/js/shared/text.js';
import { learningSignals } from '../lib/srs.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..', '..');
export const SCHEMA_VERSION = 6;
export const DEFAULT_SQLITE_PATH = path.join(ROOT, 'data', 'lexitube.db');

export function resolvePath(p) {
  if (!p) return DEFAULT_SQLITE_PATH;
  return p === ':memory:' ? ':memory:' : path.resolve(p);
}

export async function createDriver(file) {
  const dbPath = resolvePath(file);
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const d = new DatabaseSync(dbPath);
  // Rollback journal (not WAL): the .db file alone always holds all data, so
  // copying it (backup, moving to the website) is safe even while running.
  if (dbPath !== ':memory:') d.exec('PRAGMA journal_mode = DELETE;');
  migrate(d);
  d.exec('PRAGMA foreign_keys = ON;');

  const returnsRows = (sql) => /^\s*(SELECT|WITH|PRAGMA|VALUES)\b/i.test(sql) || /\bRETURNING\b/i.test(sql);
  const stmts = new Map();
  const prepare = (sql) => {
    let st = stmts.get(sql);
    if (!st) {
      st = d.prepare(sql);
      if (stmts.size > 500) stmts.clear();
      stmts.set(sql, st);
    }
    return st;
  };

  // node:sqlite is synchronous with one connection, so transactions are
  // serialized with a promise chain; queries inside a transaction run directly.
  let chain = Promise.resolve();
  let inTx = false;

  async function query(sql, params) {
    // A query outside any transaction waits until a running one finishes.
    if (inTx) await chain;
    const st = prepare(sql);
    if (returnsRows(sql)) return { rows: st.all(...params), changes: 0 };
    const r = st.run(...params);
    return { rows: [], changes: Number(r.changes) };
  }

  return {
    dialect: 'sqlite',
    file: dbPath,
    async query(sql, params, client) {
      if (client) {
        const st = prepare(sql);
        if (returnsRows(sql)) return { rows: st.all(...params), changes: 0 };
        const r = st.run(...params);
        return { rows: [], changes: Number(r.changes) };
      }
      return query(sql, params);
    },
    transaction(fn) {
      const run = chain.then(async () => {
        inTx = true;
        d.exec('BEGIN');
        try {
          const out = await fn({ sqlite: true });
          d.exec('COMMIT');
          return out;
        } catch (err) {
          d.exec('ROLLBACK');
          throw err;
        } finally {
          inTx = false;
        }
      });
      chain = run.catch(() => {});
      return run;
    },
    async exec(sqlText) {
      d.exec(sqlText);
    },
    async close() {
      d.close();
    },
    raw: d,
  };
}

function tableExists(d, name) {
  return !!d.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(name);
}

/** Create the schema, or upgrade a v1 database in place without losing data. */
export function migrate(d) {
  const version = d.prepare('PRAGMA user_version').get().user_version;
  if (version >= SCHEMA_VERSION) return;
  const schema = fs.readFileSync(path.join(ROOT, 'db', 'schema.sql'), 'utf8');
  if (version < 2) {
    if (tableExists(d, 'video_vocabulary')) migrateV1(d, schema);
    else d.exec(schema);
  }
  if (version < 3) {
    // v3: cache of AI answers (OpenRouter)
    d.exec(`CREATE TABLE IF NOT EXISTS ai_cache (
      key TEXT PRIMARY KEY, task TEXT NOT NULL, model TEXT, response TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`);
    const cols = d.prepare('PRAGMA table_info(occurrences)').all().map((c) => c.name);
    if (!cols.includes('context_note')) d.exec('ALTER TABLE occurrences ADD COLUMN context_note TEXT');
  }
  if (version < 4) {
    // v4: owner login (production) — password hash on the user row.
    const cols = d.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
    if (!cols.includes('username')) d.exec('ALTER TABLE users ADD COLUMN username TEXT');
    if (!cols.includes('password_hash')) d.exec('ALTER TABLE users ADD COLUMN password_hash TEXT');
    const srcCols = d.prepare('PRAGMA table_info(sources)').all().map((c) => c.name);
    if (!srcCols.includes('ai_cursor')) d.exec('ALTER TABLE sources ADD COLUMN ai_cursor INTEGER NOT NULL DEFAULT 0');
    d.exec('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    d.exec(`CREATE TABLE IF NOT EXISTS backups (id INTEGER PRIMARY KEY AUTOINCREMENT, reason TEXT NOT NULL, payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`);
  }
  if (version < 5) migrateV5(d);
  if (version < 6) {
    // v6: tokens, cost and transcripts per learner per day.
    const cols = columnsOf(d, 'ai_usage');
    for (const [c, def] of [['prompt_tokens', 'INTEGER NOT NULL DEFAULT 0'], ['completion_tokens', 'INTEGER NOT NULL DEFAULT 0'], ['cost', 'REAL NOT NULL DEFAULT 0'], ['transcripts', 'INTEGER NOT NULL DEFAULT 0']]) {
      if (!cols.includes(c)) d.exec(`ALTER TABLE ai_usage ADD COLUMN ${c} ${def}`);
    }
  }
  d.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

const columnsOf = (d, table) => d.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);

/**
 * v4 → v5: several accounts. Sources (and through them transcripts and
 * contexts), backups and the learner's own examples get an owner; existing
 * rows belong to the first user. SQLite cannot drop a UNIQUE column
 * constraint, so sources/examples/backups are rebuilt with their data.
 */
function migrateV5(d) {
  d.exec('PRAGMA foreign_keys = OFF');
  d.exec('BEGIN');
  try {
    if (!columnsOf(d, 'users').includes('role')) d.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`);
    if (!columnsOf(d, 'transcript_lines').includes('words_json')) d.exec('ALTER TABLE transcript_lines ADD COLUMN words_json TEXT');
    const firstUser = () => {
      const u = d.prepare('SELECT MIN(id) AS id FROM users').get()?.id;
      if (u) return u;
      d.prepare(`INSERT INTO users (id, name) VALUES (1, 'Learner')`).run();
      return 1;
    };
    if (!columnsOf(d, 'sources').includes('user_id')) {
      const owner = d.prepare('SELECT COUNT(*) AS n FROM sources').get().n ? firstUser() : 1;
      d.exec(`CREATE TABLE sources_v5 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('youtube','text')),
        youtube_id TEXT, url TEXT, title TEXT NOT NULL, channel TEXT, duration_seconds INTEGER, thumbnail_url TEXT,
        transcript_source TEXT, extractor TEXT, word_count INTEGER, is_demo INTEGER NOT NULL DEFAULT 0,
        translation_status TEXT NOT NULL DEFAULT 'none', ai_cursor INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        analyzed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`);
      d.prepare(`INSERT INTO sources_v5 (id, user_id, kind, youtube_id, url, title, channel, duration_seconds, thumbnail_url, transcript_source, extractor,
                   word_count, is_demo, translation_status, ai_cursor, created_at, analyzed_at)
                 SELECT id, ?, kind, youtube_id, url, title, channel, duration_seconds, thumbnail_url, transcript_source, extractor,
                   word_count, is_demo, translation_status, ai_cursor, created_at, analyzed_at FROM sources`).run(owner);
      d.exec('DROP TABLE sources');
      d.exec('ALTER TABLE sources_v5 RENAME TO sources');
    }
    if (!columnsOf(d, 'examples').includes('user_id')) {
      const owner = d.prepare(`SELECT COUNT(*) AS n FROM examples WHERE kind = 'user'`).get().n ? firstUser() : null;
      d.exec(`CREATE TABLE examples_v5 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vocabulary_id INTEGER NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
        kind TEXT NOT NULL DEFAULT 'example', sentence TEXT NOT NULL, sentence_key TEXT NOT NULL, arabic TEXT,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE)`);
      d.prepare(`INSERT INTO examples_v5 (id, vocabulary_id, kind, sentence, sentence_key, arabic, user_id)
                 SELECT id, vocabulary_id, kind, sentence, sentence_key, arabic, CASE WHEN kind = 'user' THEN ? END FROM examples`).run(owner);
      d.exec('DROP TABLE examples');
      d.exec('ALTER TABLE examples_v5 RENAME TO examples');
    }
    if (!columnsOf(d, 'backups').includes('user_id')) {
      d.exec('ALTER TABLE backups ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE');
      if (d.prepare('SELECT COUNT(*) AS n FROM backups').get().n) d.prepare('UPDATE backups SET user_id = ?').run(firstUser());
    }
    // The first account with a password is the administrator.
    d.exec(`UPDATE users SET role = 'admin' WHERE id = (SELECT MIN(id) FROM users WHERE password_hash IS NOT NULL)
            AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin')`);
    d.exec(`
      CREATE INDEX IF NOT EXISTS idx_examples_vocab ON examples(vocabulary_id);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_examples_owner ON examples(vocabulary_id, sentence_key, COALESCE(user_id, 0));
      CREATE UNIQUE INDEX IF NOT EXISTS uq_sources_user_youtube ON sources(user_id, youtube_id);
      CREATE INDEX IF NOT EXISTS idx_sources_user ON sources(user_id, analyzed_at);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username ON users(lower(username));
      CREATE TABLE IF NOT EXISTS ai_usage (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, day TEXT NOT NULL,
        calls INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, day));
      CREATE TABLE IF NOT EXISTS import_map (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, tbl TEXT NOT NULL,
        old_id TEXT NOT NULL, new_id INTEGER NOT NULL, PRIMARY KEY (user_id, tbl, old_id));`);
    d.exec('COMMIT');
  } catch (err) {
    d.exec('ROLLBACK');
    throw err;
  } finally {
    d.exec('PRAGMA foreign_keys = ON');
  }
}

const BAND_FOR = { A1: 'basic', A2: 'basic', B1: 'useful', B2: 'useful', C1: 'advanced', C2: 'advanced' };

/**
 * v1 → v2: videos→sources, video_vocabulary→transcript_lines+occurrences,
 * campaigns→word_groups; vocabulary rows that are really the same item
 * (same match key) are merged into one.
 */
function migrateV1(d, schema) {
  const read = (t) => (tableExists(d, t) ? d.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all() : []);
  const legacy = {};
  for (const t of ['users', 'videos', 'vocabulary', 'examples', 'video_vocabulary', 'user_vocabulary', 'review_logs', 'daily_plans', 'daily_plan_items', 'campaigns', 'campaign_items']) {
    legacy[t] = read(t);
  }
  d.exec('PRAGMA foreign_keys = OFF');
  d.exec('BEGIN');
  try {
    for (const t of ['campaign_items', 'campaigns', 'daily_plan_items', 'daily_plans', 'review_logs', 'user_vocabulary', 'video_vocabulary', 'examples', 'vocabulary', 'videos', 'users']) {
      d.exec(`DROP TABLE IF EXISTS ${t}`);
    }
    d.exec(schema);
    const ins = (sql, ...p) => Number(d.prepare(sql).run(...p).lastInsertRowid);

    for (const u of legacy.users) {
      ins(`INSERT INTO users (id, name, daily_goal, speak_arabic, speech_rate, created_at) VALUES (?,?,?,?,?,?)`,
        u.id, u.name, u.daily_goal, u.speak_arabic, u.speech_rate, u.created_at);
    }
    for (const v of legacy.videos) {
      ins(`INSERT INTO sources (id, user_id, kind, youtube_id, url, title, channel, duration_seconds, thumbnail_url, transcript_source, extractor, word_count, is_demo, created_at, analyzed_at)
           VALUES (?,?,'youtube',?,?,?,?,?,?,?,?,?,?,?,?)`,
        v.id, legacy.users[0]?.id ?? 1, v.youtube_id, v.url, v.title, v.channel, v.duration_seconds, v.thumbnail_url, v.transcript_source, v.extractor, v.word_count, v.is_demo, v.analyzed_at, v.analyzed_at);
    }
    const vocabMap = new Map();
    const byKey = new Map();
    for (const v of legacy.vocabulary) {
      const key = matchKey(v.term);
      if (byKey.has(key)) {
        vocabMap.set(v.id, byKey.get(key));
        continue;
      }
      const id = ins(`INSERT INTO vocabulary (term, match_key, item_type, part_of_speech, level, band, usefulness, pronunciation, arabic, simple_english, similar_json, topic, origin, created_at)
                      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        v.term, key, v.item_type, v.part_of_speech, v.level, BAND_FOR[v.level] || null, v.usefulness, v.pronunciation, v.arabic, v.simple_english, v.similar_json, v.topic, null, v.created_at);
      byKey.set(key, id);
      vocabMap.set(v.id, id);
    }
    for (const e of legacy.examples) {
      d.prepare(`INSERT OR IGNORE INTO examples (vocabulary_id, kind, sentence, sentence_key, arabic) VALUES (?,?,?,?,?)`)
        .run(vocabMap.get(e.vocabulary_id), e.kind, e.sentence, sentenceKey(e.sentence), e.arabic);
    }
    // Rebuild what we can of each transcript from the saved context sentences.
    const occMap = new Map();
    const byVideo = new Map();
    for (const vv of legacy.video_vocabulary) {
      if (!byVideo.has(vv.video_id)) byVideo.set(vv.video_id, []);
      byVideo.get(vv.video_id).push(vv);
    }
    for (const [videoId, rows] of byVideo) {
      rows.sort((a, b) => (a.timestamp_seconds ?? 0) - (b.timestamp_seconds ?? 0));
      const lineIds = new Map();
      for (const vv of rows) {
        const sk = sentenceKey(vv.context_sentence);
        if (!lineIds.has(sk)) {
          lineIds.set(sk, ins(`INSERT INTO transcript_lines (source_id, idx, start_seconds, text, text_ar) VALUES (?,?,?,?,?)`,
            videoId, lineIds.size, vv.timestamp_seconds, vv.context_sentence, vv.context_arabic));
        }
        const vocabId = vocabMap.get(vv.vocabulary_id);
        const existing = d.prepare('SELECT id FROM occurrences WHERE source_id=? AND vocabulary_id=? AND line_id=?').get(videoId, vocabId, lineIds.get(sk));
        const occId = existing
          ? existing.id
          : ins(`INSERT INTO occurrences (vocabulary_id, source_id, line_id, sentence, sentence_ar, contextual_meaning, timestamp_seconds, suggested, rank)
                 VALUES (?,?,?,?,?,?,?,1,?)`,
            vocabId, videoId, lineIds.get(sk), vv.context_sentence, vv.context_arabic, vv.contextual_meaning, vv.timestamp_seconds, vv.rank);
        occMap.set(vv.id, occId);
      }
    }
    const uvMap = new Map();
    const uvByVocab = new Map();
    for (const uv of [...legacy.user_vocabulary].sort((a, b) => b.review_count - a.review_count)) {
      const vocabId = vocabMap.get(uv.vocabulary_id);
      const k = `${uv.user_id}:${vocabId}`;
      if (uvByVocab.has(k)) {
        uvMap.set(uv.id, uvByVocab.get(k));
        continue;
      }
      const id = ins(`INSERT INTO user_vocabulary (user_id, vocabulary_id, occurrence_id, source_id, state, saved_at, review_count, correct_count, wrong_count,
                        streak_correct, lapses, ease, interval_days, mastery, last_reviewed_at, next_review_at)
                      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        uv.user_id, vocabId, occMap.get(uv.video_vocabulary_id) ?? null, uv.source_video_id, uv.state, uv.saved_at, uv.review_count, uv.correct_count,
        uv.wrong_count, uv.streak_correct, uv.lapses, uv.ease, uv.interval_days, uv.mastery, uv.last_reviewed_at, uv.next_review_at);
      uvByVocab.set(k, id);
      uvMap.set(uv.id, id);
    }
    for (const l of legacy.review_logs) {
      if (!uvMap.has(l.user_vocabulary_id)) continue;
      ins(`INSERT INTO review_logs (user_id, user_vocabulary_id, source, grade, correct, interval_after, created_at) VALUES (?,?,?,?,?,?,?)`,
        l.user_id, uvMap.get(l.user_vocabulary_id), l.source, l.grade, l.correct, l.interval_after, l.created_at);
    }
    for (const p of legacy.daily_plans) ins(`INSERT INTO daily_plans (id, user_id, plan_date, created_at) VALUES (?,?,?,?)`, p.id, p.user_id, p.plan_date, p.created_at);
    for (const i of legacy.daily_plan_items) {
      if (!uvMap.has(i.user_vocabulary_id)) continue;
      d.prepare(`INSERT OR IGNORE INTO daily_plan_items (plan_id, user_vocabulary_id, bucket, position, completed_at) VALUES (?,?,?,?,?)`)
        .run(i.plan_id, uvMap.get(i.user_vocabulary_id), i.bucket, i.position, i.completed_at);
    }
    const groupMap = new Map();
    for (const c of legacy.campaigns) {
      let name = c.name;
      for (let n = 2; d.prepare('SELECT 1 FROM word_groups WHERE user_id=? AND name=? COLLATE NOCASE').get(c.user_id, name); n += 1) name = `${c.name} (${n})`;
      groupMap.set(c.id, ins(`INSERT INTO word_groups (user_id, name, color, created_at) VALUES (?,?,?,?)`, c.user_id, name, c.color, c.created_at));
    }
    for (const ci of legacy.campaign_items) {
      if (!groupMap.has(ci.campaign_id) || !uvMap.has(ci.user_vocabulary_id)) continue;
      d.prepare('INSERT OR IGNORE INTO word_group_items (group_id, user_vocabulary_id) VALUES (?,?)').run(groupMap.get(ci.campaign_id), uvMap.get(ci.user_vocabulary_id));
    }
    // Derive the new learning signals from the existing answer history.
    for (const uv of d.prepare('SELECT * FROM user_vocabulary').all()) {
      const logs = d.prepare('SELECT correct, created_at FROM review_logs WHERE user_vocabulary_id=? ORDER BY id').all(uv.id);
      const sig = learningSignals(uv, logs);
      d.prepare('UPDATE user_vocabulary SET recent=?, difficulty=?, last_wrong_at=? WHERE id=?').run(sig.recent, sig.difficulty, sig.last_wrong_at, uv.id);
    }
    d.exec('COMMIT');
  } catch (err) {
    d.exec('ROLLBACK');
    throw err;
  } finally {
    d.exec('PRAGMA foreign_keys = ON');
  }
}

