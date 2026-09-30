-- 006 · remember which of your habits a join request should count on, so approval doesn't create a duplicate
alter table public.join_requests add column if not exists habit_id uuid references public.habits (id) on delete set null;

create or replace function public.join_challenge(p_token text, p_habit_id uuid default null, p_goal numeric default null, p_times smallint default null)
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
    insert into public.join_requests (challenge_id, user_id, goal_amount, times_per_week, habit_id)
    values (v.id, auth.uid(), p_goal, p_times, p_habit_id)
    on conflict (challenge_id, user_id) do update
      set goal_amount = excluded.goal_amount, times_per_week = excluded.times_per_week, habit_id = excluded.habit_id;
    return 'requested';
  end if;

  insert into public.challenge_members (challenge_id, user_id, habit_id, goal_amount, times_per_week)
  values (v.id, auth.uid(), p_habit_id, p_goal, p_times);
  delete from public.challenge_invites where challenge_id = v.id and user_id = auth.uid();
  return 'joined';
end;
$$;

create or replace function public.approve_request(p_challenge uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.join_requests;
begin
  if not public.is_creator(p_challenge) then raise exception 'Only the creator can do this'; end if;
  select * into r from public.join_requests where challenge_id = p_challenge and user_id = p_user;
  if not found then raise exception 'No such request'; end if;
  insert into public.challenge_members (challenge_id, user_id, habit_id, goal_amount, times_per_week)
  values (p_challenge, p_user,
          (select id from public.habits where id = r.habit_id and owner_id = p_user),
          r.goal_amount, r.times_per_week)
  on conflict do nothing;
  delete from public.join_requests where challenge_id = p_challenge and user_id = p_user;
end;
$$;
