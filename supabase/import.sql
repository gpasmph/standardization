-- Run once in Supabase → SQL Editor (after auth.sql).
-- Lets QA reviewers import Excel rows into public.items from the portal.
drop policy if exists "qa import" on public.items;
create policy "qa import" on public.items for insert to authenticated with check (public.is_qa());
