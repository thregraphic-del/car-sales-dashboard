-- «المحذوفات»: a deleted word waits in the trash (state 'trashed') and can be restored from the settings.
ALTER TABLE user_vocabulary DROP CONSTRAINT IF EXISTS user_vocabulary_state_check;
ALTER TABLE user_vocabulary ADD CONSTRAINT user_vocabulary_state_check CHECK (state IN ('saved','dismissed','trashed'));
