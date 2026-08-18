-- =========================================================
-- Optional credit top-up purchases ($1 -> 10 credits, $10 -> 100
-- credits — see CREDIT_PACKS in lib/credits.ts), on top of the
-- monthly free/subscription allowance.
--
-- A top-up is applied by incrementing tenants.monthly_credit_limit
-- directly (see handleCheckoutCompleted in the webhook route) rather
-- than a separate balance column, so every existing credit check
-- (`credits_used_this_month >= monthly_credit_limit`) needs no changes.
-- For that to behave like a *top-up for this billing period* rather
-- than a permanent limit increase, reset_monthly_credits() now also
-- resets monthly_credit_limit back to the plan's baseline (300 if the
-- subscription is active, 4 otherwise) on each monthly reset, instead
-- of only resetting credits_used_this_month.
-- =========================================================

create or replace function public.reset_monthly_credits()
returns void
language sql
security definer
as $$
  update public.tenants
  set
    credits_used_this_month = 0,
    billing_cycle_reset_at = date_trunc('month', now())::date,
    monthly_credit_limit = case when subscription_status = 'active' then 300 else 4 end;
$$;
