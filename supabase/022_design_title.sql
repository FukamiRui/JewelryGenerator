-- =========================================================
-- Add an optional, shop-editable title to designs so History can show
-- something more useful than the customer_name field (which is often
-- empty for personal-workbench designs) and so a design can be renamed
-- independently of who it was made for.
-- =========================================================

alter table public.designs
  add column title text;
