-- Where the learner stopped in each video (seconds).
ALTER TABLE sources ADD COLUMN IF NOT EXISTS progress_seconds DOUBLE PRECISION;
