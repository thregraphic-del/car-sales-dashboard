-- LexiTube schema v3 (SQLite). PostgreSQL / Supabase version: db/postgres-schema.sql.
--
-- Layers
--   Global knowledge : vocabulary, examples            (one row per word/phrase)
--   Sources          : sources, transcript_lines       (the original text = source of truth)
--   Context          : occurrences                     (word × source line, contextual meaning)
--   User knowledge   : user_vocabulary, review_logs, daily_plans, daily_plan_items
--   Organisation     : word_groups, word_group_items   (many-to-many, no copies)

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL DEFAULT 'Learner',
  daily_goal    INTEGER NOT NULL DEFAULT 10,
  speak_arabic  INTEGER NOT NULL DEFAULT 0,
  speech_rate   REAL    NOT NULL DEFAULT 1.0,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- A YouTube video or a pasted text.
CREATE TABLE IF NOT EXISTS sources (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  kind               TEXT    NOT NULL CHECK (kind IN ('youtube','text')),
  youtube_id         TEXT UNIQUE,
  url                TEXT,
  title              TEXT    NOT NULL,
  channel            TEXT,
  duration_seconds   INTEGER,
  thumbnail_url      TEXT,
  transcript_source  TEXT,               -- youtube-captions | youtube-auto-captions | pasted | text | demo
  extractor          TEXT,               -- claude | dictionary | demo
  word_count         INTEGER,
  is_demo            INTEGER NOT NULL DEFAULT 0,
  translation_status TEXT    NOT NULL DEFAULT 'none', -- none | running | done | unavailable | failed
  created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  analyzed_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- The original transcript / text, one sentence per row, in order.
CREATE TABLE IF NOT EXISTS transcript_lines (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id     INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  idx           INTEGER NOT NULL,
  start_seconds REAL,
  duration      REAL,
  text          TEXT    NOT NULL,
  text_ar       TEXT,
  UNIQUE (source_id, idx)
);

-- One row per learnable item. match_key makes duplicates impossible
-- ("Figure something out" and "figure out" share the key "figure out").
CREATE TABLE IF NOT EXISTS vocabulary (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  term            TEXT    NOT NULL,
  match_key       TEXT    NOT NULL UNIQUE,
  item_type       TEXT    NOT NULL DEFAULT 'word',   -- word | phrasal verb | idiom | collocation | expression
  part_of_speech  TEXT,
  level           TEXT CHECK (level IS NULL OR level IN ('A1','A2','B1','B2','C1','C2')),
  band            TEXT,                              -- basic | useful | advanced | specialized
  usefulness      INTEGER,
  pronunciation   TEXT,
  arabic          TEXT,                              -- general meaning (NULL = unknown, never invented)
  simple_english  TEXT,
  similar_json    TEXT    NOT NULL DEFAULT '[]',
  topic           TEXT,
  origin          TEXT,                              -- ai | dictionary | user | demo
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS examples (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  vocabulary_id INTEGER NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
  kind          TEXT    NOT NULL DEFAULT 'example',  -- example | easy | user
  sentence      TEXT    NOT NULL,
  sentence_key  TEXT    NOT NULL,
  arabic        TEXT,
  UNIQUE (vocabulary_id, sentence_key)
);

-- Where an item appears: links global vocabulary to an exact source line.
CREATE TABLE IF NOT EXISTS occurrences (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  vocabulary_id      INTEGER NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
  source_id          INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  line_id            INTEGER REFERENCES transcript_lines(id) ON DELETE CASCADE,
  char_start         INTEGER,
  char_end           INTEGER,
  sentence           TEXT    NOT NULL,
  sentence_ar        TEXT,
  contextual_meaning TEXT,                           -- Arabic meaning in THIS sentence
  context_note       TEXT,                           -- short Arabic explanation of the meaning here
  timestamp_seconds  INTEGER,
  suggested          INTEGER NOT NULL DEFAULT 0,     -- shown in the source's word list
  rank               INTEGER NOT NULL DEFAULT 0,
  UNIQUE (source_id, vocabulary_id, line_id)
);

CREATE TABLE IF NOT EXISTS user_vocabulary (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vocabulary_id     INTEGER NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
  occurrence_id     INTEGER REFERENCES occurrences(id) ON DELETE SET NULL, -- context it was saved from
  source_id         INTEGER REFERENCES sources(id) ON DELETE SET NULL,
  state             TEXT    NOT NULL DEFAULT 'saved' CHECK (state IN ('saved','dismissed')),
  user_arabic       TEXT,                            -- the learner's own meaning
  saved_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  review_count      INTEGER NOT NULL DEFAULT 0,
  correct_count     INTEGER NOT NULL DEFAULT 0,
  wrong_count       INTEGER NOT NULL DEFAULT 0,
  streak_correct    INTEGER NOT NULL DEFAULT 0,
  lapses            INTEGER NOT NULL DEFAULT 0,
  ease              REAL    NOT NULL DEFAULT 2.5,
  interval_days     REAL    NOT NULL DEFAULT 0,
  mastery           INTEGER NOT NULL DEFAULT 0,
  difficulty        REAL    NOT NULL DEFAULT 0,      -- 0..1, learned from answers
  recent            TEXT    NOT NULL DEFAULT '',     -- last answers, newest last: "1101"
  last_wrong_at     TEXT,
  last_reviewed_at  TEXT,
  next_review_at    TEXT,
  UNIQUE (user_id, vocabulary_id)
);

CREATE TABLE IF NOT EXISTS review_logs (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_vocabulary_id INTEGER NOT NULL REFERENCES user_vocabulary(id) ON DELETE CASCADE,
  source             TEXT    NOT NULL,
  grade              TEXT    NOT NULL,
  correct            INTEGER NOT NULL,
  interval_after     REAL,
  created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS daily_plans (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_date  TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, plan_date)
);

CREATE TABLE IF NOT EXISTS daily_plan_items (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id            INTEGER NOT NULL REFERENCES daily_plans(id) ON DELETE CASCADE,
  user_vocabulary_id INTEGER NOT NULL REFERENCES user_vocabulary(id) ON DELETE CASCADE,
  bucket             TEXT    NOT NULL,
  position           INTEGER NOT NULL,
  completed_at       TEXT,
  UNIQUE (plan_id, user_vocabulary_id)
);

CREATE TABLE IF NOT EXISTS word_groups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  color      TEXT,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, name COLLATE NOCASE)
);

CREATE TABLE IF NOT EXISTS word_group_items (
  group_id           INTEGER NOT NULL REFERENCES word_groups(id) ON DELETE CASCADE,
  user_vocabulary_id INTEGER NOT NULL REFERENCES user_vocabulary(id) ON DELETE CASCADE,
  added_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (group_id, user_vocabulary_id)
);

-- Cache of AI answers (word in context, translations, imports): never ask twice.
CREATE TABLE IF NOT EXISTS ai_cache (
  key        TEXT PRIMARY KEY,                -- sha256(task + input)
  task       TEXT NOT NULL,
  model      TEXT,
  response   TEXT NOT NULL,                   -- validated JSON
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_lines_source      ON transcript_lines(source_id, idx);
CREATE INDEX IF NOT EXISTS idx_occ_source        ON occurrences(source_id, line_id);
CREATE INDEX IF NOT EXISTS idx_occ_vocab         ON occurrences(vocabulary_id);
CREATE INDEX IF NOT EXISTS idx_examples_vocab    ON examples(vocabulary_id);
CREATE INDEX IF NOT EXISTS idx_uv_user_next      ON user_vocabulary(user_id, next_review_at);
CREATE INDEX IF NOT EXISTS idx_uv_user_saved     ON user_vocabulary(user_id, saved_at);
CREATE INDEX IF NOT EXISTS idx_uv_user_difficult ON user_vocabulary(user_id, difficulty);
CREATE INDEX IF NOT EXISTS idx_logs_user_time    ON review_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_logs_uv           ON review_logs(user_vocabulary_id, id);
CREATE INDEX IF NOT EXISTS idx_group_items_uv    ON word_group_items(user_vocabulary_id);
