-- 014b · the two older checks that run by themselves when someone joins are not meant to be called from outside
revoke execute on function public.check_join_by(), public.check_max_members() from public, anon, authenticated;
