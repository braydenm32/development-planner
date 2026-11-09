-- Comments on share links: someone with a link pins a short note on the plan ("move this wall")
-- for the person who shared it. Each link has its own setting, off for links made before this
-- and for new ones unless the owner ticks it: 0 off, 1 on (each person sees only their own),
-- 2 on (everyone with the link sees every comment on it).
ALTER TABLE share_links ADD COLUMN comments INTEGER NOT NULL DEFAULT 0;

-- One row a comment. `x` and `y` are the survey's easting and northing (m) and `floor` the plan's
-- level id, so a pin stays on its spot of the block however the view is turned or moved.
-- `viewer_hash` is the SHA-256 of a random token kept in the commenter's browser, so they can
-- see their own again; nothing else about them is kept but the name they chose to give.
-- `resolved` is when the owner marked it dealt with (ms), NULL while it is new.
CREATE TABLE share_comments (
  id TEXT PRIMARY KEY,
  link_id TEXT NOT NULL REFERENCES share_links(token_hash) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  floor TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  text TEXT NOT NULL,
  name TEXT,
  created INTEGER NOT NULL,
  resolved INTEGER,
  viewer_hash TEXT NOT NULL
);
CREATE INDEX share_comments_link ON share_comments(link_id, created);
CREATE INDEX share_comments_owner ON share_comments(user_id, project_id, created);
