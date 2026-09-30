-- 008 · the feed updates live when someone checks in or ticks a shared habit (row security still decides who gets what)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'check_ins') then
    alter publication supabase_realtime add table public.check_ins;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'habit_logs') then
    alter publication supabase_realtime add table public.habit_logs;
  end if;
end $$;
