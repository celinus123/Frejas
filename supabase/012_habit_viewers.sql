-- 012 · a habit can be shown to chosen friends only. (Only adds things.)
-- How it fits with what was there: a habit set to "friends" is seen by all your friends, as before.
-- A habit shown to chosen friends stays "private" in the old sense, and the people listed here get to see it.
create table if not exists public.habit_viewers (
  habit_id   uuid not null references public.habits (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (habit_id, user_id)
);
create index if not exists habit_viewers_user on public.habit_viewers (user_id);
alter table public.habit_viewers enable row level security;

-- Small helpers that answer one question each. They run with the database's own rights so that the
-- rules on habits and on this table don't have to look at each other in a circle.
create or replace function public.owns_habit(p_habit uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.habits h where h.id = p_habit and h.owner_id = auth.uid());
$$;
-- chosen for this habit AND still a friend of its owner (so ending a friendship ends the access too)
create or replace function public.is_habit_viewer(p_habit uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.habit_viewers v join public.habits h on h.id = v.habit_id
    where v.habit_id = p_habit and v.user_id = auth.uid() and public.shares_challenge(h.owner_id));
$$;
revoke execute on function public.owns_habit(uuid), public.is_habit_viewer(uuid) from public, anon;
grant execute on function public.owns_habit(uuid), public.is_habit_viewer(uuid) to authenticated;

-- the list: the habit's owner sees and manages it; you can see (and leave) the lists you are on
create policy "habit_viewers: owner and the chosen read" on public.habit_viewers
  for select to authenticated using (user_id = auth.uid() or public.owns_habit(habit_id));
create policy "habit_viewers: owner adds friends" on public.habit_viewers
  for insert to authenticated
  with check (public.owns_habit(habit_id) and user_id <> auth.uid() and public.shares_challenge(user_id));
create policy "habit_viewers: owner removes, or you leave" on public.habit_viewers
  for delete to authenticated using (user_id = auth.uid() or public.owns_habit(habit_id));
grant select, insert, delete on public.habit_viewers to authenticated;
grant all on public.habit_viewers to service_role;

-- chosen friends can read the habit and its ticks (added beside the existing rules; either is enough)
create policy "habits: read when chosen" on public.habits
  for select to authenticated using (public.is_habit_viewer(id));
create policy "habit_logs: read when chosen" on public.habit_logs
  for select to authenticated using (public.is_habit_viewer(habit_id));
