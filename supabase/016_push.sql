-- 016 · notifications to the phone. (Only adds things.)

-- The address Apple (or Google) gives a phone for an app. One row per phone; it follows whoever is signed in on it.
create table if not exists public.push_tokens (
  token      text primary key check (char_length(token) between 20 and 400),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  platform   text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_user on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
create policy "push_tokens: see your own" on public.push_tokens
  for select to authenticated using (user_id = auth.uid());
create policy "push_tokens: remove your own" on public.push_tokens
  for delete to authenticated using (user_id = auth.uid());
grant select, delete on public.push_tokens to authenticated;
grant all on public.push_tokens to service_role;

-- Saving goes through here, so that a phone someone else was signed in on before moves over to you.
create or replace function public.save_push_token(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into public.push_tokens (token, user_id, platform) values (p_token, auth.uid(), p_platform)
  on conflict (token) do update set user_id = auth.uid(), platform = excluded.platform, updated_at = now();
end $$;
revoke execute on function public.save_push_token(text, text) from public, anon;
grant execute on function public.save_push_token(text, text) to authenticated;

-- The kinds of notification someone has switched off. Empty = all on.
alter table public.profiles add column if not exists notify_off text[] not null default '{}';
alter table public.profiles add constraint profiles_notify_off_kinds check (notify_off <@ array['invite', 'request', 'comment', 'friend']::text[]);

-- What has been sent, so the same thing is never sent twice. Only the server reads and writes it.
create table if not exists public.push_log (
  key        text primary key,
  kind       text not null,
  to_user    uuid,
  sent       integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.push_log enable row level security;
grant all on public.push_log to service_role;
