-- Run once in Supabase → SQL Editor (after auth.sql). Safe to re-run.
-- Lets QA reviewers insert items with ANY status, so the Batch import page can load the
-- master data (its rows have no status, or "Ongoing Review"). Everyone else is still limited
-- to 'Pending QA' / 'Mapped' by the existing "items insert" policy.
drop policy if exists "items qa insert" on public.items;
create policy "items qa insert" on public.items for insert to authenticated
  with check (public.is_qa());
