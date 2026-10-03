-- 020 · knowing how Frejas is used, feedback, and questions to everyone. (Only adds things.)
--
--   user_days        · which days someone opened the app (the day, never the time of day)
--   user_origin      · how someone arrived: on their own, through a challenge link, or through a friend link
--   user_prefs       · whether someone has said yes or no to sharing how they use the app (for the analytics tool)
--   feedback         · what people write under "Give feedback"
--   questions        · a question whoever runs Frejas asks everyone, and the answers
--   admin_stats()    · the numbers for the private Insights page. Answers only whoever is in `admins`.
-- Nobody can read anyone else's rows in any of these; most can't be read by the people using the app at all.

-- ---------------------------------------------------------------- days the app was opened
create table if not exists public.user_days (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  day      date not null default current_date,
  opens    integer not null default 1,
  platform text,
  primary key (user_id, day)
);
create index if not exists user_days_day on public.user_days (day);
alter table public.user_days enable row level security;   -- no rules: written through seen(), read by the server
grant all on public.user_days to service_role;

create or replace function public.seen(p_platform text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.profiles p where p.id = auth.uid()) then return; end if;
  insert into public.user_days (user_id, day, opens, platform)
  values (auth.uid(), current_date, 1, left(p_platform, 12))
  on conflict (user_id, day) do update
    set opens = least(public.user_days.opens + 1, 500), platform = coalesce(excluded.platform, public.user_days.platform);
end $$;

-- what is already known: the days someone did something, and the day they started
insert into public.user_days (user_id, day)
select distinct x.user_id, x.d from (
  select id as user_id, created_at::date as d from public.profiles
  union all select user_id, created_at::date from public.habit_logs
  union all select user_id, created_at::date from public.check_ins
  union all select user_id, created_at::date from public.comments
  union all select user_id, created_at::date from public.day_comments
  union all select user_id, created_at::date from public.messages
) x
where exists (select 1 from public.profiles p where p.id = x.user_id)
on conflict (user_id, day) do nothing;

-- ---------------------------------------------------------------- how someone arrived
create table if not exists public.user_origin (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  source     text not null check (source in ('direct', 'challenge', 'friend')),
  ref_user   uuid references public.profiles (id) on delete set null,   -- whose link it was
  as_guest   boolean not null default false,                            -- started without an account
  platform   text,
  created_at timestamptz not null default now()
);
alter table public.user_origin enable row level security;   -- no rules: written through note_origin(), read by the server
grant all on public.user_origin to service_role;

-- Said once, right after the name is chosen. p_ref is the challenge's invite token or the friend's code.
create or replace function public.note_origin(p_source text, p_ref text default null, p_platform text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ref uuid; v_source text := 'direct';
begin
  if auth.uid() is null then return; end if;
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.created_at > now() - interval '2 days') then return; end if;
  if p_source = 'challenge' and p_ref is not null then
    select c.creator_id into v_ref from public.challenges c where c.invite_token = p_ref;
    if v_ref is not null then v_source := 'challenge'; end if;
  elsif p_source = 'friend' and p_ref is not null then
    select p.id into v_ref from public.profiles p where p.friend_code = p_ref;
    if v_ref is not null then v_source := 'friend'; end if;
  end if;
  if v_ref = auth.uid() then v_ref := null; v_source := 'direct'; end if;
  insert into public.user_origin (user_id, source, ref_user, as_guest, platform)
  values (auth.uid(), v_source, v_ref, coalesce((select u.is_anonymous from auth.users u where u.id = auth.uid()), false), left(p_platform, 12))
  on conflict (user_id) do nothing;
end $$;

-- ---------------------------------------------------------------- sharing how you use the app: yes or no
create table if not exists public.user_prefs (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  share_usage boolean,                       -- empty = not asked yet
  asked_at    timestamptz not null default now()
);
alter table public.user_prefs enable row level security;
create policy "user_prefs: see your own" on public.user_prefs for select to authenticated using (user_id = auth.uid());
create policy "user_prefs: set your own" on public.user_prefs for insert to authenticated with check (user_id = auth.uid());
create policy "user_prefs: change your own" on public.user_prefs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on public.user_prefs to authenticated;
grant all on public.user_prefs to service_role;

-- ---------------------------------------------------------------- feedback
create table if not exists public.feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles (id) on delete set null,
  body       text not null check (char_length(body) between 1 and 1000),
  page       text check (char_length(page) <= 120),
  build      text check (char_length(build) <= 40),
  platform   text check (char_length(platform) <= 12),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);
create index if not exists feedback_open on public.feedback (created_at desc) where handled_at is null;
alter table public.feedback enable row level security;
create policy "feedback: write as yourself" on public.feedback for insert to authenticated with check (user_id = auth.uid());
grant insert on public.feedback to authenticated;
grant all on public.feedback to service_role;

create or replace function public.fill_feedback()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
    if (select count(*) from public.feedback f where f.user_id = auth.uid() and f.created_at > now() - interval '1 day') >= 20 then
      raise exception 'That is a lot of feedback for one day. Write to hello@frejas.app instead.';
    end if;
  end if;
  new.created_at := now();
  new.handled_at := null;
  return new;
end $$;
create trigger feedback_fill before insert on public.feedback
  for each row execute function public.fill_feedback();

-- ---------------------------------------------------------------- questions to everyone
create table if not exists public.questions (
  id         uuid primary key default gen_random_uuid(),
  body       text not null check (char_length(body) between 3 and 200),
  kind       text not null check (kind in ('choice', 'scale', 'text')),   -- pick one · 1 to 5 · write freely
  options    text[],                                                       -- for 'choice': two to six
  after_days integer not null default 0 check (after_days between 0 and 365),   -- only asked once someone has been around this long
  created_at timestamptz not null default now(),
  closed_at  timestamptz,
  check (kind <> 'choice' or (options is not null and array_length(options, 1) between 2 and 6))
);
alter table public.questions enable row level security;
create policy "questions: open ones can be read" on public.questions for select to authenticated using (closed_at is null);
grant select on public.questions to authenticated;
grant all on public.questions to service_role;

create table if not exists public.question_answers (
  question_id uuid not null references public.questions (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  choice      text check (char_length(choice) <= 80),     -- the option picked, or 1 to 5
  body        text check (char_length(body) <= 500),      -- what was written
  skipped     boolean not null default false,             -- chose not to answer
  created_at  timestamptz not null default now(),
  primary key (question_id, user_id)
);
alter table public.question_answers enable row level security;
create policy "answers: see your own" on public.question_answers for select to authenticated using (user_id = auth.uid());
create policy "answers: answer as yourself" on public.question_answers for insert to authenticated with check (user_id = auth.uid());
grant select, insert on public.question_answers to authenticated;
grant all on public.question_answers to service_role;

-- an answer has to fit the question, and the question has to be open
create or replace function public.check_answer()
returns trigger language plpgsql security definer set search_path = '' as $$
declare q public.questions;
begin
  select * into q from public.questions where id = new.question_id;
  if not found or q.closed_at is not null then raise exception 'That question is closed.'; end if;
  new.created_at := now();
  if new.skipped then new.choice := null; new.body := null; return new; end if;
  if q.kind = 'choice' then
    if new.choice is null or not (new.choice = any (q.options)) then raise exception 'Pick one of the answers.'; end if;
    new.body := null;
  elsif q.kind = 'scale' then
    if new.choice is null or new.choice not in ('1', '2', '3', '4', '5') then raise exception 'Pick a number from 1 to 5.'; end if;
    new.body := null;
  else
    if coalesce(btrim(new.body), '') = '' then raise exception 'Write something first.'; end if;
    new.choice := null;
  end if;
  return new;
end $$;
create trigger answers_check before insert on public.question_answers
  for each row execute function public.check_answer();

-- the next question for you: open, not answered yet, and you have been around long enough
create or replace function public.next_question()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object('id', q.id, 'body', q.body, 'kind', q.kind, 'options', q.options)
  from public.questions q
  where auth.uid() is not null and q.closed_at is null
    and not exists (select 1 from public.question_answers a where a.question_id = q.id and a.user_id = auth.uid())
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.display_name <> ''
                and p.created_at <= now() - make_interval(days => q.after_days))
  order by q.created_at
  limit 1;
$$;

-- ---------------------------------------------------------------- the numbers for the Insights page
-- People who run Frejas (in `admins`) are left out of every number, so their own testing doesn't colour it.
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
    where not exists (select 1 from public.admins a where a.user_id = p.id) and p.display_name <> ''
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
      'unnamed', (select count(*) from public.profiles p where p.display_name = '' and not exists (select 1 from public.admins a where a.user_id = p.id)),
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
      'friendships', (select count(*) from public.friendships),
      'invites_sent', (select count(*) from public.push_log pl where pl.kind = 'invite'),
      'challenges_inviting', (select count(distinct split_part(pl.key, ':', 2)) from public.push_log pl where pl.kind = 'invite'),
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
      'questions_open', (select count(*) from public.questions q where q.closed_at is null))
  ) into j;
  return j;
end $$;

-- ---------------------------------------------------------------- for whoever runs Frejas: questions and feedback
-- Each of these answers only someone in `admins`; anyone else gets nothing back, or an error when they try to change something.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

create or replace function public.admin_questions()
returns json language sql stable security definer set search_path = '' as $$
  select case when public.is_admin() then coalesce((
    select json_agg(json_build_object(
      'id', q.id, 'body', q.body, 'kind', q.kind, 'options', q.options, 'after_days', q.after_days,
      'created_at', q.created_at, 'closed_at', q.closed_at,
      'answered', (select count(*) from public.question_answers a where a.question_id = q.id and not a.skipped),
      'skipped', (select count(*) from public.question_answers a where a.question_id = q.id and a.skipped),
      'counts', (select coalesce(json_object_agg(c.choice, c.n), '{}'::json) from (
                   select a.choice, count(*) as n from public.question_answers a
                   where a.question_id = q.id and not a.skipped and a.choice is not null group by a.choice) c),
      'texts', (select coalesce(json_agg(json_build_object('body', t.body, 'at', t.created_at) order by t.created_at desc), '[]'::json) from (
                  select a.body, a.created_at from public.question_answers a
                  where a.question_id = q.id and not a.skipped and a.body is not null order by a.created_at desc limit 200) t)
    ) order by q.created_at desc)
    from (select * from public.questions order by created_at desc limit 50) q), '[]'::json) end;
$$;

create or replace function public.admin_ask(p_body text, p_kind text, p_options text[] default null, p_after_days integer default 0)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_opts text[];
begin
  if not public.is_admin() then raise exception 'Not found'; end if;
  if p_kind = 'choice' then
    select array_agg(btrim(o)) into v_opts from unnest(p_options) as o where btrim(o) <> '';
  end if;
  insert into public.questions (body, kind, options, after_days)
  values (btrim(p_body), p_kind, v_opts, coalesce(p_after_days, 0))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.admin_close_question(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Not found'; end if;
  update public.questions set closed_at = now() where id = p_id and closed_at is null;
end $$;

create or replace function public.admin_feedback(p_handled boolean default false)
returns json language sql stable security definer set search_path = '' as $$
  select case when public.is_admin() then coalesce((
    select json_agg(json_build_object(
      'id', f.id, 'body', f.body, 'page', f.page, 'build', f.build, 'platform', f.platform,
      'created_at', f.created_at, 'handled_at', f.handled_at,
      'name', (select p.display_name from public.profiles p where p.id = f.user_id),
      'level', case when f.user_id is null then null else public.level_of(f.user_id) end
    ) order by f.created_at desc)
    from (select * from public.feedback x where (x.handled_at is not null) = coalesce(p_handled, false) order by x.created_at desc limit 200) f), '[]'::json) end;
$$;

create or replace function public.admin_feedback_done(p_id uuid, p_done boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Not found'; end if;
  update public.feedback set handled_at = case when coalesce(p_done, true) then now() end where id = p_id;
end $$;

-- ---------------------------------------------------------------- who may call what
revoke execute on function public.seen(text), public.note_origin(text, text, text), public.fill_feedback(), public.check_answer(),
  public.next_question(), public.admin_stats(), public.is_admin(), public.admin_questions(), public.admin_ask(text, text, text[], integer),
  public.admin_close_question(uuid), public.admin_feedback(boolean), public.admin_feedback_done(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.seen(text), public.note_origin(text, text, text), public.next_question(), public.admin_stats(),
  public.admin_questions(), public.admin_ask(text, text, text[], integer), public.admin_close_question(uuid),
  public.admin_feedback(boolean), public.admin_feedback_done(uuid, boolean) to authenticated;
