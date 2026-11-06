-- 1 once a word's CEFR level was set by the learner dictionaries (Oxford 3000/5000, EVP):
-- it is never classified again.
ALTER TABLE vocabulary ADD COLUMN IF NOT EXISTS level_checked INTEGER NOT NULL DEFAULT 0;
