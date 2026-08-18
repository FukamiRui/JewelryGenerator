-- =========================================================
-- Fix: reset_monthly_credits() failed with "UPDATE requires a WHERE
-- clause" — this Supabase project has an UPDATE/DELETE-without-WHERE
-- guard enabled, and the function (originally migration 004, extended in
-- 020 to also reset monthly_credit_limit) never had one. Caught by
-- actually invoking the RPC directly rather than just reading the SQL —
-- it silently would have made POST /api/cron/reset-credits fail every
-- time it ran, so no shop's credits_used_this_month (or, after 020,
-- monthly_credit_limit) has ever actually been reset by the monthly cron.
-- `where true` is intentional: this function really does mean to touch
-- every tenant row.
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
    monthly_credit_limit = case when subscription_status = 'active' then 300 else 4 end
  where true;
$$;
