-- Read-only share links: when each was last opened, for the owner's list ("Opened 2 hours ago").
-- Written at most once a minute per link, and only by opening it.
ALTER TABLE share_links ADD COLUMN last_opened INTEGER;
