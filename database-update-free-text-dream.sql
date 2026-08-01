-- =====================================================================
-- UPDATE: Allow ANY company and ANY role (free text, not a fixed list)
-- Run this in Supabase SQL Editor. Safe to run once.
-- =====================================================================

alter table public.dream_selections
  add column if not exists company_name text,
  add column if not exists role_name text;

-- company_id / role_id from the old catalog system are no longer required
alter table public.dream_selections
  alter column company_id drop not null;
