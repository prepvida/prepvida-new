-- =====================================================================
-- PREPVIDA.IN — COMPLETE SUPABASE DATABASE SCHEMA (FULL, STANDALONE)
-- Run this in: Supabase Dashboard -> SQL Editor -> New Query -> Paste -> Run
-- This is the ENTIRE schema in one file. Run top-to-bottom in ONE go.
-- =====================================================================


-- =====================================================================
-- 1. PROFILES
-- Extends Supabase's built-in auth.users table (which already handles
-- login, sessions, tokens, password reset). Do not build your own
-- login/session tables — this just adds app-specific fields.
-- =====================================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  avatar_url text,
  last_sign_in_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Auto-create a profile row whenever someone signs up via Supabase Auth
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data->>'full_name', new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Keep last_sign_in_at synced on every login
create or replace function public.handle_user_login()
returns trigger as $$
begin
  update public.profiles
  set last_sign_in_at = new.last_sign_in_at
  where id = new.id;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_login
  after update of last_sign_in_at on auth.users
  for each row execute procedure public.handle_user_login();


-- =====================================================================
-- 2. SUBSCRIPTION PLANS (Basic / Pro / Premium catalog)
-- =====================================================================

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,                    -- 'Basic' | 'Pro' | 'Premium'
  description text,
  price numeric(10,2) not null default 0,
  billing_cycle text not null default 'monthly',
  interview_mode text not null,          -- 'voice' | 'video_static_avatar' | 'video_ai_avatar'
  interview_credits int not null default 0,
  features jsonb default '[]',
  is_active boolean default true,
  created_at timestamptz default now()
);


-- =====================================================================
-- 3. USER SUBSCRIPTIONS
-- =====================================================================

create table public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  status text not null default 'active', -- 'active' | 'expired' | 'cancelled' | 'trial'
  credits_remaining int default 0,
  payment_provider text default 'instamojo',
  payment_reference_id text,
  start_date timestamptz default now(),
  end_date timestamptz,
  created_at timestamptz default now()
);

create index idx_user_subscriptions_user_id on public.user_subscriptions(user_id);


-- =====================================================================
-- 4. COMPANIES CATALOG (unlimited, admin-managed)
-- =====================================================================

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  logo_url text,
  is_active boolean default true,
  created_at timestamptz default now()
);


-- =====================================================================
-- 5. ROLES CATALOG (unlimited roles per company, admin-managed)
-- =====================================================================

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  role_name text not null,
  description text,
  is_active boolean default true,
  created_at timestamptz default now()
);

create index idx_roles_company_id on public.roles(company_id);


-- =====================================================================
-- 6. DREAM COMPANY / DREAM ROLE SELECTIONS (per student)
-- =====================================================================

create table public.dream_selections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid references public.companies(id),
  role_id uuid references public.roles(id),
  experience_level text,              -- 'fresher' | 'mid' | 'senior'
  is_active boolean default true,
  created_at timestamptz default now()
);

create index idx_dream_selections_user_id on public.dream_selections(user_id);


-- =====================================================================
-- 7. INTERVIEW SESSIONS (one row per AI interview attempt)
-- =====================================================================

create table public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  dream_selection_id uuid references public.dream_selections(id) on delete set null,
  round_type text not null,              -- 'HR' | 'Technical' | 'System Design' | 'Behavioral'
  interview_mode text not null,          -- 'voice' | 'video_static_avatar' | 'video_ai_avatar'
  status text not null default 'in_progress', -- 'in_progress' | 'completed' | 'abandoned'
  started_at timestamptz default now(),
  completed_at timestamptz,
  audio_recording_url text,
  video_recording_url text,
  transcript text,
  fraud_flag boolean default false,      -- premium: eye-tracking/behavior alert
  fraud_notes text
);

create index idx_interview_sessions_user_id on public.interview_sessions(user_id);


-- =====================================================================
-- 8. INTERVIEW SCORES (many metrics per session)
-- =====================================================================

create table public.interview_scores (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions(id) on delete cascade,
  metric_name text not null,           -- 'Communication' | 'Confidence' | 'Technical Depth' etc.
  score numeric(5,2) not null,
  max_score numeric(5,2) not null default 10,
  feedback text,
  created_at timestamptz default now()
);

create index idx_interview_scores_session_id on public.interview_scores(session_id);


-- =====================================================================
-- 9. PAYMENTS (Instamojo transaction log)
-- =====================================================================

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid references public.subscription_plans(id),
  instamojo_payment_id text unique,
  amount numeric(10,2) not null,
  status text not null default 'pending', -- 'pending' | 'success' | 'failed' | 'refunded'
  raw_response jsonb,
  created_at timestamptz default now()
);

create index idx_payments_user_id on public.payments(user_id);


-- =====================================================================
-- 10. EMAIL LOGS (confirms scoreboard emails actually sent)
-- =====================================================================

create table public.email_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid references public.interview_sessions(id) on delete set null,
  email_type text not null,            -- 'scoreboard' | 'welcome' | 'payment_receipt'
  recipient_email text not null,
  status text not null default 'sent', -- 'sent' | 'failed'
  sent_at timestamptz default now()
);

create index idx_email_logs_user_id on public.email_logs(user_id);


-- =====================================================================
-- 11. CONTACT / ENQUIRY FORM SUBMISSIONS (hello@prepvida.in)
-- =====================================================================

create table public.contact_enquiries (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  message text not null,
  status text not null default 'new',  -- 'new' | 'responded' | 'closed'
  created_at timestamptz default now()
);


-- =====================================================================
-- 12. ROW LEVEL SECURITY (RLS)
-- Ensures every user only ever sees/edits their own data.
-- =====================================================================

alter table public.profiles enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.companies enable row level security;
alter table public.roles enable row level security;
alter table public.dream_selections enable row level security;
alter table public.interview_sessions enable row level security;
alter table public.interview_scores enable row level security;
alter table public.payments enable row level security;
alter table public.email_logs enable row level security;
alter table public.contact_enquiries enable row level security;

-- Profiles
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- Subscription plans: public read for pricing page
create policy "Anyone can view active plans" on public.subscription_plans
  for select using (is_active = true);

-- User subscriptions
create policy "Users can view own subscription" on public.user_subscriptions
  for select using (auth.uid() = user_id);

-- Companies & roles: public read for selection page
create policy "Anyone can view active companies" on public.companies
  for select using (is_active = true);
create policy "Anyone can view active roles" on public.roles
  for select using (is_active = true);

-- Dream selections
create policy "Users can view own dream selections" on public.dream_selections
  for select using (auth.uid() = user_id);
create policy "Users can insert own dream selections" on public.dream_selections
  for insert with check (auth.uid() = user_id);
create policy "Users can update own dream selections" on public.dream_selections
  for update using (auth.uid() = user_id);

-- Interview sessions
create policy "Users can view own sessions" on public.interview_sessions
  for select using (auth.uid() = user_id);
create policy "Users can insert own sessions" on public.interview_sessions
  for insert with check (auth.uid() = user_id);
create policy "Users can update own sessions" on public.interview_sessions
  for update using (auth.uid() = user_id);

-- Interview scores (via parent session ownership)
create policy "Users can view own scores" on public.interview_scores
  for select using (
    exists (
      select 1 from public.interview_sessions s
      where s.id = interview_scores.session_id
      and s.user_id = auth.uid()
    )
  );

-- Payments
create policy "Users can view own payments" on public.payments
  for select using (auth.uid() = user_id);

-- Email logs
create policy "Users can view own email logs" on public.email_logs
  for select using (auth.uid() = user_id);

-- Contact enquiries: anyone (even logged-out visitors) can submit
create policy "Anyone can submit an enquiry" on public.contact_enquiries
  for insert with check (true);


-- =====================================================================
-- 13. SEED DATA — starter pricing plans (edit freely)
-- =====================================================================

insert into public.subscription_plans
  (name, description, price, billing_cycle, interview_mode, interview_credits, features)
values
  ('Basic', 'Voice-to-voice AI mock interviews', 699, 'monthly', 'voice', 4,
    '["Voice-to-Voice AI Interview", "4 Interviews", "Auto-emailed Scoreboard"]'),
  ('Pro', 'Video-to-video with webcam or static avatar', 899, 'monthly', 'video_static_avatar', 3,
    '["Video-to-Video Interview", "Webcam or Static Avatar", "3 Interviews", "Auto-emailed Scoreboard", "Text-to-Speech Audio Download"]'),
  ('Premium', 'Video-to-video with AI avatar and behavior monitoring', 1099, 'monthly', 'video_ai_avatar', 3,
    '["Video-to-Video with AI Avatar", "Webcam Behavior Monitoring", "Eye Tracking Fraud Alerts", "3 Interviews", "Video Download", "Auto-emailed Scorecard"]');

-- Seed a few starter companies (add unlimited more anytime via dashboard/admin panel)
insert into public.companies (name) values
  ('Google'), ('Amazon'), ('Microsoft'), ('TCS'), ('Infosys'), ('Accenture');
