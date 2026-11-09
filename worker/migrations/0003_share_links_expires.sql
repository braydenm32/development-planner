-- Read-only share links end: a new link works for 30 days, 90 days or a year, and can be
-- extended while it still works. NULL is a link made before links had an end, which keeps working
-- until it is turned off.
ALTER TABLE share_links ADD COLUMN expires INTEGER;
