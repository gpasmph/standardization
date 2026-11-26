-- Run once in Supabase → SQL Editor (after auth.sql). Safe to re-run.
-- Fixes "canceling statement due to statement timeout" once items grew past ~100k rows:
--   1. Dashboard reads a small running-totals table instead of counting every row.
--   2. Review / QA lists get an index for their sort order and for the search box.

-- ---------- 1. Running totals for the dashboard ----------
create table if not exists public.item_counts (
  status   text not null,
  category text not null,
  priority text not null,
  n        bigint not null default 0,
  primary key (status, category, priority)
);
alter table public.item_counts enable row level security;  -- no policies: only reached through dashboard_stats

create or replace function public.item_counts_apply() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    insert into item_counts (status, category, priority, n)
    select coalesce(status, chr(8212)), coalesce(category, chr(8212)), coalesce(priority, ''), -count(*)
    from old_rows group by 1, 2, 3
    on conflict (status, category, priority) do update set n = item_counts.n + excluded.n;
  end if;
  if tg_op in ('UPDATE', 'INSERT') then
    insert into item_counts (status, category, priority, n)
    select coalesce(status, chr(8212)), coalesce(category, chr(8212)), coalesce(priority, ''), count(*)
    from new_rows group by 1, 2, 3
    on conflict (status, category, priority) do update set n = item_counts.n + excluded.n;
  end if;
  delete from item_counts where n = 0;
  return null;
end $$;

drop trigger if exists items_counts_ins on public.items;
drop trigger if exists items_counts_upd on public.items;
drop trigger if exists items_counts_del on public.items;
create trigger items_counts_ins after insert on public.items referencing new table as new_rows
  for each statement execute function public.item_counts_apply();
create trigger items_counts_upd after update on public.items referencing old table as old_rows new table as new_rows
  for each statement execute function public.item_counts_apply();
create trigger items_counts_del after delete on public.items referencing old table as old_rows
  for each statement execute function public.item_counts_apply();

-- Fill from the current rows (locks writes to items for the few seconds this takes).
begin;
lock table public.items in share mode;
truncate public.item_counts;
insert into public.item_counts (status, category, priority, n)
select coalesce(status, chr(8212)), coalesce(category, chr(8212)), coalesce(priority, ''), count(*)
from public.items group by 1, 2, 3;
commit;

create or replace function public.dashboard_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total',       (select coalesce(sum(n), 0) from item_counts),
    'optima',      (select coalesce(sum(n), 0) from item_counts where priority = 'OPTIMA'),
    'optima_done', (select coalesce(sum(n), 0) from item_counts where priority = 'OPTIMA' and status = 'Approved'),
    'by_status',   (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
                    from (select status, sum(n) as n from item_counts group by 1) x),
    'by_category', (select coalesce(jsonb_object_agg(category, n), '{}'::jsonb)
                    from (select category, sum(n) as n from item_counts group by 1) x)
  )
$$;
revoke execute on function public.dashboard_stats() from public, anon;
grant  execute on function public.dashboard_stats() to authenticated;

-- ---------- 2. Indexes for the Review / QA lists ----------
create index if not exists items_created_idx    on public.items (created_at desc, item_id desc);
create index if not exists items_status_created on public.items (status, created_at desc, item_id desc);
-- search box: item_id / hospital_desc / mph_short / new_short ilike '%text%'
create index if not exists items_id_trgm        on public.items using gin (item_id gin_trgm_ops);
create index if not exists items_new_short_trgm on public.items using gin (new_short gin_trgm_ops);
analyze public.items;
