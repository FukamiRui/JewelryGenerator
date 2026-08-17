-- Resets every tenant's monthly credit usage. Called by the
-- /api/cron/reset-credits route on the 1st of each month, or can be
-- scheduled directly via pg_cron if the extension is available.

create or replace function public.reset_monthly_credits()
returns void
language sql
security definer
as $$
  update public.tenants
  set
    credits_used_this_month = 0,
    billing_cycle_reset_at = date_trunc('month', now())::date;
$$;

-- Optional: if pg_cron is enabled on your Supabase project, you can schedule
-- this directly in Postgres instead of (or in addition to) the HTTP route:
--
-- select cron.schedule(
--   'reset-monthly-credits',
--   '0 0 1 * *', -- 00:00 on day 1 of every month
--   $$ select public.reset_monthly_credits(); $$
-- );
