-- 010 · two of your habits can be kept as a pair: ticking one ticks the other.
-- Each keeps its own name, schedule and history. (Only adds things.)
alter table public.habits add column if not exists linked_habit_id uuid references public.habits (id) on delete set null;
create index if not exists habits_linked on public.habits (linked_habit_id) where linked_habit_id is not null;

-- a pair is always two habits of the same person, and never a habit with itself
create or replace function public.check_linked_habit()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.linked_habit_id is not null then
    if new.linked_habit_id = new.id then
      raise exception 'A habit cannot be paired with itself';
    end if;
    if not exists (select 1 from public.habits h where h.id = new.linked_habit_id and h.owner_id = new.owner_id) then
      raise exception 'You can only pair two of your own habits';
    end if;
  end if;
  return new;
end $$;

create trigger habits_linked_check
  before insert or update of linked_habit_id, owner_id on public.habits
  for each row execute function public.check_linked_habit();
