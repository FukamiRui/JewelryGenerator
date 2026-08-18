-- Shop-side mode selector: "For a customer" (existing behavior — tied to an
-- estimate/quote workflow) vs "For myself" (personal creative exploration,
-- no customer attached). Both use the same generation pipeline; this column
-- just distinguishes the two in History so a shop's own experiments don't
-- get mixed up with real customer estimates.

alter table public.designs
  add column is_personal boolean not null default false;

comment on column public.designs.is_personal is 'true when generated in "For myself" mode in the simulator — a personal exploration, not a customer estimate.';
