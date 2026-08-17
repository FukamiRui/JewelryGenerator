-- Adds a deterministic hash of the selection (category + materials + weight)
-- so identical requests can reuse a previously generated image instead of
-- re-calling FLUX.

alter table public.designs
  add column selection_hash text;

create index idx_designs_tenant_hash on public.designs (tenant_id, selection_hash);

comment on column public.designs.selection_hash is
  'sha256 of the normalized selection (category_id + sorted material ids + rounded weight). Used to skip regeneration for identical requests.';

-- Storage bucket for generated images (run once in the Supabase dashboard or via API,
-- included here for reference — storage buckets aren't managed via plain SQL migrations
-- in all Supabase CLI setups):
--   supabase storage create-bucket design-images --public
