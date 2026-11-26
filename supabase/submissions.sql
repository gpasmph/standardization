-- Run once in Supabase → SQL Editor (after auth.sql).
-- History of the Wednesday AM / Friday 5 PM updates sent to MPH.
create table if not exists public.submissions (
  id           bigint generated always as identity primary key,
  kind         text not null,                 -- 'Wednesday AM' | 'Friday 5 PM'
  row_count    int  not null,
  sent_by      uuid default auth.uid(),
  sent_by_name text,
  sent_at      timestamptz not null default now(),
  feedback     text                           -- MPH feedback, filled in later
);
alter table public.submissions enable row level security;
drop policy if exists "submissions read"   on public.submissions;
drop policy if exists "submissions insert" on public.submissions;
create policy "submissions read"   on public.submissions for select to authenticated using (true);
create policy "submissions insert" on public.submissions for insert to authenticated with check (public.is_qa());
