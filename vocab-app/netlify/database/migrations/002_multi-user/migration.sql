-- LexiTube schema v5: several independent accounts.
--   * users.role: the first account with a password is the administrator.
--   * sources get an owner (transcripts and word contexts belong to a user
--     through their source); existing rows go to the first user.
--   * the learner's own examples and server backups get an owner.
--   * word timings for live transcript highlighting, per-user AI usage,
--     and an id map used while importing a backup.
-- Every statement is idempotent; existing data is kept.

ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
UPDATE users SET role = 'admin'
 WHERE id = (SELECT MIN(id) FROM users WHERE password_hash IS NOT NULL)
   AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin');
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username ON users (lower(username));

-- Existing data needs an owner: create the first user only if there is data and no user.
INSERT INTO users (id, name)
SELECT 1, 'Learner'
 WHERE NOT EXISTS (SELECT 1 FROM users)
   AND (EXISTS (SELECT 1 FROM sources) OR EXISTS (SELECT 1 FROM examples WHERE kind = 'user') OR EXISTS (SELECT 1 FROM backups))
ON CONFLICT (id) DO NOTHING;

ALTER TABLE sources ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
UPDATE sources SET user_id = (SELECT MIN(id) FROM users) WHERE user_id IS NULL;
ALTER TABLE sources ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_youtube_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sources_user_youtube ON sources (user_id, youtube_id);
CREATE INDEX IF NOT EXISTS idx_sources_user ON sources (user_id, analyzed_at);

ALTER TABLE examples ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
UPDATE examples SET user_id = (SELECT MIN(id) FROM users) WHERE kind = 'user' AND user_id IS NULL;
ALTER TABLE examples DROP CONSTRAINT IF EXISTS examples_vocabulary_id_sentence_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_examples_owner ON examples (vocabulary_id, sentence_key, COALESCE(user_id, 0));

ALTER TABLE backups ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
UPDATE backups SET user_id = (SELECT MIN(id) FROM users) WHERE user_id IS NULL;

ALTER TABLE transcript_lines ADD COLUMN IF NOT EXISTS words_json TEXT;

CREATE TABLE IF NOT EXISTS ai_usage (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day     TEXT    NOT NULL,
  calls   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS import_map (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tbl     TEXT    NOT NULL,
  old_id  TEXT    NOT NULL,
  new_id  INTEGER NOT NULL,
  PRIMARY KEY (user_id, tbl, old_id)
);

-- The first account was created with an explicit id: move the counter past it
-- so new accounts get fresh ids.
SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE((SELECT MAX(id) FROM users), 0) + 1, false);
