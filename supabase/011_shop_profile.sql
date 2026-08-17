-- Shop-facing profile fields. `bio` and `logo_url` already existed in the
-- schema (001/007) but were never editable from the app — this migration
-- adds the rest of what a shop needs for a real public profile, and the
-- app-layer changes in this same change finally make all of them editable.

alter table public.tenants
  add column cover_image_url    text,
  add column location           text,
  add column specialty_materials text[] not null default '{}';

comment on column public.tenants.cover_image_url is 'Banner/cover photo shown at the top of the public shop profile.';
comment on column public.tenants.location is 'Free-text base location (e.g. "Tokyo, Japan") — shown on the profile and filterable in the shop directory.';
comment on column public.tenants.specialty_materials is 'Free-text tags for materials this shop is known for (e.g. "Platinum", "Sapphire") — shown on the profile and filterable in the shop directory.';

create index idx_tenants_specialty_materials on public.tenants using gin (specialty_materials);
