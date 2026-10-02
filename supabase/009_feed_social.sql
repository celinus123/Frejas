-- 009 · the feed gets reactions with a choice of emoji, and short comments.
-- Written so that it only ADDS things (no drop, no revoke): rules that already
-- exist are left in place and the new ones are added beside them.
-- They work on two kinds of post: a check-in in a challenge, and a "day card"
-- (the habits someone shares with friends that they ticked on a given day).

-- ---------------------------------------------------------------- check-ins
-- one reaction per person per check-in; which emoji is a choice of five
alter table public.reactions add column if not exists emoji text not null default '❤️';
alter table public.reactions add constraint reactions_emoji_check check (emoji in ('❤️', '😍', '😊', '👏', '⚡'));
create policy "reactions: change own" on public.reactions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant update (emoji) on public.reactions to authenticated;

-- comments are short, like a note on a story
-- (the older, longer limit stays; this one is added and is the one that bites)
alter table public.comments add constraint comments_body_max_120 check (char_length(body) <= 120);

-- ---------------------------------------------------------------- day cards
-- A day card is identified by whose habits (owner_id) and which day.
-- You can see and write on it when it is yours or the owner is a friend
-- (shares a challenge with you, or added with a friend link) — the same
-- people who can see the shared habits themselves.
create table if not exists public.day_reactions (
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  day        date not null,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  emoji      text not null default '❤️' check (emoji in ('❤️', '😍', '😊', '👏', '⚡')),
  created_at timestamptz not null default now(),
  primary key (owner_id, day, user_id)
);
create table if not exists public.day_comments (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  day        date not null,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 120),
  created_at timestamptz not null default now()
);
create index if not exists day_reactions_day on public.day_reactions (day);
create index if not exists day_reactions_user on public.day_reactions (user_id);
create index if not exists day_comments_owner_day on public.day_comments (owner_id, day, created_at);
create index if not exists day_comments_day on public.day_comments (day);
create index if not exists day_comments_user on public.day_comments (user_id);

alter table public.day_reactions enable row level security;
alter table public.day_comments  enable row level security;

create policy "day_reactions: owner and friends read" on public.day_reactions
  for select to authenticated using (owner_id = auth.uid() or public.shares_challenge(owner_id));
create policy "day_reactions: react as yourself" on public.day_reactions
  for insert to authenticated
  with check (user_id = auth.uid() and day <= current_date + 1 and (owner_id = auth.uid() or public.shares_challenge(owner_id)));
create policy "day_reactions: change own" on public.day_reactions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "day_reactions: remove own" on public.day_reactions
  for delete to authenticated using (user_id = auth.uid());

create policy "day_comments: owner and friends read" on public.day_comments
  for select to authenticated using (owner_id = auth.uid() or public.shares_challenge(owner_id));
create policy "day_comments: write as yourself" on public.day_comments
  for insert to authenticated
  with check (user_id = auth.uid() and day <= current_date + 1 and (owner_id = auth.uid() or public.shares_challenge(owner_id)));
-- your own comments, and anything written on your own day card
create policy "day_comments: delete own or on your card" on public.day_comments
  for delete to authenticated using (user_id = auth.uid() or owner_id = auth.uid());

grant select, insert, delete on public.day_reactions to authenticated;
grant update (emoji)         on public.day_reactions to authenticated;
grant select, insert, delete on public.day_comments  to authenticated;
grant all on public.day_reactions, public.day_comments to service_role;

-- the owner of a check-in can also remove comments written on it
-- (added beside "comments: delete own"; either rule is enough)
create policy "comments: delete on your check-in" on public.comments
  for delete to authenticated
  using (exists (select 1 from public.check_ins ci where ci.id = check_in_id and ci.user_id = auth.uid()));

-- Names of people who reacted or commented on a day card you can see.
-- (They are friends of the card's owner, not necessarily of you, so the
-- normal profile rule would hide their name.) Returns nothing for anyone else,
-- including someone who isn't signed in: every branch below needs auth.uid().
create or replace function public.post_people(p_ids uuid[])
returns table (id uuid, display_name text, avatar_path text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.avatar_path
  from public.profiles p
  where p.id = any (p_ids)
    and auth.uid() is not null
    and (p.id = auth.uid()
      or public.shares_challenge(p.id)
      or exists (select 1 from public.day_comments c
                 where c.user_id = p.id and (c.owner_id = auth.uid() or public.shares_challenge(c.owner_id)))
      or exists (select 1 from public.day_reactions r
                 where r.user_id = p.id and (r.owner_id = auth.uid() or public.shares_challenge(r.owner_id))));
$$;
grant execute on function public.post_people(uuid[]) to authenticated;

-- live updates in the feed (row security still decides who gets what)
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['reactions', 'comments', 'day_reactions', 'day_comments'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
