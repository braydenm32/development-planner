-- Signing the desktop app in (worker/src/appLink.ts). The app can't use passkeys (they belong to
-- the website's address), so it asks for a link, opens it in the browser, and a signed-in browser
-- approves it. The code is shown both in the app and in the browser, to check they match; only a
-- hash of the app's secret is kept, and only the app knows the secret, so only it can collect the
-- session. Ten minutes, single use; expired rows are tidied as new ones are made and hourly.
CREATE TABLE app_links (
  code TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX app_links_expires ON app_links(expires);
