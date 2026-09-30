-- 005 · habits made for a challenge, and merging two habits into one

-- Which challenge a habit was created for (so we can ask "keep it?" when the challenge ends).
alter table public.habits add column if not exists from_challenge uuid references public.challenges (id) on delete set null;

update public.habits h set from_challenge = m.challenge_id
from public.challenge_members m join public.challenges c on c.id = m.challenge_id
where m.habit_id = h.id and m.user_id = h.owner_id and lower(h.name) = lower(c.name) and h.from_challenge is null;

-- Move everything from one of your habits into another, then delete the first.
-- Runs as the caller, so row security still applies: you can only merge your own habits.
create or replace function public.merge_habits(p_from uuid, p_into uuid)
returns void language plpgsql set search_path = '' as $$
declare
  a public.habits;
  b public.habits;
  l record;
  target uuid;
begin
  if p_from = p_into then raise exception 'Pick two different habits'; end if;
  select * into a from public.habits where id = p_from and owner_id = auth.uid();
  select * into b from public.habits where id = p_into and owner_id = auth.uid();
  if a.id is null or b.id is null then raise exception 'Habit not found'; end if;

  for l in select id, log_date from public.habit_logs where habit_id = p_from loop
    select id into target from public.habit_logs where habit_id = p_into and log_date = l.log_date;
    if target is null then
      insert into public.habit_logs (habit_id, user_id, log_date) values (p_into, auth.uid(), l.log_date) returning id into target;
    end if;
    update public.check_ins set habit_log_id = target where habit_log_id = l.id;
    target := null;
  end loop;

  update public.challenge_members set habit_id = p_into where habit_id = p_from and user_id = auth.uid();

  update public.habits set
    created_at = least(a.created_at, b.created_at),
    category = coalesce(b.category, a.category),
    from_challenge = case when b.from_challenge is not null and a.from_challenge is null then null else b.from_challenge end
  where id = p_into;

  delete from public.habits where id = p_from;
end $$;

revoke execute on function public.merge_habits(uuid, uuid) from public, anon;
grant execute on function public.merge_habits(uuid, uuid) to authenticated;
