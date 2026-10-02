-- 014 · report and block. (Only adds things; rules that exist stay in place.)
--
-- Blocking someone means, in both directions:
--   · you stop being friends in the rules (habits shared with friends, day cards, invitations,
--     challenges friends can find, profile photos) for as long as the block is there
--   · you don't see each other's check-ins, comments, reactions or chat messages
--   · they can't add you with a friend link, and neither of you can join a challenge the other one made
-- If you are in a challenge together you both stay in it and the points still count:
-- the name stays on the leaderboard, what they post does not reach you.

-- ---------------------------------------------------------------- blocks
create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists blocks_blocked on public.blocks (blocked_id);
alter table public.blocks enable row level security;

-- you only ever see the blocks you made yourself; nobody is told that they are blocked
create policy "blocks: see your own" on public.blocks
  for select to authenticated using (blocker_id = auth.uid());
create policy "blocks: block as yourself" on public.blocks
  for insert to authenticated with check (blocker_id = auth.uid());
create policy "blocks: unblock" on public.blocks
  for delete to authenticated using (blocker_id = auth.uid());
grant select, insert, delete on public.blocks to authenticated;
grant all on public.blocks to service_role;

-- is there a block between these two, in either direction? (only used inside the rules below)
create or replace function public.blocked_pair(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.blocks b
                 where (b.blocker_id = p_a and b.blocked_id = p_b) or (b.blocker_id = p_b and b.blocked_id = p_a));
$$;
-- …between you and this person?
create or replace function public.blocked(p_other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.blocked_pair(auth.uid(), p_other);
$$;
-- everyone there is a block with, either way: the app uses it to leave them out of lists of friends
create or replace function public.blocked_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select b.blocked_id from public.blocks b where b.blocker_id = auth.uid()
  union
  select b.blocker_id from public.blocks b where b.blocked_id = auth.uid();
$$;
-- the people you have blocked, with their name, for the list in Settings
create or replace function public.my_blocks()
returns table (id uuid, display_name text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, b.created_at
  from public.blocks b join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

-- ---------------------------------------------------------------- "friends" in the rules
-- in the same challenge as you (nothing about friendship or blocks)
create or replace function public.co_member(p_other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.challenge_members me
    join public.challenge_members them on them.challenge_id = me.challenge_id
    where me.user_id = auth.uid() and them.user_id = p_other);
$$;

create or replace function public.is_friend(p_other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.friendships
                 where user_a = least(auth.uid(), p_other) and user_b = greatest(auth.uid(), p_other))
         and not public.blocked(p_other);
$$;

-- "Friends" everywhere in the rules = shares a challenge with you, or added as a friend — and no block between you.
create or replace function public.shares_challenge(p_other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (public.co_member(p_other) or public.is_friend(p_other)) and not public.blocked(p_other);
$$;

-- names on a leaderboard stay readable for everyone in the challenge, block or not
create policy "profiles: people in your challenges" on public.profiles
  for select to authenticated using (public.co_member(id));

-- ---------------------------------------------------------------- what you no longer see
-- (these narrow the rules that exist: a row has to pass them as well)
create policy "check_ins: not across a block" on public.check_ins
  as restrictive for select to authenticated using (user_id = auth.uid() or not public.blocked(user_id));
create policy "comments: not across a block" on public.comments
  as restrictive for select to authenticated using (user_id = auth.uid() or not public.blocked(user_id));
create policy "reactions: not across a block" on public.reactions
  as restrictive for select to authenticated using (user_id = auth.uid() or not public.blocked(user_id));
create policy "messages: not across a block" on public.messages
  as restrictive for select to authenticated using (user_id = auth.uid() or not public.blocked(user_id));
create policy "day_comments: not across a block" on public.day_comments
  as restrictive for select to authenticated using (user_id = auth.uid() or not public.blocked(user_id));
create policy "day_reactions: not across a block" on public.day_reactions
  as restrictive for select to authenticated using (user_id = auth.uid() or not public.blocked(user_id));

-- So that the leaderboard stays right: the days and amounts of check-ins you can't see, and nothing else
-- (no title, no text, no photo).
create or replace function public.hidden_checkins(p_challenge uuid)
returns table (id uuid, user_id uuid, checkin_date date, amount numeric, has_photo boolean, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select ci.id, ci.user_id, ci.checkin_date, ci.amount, ci.photo_path is not null, ci.created_at
  from public.check_ins ci
  where ci.challenge_id = p_challenge
    and public.is_member(p_challenge)
    and ci.user_id <> auth.uid()
    and public.blocked(ci.user_id);
$$;

-- ---------------------------------------------------------------- what can no longer be started
-- no new friendship across a block
create or replace function public.check_block_friend()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.blocked_pair(new.user_a, new.user_b) then
    raise exception 'This friend link is not valid any more';
  end if;
  return new;
end $$;
create trigger friendships_block before insert on public.friendships
  for each row execute function public.check_block_friend();

-- nobody joins (or asks to join) a challenge made by someone they have a block with
create or replace function public.check_block_join()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_creator uuid;
begin
  select c.creator_id into v_creator from public.challenges c where c.id = new.challenge_id;
  if v_creator is not null and v_creator <> new.user_id and public.blocked_pair(new.user_id, v_creator) then
    raise exception 'This invite link is not valid any more';
  end if;
  return new;
end $$;
create trigger members_block before insert on public.challenge_members
  for each row execute function public.check_block_join();
create trigger requests_block before insert on public.join_requests
  for each row execute function public.check_block_join();

-- ---------------------------------------------------------------- reports
-- A report is written by the person reporting and read only by whoever runs Frejas.
create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid references public.profiles (id) on delete set null,
  kind         text not null check (kind in ('check_in', 'comment', 'day_comment', 'day_card', 'message', 'person', 'challenge')),
  target_id    uuid,                                                    -- the thing reported (not for a person or a day card)
  target_user  uuid references public.profiles (id) on delete set null, -- who posted it
  day          date,                                                    -- for a day card
  challenge_id uuid,
  reason       text not null check (reason in ('spam', 'harassment', 'hate', 'sexual', 'self_harm', 'other')),
  details      text check (char_length(details) <= 500),
  snapshot     text,                                                    -- what it said when it was reported
  status       text not null default 'open' check (status in ('open', 'handled')),
  notified_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists reports_open on public.reports (created_at desc) where status = 'open';
create index if not exists reports_reporter on public.reports (reporter_id, created_at);
alter table public.reports enable row level security;
create policy "reports: report as yourself" on public.reports
  for insert to authenticated with check (reporter_id = auth.uid());
grant insert on public.reports to authenticated;
grant all on public.reports to service_role;

-- Fills in who posted it and what it said, straight from the database, so a report can't be made up
-- and still says what it was about if the post is changed or taken away afterwards.
create or replace function public.fill_report()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if auth.uid() is not null then
    new.reporter_id := auth.uid();
    select count(*) into v_n from public.reports r where r.reporter_id = auth.uid() and r.created_at > now() - interval '1 day';
    if v_n >= 30 then raise exception 'That is a lot of reports for one day. Write to hello@frejas.app instead.'; end if;
  end if;
  new.status := 'open';
  new.created_at := now();
  new.notified_at := null;
  new.snapshot := null;
  new.challenge_id := null;

  if new.kind = 'check_in' then
    select ci.user_id, ci.challenge_id, concat_ws(' · ', ci.title, ci.comment, case when ci.photo_path is not null then 'photo: ' || ci.photo_path end)
      into new.target_user, new.challenge_id, new.snapshot
      from public.check_ins ci where ci.id = new.target_id;
  elsif new.kind = 'comment' then
    select cm.user_id, ci.challenge_id, cm.body into new.target_user, new.challenge_id, new.snapshot
      from public.comments cm join public.check_ins ci on ci.id = cm.check_in_id where cm.id = new.target_id;
  elsif new.kind = 'day_comment' then
    select dc.user_id, dc.body into new.target_user, new.snapshot
      from public.day_comments dc where dc.id = new.target_id;
  elsif new.kind = 'message' then
    select m.user_id, m.challenge_id, m.body into new.target_user, new.challenge_id, new.snapshot
      from public.messages m where m.id = new.target_id;
  elsif new.kind = 'challenge' then
    select c.creator_id, c.id, concat_ws(' · ', c.name, c.stake) into new.target_user, new.challenge_id, new.snapshot
      from public.challenges c where c.id = new.target_id;
  elsif new.kind = 'day_card' then
    if new.day is null then raise exception 'Which day?'; end if;
    select string_agg(h.name, ', ') into new.snapshot
      from public.habits h join public.habit_logs l on l.habit_id = h.id
      where h.owner_id = new.target_user and l.log_date = new.day
        and (h.visibility = 'friends' or exists (select 1 from public.habit_viewers v where v.habit_id = h.id));
  else
    select p.display_name into new.snapshot from public.profiles p where p.id = new.target_user;
  end if;

  if new.target_user is null then raise exception 'That is no longer there.'; end if;
  if new.target_user = auth.uid() then raise exception 'That is your own.'; end if;
  return new;
end $$;
create trigger reports_fill before insert on public.reports
  for each row execute function public.fill_report();

-- ---------------------------------------------------------------- who may call what
revoke execute on function public.blocked_pair(uuid, uuid), public.blocked(uuid), public.blocked_ids(), public.my_blocks(),
  public.co_member(uuid), public.hidden_checkins(uuid), public.check_block_friend(), public.check_block_join(), public.fill_report()
  from public, anon;
revoke execute on function public.blocked_pair(uuid, uuid), public.check_block_friend(), public.check_block_join(), public.fill_report()
  from authenticated;
grant execute on function public.blocked(uuid), public.blocked_ids(), public.my_blocks(), public.co_member(uuid), public.hidden_checkins(uuid)
  to authenticated;
