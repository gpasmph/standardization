-- Apply in Supabase SQL Editor. Keeps existing RLS and caller permissions.
-- Scan items once, then calculate dashboard totals from the grouped counts.
create or replace function public.dashboard_stats() returns jsonb
language sql stable security invoker set search_path = public as $$
  with counts as materialized (
    select status, category, priority, count(*) as n
    from public.items
    group by status, category, priority
  )
  select jsonb_build_object(
    'total', (select coalesce(sum(n), 0) from counts),
    'optima', (select coalesce(sum(n), 0) from counts where priority = 'OPTIMA'),
    'optima_done', (select coalesce(sum(n), 0) from counts where priority = 'OPTIMA' and status = 'Approved'),
    'by_status', (select coalesce(jsonb_object_agg(label, n), '{}'::jsonb) from (
      select coalesce(status, chr(8212)) as label, sum(n) as n from counts group by 1
    ) x),
    'by_category', (select coalesce(jsonb_object_agg(label, n), '{}'::jsonb) from (
      select coalesce(category, chr(8212)) as label, sum(n) as n from counts group by 1
    ) x)
  )
$$;

revoke execute on function public.dashboard_stats() from public, anon;
grant execute on function public.dashboard_stats() to authenticated;
