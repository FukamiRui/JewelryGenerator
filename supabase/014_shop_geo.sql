-- Real coordinates for distance-based sorting ("shops near me"), separate
-- from the existing free-text `location` field (which stays for display /
-- the text-search filter — e.g. "Tokyo, Japan" isn't precise enough to sort
-- by distance on its own). Captured via the browser's Geolocation API on
-- both the shop-settings side and the customer-directory side — no
-- geocoding service involved, so this only works when both parties opt in
-- to sharing their device location.

alter table public.tenants
  add column latitude  double precision,
  add column longitude double precision;

comment on column public.tenants.latitude is 'Shop location latitude, captured via browser geolocation in Settings. Null if the shop has not set it.';
comment on column public.tenants.longitude is 'Shop location longitude, captured via browser geolocation in Settings. Null if the shop has not set it.';

create index idx_tenants_geo on public.tenants (latitude, longitude) where latitude is not null and longitude is not null;
