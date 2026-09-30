-- =====================================================================
--  Frejas — migration 003: challenges v2
--  Solo or with friends, drafts, future start, schedules (every day /
--  specific days / times a week), win rules, covers, in-app invites,
--  join approval and chat.
-- =====================================================================

-- ---------------------------------------------------------------- columns
alter table public.challenges
  add column status         text     not null default 'active' check (status in ('draft', 'active')),
  add column solo           boolean  not null default false,
  add column frequency      public.frequency_type check (frequency in ('daily', 'specific_days', 'times_per_week')),
  add column days           smallint[] check (days <@ array[1,2,3,4,5,6,7]::smallint[]),
  add column times_per_week smallint check (times_per_week between 1 and 7),
  add column min_amount     numeric  check (min_amount > 0),
  add column same_goal      boolean  not null default true,
  add column win_rule       text     not null default 'consistent' check (win_rule in ('finishers', 'consistent', 'most')),
  add column finish_pct     smallint not null default 80 check (finish_pct between 1 and 100),
  add column join_mode      text     not null default 'approve' check (join_mode in ('open', 'approve')),
  add column cover_preset   text     check (cover_preset in ('arches', 'waves', 'sun', 'dots', 'leaf', 'stripes')),
  add column cover_path     text;

-- a member's own goal when "own goals" is chosen
alter table public.challenge_members
  add column times_per_week smallint check (times_per_week between 1 and 7);

-- habits made by a future challenge stay hidden until it starts
alter table public.habits add column starts_on date;

-- ---------------------------------------------------------------- new tables
create table public.challenge_invites (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  invited_by   uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

create table public.join_requests (
  challenge_id   uuid not null references public.challenges (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  goal_amount    numeric check (goal_amount > 0),
  times_per_week smallint check (times_per_week between 1 and 7),
  created_at     timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

create table public.messages (
  id           uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  body         text not null check (char_length(body) between 1 and 1000),
  created_at   timestamptz not null default now()
);
create index on public.messages (challenge_id, created_at);
create index on public.challenge_invites (user_id);

-- ---------------------------------------------------------------- helpers
create function public.is_creator(p_challenge uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.challenges where id = p_challenge and creator_id = auth.uid());
$$;

create function public.is_invited(p_challenge uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.challenge_invites where challenge_id = p_challenge and user_id = auth.uid());
$$;

-- ---------------------------------------------------------------- security rules
alter table public.challenge_invites enable row level security;
alter table public.join_requests     enable row level security;
alter table public.messages          enable row level security;

-- invited people can see the challenge they're invited to (drafts stay private)
drop policy "challenges: read if member or creator" on public.challenges;
create policy "challenges: read if member, creator or invited" on public.challenges
  for select to authenticated
  using (creator_id = auth.uid() or public.is_member(id) or (status = 'active' and public.is_invited(id)));

-- invites: members invite people they already share a challenge with
create policy "invites: see own and challenge's" on public.challenge_invites
  for select to authenticated using (user_id = auth.uid() or public.is_member(challenge_id));
create policy "invites: members invite friends" on public.challenge_invites
  for insert to authenticated
  with check (invited_by = auth.uid() and public.is_member(challenge_id) and public.shares_challenge(user_id));
create policy "invites: decline or withdraw" on public.challenge_invites
  for delete to authenticated using (user_id = auth.uid() or invited_by = auth.uid() or public.is_creator(challenge_id));

-- join requests: created by join_challenge(); the asker and the creator can see and remove them
create policy "requests: asker and creator read" on public.join_requests
  for select to authenticated using (user_id = auth.uid() or public.is_creator(challenge_id));
create policy "requests: asker withdraws, creator declines" on public.join_requests
  for delete to authenticated using (user_id = auth.uid() or public.is_creator(challenge_id));

-- chat: members only
create policy "messages: members read" on public.messages
  for select to authenticated using (public.is_member(challenge_id));
create policy "messages: members write as themselves" on public.messages
  for insert to authenticated with check (user_id = auth.uid() and public.is_member(challenge_id));
create policy "messages: delete own" on public.messages
  for delete to authenticated using (user_id = auth.uid());

-- people who asked to join are visible to the creator (name and photo)
drop policy "profiles: read self and challenge friends" on public.profiles;
create policy "profiles: read self, friends and requesters" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_challenge(id)
         or exists (select 1 from public.join_requests r where r.user_id = profiles.id and public.is_creator(r.challenge_id))
         or exists (select 1 from public.challenge_invites i where i.invited_by = profiles.id and i.user_id = auth.uid()));

-- ---------------------------------------------------------------- invite preview (before sign-up)
drop function public.get_invite(text);
create function public.get_invite(p_token text)
returns table (challenge_id uuid, name text, goal_type public.goal_type, unit text, starts_on date, ends_on date,
               stake text, member_names text[], frequency public.frequency_type, days smallint[], times_per_week smallint,
               min_amount numeric, same_goal boolean, win_rule text, join_mode text, cover_preset text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, c.goal_type, c.unit, c.starts_on, c.ends_on, c.stake,
         array(select p.display_name from public.challenge_members m join public.profiles p on p.id = m.user_id
               where m.challenge_id = c.id order by m.joined_at limit 5),
         c.frequency, c.days, c.times_per_week, c.min_amount, c.same_goal, c.win_rule, c.join_mode, c.cover_preset
  from public.challenges c
  where c.invite_token = p_token and not c.invite_revoked and c.status = 'active' and not c.solo and c.ends_on >= current_date;
$$;

-- ---------------------------------------------------------------- join (open, invited, or ask to join)
drop function public.join_challenge(text, uuid, numeric);
create function public.join_challenge(p_token text, p_habit_id uuid default null, p_goal numeric default null, p_times smallint default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v public.challenges;
  v_invited boolean;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  select * into v from public.challenges
  where invite_token = p_token and not invite_revoked and status = 'active' and not solo and ends_on >= current_date;
  if not found then raise exception 'This invite link is not valid any more'; end if;

  if exists (select 1 from public.challenge_members where challenge_id = v.id and user_id = auth.uid()) then
    return 'joined';
  end if;
  if p_habit_id is not null and not exists (select 1 from public.habits where id = p_habit_id and owner_id = auth.uid()) then
    raise exception 'Unknown habit';
  end if;

  v_invited := exists (select 1 from public.challenge_invites where challenge_id = v.id and user_id = auth.uid());

  if v.join_mode = 'approve' and not v_invited then
    insert into public.join_requests (challenge_id, user_id, goal_amount, times_per_week)
    values (v.id, auth.uid(), p_goal, p_times)
    on conflict (challenge_id, user_id) do update set goal_amount = excluded.goal_amount, times_per_week = excluded.times_per_week;
    return 'requested';
  end if;

  insert into public.challenge_members (challenge_id, user_id, habit_id, goal_amount, times_per_week)
  values (v.id, auth.uid(), p_habit_id, p_goal, p_times);
  delete from public.challenge_invites where challenge_id = v.id and user_id = auth.uid();
  return 'joined';
end;
$$;

-- creator lets someone in
create function public.approve_request(p_challenge uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.join_requests;
begin
  if not public.is_creator(p_challenge) then raise exception 'Only the creator can do this'; end if;
  select * into r from public.join_requests where challenge_id = p_challenge and user_id = p_user;
  if not found then raise exception 'No such request'; end if;
  insert into public.challenge_members (challenge_id, user_id, goal_amount, times_per_week)
  values (p_challenge, p_user, r.goal_amount, r.times_per_week)
  on conflict do nothing;
  delete from public.join_requests where challenge_id = p_challenge and user_id = p_user;
end;
$$;

-- ---------------------------------------------------------------- covers (private)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('covers', 'covers', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "covers: members and invited view" on storage.objects
  for select to authenticated
  using (bucket_id = 'covers' and (public.is_member(((storage.foldername(name))[1])::uuid)
                                   or public.is_creator(((storage.foldername(name))[1])::uuid)
                                   or public.is_invited(((storage.foldername(name))[1])::uuid)));
create policy "covers: creator manages" on storage.objects
  for all to authenticated
  using (bucket_id = 'covers' and public.is_creator(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'covers' and public.is_creator(((storage.foldername(name))[1])::uuid));

-- ---------------------------------------------------------------- grants
grant select, insert, delete on public.challenge_invites to authenticated;
grant select, delete         on public.join_requests     to authenticated;
grant select, insert, delete on public.messages          to authenticated;
grant all on public.challenge_invites, public.join_requests, public.messages to service_role;

revoke execute on function public.is_creator(uuid), public.is_invited(uuid), public.get_invite(text),
  public.join_challenge(text, uuid, numeric, smallint), public.approve_request(uuid, uuid) from public, anon;
grant execute on function public.is_creator(uuid)                                 to authenticated;
grant execute on function public.is_invited(uuid)                                 to authenticated;
grant execute on function public.join_challenge(text, uuid, numeric, smallint)    to authenticated;
grant execute on function public.approve_request(uuid, uuid)                      to authenticated;
grant execute on function public.get_invite(text)                                 to anon, authenticated;

-- ---------------------------------------------------------------- live chat
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
