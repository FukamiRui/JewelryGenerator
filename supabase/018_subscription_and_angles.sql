-- =========================================================
-- Platform subscription billing ($30/mo -> 300 credits, vs a free
-- tier at 4 credits/mo), and the "Generate 4 angles" multi-view feature.
-- =========================================================

-- stripe_customer_id / stripe_subscription_id here are on the PLATFORM's
-- own Stripe account (the shop paying US for the SaaS subscription) —
-- distinct from tenants.stripe_connect_account_id (the shop's own Connect
-- Express account, used to pay THE SHOP for customer orders). Two separate
-- Stripe relationships on the same tenant row.
alter table public.tenants
  add column subscription_status text not null default 'free'
    check (subscription_status in ('free', 'active', 'past_due', 'canceled')),
  add column stripe_customer_id text,
  add column stripe_subscription_id text;

comment on column public.tenants.subscription_status is
  'Platform subscription state: free (4 credits/mo, generated images watermarked) or active (paid $30/mo, 300 credits/mo, no watermark). past_due/canceled behave like free until payment recovers or the shop resubscribes.';
comment on column public.tenants.stripe_customer_id is
  'Platform-side Stripe Customer id (the shop paying the platform for its subscription) — not the Connect account id used to pay the shop.';
comment on column public.tenants.stripe_subscription_id is
  'Active Stripe Subscription id for the $30/mo plan, if subscribed.';

-- New signups start on the free tier; existing tenants keep whatever
-- monthly_credit_limit they already have (no backfill — this only changes
-- the default applied to future inserts).
alter table public.tenants
  alter column monthly_credit_limit set default 4;

-- "Generate 4 angles": takes an existing generated design and produces
-- front/side/diagonal/bottom views of the same piece as 4 new design rows
-- sharing one angle_set_id, for one bundled credit cost (see
-- MULTI_ANGLE_CREDIT_COST in lib/credits.ts) instead of 4x the normal cost.
alter table public.designs
  add column angle text check (angle in ('front', 'side', 'diagonal', 'bottom')),
  add column angle_set_id uuid;

comment on column public.designs.angle is
  'Which angle this design row is, when it was generated as part of a "Generate 4 angles" set. NULL for ordinary single-view designs.';
comment on column public.designs.angle_set_id is
  'Groups the 4 rows generated together from one "Generate 4 angles" request. NULL for ordinary single-view designs.';

create index idx_designs_angle_set on public.designs (angle_set_id) where angle_set_id is not null;
