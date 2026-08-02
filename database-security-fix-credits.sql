-- =====================================================================
-- CRITICAL SECURITY FIX
-- Currently, any logged-in student can open their browser console and
-- directly UPDATE their own user_subscriptions row to set unlimited
-- credits or upgrade their own plan for free. This closes that hole.
-- Run this in Supabase SQL Editor.
-- =====================================================================

-- 1. Remove the old, unrestricted update policy
drop policy if exists "Users can update own subscription" on public.user_subscriptions;

-- Students can now only VIEW their subscription — never edit it directly.
-- (The earlier "Users can view own subscription" policy already covers this.)

-- 2. Create a protected function that safely deducts exactly one credit.
-- This runs with elevated privileges (security definer) but still checks
-- that the caller owns the row and that credits are actually available —
-- so it can't be abused to grant free credits.
create or replace function public.deduct_interview_credit(subscription_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  rows_updated int;
begin
  update public.user_subscriptions
  set credits_remaining = credits_remaining - 1
  where id = subscription_id
    and user_id = auth.uid()   -- can only touch your own subscription
    and credits_remaining > 0; -- can never go below zero

  get diagnostics rows_updated = row_count;
  return rows_updated > 0;
end;
$$;

-- Allow logged-in users to call this specific function (but not edit
-- the table directly — that door is now closed).
grant execute on function public.deduct_interview_credit(uuid) to authenticated;
