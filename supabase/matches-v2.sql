-- Run once in Supabase → SQL Editor.
-- Same search as before, but also returns the hospital name and description of each match,
-- so the portal can explain WHY it matches (same hospital wording, same size, shared terms…).
drop function if exists public.find_matches(text, int);

create or replace function public.find_matches(q text, n int default 5)
returns table (item_id text, mph_code text, category text, mph_short text, mph_long text, unspsc_commodity text,
               hospital_name text, hospital_desc text, score real)
language sql stable as $$
  select i.item_id, i.mph_code, i.category, i.mph_short, i.mph_long, i.unspsc_commodity, i.hospital_name, i.hospital_desc,
         greatest(similarity(i.mph_short, q), similarity(coalesce(i.hospital_desc, ''), q)) as score
  from public.items i
  where i.mph_short % q or i.hospital_desc % q
  order by score desc limit n
$$;

revoke execute on function public.find_matches(text, int) from public, anon;
grant  execute on function public.find_matches(text, int) to authenticated;
