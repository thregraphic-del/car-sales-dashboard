-- Phrase-by-phrase English/Arabic alignment of each transcript line: [[from, to, arabic], ...]
ALTER TABLE transcript_lines ADD COLUMN IF NOT EXISTS align_json TEXT;
