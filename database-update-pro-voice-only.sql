-- =====================================================================
-- UPDATE: Pro plan is voice-to-voice (not webcam video)
-- Run this in Supabase SQL Editor.
-- =====================================================================

update public.subscription_plans
set interview_mode = 'voice'
where name = 'Pro';
