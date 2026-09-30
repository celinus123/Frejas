-- 007 · friends you add yourself (with a personal link), on top of people you share a challenge with

alter table public.profiles add column if not exists friend_code text;
update public.profiles set friend_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 12) where friend_code is null;
alter table public.profiles alter column friend_code set default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
alter table public.profiles alter column friend_code set not null;
create unique index if not exists profiles_friend_code on public.profiles (friend_code);

create table if not exists public.friendships (
  user_a     uuid not null references public.profiles (id) on delete cascade,
  user_b     uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index if not exists friendships_b on public.friendships (user_b);
alter table public.friendships enable row level security;
create policy "friendships: see your own" on public.friendships
  for select to authenticated using (auth.uid() in (user_a, user_b));
create policy "friendships: either side can end it" on public.friendships
  for delete to authenticated using (auth.uid() in (user_a, user_b));
grant select, delete on public.friendships to authenticated;
grant all on public.friendships to service_role;

create or replace function public.is_friend(p_other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.friendships
                 where user_a = least(auth.uid(), p_other) and user_b = greatest(auth.uid(), p_other));
$$;

-- "Friends" everywhere in the rules = shares a challenge with you, or added as a friend.
create or replace function public.shares_challenge(p_other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.challenge_members me
    join public.challenge_members them on them.challenge_id = me.challenge_id
    where me.user_id = auth.uid() and them.user_id = p_other
  ) or public.is_friend(p_other);
$$;

-- Open someone's friend link: you become friends (they shared the link on purpose).
create or replace function public.add_friend(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare other uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select id into other from public.profiles where friend_code = p_code;
  if other is null then raise exception 'This friend link is not valid any more'; end if;
  if other = auth.uid() then raise exception 'That''s your own link'; end if;
  insert into public.friendships (user_a, user_b) values (least(auth.uid(), other), greatest(auth.uid(), other))
  on conflict do nothing;
  return other;
end $$;

-- Name on a friend link, shown before you sign in.
create or replace function public.friend_preview(p_code text)
returns text language sql stable security definer set search_path = '' as $$
  select display_name from public.profiles where friend_code = p_code;
$$;

-- Make a new link; the old one stops working.
create or replace function public.reset_friend_code()
returns text language sql security definer set search_path = '' as $$
  update public.profiles set friend_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
  where id = auth.uid() returning friend_code;
$$;

revoke execute on function public.is_friend(uuid), public.add_friend(text), public.reset_friend_code(), public.friend_preview(text) from public;
grant execute on function public.is_friend(uuid), public.add_friend(text), public.reset_friend_code() to authenticated;
grant execute on function public.friend_preview(text) to anon, authenticated;

revoke execute on function public.is_friend(uuid), public.add_friend(text), public.reset_friend_code(), public.merge_habits(uuid, uuid) from anon;
