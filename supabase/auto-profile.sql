-- Run once in Supabase → SQL Editor (after auth.sql).
-- Every new user (added in Authentication → Users) automatically gets a profile as Production.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)), 'prod')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill users that already exist
insert into public.profiles (id, email, full_name, role)
select id, email, split_part(email, '@', 1), 'prod' from auth.users
on conflict (id) do nothing;

-- Make QA reviewers (change the emails, run again whenever needed):
-- update public.profiles set role = 'qa' where email in ('ikaw@pasia.org');
