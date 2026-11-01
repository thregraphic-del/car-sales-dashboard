-- Built-in dictionary: every inflected form points to its dictionary word
-- (decided → decide, went → go), so a clicked word is found without AI.
CREATE TABLE IF NOT EXISTS lemma_index (
  form  TEXT PRIMARY KEY,
  lemma TEXT NOT NULL
);
-- Words of the frequency list already processed (found, or skipped as names/slang).
CREATE TABLE IF NOT EXISTS dictionary_done (
  word TEXT PRIMARY KEY
);
