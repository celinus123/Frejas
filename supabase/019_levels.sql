-- 019 · levels and what each has room for. (Only adds things; rules that exist stay in place.)
--
-- Three levels:
--   guest · using Frejas without an account (no email yet)
--   free  · an account
--   plus  · the paid level (a row in user_plans; nobody can give it to themselves)
-- What a level has room for is a row in plan_limits, so a number is changed by changing that row.
-- Counted at a time:
--   habits            · your own habits that are not archived. Habits that came with a challenge don't count.
--   own_challenges    · challenges you started that haven't ended (solo ones and drafts included)
--   joined_challenges · challenges someone else started that you are in, or have asked to join, and that haven't ended
-- Nothing anyone already has is taken away: the limits only stop adding more.

-- ---------------------------------------------------------------- the numbers
create table if not exists public.plan_limits (
  level             text primary key check (level in ('guest', 'free', 'plus')),
  habits            integer check (habits >= 0),             -- empty = no limit
  own_challenges    integer check (own_challenges >= 0),
  joined_challenges integer check (joined_challenges >= 0)
);
insert into public.plan_limits (level, habits, own_challenges, joined_challenges) values
  ('guest', 5, 1, 2),
  ('free',  5, 1, 2),
  ('plus',  null, null, null)
on conflict (level) do nothing;
alter table public.plan_limits enable row level security;
create policy "plan_limits: readable when signed in" on public.plan_limits
  for select to authenticated using (true);
grant select on public.plan_limits to authenticated;
grant all on public.plan_limits to service_role;

-- ---------------------------------------------------------------- who has the paid level
-- Written only from the server (a purchase, or by whoever runs Frejas). You can see your own row, nothing more.
create table if not exists public.user_plans (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  plan       text not null default 'plus' check (plan in ('plus')),
  note       text,
  created_at timestamptz not null default now()
);
alter table public.user_plans enable row level security;
create policy "user_plans: see your own" on public.user_plans
  for select to authenticated using (user_id = auth.uid());
grant select on public.user_plans to authenticated;
grant all on public.user_plans to service_role;

-- ---------------------------------------------------------------- level and counts (used inside the rules below)
create or replace function public.level_of(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.user_plans up where up.user_id = p_user) then 'plus'
    when coalesce((select u.is_anonymous from auth.users u where u.id = p_user), false) then 'guest'
    else 'free' end;
$$;

create or replace function public.count_habits(p_user uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.habits h
  where h.owner_id = p_user and h.archived_at is null and h.from_challenge is null;
$$;

create or replace function public.count_own_challenges(p_user uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.challenges c
  where c.creator_id = p_user and c.ends_on >= current_date;
$$;

-- p_except: a challenge to leave out (the one being joined right now)
create or replace function public.count_joined(p_user uuid, p_except uuid default null)
returns integer language sql stable security definer set search_path = '' as $$
  select (
    (select count(*) from public.challenge_members m join public.challenges c on c.id = m.challenge_id
      where m.user_id = p_user and c.creator_id <> p_user and c.ends_on >= current_date
        and (p_except is null or c.id <> p_except))
    +
    (select count(*) from public.join_requests r join public.challenges c on c.id = r.challenge_id
      where r.user_id = p_user and c.ends_on >= current_date
        and (p_except is null or c.id <> p_except)
        and not exists (select 1 from public.challenge_members m where m.challenge_id = r.challenge_id and m.user_id = p_user))
  )::integer;
$$;

-- what the app asks: your level, how much you have, and how much there is room for (max empty = no limit)
create or replace function public.my_limits()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'level', l.level,
    'habits', json_build_object('used', public.count_habits(auth.uid()), 'max', l.habits),
    'own',    json_build_object('used', public.count_own_challenges(auth.uid()), 'max', l.own_challenges),
    'joined', json_build_object('used', public.count_joined(auth.uid()), 'max', l.joined_challenges))
  from public.plan_limits l
  where auth.uid() is not null and l.level = public.level_of(auth.uid());
$$;

-- ---------------------------------------------------------------- the rules
-- a new habit, one brought back from the archive, or one kept after its challenge ended
create or replace function public.check_habit_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_max integer;
begin
  if new.archived_at is not null or new.from_challenge is not null then return new; end if;
  if tg_op = 'UPDATE' and old.archived_at is null and old.from_challenge is null then return new; end if;   -- already counted
  select l.habits into v_max from public.plan_limits l where l.level = public.level_of(new.owner_id);
  if v_max is not null and public.count_habits(new.owner_id) >= v_max then
    raise exception 'The free level has room for % habits. Archive one to make room for this one.', v_max;
  end if;
  return new;
end $$;
create trigger habits_plan_limit before insert or update of archived_at, from_challenge on public.habits
  for each row execute function public.check_habit_limit();

-- a new challenge of your own
create or replace function public.check_own_challenge_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_max integer;
begin
  select l.own_challenges into v_max from public.plan_limits l where l.level = public.level_of(new.creator_id);
  if v_max is not null and public.count_own_challenges(new.creator_id) >= v_max then
    raise exception 'The free level has room for % of your own challenges at a time. Finish or delete the one you have to start another.', v_max;
  end if;
  return new;
end $$;
create trigger challenges_plan_limit before insert on public.challenges
  for each row execute function public.check_own_challenge_limit();

-- joining, or asking to join, a challenge someone else started
create or replace function public.check_joined_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_creator uuid; v_max integer;
begin
  select c.creator_id into v_creator from public.challenges c where c.id = new.challenge_id;
  if v_creator is null or v_creator = new.user_id then return new; end if;
  -- already in it (a repeated join does nothing): no new place is taken
  if exists (select 1 from public.challenge_members m where m.challenge_id = new.challenge_id and m.user_id = new.user_id) then return new; end if;
  select l.joined_challenges into v_max from public.plan_limits l where l.level = public.level_of(new.user_id);
  if v_max is not null and public.count_joined(new.user_id, new.challenge_id) >= v_max then
    if new.user_id = auth.uid() then
      raise exception 'The free level has room for % challenges that others started. Leave one, or wait for one to end, to join this one.', v_max;
    end if;
    raise exception 'They are already in as many challenges as the free level has room for.';
  end if;
  return new;
end $$;
create trigger members_plan_limit before insert on public.challenge_members
  for each row execute function public.check_joined_limit();
create trigger requests_plan_limit before insert on public.join_requests
  for each row execute function public.check_joined_limit();

-- ---------------------------------------------------------------- who may call what
revoke execute on function public.level_of(uuid), public.count_habits(uuid), public.count_own_challenges(uuid), public.count_joined(uuid, uuid),
  public.my_limits(), public.check_habit_limit(), public.check_own_challenge_limit(), public.check_joined_limit()
  from public, anon, authenticated;
grant execute on function public.my_limits() to authenticated;
