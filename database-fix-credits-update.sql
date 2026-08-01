-- =====================================================================
-- FIX: allow students to update their own subscription row
-- (needed so interview credit deduction actually saves)
-- Run this once in Supabase SQL Editor.
-- =====================================================================

create policy "Users can update own subscription" on public.user_subscriptions
  for update using (auth.uid() = user_id);
