-- Usage per learner per day: tokens and cost (USD, from OpenRouter) and
-- transcripts fetched through the transcript service.
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS completion_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS cost DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS transcripts INTEGER NOT NULL DEFAULT 0;
