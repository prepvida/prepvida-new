-- =====================================================================
-- SETUP: PDF interview report storage
-- Run this in Supabase SQL Editor.
-- =====================================================================

-- Track the PDF report location on each session
alter table public.interview_sessions
  add column if not exists report_url text;

-- Private bucket (not public) — reports are only accessible via
-- signed, time-limited links generated for the owning student.
insert into storage.buckets (id, name, public)
values ('interview-reports', 'interview-reports', false)
on conflict (id) do nothing;

create policy "Users can upload own reports"
on storage.objects for insert
with check (bucket_id = 'interview-reports' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can view own reports"
on storage.objects for select
using (bucket_id = 'interview-reports' and auth.uid()::text = (storage.foldername(name))[1]);
