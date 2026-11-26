-- Run once in Supabase → SQL Editor (after items.sql).
create extension if not exists pg_trgm;

-- ---------- Users & roles ----------
create table if not exists public.profiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  email     text,
  full_name text,
  role      text not null default 'prod' check (role in ('prod', 'qa'))
);
alter table public.profiles enable row level security;
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select to authenticated using (id = auth.uid());

create or replace function public.is_qa() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'qa') $$;

-- ---------- Items: who can do what ----------
alter table public.items add column if not exists created_by uuid default auth.uid();
create sequence if not exists public.req_seq;
alter table public.items alter column item_id set default ('REQ-' || nextval('public.req_seq'));

drop policy if exists "items read"   on public.items;
drop policy if exists "items insert" on public.items;
drop policy if exists "items update" on public.items;
create policy "items read"   on public.items for select to authenticated using (true);
create policy "items insert" on public.items for insert to authenticated
  with check (status in ('Pending QA', 'Mapped'));
-- Only QA may touch or set "Approved"
create policy "items update" on public.items for update to authenticated
  using (status <> 'Approved' or public.is_qa())
  with check (status <> 'Approved' or public.is_qa());

-- ---------- Audit log (every status change) ----------
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  item_id    text,
  old_status text,
  new_status text,
  user_id    uuid default auth.uid(),
  at         timestamptz not null default now()
);
alter table public.audit_log enable row level security;
drop policy if exists "qa reads audit" on public.audit_log;
create policy "qa reads audit" on public.audit_log for select to authenticated using (public.is_qa());

create or replace function public.items_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if new.status is distinct from old.status then
    insert into public.audit_log (item_id, old_status, new_status) values (old.item_id, old.status, new.status);
  end if;
  return new;
end $$;
drop trigger if exists items_bu on public.items;
create trigger items_bu before update on public.items for each row execute function public.items_before_update();

-- ---------- Search indexes + functions the portal calls ----------
create index if not exists items_short_trgm on public.items using gin (mph_short gin_trgm_ops);
create index if not exists items_desc_trgm  on public.items using gin (hospital_desc gin_trgm_ops);

create or replace function public.find_matches(q text, n int default 5)
returns table (item_id text, mph_code text, category text, mph_short text, mph_long text, unspsc_commodity text, score real)
language sql stable as $$
  select i.item_id, i.mph_code, i.category, i.mph_short, i.mph_long, i.unspsc_commodity,
         greatest(similarity(i.mph_short, q), similarity(coalesce(i.hospital_desc, ''), q)) as score
  from public.items i
  where i.mph_short % q or i.hospital_desc % q
  order by score desc limit n
$$;

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

create or replace function public.hospital_list() returns setof text
language sql stable as $$ select distinct hospital_name from public.items where hospital_name is not null order by 1 $$;

-- Logged-in users only (not anonymous visitors)
revoke execute on function public.find_matches, public.dashboard_stats, public.hospital_list from public, anon;
grant  execute on function public.find_matches, public.dashboard_stats, public.hospital_list to authenticated;
