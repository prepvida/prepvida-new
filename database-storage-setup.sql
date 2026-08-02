-- =====================================================================
-- SETUP: Storage bucket for interview video recordings (Premium plan)
-- Run this in Supabase SQL Editor.
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('interview-recordings', 'interview-recordings', true)
on conflict (id) do nothing;

create policy "Users can upload own recordings"
on storage.objects for insert
with check (bucket_id = 'interview-recordings' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can view own recordings"
on storage.objects for select
using (bucket_id = 'interview-recordings' and auth.uid()::text = (storage.foldername(name))[1]);
