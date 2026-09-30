-- 004 · at most 10 categories per person (counted over habits that aren't archived)
create or replace function public.limit_categories()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.category is null or new.archived_at is not null then return new; end if;
  if exists (select 1 from public.habits h
             where h.owner_id = new.owner_id and h.id <> new.id and h.archived_at is null
               and lower(h.category) = lower(new.category)) then
    return new;
  end if;
  if (select count(distinct lower(h.category)) from public.habits h
      where h.owner_id = new.owner_id and h.id <> new.id and h.archived_at is null and h.category is not null) >= 10 then
    raise exception 'You can have up to 10 categories. Pick one you already use.';
  end if;
  return new;
end $$;

drop trigger if exists habits_limit_categories on public.habits;
create trigger habits_limit_categories
  before insert or update of category, archived_at on public.habits
  for each row execute function public.limit_categories();

revoke execute on function public.limit_categories() from public, anon, authenticated;
