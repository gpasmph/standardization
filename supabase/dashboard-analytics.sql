-- Run once in Supabase → SQL Editor (after auth.sql and performance-v2.sql). Safe to re-run.
-- Feeds the analytics half of the Dashboard. The portal still works without it (it shows the old bars).

-- Cheap: reads the running-totals table and the audit log only.
create or replace function public.dashboard_analytics() returns jsonb
language sql stable security definer set search_path = public as $$
  with days as (
    select d::date as day
    from generate_series((now() at time zone 'Asia/Manila')::date - 29, (now() at time zone 'Asia/Manila')::date, interval '1 day') d
  ),
  log as (
    select (at at time zone 'Asia/Manila')::date as day, old_status, new_status
    from audit_log
    where at >= now() - interval '31 days'
  )
  select jsonb_build_object(
    'category_status', (select coalesce(jsonb_agg(jsonb_build_object('k', category, 'status', status, 'n', n)), '[]'::jsonb)
                        from (select category, status, sum(n) as n from item_counts group by 1, 2) x),
    'priority_status', (select coalesce(jsonb_agg(jsonb_build_object('k', priority, 'status', status, 'n', n)), '[]'::jsonb)
                        from (select priority, status, sum(n) as n from item_counts group by 1, 2) x),
    'daily', (select jsonb_agg(jsonb_build_object(
                'day', days.day,
                'approved', (select count(*) from log where log.day = days.day and log.new_status = 'Approved'),
                'changes',  (select count(*) from log where log.day = days.day)
              ) order by days.day) from days),
    'qa_approved', (select count(*) from log where old_status = 'Pending QA' and new_status = 'Approved'),
    'qa_returned', (select count(*) from log where old_status = 'Pending QA' and new_status = 'Returned')
  )
$$;
revoke execute on function public.dashboard_analytics() from public, anon;
grant  execute on function public.dashboard_analytics() to authenticated;

-- Scans items once (uses items_hospital_idx). Kept separate so a slow scan can never hide the rest of the dashboard.
create or replace function public.dashboard_hospitals() returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('k', h, 'total', t, 'approved', a, 'open', o) order by t desc), '[]'::jsonb)
  from (
    select coalesce(hospital_name, chr(8212)) as h,
           count(*) as t,
           count(*) filter (where status in ('Approved', 'Mapped')) as a,
           count(*) filter (where status in ('Returned', 'FOR HOSPITAL TICKET')) as o
    from items group by 1 order by t desc limit 12
  ) x
$$;
revoke execute on function public.dashboard_hospitals() from public, anon;
grant  execute on function public.dashboard_hospitals() to authenticated;
