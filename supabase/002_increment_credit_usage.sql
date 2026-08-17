-- Atomic credit usage increment, called via service-role RPC after each
-- successful design generation. Using a function avoids a read-then-write
-- race condition under concurrent requests from the same tenant.

create or replace function public.increment_credit_usage(p_tenant_id uuid)
returns void
language sql
security definer
as $$
  update public.tenants
  set credits_used_this_month = credits_used_this_month + 1
  where id = p_tenant_id;
$$;

-- security definer means this runs with the function owner's privileges,
-- bypassing RLS — safe here because it's only ever called via the
-- service-role client from a trusted server route, and it only ever
-- touches the single tenant_id passed in.
