alter table public.subscription_plans
  add column if not exists year_level text default 'final',
  add column if not exists max_duration_minutes int default 20;

alter table public.dream_selections
  add column if not exists year_level text default 'final';

update public.subscription_plans set year_level = 'final', max_duration_minutes = 20,
  description = 'Full placement-ready voice practice'
  where name = 'Basic';
update public.subscription_plans set year_level = 'final', max_duration_minutes = 20,
  description = 'Full placement-ready voice practice with audio download'
  where name = 'Pro';
update public.subscription_plans set year_level = 'final', max_duration_minutes = 20,
  description = 'Full placement-ready video practice with behavior monitoring'
  where name = 'Premium';

insert into public.subscription_plans
  (name, description, price, billing_cycle, interview_mode, interview_credits, year_level, max_duration_minutes, features)
values
  ('Basic', 'Early-years voice practice', 399, 'monthly', 'voice', 4, 'early', 10,
    '["Voice-to-Voice AI Interview", "4 Interviews", "10-min Sessions", "Auto-emailed Scoreboard"]'),
  ('Pro', 'Early-years voice practice with audio download', 549, 'monthly', 'voice', 3, 'early', 10,
    '["Voice-to-Voice AI Interview", "3 Interviews", "10-min Sessions", "Auto-emailed Scoreboard", "Audio Download"]'),
  ('Premium', 'Early-years video practice with behavior monitoring', 699, 'monthly', 'video_ai_avatar', 3, 'early', 10,
    '["Video-to-Video Interview", "3 Interviews", "10-min Sessions", "Behavior Monitoring", "Video Download", "Auto-emailed Scoreboard"]'),

  ('Basic', 'Pre-final year voice practice', 599, 'monthly', 'voice', 4, 'prefinal', 15,
    '["Voice-to-Voice AI Interview", "4 Interviews", "15-min Sessions", "Auto-emailed Scoreboard"]'),
  ('Pro', 'Pre-final year voice practice with audio download', 749, 'monthly', 'voice', 3, 'prefinal', 15,
    '["Voice-to-Voice AI Interview", "3 Interviews", "15-min Sessions", "Auto-emailed Scoreboard", "Audio Download"]'),
  ('Premium', 'Pre-final year video practice with behavior monitoring', 949, 'monthly', 'video_ai_avatar', 3, 'prefinal', 15,
    '["Video-to-Video Interview", "3 Interviews", "15-min Sessions", "Behavior Monitoring", "Video Download", "Auto-emailed Scoreboard"]');
