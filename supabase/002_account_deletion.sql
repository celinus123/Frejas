-- =====================================================================
--  Orbit — migration 002: account deletion support
--  Run AFTER schema.sql, once: SQL Editor → New query → paste → Run.
-- =====================================================================

-- The server (secret key) needs explicit access, since new tables are
-- not exposed automatically in this project.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;

-- Allow a creator change only through transfer_challenge() below.
create or replace function public.protect_challenge_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.goal_type <> old.goal_type then
    raise exception 'Goal type cannot be changed';
  end if;
  if new.creator_id <> old.creator_id and coalesce(current_setting('orbit.transfer', true), '') <> 'on' then
    raise exception 'Creator cannot be changed';
  end if;
  return new;
end;
$$;

-- When someone deletes their account, their challenges are handed to
-- another member instead of disappearing for everyone. Server only.
create or replace function public.transfer_challenge(p_challenge uuid, p_new_creator uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.challenge_members where challenge_id = p_challenge and user_id = p_new_creator) then
    raise exception 'New creator must be a member';
  end if;
  perform set_config('orbit.transfer', 'on', true);
  update public.challenges set creator_id = p_new_creator where id = p_challenge;
  perform set_config('orbit.transfer', '', true);
end;
$$;

revoke execute on function public.transfer_challenge(uuid, uuid) from public, anon, authenticated;
grant execute on function public.transfer_challenge(uuid, uuid) to service_role;
