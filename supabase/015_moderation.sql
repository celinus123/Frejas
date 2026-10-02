-- 015 · photos across a block, a word filter, and who looks after reports. (Only adds things.)

-- ---------------------------------------------------------------- photos across a block
-- A check-in photo is stored as photos/<challenge>/<who posted it>/<file>. Members of the challenge can
-- open it; from now on not when there is a block between you and the person who posted it.
create or replace function public.photo_blocked(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when split_part(p_name, '/', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
              then public.blocked(split_part(p_name, '/', 2)::uuid)
              else false end;
$$;
create policy "photos: not across a block" on storage.objects
  as restrictive for select to authenticated
  using (bucket_id <> 'photos' or not public.photo_blocked(name));

-- ---------------------------------------------------------------- word filter
-- Hate words and threats can't be posted where other people read them. Ordinary swearing is left alone.
-- The list is a table so that words can be added without changing the app. Whole words only.
create table if not exists public.blocked_words (
  word text primary key check (word = lower(word) and word ~ '^[[:alpha:]][[:alpha:] ''-]*[[:alpha:]]$' and char_length(word) <= 40)
);
alter table public.blocked_words enable row level security;   -- no rules: nobody signed in can read the list
grant all on public.blocked_words to service_role;

insert into public.blocked_words (word) values
  ('nigger'), ('niggers'), ('nigga'), ('niggas'), ('faggot'), ('faggots'), ('kike'), ('kikes'), ('wetback'), ('wetbacks'),
  ('gook'), ('gooks'), ('raghead'), ('towelhead'), ('tranny'), ('trannies'),
  ('kill yourself'), ('i will rape'), ('rape you'),
  ('neger'), ('negern'), ('negrer'), ('blatte'), ('blattar'), ('svartskalle'), ('svartskallar'), ('judesvin'), ('bögjävel'), ('ta livet av dig'),
  ('nègre'), ('nègres'), ('négro'), ('bougnoule'), ('bougnoules'), ('youpin'), ('youpins'), ('pédé'), ('pédés'),
  ('sale arabe'), ('sale juif'), ('sale noir'), ('suicide-toi'), ('va te pendre')
on conflict do nothing;

create or replace function public.has_blocked_word(p_text text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_text is not null and exists (select 1 from public.blocked_words w where lower(p_text) ~ ('\m' || w.word || '\M'));
$$;

-- Checks the columns it is given, and only text that is new or was changed.
create or replace function public.keep_it_kind()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  i int; v text; was text;
begin
  for i in 0 .. tg_nargs - 1 loop
    v := to_jsonb(new) ->> tg_argv[i];
    if tg_op = 'UPDATE' then was := to_jsonb(old) ->> tg_argv[i]; else was := null; end if;
    if v is not null and v is distinct from was and public.has_blocked_word(v) then
      raise exception 'Some of that wording isn''t allowed on Frejas. Please change it and try again.';
    end if;
  end loop;
  return new;
end $$;

create trigger comments_kind     before insert or update on public.comments     for each row execute function public.keep_it_kind('body');
create trigger day_comments_kind before insert or update on public.day_comments for each row execute function public.keep_it_kind('body');
create trigger messages_kind     before insert or update on public.messages     for each row execute function public.keep_it_kind('body');
create trigger check_ins_kind    before insert or update on public.check_ins    for each row execute function public.keep_it_kind('title', 'comment');
create trigger challenges_kind   before insert or update on public.challenges   for each row execute function public.keep_it_kind('name', 'stake', 'unit');
create trigger habits_kind       before insert or update on public.habits       for each row execute function public.keep_it_kind('name', 'category');
create trigger profiles_kind     before update           on public.profiles     for each row execute function public.keep_it_kind('display_name');

-- A new account whose name is on the list starts without a name (and is asked for one), so signing up never fails on it.
create or replace function public.blank_unkind_name()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.has_blocked_word(new.display_name) then new.display_name := ''; end if;
  return new;
end $$;
create trigger profiles_kind_new before insert on public.profiles for each row execute function public.blank_unkind_name();

-- ---------------------------------------------------------------- who looks after reports
-- People listed here see the reports page. The first one is added by hand in the database.
create table if not exists public.admins (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;   -- no rules: only the server reads it
grant all on public.admins to service_role;

alter table public.reports add column if not exists handled_at timestamptz;
alter table public.reports add column if not exists handled_action text check (handled_action in ('kept', 'removed', 'account_removed'));

-- How many reports are waiting. Null for everyone who doesn't look after reports.
create or replace function public.open_reports()
returns integer language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from public.admins a where a.user_id = auth.uid())
              then (select count(*)::int from public.reports r where r.status = 'open') end;
$$;

revoke execute on function public.photo_blocked(text), public.has_blocked_word(text), public.keep_it_kind(), public.blank_unkind_name(), public.open_reports()
  from public, anon;
revoke execute on function public.has_blocked_word(text), public.keep_it_kind(), public.blank_unkind_name() from authenticated;
grant execute on function public.photo_blocked(text), public.open_reports() to authenticated;
