-- Deleting an account. Asking sets when it goes (ms), 30 days on; until then, signing in again
-- and choosing Keep stops it. After that the hourly clean-up (worker/src/account.ts) removes the
-- account and everything saved for it. NULL: not being deleted.
ALTER TABLE users ADD COLUMN delete_after INTEGER;
CREATE INDEX users_delete_after ON users(delete_after) WHERE delete_after IS NOT NULL;
