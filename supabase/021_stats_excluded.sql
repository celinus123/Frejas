-- 021 · accounts that are left out of the numbers. (Only adds things.)
--
-- Whoever runs Frejas tests with accounts of their own. Those are listed here and left out of every number on the
-- Insights page, just like the accounts in `admins`. Being on the list changes nothing else for the account.
create table if not exists public.stats_excluded (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);
alter table public.stats_excluded enable row level security;   -- no rules: only the server reads and writes it
grant all on public.stats_excluded to service_role;

-- The numbers for the Insights page, as in 020, now also leaving out the accounts above. Invitations are counted
-- by who received them, and a friendship counts when at least one of the two is counted.
create or replace function public.admin_stats()
returns json language plpgsql stable security definer set search_path = '' as $$
declare j json;
begin
  if auth.uid() is null or not exists (select 1 from public.admins a where a.user_id = auth.uid()) then return null; end if;

  with ppl as (
    select p.id, p.created_at, p.created_at::date as d0,
           coalesce(u.is_anonymous, false) as guest,
           exists (select 1 from public.user_plans up where up.user_id = p.id) as plus
    from public.profiles p
    join auth.users u on u.id = p.id
    where not exists (select 1 from public.admins a where a.user_id = p.id)
      and not exists (select 1 from public.stats_excluded x where x.user_id = p.id)
      and p.display_name <> ''
  ),
  days as (select ud.user_id, ud.day from public.user_days ud join ppl on ppl.id = ud.user_id),
  per as (
    select ppl.id,
      (select count(*) from public.habits h where h.owner_id = ppl.id and h.archived_at is null and h.from_challenge is null) as habits,
      (select count(*) from public.challenges c where c.creator_id = ppl.id and c.ends_on >= current_date) as own,
      (select count(*) from public.challenge_members m join public.challenges c on c.id = m.challenge_id
        where m.user_id = ppl.id and c.creator_id <> ppl.id and c.ends_on >= current_date) as joined,
      (select count(*) from public.friendships f where f.user_a = ppl.id or f.user_b = ppl.id) as friends
    from ppl
  ),
  cohorts as (
    select date_trunc('week', ppl.d0)::date as wk, count(*) as size,
      count(*) filter (where ppl.d0 + 7 < current_date and exists (select 1 from days d where d.user_id = ppl.id and d.day between ppl.d0 + 1 and ppl.d0 + 7)) as w1,
      count(*) filter (where ppl.d0 + 14 < current_date and exists (select 1 from days d where d.user_id = ppl.id and d.day between ppl.d0 + 8 and ppl.d0 + 14)) as w2,
      count(*) filter (where ppl.d0 + 21 < current_date and exists (select 1 from days d where d.user_id = ppl.id and d.day between ppl.d0 + 15 and ppl.d0 + 21)) as w3,
      count(*) filter (where ppl.d0 + 28 < current_date and exists (select 1 from days d where d.user_id = ppl.id and d.day between ppl.d0 + 22 and ppl.d0 + 28)) as w4,
      -- n1..n4: how many in the group have that whole week behind them. Only they are counted in w1..w4, so that an
      -- unfinished week isn't read as "didn't come back" and a share can never pass 100%.
      count(*) filter (where ppl.d0 + 7 < current_date) as n1, count(*) filter (where ppl.d0 + 14 < current_date) as n2,
      count(*) filter (where ppl.d0 + 21 < current_date) as n3, count(*) filter (where ppl.d0 + 28 < current_date) as n4
    from ppl where ppl.d0 >= current_date - 56
    group by 1
  )
  select json_build_object(
    'as_of', now(),
    'people', json_build_object(
      'total', (select count(*) from ppl),
      'guests', (select count(*) from ppl where guest),
      'accounts', (select count(*) from ppl where not guest),
      'plus', (select count(*) from ppl where plus),
      'unnamed', (select count(*) from public.profiles p where p.display_name = '' and not exists (select 1 from public.admins a where a.user_id = p.id)
                    and not exists (select 1 from public.stats_excluded x where x.user_id = p.id)),
      'new_7d', (select count(*) from ppl where d0 > current_date - 7),
      'new_prev_7d', (select count(*) from ppl where d0 > current_date - 14 and d0 <= current_date - 7)),
    'active', json_build_object(
      'today', (select count(distinct user_id) from days where day = current_date),
      'd7', (select count(distinct user_id) from days where day > current_date - 7),
      'prev_d7', (select count(distinct user_id) from days where day > current_date - 14 and day <= current_date - 7),
      'd30', (select count(distinct user_id) from days where day > current_date - 30)),
    'daily', (select coalesce(json_agg(json_build_object('day', g.day::date,
                'active', (select count(*) from days d where d.day = g.day::date),
                'new', (select count(*) from ppl where ppl.d0 = g.day::date)) order by g.day), '[]'::json)
              from generate_series(current_date - 27, current_date, interval '1 day') as g(day)),
    'came_back', json_build_object(
      'of', (select count(*) from ppl where d0 < current_date - 1),
      'n', (select count(*) from ppl where d0 < current_date - 1 and exists (select 1 from days d where d.user_id = ppl.id and d.day > ppl.d0))),
    'cohorts', (select coalesce(json_agg(json_build_object('week', wk, 'size', size, 'w1', w1, 'w2', w2, 'w3', w3, 'w4', w4, 'n1', n1, 'n2', n2, 'n3', n3, 'n4', n4) order by wk desc), '[]'::json) from cohorts),
    'habits', json_build_object(
      'dist', (select coalesce(json_agg(json_build_object('n', b.n, 'people', (select count(*) from per where least(per.habits, 7) = b.n)) order by b.n), '[]'::json) from generate_series(0, 7) as b(n)),
      'avg', (select round(avg(habits)::numeric, 1) from per),
      'median', (select percentile_cont(0.5) within group (order by habits) from per),
      'ticks_7d', (select count(*) from public.habit_logs l join ppl on ppl.id = l.user_id where l.log_date > current_date - 7),
      'tickers_7d', (select count(distinct l.user_id) from public.habit_logs l join ppl on ppl.id = l.user_id where l.log_date > current_date - 7)),
    'challenges', json_build_object(
      'own_dist', (select coalesce(json_agg(json_build_object('n', b.n, 'people', (select count(*) from per where least(per.own, 3) = b.n)) order by b.n), '[]'::json) from generate_series(0, 3) as b(n)),
      'joined_dist', (select coalesce(json_agg(json_build_object('n', b.n, 'people', (select count(*) from per where least(per.joined, 3) = b.n)) order by b.n), '[]'::json) from generate_series(0, 3) as b(n)),
      'in_any', (select count(*) from per where own + joined > 0),
      'ongoing_solo', (select count(*) from public.challenges c join ppl on ppl.id = c.creator_id where c.ends_on >= current_date and c.solo),
      'ongoing_friends', (select count(*) from public.challenges c join ppl on ppl.id = c.creator_id where c.ends_on >= current_date and not c.solo),
      'checkins_7d', (select count(*) from public.check_ins ci join ppl on ppl.id = ci.user_id where ci.created_at > now() - interval '7 days'),
      'checkers_7d', (select count(distinct ci.user_id) from public.check_ins ci join ppl on ppl.id = ci.user_id where ci.created_at > now() - interval '7 days')),
    'friends', json_build_object(
      'with_any', (select count(*) from per where friends > 0),
      'friendships', (select count(*) from public.friendships f where f.user_a in (select id from ppl) or f.user_b in (select id from ppl)),
      'invites_sent', (select count(*) from public.push_log pl where pl.kind = 'invite' and pl.to_user in (select id from ppl)),
      'challenges_inviting', (select count(distinct split_part(pl.key, ':', 2)) from public.push_log pl where pl.kind = 'invite' and pl.to_user in (select id from ppl)),
      'comments_7d', (select (select count(*) from public.comments c join ppl on ppl.id = c.user_id where c.created_at > now() - interval '7 days')
                           + (select count(*) from public.day_comments c join ppl on ppl.id = c.user_id where c.created_at > now() - interval '7 days'))),
    'origin', json_build_object(
      'direct', (select count(*) from public.user_origin o join ppl on ppl.id = o.user_id where o.source = 'direct'),
      'challenge', (select count(*) from public.user_origin o join ppl on ppl.id = o.user_id where o.source = 'challenge'),
      'friend', (select count(*) from public.user_origin o join ppl on ppl.id = o.user_id where o.source = 'friend'),
      'unknown', (select count(*) from ppl where not exists (select 1 from public.user_origin o where o.user_id = ppl.id)),
      'recruiters', (select count(distinct o.ref_user) from public.user_origin o join ppl on ppl.id = o.user_id where o.ref_user is not null)),
    'guests', json_build_object(
      'started', (select count(*) from public.user_origin o join ppl on ppl.id = o.user_id where o.as_guest),
      'saved', (select count(*) from public.user_origin o join ppl on ppl.id = o.user_id where o.as_guest and not ppl.guest)),
    'notifications', json_build_object(
      'phones', (select count(distinct t.user_id) from public.push_tokens t join ppl on ppl.id = t.user_id)),
    'usage', json_build_object(
      'yes', (select count(*) from public.user_prefs up join ppl on ppl.id = up.user_id where up.share_usage),
      'no', (select count(*) from public.user_prefs up join ppl on ppl.id = up.user_id where up.share_usage = false)),
    'inbox', json_build_object(
      'feedback_open', (select count(*) from public.feedback f where f.handled_at is null),
      'left_out', (select count(*) from public.stats_excluded),
      'questions_open', (select count(*) from public.questions q where q.closed_at is null))
  ) into j;
  return j;
end $$;
