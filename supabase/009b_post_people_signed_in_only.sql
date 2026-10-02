-- The name lookup already returns nothing to someone who isn't signed in; this also stops them from calling it.
revoke execute on function public.post_people(uuid[]) from public, anon;
grant execute on function public.post_people(uuid[]) to authenticated;
