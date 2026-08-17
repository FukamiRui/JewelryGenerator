-- =========================================================
-- Returns policy badge + customer identity-verification badge
-- =========================================================

-- Returns policy — shown as a badge on the shop profile, directory, and
-- order cards (relevant right at the purchase decision).
alter table public.tenants
  add column returns_accepted   boolean not null default false,
  add column return_policy_note text;

comment on column public.tenants.returns_accepted is 'Whether this shop accepts returns — shown as a badge on the shop profile/directory and order cards.';
comment on column public.tenants.return_policy_note is 'Optional free-text detail on the return policy (e.g. "14 days, unworn only").';

-- Customer identity verification — mirrors auth.users.email_confirmed_at so
-- shops can see a "Verified" badge without an admin API call on every read.
-- Kept in sync going forward by the trigger below; app/api/customer/bootstrap
-- also sets it directly at profile-creation time (the trigger's UPDATE is a
-- no-op before the customers row exists, e.g. right after signup).
alter table public.customers
  add column email_verified boolean not null default false;

create or replace function public.sync_customer_email_verified()
returns trigger as $$
begin
  update public.customers
  set email_verified = (new.email_confirmed_at is not null)
  where user_id = new.id;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_sync_customer_email_verified
  after insert or update of email_confirmed_at on auth.users
  for each row execute function public.sync_customer_email_verified();

-- Backfill existing customers.
update public.customers c
set email_verified = (u.email_confirmed_at is not null)
from auth.users u
where u.id = c.user_id;
