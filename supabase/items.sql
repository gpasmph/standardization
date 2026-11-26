-- Run once in Supabase → SQL Editor.
create table if not exists public.items (
  item_id            text primary key,          -- PASIA ID, e.g. PASIA002617
  category           text,
  mph_code           text,
  hospital_key       text,
  hospital_name      text,
  hospital_code      text,
  hospital_desc      text,
  supplier           text,
  mph_short          text,
  mph_long           text,
  unspsc_commodity   text,
  unspsc_title       text,
  mph_item_code      text,
  change_category    text,                      -- PASIA: change category suggestion
  new_short          text,                      -- PASIA: proposed short description
  new_long           text,                      -- PASIA: proposed long description
  priority           text,
  status             text,
  review_date        text,
  remarks            text,
  mph_data           jsonb not null default '{}', -- MPH TEAM attribute columns
  pasia_data         jsonb not null default '{}', -- PASIA TEAM attribute columns
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists items_status_idx    on public.items (status);
create index if not exists items_category_idx  on public.items (category);
create index if not exists items_hospital_idx  on public.items (hospital_name);

-- Locked down: with RLS on and no policies, only the service role can read/write.
-- Policies for logged-in portal users come with the login step.
alter table public.items enable row level security;
