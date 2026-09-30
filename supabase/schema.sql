-- =====================================================================
--  Together — database schema v1
--  Run once in Supabase: SQL Editor → New query → paste all → Run.
--  Safe defaults: every table has Row Level Security, nothing is
--  readable by logged-out visitors except an invite preview by token.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Types
-- ---------------------------------------------------------------------
create type public.frequency_type as enum ('daily', 'specific_days', 'times_per_week', 'every_other_week', 'monthly');
create type public.visibility as enum ('private', 'friends');
create type public.goal_type as enum ('own', 'shared');

-- ---------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------

-- One row per user, created automatically at sign-up (see trigger below).
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null default '' check (char_length(display_name) <= 40),
  avatar_path   text,
  theme         text not null default 'auto' check (theme in ('light', 'dark', 'auto')),
  week_starts_monday boolean not null default true,
  new_habits_private boolean not null default true,
  created_at    timestamptz not null default now()
);

create table public.habits (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 60),
  frequency       public.frequency_type not null default 'daily',
  days            smallint[] check (days <@ array[1,2,3,4,5,6,7]::smallint[]),   -- 1 = Monday
  times_per_week  smallint check (times_per_week between 1 and 7),
  category        text check (char_length(category) <= 24),
  reminder_time   time,
  visibility      public.visibility not null default 'private',
  archived_at     timestamptz,
  created_at      timestamptz not null default now()
);

-- One row per habit per day it was done.
create table public.habit_logs (
  id          uuid primary key default gen_random_uuid(),
  habit_id    uuid not null references public.habits (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  log_date    date not null,
  created_at  timestamptz not null default now(),
  unique (habit_id, log_date)
);

create table public.challenges (
  id                   uuid primary key default gen_random_uuid(),
  creator_id           uuid not null references public.profiles (id) on delete cascade,
  name                 text not null check (char_length(name) between 1 and 60),
  goal_type            public.goal_type not null,
  unit                 text check (char_length(unit) <= 16),          -- 'km', 'steps', null = just done/not done
  shared_target        numeric check (shared_target > 0),             -- only for goal_type = 'shared'
  starts_on            date not null,
  ends_on              date not null,
  stake                text check (char_length(stake) <= 80),
  show_longest_streak  boolean not null default true,
  show_most_checkins   boolean not null default true,
  show_most_photos     boolean not null default false,
  invite_token         text not null unique default replace(gen_random_uuid()::text, '-', ''),
  invite_revoked       boolean not null default false,
  created_at           timestamptz not null default now(),
  check (ends_on >= starts_on),
  check (goal_type = 'own' or shared_target is not null)
);

create table public.challenge_members (
  challenge_id  uuid not null references public.challenges (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  habit_id      uuid references public.habits (id) on delete set null,   -- the habit that counts here
  goal_amount   numeric check (goal_amount > 0),                         -- own goal; locked at start
  muted         boolean not null default false,
  joined_at     timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

create table public.check_ins (
  id            uuid primary key default gen_random_uuid(),
  challenge_id  uuid not null references public.challenges (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  habit_log_id  uuid references public.habit_logs (id) on delete set null,
  checkin_date  date not null default current_date,
  title         text not null check (char_length(title) between 1 and 60),
  comment       text check (char_length(comment) <= 500),
  photo_path    text,
  amount        numeric check (amount > 0 and amount < 1000000),
  created_at    timestamptz not null default now()
);

create table public.reactions (
  check_in_id  uuid not null references public.check_ins (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (check_in_id, user_id)
);

create table public.comments (
  id           uuid primary key default gen_random_uuid(),
  check_in_id  uuid not null references public.check_ins (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  body         text not null check (char_length(body) between 1 and 500),
  created_at   timestamptz not null default now()
);

create index on public.habits (owner_id);
create index on public.habit_logs (user_id, log_date);
create index on public.challenge_members (user_id);
create index on public.check_ins (challenge_id, created_at desc);
create index on public.check_ins (user_id);
create index on public.comments (check_in_id, created_at);

-- ---------------------------------------------------------------------
-- 3. Helper functions used by the security rules
--    (security definer so they can look at membership without
--     tripping over the rules they are part of)
-- ---------------------------------------------------------------------
create function public.is_member(p_challenge uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.challenge_members
    where challenge_id = p_challenge and user_id = auth.uid()
  );
$$;

-- True when the current user and p_other are in at least one challenge together.
create function public.shares_challenge(p_other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.challenge_members me
    join public.challenge_members them on them.challenge_id = me.challenge_id
    where me.user_id = auth.uid() and them.user_id = p_other
  );
$$;

-- ---------------------------------------------------------------------
-- 4. Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.habits            enable row level security;
alter table public.habit_logs        enable row level security;
alter table public.challenges        enable row level security;
alter table public.challenge_members enable row level security;
alter table public.check_ins         enable row level security;
alter table public.reactions         enable row level security;
alter table public.comments          enable row level security;

-- profiles: see yourself and people you share a challenge with; edit only yourself
create policy "profiles: read self and challenge friends" on public.profiles
  for select to authenticated using (id = auth.uid() or public.shares_challenge(id));
create policy "profiles: update self" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- habits: private by default; 'friends' habits visible to challenge friends
create policy "habits: read own or shared" on public.habits
  for select to authenticated
  using (owner_id = auth.uid() or (visibility = 'friends' and public.shares_challenge(owner_id)));
create policy "habits: insert own" on public.habits
  for insert to authenticated with check (owner_id = auth.uid());
create policy "habits: update own" on public.habits
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "habits: delete own" on public.habits
  for delete to authenticated using (owner_id = auth.uid());

-- habit_logs: same visibility as the habit; only log your own habits
create policy "habit_logs: read own or shared" on public.habit_logs
  for select to authenticated
  using (user_id = auth.uid() or exists (
    select 1 from public.habits h
    where h.id = habit_id and h.visibility = 'friends' and public.shares_challenge(h.owner_id)));
create policy "habit_logs: insert own" on public.habit_logs
  for insert to authenticated
  with check (user_id = auth.uid()
              and exists (select 1 from public.habits h where h.id = habit_id and h.owner_id = auth.uid()));
create policy "habit_logs: delete own" on public.habit_logs
  for delete to authenticated using (user_id = auth.uid());

-- challenges: members (and the creator) can read; only the creator can change
create policy "challenges: read if member or creator" on public.challenges
  for select to authenticated using (creator_id = auth.uid() or public.is_member(id));
create policy "challenges: create as yourself" on public.challenges
  for insert to authenticated with check (creator_id = auth.uid());
create policy "challenges: creator updates" on public.challenges
  for update to authenticated using (creator_id = auth.uid()) with check (creator_id = auth.uid());
create policy "challenges: creator deletes" on public.challenges
  for delete to authenticated using (creator_id = auth.uid());

-- challenge_members: members see each other. Joining happens through
-- join_challenge(); the creator adds themself right after creating.
create policy "members: read fellow members" on public.challenge_members
  for select to authenticated using (public.is_member(challenge_id));
create policy "members: creator adds self" on public.challenge_members
  for insert to authenticated
  with check (user_id = auth.uid()
              and exists (select 1 from public.challenges c where c.id = challenge_id and c.creator_id = auth.uid())
              and (habit_id is null or exists (select 1 from public.habits h where h.id = habit_id and h.owner_id = auth.uid())));
create policy "members: update own row" on public.challenge_members
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
              and (habit_id is null or exists (select 1 from public.habits h where h.id = habit_id and h.owner_id = auth.uid())));
create policy "members: leave" on public.challenge_members
  for delete to authenticated using (user_id = auth.uid());

-- check_ins: members read; you post your own, inside the challenge dates, never in the future
create policy "check_ins: members read" on public.check_ins
  for select to authenticated using (public.is_member(challenge_id));
create policy "check_ins: post own" on public.check_ins
  for insert to authenticated
  with check (user_id = auth.uid()
              and public.is_member(challenge_id)
              and checkin_date <= current_date
              and exists (select 1 from public.challenges c
                          where c.id = challenge_id and checkin_date between c.starts_on and c.ends_on));
create policy "check_ins: edit own" on public.check_ins
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "check_ins: delete own" on public.check_ins
  for delete to authenticated using (user_id = auth.uid());

-- reactions and comments: members of the check-in's challenge
create policy "reactions: members read" on public.reactions
  for select to authenticated
  using (exists (select 1 from public.check_ins ci where ci.id = check_in_id and public.is_member(ci.challenge_id)));
create policy "reactions: like as yourself" on public.reactions
  for insert to authenticated
  with check (user_id = auth.uid()
              and exists (select 1 from public.check_ins ci where ci.id = check_in_id and public.is_member(ci.challenge_id)));
create policy "reactions: unlike own" on public.reactions
  for delete to authenticated using (user_id = auth.uid());

create policy "comments: members read" on public.comments
  for select to authenticated
  using (exists (select 1 from public.check_ins ci where ci.id = check_in_id and public.is_member(ci.challenge_id)));
create policy "comments: write as yourself" on public.comments
  for insert to authenticated
  with check (user_id = auth.uid()
              and exists (select 1 from public.check_ins ci where ci.id = check_in_id and public.is_member(ci.challenge_id)));
create policy "comments: delete own" on public.comments
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 5. Rules the security policies can't express
-- ---------------------------------------------------------------------

-- Own goals lock when the challenge starts.
create function public.lock_goal_after_start()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.goal_amount is distinct from old.goal_amount
     and current_date >= (select starts_on from public.challenges where id = new.challenge_id) then
    raise exception 'Goals are locked once the challenge has started';
  end if;
  if new.challenge_id <> old.challenge_id or new.user_id <> old.user_id then
    raise exception 'Membership cannot be moved';
  end if;
  return new;
end;
$$;
create trigger lock_goal before update on public.challenge_members
  for each row execute function public.lock_goal_after_start();

-- Nobody can change who created a challenge or regenerate its identity.
create function public.protect_challenge_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.creator_id <> old.creator_id or new.goal_type <> old.goal_type then
    raise exception 'Creator and goal type cannot be changed';
  end if;
  return new;
end;
$$;
create trigger protect_challenge before update on public.challenges
  for each row execute function public.protect_challenge_fields();

-- Create a profile automatically for every new sign-up.
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(left(new.raw_user_meta_data ->> 'display_name', 40), ''));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 6. Invite links
-- ---------------------------------------------------------------------

-- What the invite screen shows before you have an account.
-- Only works with the secret token; returns first names, never emails.
create function public.get_invite(p_token text)
returns table (challenge_id uuid, name text, goal_type public.goal_type, unit text,
               starts_on date, ends_on date, stake text, member_names text[])
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, c.goal_type, c.unit, c.starts_on, c.ends_on, c.stake,
         array(select p.display_name from public.challenge_members m
               join public.profiles p on p.id = m.user_id
               where m.challenge_id = c.id order by m.joined_at limit 5)
  from public.challenges c
  where c.invite_token = p_token and not c.invite_revoked and c.ends_on >= current_date;
$$;

-- Join with a token. Returns the challenge id.
create function public.join_challenge(p_token text, p_habit_id uuid default null, p_goal numeric default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_challenge public.challenges;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select * into v_challenge from public.challenges
  where invite_token = p_token and not invite_revoked and ends_on >= current_date;
  if not found then
    raise exception 'This invite link is not valid any more';
  end if;

  if p_habit_id is not null and not exists (
       select 1 from public.habits where id = p_habit_id and owner_id = auth.uid()) then
    raise exception 'Unknown habit';
  end if;

  if v_challenge.goal_type = 'own' and p_goal is null then
    raise exception 'Set your goal to join';
  end if;

  insert into public.challenge_members (challenge_id, user_id, habit_id, goal_amount)
  values (v_challenge.id, auth.uid(), p_habit_id, p_goal)
  on conflict (challenge_id, user_id) do nothing;

  return v_challenge.id;
end;
$$;

-- Creator can make a fresh link (the old one stops working).
create function public.rotate_invite(p_challenge uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text := replace(gen_random_uuid()::text, '-', '');
begin
  update public.challenges set invite_token = v_token, invite_revoked = false
  where id = p_challenge and creator_id = auth.uid();
  if not found then raise exception 'Only the creator can do this'; end if;
  return v_token;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Who may call what
--    ("Automatically expose new tables" is off, so we grant explicitly.)
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
grant select, update                 on public.profiles          to authenticated;
grant select, insert, update, delete on public.habits            to authenticated;
grant select, insert, delete         on public.habit_logs        to authenticated;
grant select, insert, update, delete on public.challenges        to authenticated;
grant select, insert, update, delete on public.challenge_members to authenticated;
grant select, insert, update, delete on public.check_ins         to authenticated;
grant select, insert, delete         on public.reactions         to authenticated;
grant select, insert, delete         on public.comments          to authenticated;

-- invite_token is readable by members (they share the link); nobody else sees challenges at all.

revoke execute on all functions in schema public from public, anon;
grant execute on function public.is_member(uuid)                      to authenticated;
grant execute on function public.shares_challenge(uuid)               to authenticated;
grant execute on function public.join_challenge(text, uuid, numeric)  to authenticated;
grant execute on function public.rotate_invite(uuid)                  to authenticated;
grant execute on function public.get_invite(text)                     to anon, authenticated;

-- ---------------------------------------------------------------------
-- 8. Photo storage (private buckets, 5 MB, images only)
--    photos:  <challenge_id>/<user_id>/<file>
--    avatars: <user_id>/<file>
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos',  'photos',  false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
       ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "photos: members view" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "photos: upload own into your challenge" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos'
              and (storage.foldername(name))[2] = auth.uid()::text
              and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "photos: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[2] = auth.uid()::text);

create policy "avatars: self and challenge friends view" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars'
         and ((storage.foldername(name))[1] = auth.uid()::text
              or public.shares_challenge(((storage.foldername(name))[1])::uuid)));
create policy "avatars: manage own" on storage.objects
  for all to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
