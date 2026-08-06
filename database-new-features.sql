-- Feature 2: Shareable badges (public, read-only summary pages)
create table if not exists public.public_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid references public.interview_sessions(id) on delete cascade,
  company_name text,
  role_name text,
  summary_text text,
  created_at timestamptz default now()
);

alter table public.public_badges enable row level security;

create policy "Users can create own badges" on public.public_badges
  for insert with check (auth.uid() = user_id);

create policy "Anyone can view badges" on public.public_badges
  for select using (true);

-- Feature 4: Simple TPO/admin flag on profiles
alter table public.profiles add column if not exists is_admin boolean default false;

-- Resume gap coaching data
alter table public.dream_selections add column if not exists resume_gap_areas text;
