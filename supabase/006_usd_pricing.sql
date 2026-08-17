-- Switches the app's pricing currency from JPY to USD. This only renames
-- columns (data is preserved) — the app-layer code that reads/writes these
-- values (lib/gold-api.ts, lib/pricing.ts, and every API route touching
-- prices) was updated in the same change to use USD throughout.
--
-- IMPORTANT: existing rows in `designs.calculated_price_usd` (previously
-- `calculated_price_jpy`) and `gold_rates.price_usd_per_gram` (previously
-- `price_jpy_per_gram`) still hold JPY-denominated numbers after this
-- migration runs — renaming a column does not convert the values. Historical
-- designs generated before this migration will display an incorrect (JPY)
-- number under the new $ symbol. If you need accurate historical figures,
-- either backfill-convert those rows using the JPY/USD rate at their
-- `created_at` / `fetched_at` timestamp, or accept that history before this
-- migration is JPY and everything after is USD.

alter table public.designs
  rename column calculated_price_jpy to calculated_price_usd;

alter table public.gold_rates
  rename column price_jpy_per_gram to price_usd_per_gram;
