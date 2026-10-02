-- 013 · a challenge can be open for all the creator's friends to find, and can have a limit on how many join.
-- (Only adds things.)
--   visibility 'invite'  = only people who are invited or have the link see it (as before)
--   visibility 'friends' = the creator's friends also see it under Challenges and can ask to join
--   max_members          = how many people it has room for; null = no limit
alter table public.challenges add column if not exists visibility text not null default 'invite';
alter table public.challenges add column if not exists max_members integer;
alter table public.challenges add constraint challenges_visibility_check check (visibility in ('invite', 'friends'));
alter table public.challenges add constraint challenges_max_members_check check (max_members is null or max_members between 2 and 500);
-- a challenge friends can find always asks the creator first: nobody walks straight in
alter table public.challenges add constraint challenges_friends_need_approval check (visibility <> 'friends' or join_mode = 'approve');

-- friends of the creator can read such a challenge (its name, goal and dates; not its members or check-ins)
create policy "challenges: friends can find" on public.challenges
  for select to authenticated
  using (visibility = 'friends' and status = 'active' and not solo and ends_on >= current_date and public.shares_challenge(creator_id));

-- Room for more? Counted where the row is written, so every way of joining is covered.
-- People who are in and people waiting for an answer both take up a place, so the creator
-- never gets more requests than there is room for.
create or replace function public.check_max_members()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_max integer;
  v_taken integer;
begin
  select c.max_members into v_max from public.challenges c where c.id = new.challenge_id;
  if v_max is null then return new; end if;
  select (select count(*) from public.challenge_members m where m.challenge_id = new.challenge_id and m.user_id <> new.user_id)
       + (select count(*) from public.join_requests r where r.challenge_id = new.challenge_id and r.user_id <> new.user_id)
    into v_taken;
  if v_taken >= v_max then
    raise exception 'This challenge is full (% people)', v_max;
  end if;
  return new;
end $$;

create trigger members_max before insert on public.challenge_members
  for each row execute function public.check_max_members();
create trigger requests_max before insert on public.join_requests
  for each row execute function public.check_max_members();

-- the preview now also says how many places there are and how many are taken
create or replace function public.invite_preview(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'challenge_id', c.id, 'name', c.name, 'goal_type', c.goal_type, 'unit', c.unit,
    'starts_on', c.starts_on, 'ends_on', c.ends_on, 'stake', c.stake,
    'frequency', c.frequency, 'days', c.days, 'times_per_week', c.times_per_week, 'min_amount', c.min_amount,
    'same_goal', c.same_goal, 'win_rule', c.win_rule, 'join_mode', c.join_mode, 'cover_preset', c.cover_preset,
    'join_by', c.join_by, 'visibility', c.visibility, 'max_members', c.max_members,
    'member_count', (select count(*) from public.challenge_members m where m.challenge_id = c.id),
    'taken', (select count(*) from public.challenge_members m where m.challenge_id = c.id)
           + (select count(*) from public.join_requests r where r.challenge_id = c.id),
    'member_names', coalesce((select jsonb_agg(x.display_name) from (
        select p.display_name from public.challenge_members m join public.profiles p on p.id = m.user_id
        where m.challenge_id = c.id order by m.joined_at limit 5) x), '[]'::jsonb))
  from public.challenges c
  where c.invite_token = p_token and not c.invite_revoked and c.status = 'active' and not c.solo and c.ends_on >= current_date;
$$;
