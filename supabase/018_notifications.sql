-- 018 · a list in the app of what you have been told about. (Only adds things.)
-- Written by the server at the same moment a notification is sent to the phone (or would have been),
-- so the list is complete also for someone who hasn't allowed notifications.
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('invite', 'request', 'comment', 'friend')),
  title      text not null,
  body       text not null default '',
  url        text not null default '/',
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
create policy "notifications: see your own" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "notifications: mark your own as read" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications: clear your own" on public.notifications
  for delete to authenticated using (user_id = auth.uid());
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant all on public.notifications to service_role;
