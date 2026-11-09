-- Which invite code each account came in with: the code's label in INVITE_CODE, or `#` and the
-- first 8 hex characters of its SHA-256 when it has none (worker/src/auth.ts). With several codes
-- out, one that's been passed around can be taken out of the list, and the accounts it let in
-- found. NULL: no invite asked for (the first account, or open sign-up), or made before this.
ALTER TABLE users ADD COLUMN invite TEXT;
