-- Email sign-in, the backup to passkeys (worker/src/emailAuth.ts). An account may add one email
-- address, stored trimmed and lower-cased; it's used only to send 6-digit sign-in codes. NULL: none
-- added. No two accounts share one.
ALTER TABLE users ADD COLUMN email TEXT;
CREATE UNIQUE INDEX users_email ON users(email) WHERE email IS NOT NULL;

-- Codes waiting to be typed in: one per account and purpose (asking again replaces it), single
-- use, ten minutes, five wrong tries. Only a hash of the code is kept, bound to its account,
-- address and purpose:
--   verify  proves the account's owner reads the address they're adding (not yet users.email)
--   signin  signs in to the account that has the address
-- Expired rows are tidied as they're written and by the hourly clean-up, so an address someone
-- mistyped doesn't stay.
CREATE TABLE email_codes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  email TEXT NOT NULL,
  hash TEXT NOT NULL,
  expires INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL,
  PRIMARY KEY (user_id, purpose)
);
CREATE INDEX email_codes_email ON email_codes(email, purpose);
CREATE INDEX email_codes_expires ON email_codes(expires);
