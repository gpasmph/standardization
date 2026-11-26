-- Run once in Supabase → SQL Editor (after auth.sql). Safe to re-run.
-- The official UNSPSC list (UNDP, unspsc_english.xlsx), used to validate and suggest UNSPSC codes.
-- Load it with:  node --env-file=.env scripts/import-unspsc.mjs "<path to unspsc_english.xlsx>"

create extension if not exists pg_trgm;

create table if not exists public.unspsc (
  code          text primary key,                 -- 8 digits, e.g. 42142504
  level         text not null check (level in ('segment', 'family', 'class', 'commodity')),
  title         text not null,
  definition    text,
  segment       text, segment_title text,
  family        text, family_title  text,
  class         text, class_title   text,
  synonym       text,
  acronym       text,
  version       text,
  tsv tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(synonym, '') || ' ' || coalesce(acronym, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(class_title, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(family_title, '')), 'C')
  ) stored
);
create index if not exists unspsc_tsv_idx   on public.unspsc using gin (tsv);
create index if not exists unspsc_title_trgm on public.unspsc using gin (title gin_trgm_ops);

alter table public.unspsc enable row level security;
drop policy if exists "unspsc read" on public.unspsc;
create policy "unspsc read" on public.unspsc for select to authenticated using (true);

-- Best commodities for a description: any word may match (OR), title/synonym words count most,
-- and Medical Equipment and Accessories and Supplies (segment 42) is preferred by default.
create or replace function public.unspsc_search(q text, n int default 8, prefer text default '42')
returns table (code text, title text, definition text, class text, class_title text, family_title text, segment_title text, score real)
language sql stable set search_path = public as $$
  with t as (
    select to_tsquery('english', string_agg(quote_literal(lexeme), ' | ')) as tsq
    from unnest(to_tsvector('english', coalesce(q, '')))
  )
  select u.code, u.title, u.definition, u.class, u.class_title, u.family_title, u.segment_title,
         (ts_rank(u.tsv, t.tsq) + similarity(u.title, q) + case when prefer <> '' and u.code like prefer || '%' then 0.2 else 0 end)::real as score
  from public.unspsc u, t
  where t.tsq is not null and u.level = 'commodity' and u.tsv @@ t.tsq
  order by score desc
  limit least(greatest(n, 1), 25)
$$;
revoke execute on function public.unspsc_search(text, int, text) from public, anon;
grant  execute on function public.unspsc_search(text, int, text) to authenticated;
