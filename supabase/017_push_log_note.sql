-- 017 · the log of notifications says why something wasn't sent. (Only adds things.)
alter table public.push_log add column if not exists note text;
