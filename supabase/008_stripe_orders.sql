-- =========================================================
-- Stripe Connect payment support for orders.
-- =========================================================
-- Fee model (destination-charge style, computed in lib/stripe.ts):
--   - `amount_usd` is the order's base price — what the shop is quoting for
--     the piece. This is what the shop nets *before* the platform's cut.
--   - `platform_fee_usd` = 5% of amount_usd. This is Stripe Connect's
--     `application_fee_amount` — platform revenue, deducted from the
--     transfer to the shop's connected account. The shop is never charged
--     more than this 5%, regardless of Stripe's own processing costs.
--   - `stripe_fee_usd` is the card-processing surcharge added on top of
--     amount_usd so the *customer* — not the shop or the platform — covers
--     Stripe's processing cost. It's informational (Stripe computes the
--     authoritative fee at charge time); stored here for receipts/reporting.
--   - `customer_charge_usd` = amount_usd + stripe_fee_usd, the actual total
--     charged to the customer's card via Stripe Checkout.
-- For `fulfillment_type = 'shop_visit'` orders (pay in person), none of the
-- Stripe columns are used — the shop collects payment offline.

alter table public.orders
  add column stripe_fee_usd       numeric(12, 2),
  add column customer_charge_usd  numeric(12, 2);

comment on column public.orders.amount_usd is 'Base order price quoted by the shop, before any fees.';
comment on column public.orders.platform_fee_usd is 'Platform''s 5% commission (Stripe application_fee_amount), taken from the shop''s payout.';
comment on column public.orders.stripe_fee_usd is 'Card-processing surcharge added to the customer''s charge to cover Stripe''s fee (informational).';
comment on column public.orders.customer_charge_usd is 'Total amount charged to the customer''s card (amount_usd + stripe_fee_usd).';
