-- Run once in Supabase → SQL Editor.
-- Private bucket for the working Excel files (no public access, 50 MB limit).
insert into storage.buckets (id, name, public, file_size_limit)
values ('excel-files', 'excel-files', false, 52428800)
on conflict (id) do nothing;
-- No policies on purpose: only the service role (the upload script) can read/write.
