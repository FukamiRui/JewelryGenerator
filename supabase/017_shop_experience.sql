alter table public.tenants
  add column founded_year integer;

comment on column public.tenants.founded_year is
  'Optional self-reported year the shop/craftsperson started working — shown as "N years in the craft" on the public shop profile. Nullable, no validation beyond a plausible range enforced in the API route.';
