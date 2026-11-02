-- When the built-in dictionary's words were added to a source's suggestions.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS dict_words_at TEXT;
-- Daily goal while watching: the distinct words a learner opened (or saved one by one) each day.
CREATE TABLE IF NOT EXISTS word_views (
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day           TEXT    NOT NULL,
  vocabulary_id INTEGER NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, day, vocabulary_id)
);
