-- LexiTube relational schema (SQLite dialect; see db/postgres-schema.sql for the
-- equivalent PostgreSQL / Supabase version). All pages read and write these tables.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL DEFAULT 'Learner',
  daily_goal    INTEGER NOT NULL DEFAULT 10,
  speak_arabic  INTEGER NOT NULL DEFAULT 0,
  speech_rate   REAL    NOT NULL DEFAULT 1.0,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- One row per analysed YouTube video.
CREATE TABLE IF NOT EXISTS videos (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  youtube_id       TEXT    NOT NULL UNIQUE,
  url              TEXT    NOT NULL,
  title            TEXT    NOT NULL,
  channel          TEXT,
  duration_seconds INTEGER,
  thumbnail_url    TEXT,
  transcript_source TEXT,               -- youtube-captions | pasted | demo
  extractor        TEXT,                -- claude | dictionary | demo
  word_count       INTEGER,
  is_demo          INTEGER NOT NULL DEFAULT 0,
  analyzed_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Global dictionary of learnable items (single words and multi-word expressions).
CREATE TABLE IF NOT EXISTS vocabulary (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  term            TEXT    NOT NULL,      -- display form, e.g. "take something for granted"
  term_key        TEXT    NOT NULL,      -- normalised lowercase key
  item_type       TEXT    NOT NULL DEFAULT 'word', -- word | phrasal verb | idiom | collocation | expression
  part_of_speech  TEXT,
  level           TEXT    NOT NULL CHECK (level IN ('B1','B2','C1')),
  usefulness      INTEGER NOT NULL DEFAULT 70,     -- 0..100
  pronunciation   TEXT,                  -- IPA
  arabic          TEXT    NOT NULL,      -- general Arabic meaning
  simple_english  TEXT    NOT NULL,
  similar_json    TEXT    NOT NULL DEFAULT '[]', -- [{word, arabic, note}] easier words
  topic           TEXT,                  -- business | academic | daily | media | work | tech | emotions ...
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (term_key, part_of_speech)
);

-- Example sentences for a vocabulary item.
CREATE TABLE IF NOT EXISTS examples (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  vocabulary_id  INTEGER NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
  kind           TEXT    NOT NULL DEFAULT 'example', -- example | easy
  sentence       TEXT    NOT NULL,
  arabic         TEXT
);

-- Where an item appeared in a video: the *contextual* meaning lives here.
CREATE TABLE IF NOT EXISTS video_vocabulary (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id           INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  vocabulary_id      INTEGER NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
  context_sentence   TEXT    NOT NULL,
  context_arabic     TEXT,               -- translation of the context sentence
  contextual_meaning TEXT,               -- Arabic meaning of the item in THIS context
  timestamp_seconds  INTEGER,
  rank               INTEGER NOT NULL DEFAULT 0,
  UNIQUE (video_id, vocabulary_id)
);

-- A learner's personal relationship with an item (saved / dismissed + SRS state).
CREATE TABLE IF NOT EXISTS user_vocabulary (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vocabulary_id       INTEGER NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
  video_vocabulary_id INTEGER REFERENCES video_vocabulary(id) ON DELETE SET NULL,
  source_video_id     INTEGER REFERENCES videos(id) ON DELETE SET NULL,
  state               TEXT    NOT NULL DEFAULT 'saved' CHECK (state IN ('saved','dismissed')),
  saved_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  review_count        INTEGER NOT NULL DEFAULT 0,
  correct_count       INTEGER NOT NULL DEFAULT 0,
  wrong_count         INTEGER NOT NULL DEFAULT 0,
  streak_correct      INTEGER NOT NULL DEFAULT 0,
  lapses              INTEGER NOT NULL DEFAULT 0,
  ease                REAL    NOT NULL DEFAULT 2.5,
  interval_days       REAL    NOT NULL DEFAULT 0,
  mastery             INTEGER NOT NULL DEFAULT 0,  -- 0..100
  last_reviewed_at    TEXT,
  next_review_at      TEXT,
  UNIQUE (user_id, vocabulary_id)
);

-- Every answer the learner gives (flashcards, games, daily learning).
CREATE TABLE IF NOT EXISTS review_logs (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_vocabulary_id INTEGER NOT NULL REFERENCES user_vocabulary(id) ON DELETE CASCADE,
  source             TEXT    NOT NULL,   -- flashcard | today | game:<name>
  grade              TEXT    NOT NULL,   -- hard | good | easy
  correct            INTEGER NOT NULL,
  interval_after     REAL,
  created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Stable daily plan so "Today's Learning" doesn't reshuffle on every refresh.
CREATE TABLE IF NOT EXISTS daily_plans (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_date  TEXT    NOT NULL,           -- YYYY-MM-DD (server local date)
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, plan_date)
);

CREATE TABLE IF NOT EXISTS daily_plan_items (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id            INTEGER NOT NULL REFERENCES daily_plans(id) ON DELETE CASCADE,
  user_vocabulary_id INTEGER NOT NULL REFERENCES user_vocabulary(id) ON DELETE CASCADE,
  bucket             TEXT    NOT NULL,   -- new | review | difficult | mistakes
  position           INTEGER NOT NULL,
  completed_at       TEXT,
  UNIQUE (plan_id, user_vocabulary_id)
);

CREATE TABLE IF NOT EXISTS campaigns (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  description TEXT,
  source_type TEXT    NOT NULL,          -- video | videos | selection | topic
  source_ref  TEXT,                      -- e.g. topic name or video ids
  color       TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS campaign_items (
  campaign_id        INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_vocabulary_id INTEGER NOT NULL REFERENCES user_vocabulary(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, user_vocabulary_id)
);

CREATE INDEX IF NOT EXISTS idx_uv_user_next   ON user_vocabulary(user_id, next_review_at);
CREATE INDEX IF NOT EXISTS idx_uv_user_saved  ON user_vocabulary(user_id, saved_at);
CREATE INDEX IF NOT EXISTS idx_logs_user_time ON review_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_vv_video       ON video_vocabulary(video_id);
CREATE INDEX IF NOT EXISTS idx_examples_vocab ON examples(vocabulary_id);
