-- Cloud saves and passkey sign-in (D1). Record values themselves live in `blobs`: small ones
-- inline here, large ones (the survey, site drawings) in KV under b:<user>:<hash>:<part>.

-- People with an account. `id` is also the WebAuthn user handle (base64url of 16 random bytes).
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created INTEGER NOT NULL
);

-- Passkeys. `id` is the credential id (base64url), `public_key` its COSE key (base64url).
CREATE TABLE credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL,
  transports TEXT,
  backed_up INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL,
  last_used INTEGER
);
CREATE INDEX credentials_user ON credentials(user_id);

-- One recovery code per person; only its SHA-256 is kept (the code has 100 random bits).
CREATE TABLE recovery_codes (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  hash TEXT NOT NULL UNIQUE,
  created INTEGER NOT NULL
);

-- Signed-in browsers. Only the SHA-256 of the cookie's token is kept.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL,
  seen INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

-- WebAuthn challenges waiting for their answer: single use, five minutes.
CREATE TABLE challenges (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  challenge TEXT NOT NULL,
  user_id TEXT,
  data TEXT,
  expires INTEGER NOT NULL
);

-- Fixed-window counters for the sign-in endpoints.
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  win INTEGER NOT NULL,
  count INTEGER NOT NULL
);

-- Each project's index entry (the app's ProjectMeta, as JSON) and the server's revision.
-- A deleted project stays as a tombstone (deleted = 1) so other devices learn it went.
CREATE TABLE projects (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  meta TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  commit_id TEXT,
  changed INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

-- Which blob holds each of a project's records (survey, plan, prefs, site, …) now.
CREATE TABLE project_records (
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  hash TEXT NOT NULL,
  size INTEGER NOT NULL,
  parts INTEGER NOT NULL,
  PRIMARY KEY (user_id, project_id, kind)
);
CREATE INDEX project_records_hash ON project_records(user_id, hash);

-- Record values by content (SHA-256 of the encoded record, as the app sends it). `got` counts
-- the parts received in order; the blob is whole when got = parts. `used` keeps a blob uploaded
-- for a save that hasn't landed yet from being tidied away.
CREATE TABLE blobs (
  user_id TEXT NOT NULL,
  hash TEXT NOT NULL,
  size INTEGER NOT NULL,
  parts INTEGER NOT NULL,
  got INTEGER NOT NULL,
  inline TEXT,
  used INTEGER NOT NULL,
  PRIMARY KEY (user_id, hash)
);

-- Read-only share links (next): a token (only its hash kept) opens one project read-only,
-- through the same project_records and blobs, until it is revoked.
CREATE TABLE share_links (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  created INTEGER NOT NULL,
  revoked INTEGER
);
CREATE INDEX share_links_project ON share_links(user_id, project_id);
