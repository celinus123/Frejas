-- 011 · a challenge can have a last day to join. (Only adds things.)
-- null = people can join for as long as the challenge runs.
alter table public.challenges add column if not exists join_by date;

-- Nobody new gets in once the last day has passed, whichever way they try (link, invitation, request).
-- It is checked where the row is written, so every way of joining is covered. The creator is exempt,
-- so a request that was sent in time can still be approved afterwards.
-- (One day of slack, because the database's "today" is not the same hour everywhere; the app shows the exact day.)
create or replace function public.check_join_by()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_by date;
  v_creator uuid;
begin
  select c.join_by, c.creator_id into v_by, v_creator from public.challenges c where c.id = new.challenge_id;
  if v_by is not null and v_by < current_date - 1 and auth.uid() is not null and auth.uid() is distinct from v_creator then
    raise exception 'Joining closed on %', to_char(v_by, 'FMDD Mon');
  end if;
  return new;
end $$;

create trigger members_join_by before insert on public.challenge_members
  for each row execute function public.check_join_by();
create trigger requests_join_by before insert on public.join_requests
  for each row execute function public.check_join_by();

-- What someone with an invite link may see before joining. Returned as one object so that
-- more details can be added later without replacing the function's shape.
create or replace function public.invite_preview(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'challenge_id', c.id, 'name', c.name, 'goal_type', c.goal_type, 'unit', c.unit,
    'starts_on', c.starts_on, 'ends_on', c.ends_on, 'stake', c.stake,
    'frequency', c.frequency, 'days', c.days, 'times_per_week', c.times_per_week, 'min_amount', c.min_amount,
    'same_goal', c.same_goal, 'win_rule', c.win_rule, 'join_mode', c.join_mode, 'cover_preset', c.cover_preset,
    'join_by', c.join_by,
    'member_count', (select count(*) from public.challenge_members m where m.challenge_id = c.id),
    'member_names', coalesce((select jsonb_agg(x.display_name) from (
        select p.display_name from public.challenge_members m join public.profiles p on p.id = m.user_id
        where m.challenge_id = c.id order by m.joined_at limit 5) x), '[]'::jsonb))
  from public.challenges c
  where c.invite_token = p_token and not c.invite_revoked and c.status = 'active' and not c.solo and c.ends_on >= current_date;
$$;
grant execute on function public.invite_preview(text) to anon, authenticated;
