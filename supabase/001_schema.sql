-- =========================================================
-- Jewelry AI SaaS — Supabase (PostgreSQL) Schema
-- =========================================================
-- Notes:
--   - All identifiers, comments, and enum values are in English.
--   - Multi-tenant design: every business table has tenant_id.
--   - System-wide defaults (tenant_id IS NULL) are visible to all
--     tenants as "base" categories/materials they can inherit or override.
--   - Row Level Security (RLS) is enabled so each tenant only sees
--     its own rows (plus the shared NULL-tenant system defaults).
-- =========================================================

create extension if not exists "pgcrypto"; -- for gen_random_uuid()

-- ---------------------------------------------------------
-- 1. tenants — store / brand accounts
-- ---------------------------------------------------------
create table public.tenants (
  id                        uuid primary key default gen_random_uuid(),
  company_name              text not null,
  plan                      text not null default 'standard'
                              check (plan in ('standard', 'pro', 'enterprise')),
  monthly_credit_limit      integer not null default 300,
  credits_used_this_month   integer not null default 0,
  billing_cycle_reset_at    date not null default date_trunc('month', now())::date,
  logo_url                  text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

comment on table public.tenants is 'Store/brand accounts and their subscription plan & credit usage.';

-- ---------------------------------------------------------
-- 2. categories — item type master (e.g. ring, necklace)
-- ---------------------------------------------------------
create table public.categories (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid references public.tenants(id) on delete cascade,
  -- tenant_id IS NULL => system-wide default category, visible to all tenants
  name                   text not null,                -- display name (e.g. "指輪")
  ai_prompt_tag          text not null,                 -- English tag for AI (e.g. "ring, fine jewelry")
  base_processing_cost   numeric(12, 2) not null default 0,
  sort_order             integer not null default 0,
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table public.categories is 'Item type master (ring, necklace, earring, anklet, etc). NULL tenant_id = system default.';

-- ---------------------------------------------------------
-- 3. materials — metal / gemstone / finish master
-- ---------------------------------------------------------
create table public.materials (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid references public.tenants(id) on delete cascade,
  -- tenant_id IS NULL => system-wide default material
  material_type             text not null
                               check (material_type in ('metal', 'gemstone', 'finish')),
  name                      text not null,               -- display name (e.g. "Pt950", "K18ローズゴールド")
  ai_prompt_tag             text not null,                -- detailed English tag for AI
  density                   numeric(8, 3),                 -- specific gravity (metals), used in weight estimate
  cost_per_gram_or_carat    numeric(12, 2),                -- base purchase cost per g (metal) or ct (gemstone)
  price_markup_ratio        numeric(6, 3) not null default 1.5, -- e.g. 1.5 = 50% markup
  is_active                 boolean not null default true,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

comment on table public.materials is 'Metal/gemstone/finish master. Core of the dynamic per-tenant customization.';

-- ---------------------------------------------------------
-- 4. designs — generated design & estimate history
-- ---------------------------------------------------------
create table public.designs (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null references public.tenants(id) on delete cascade,
  category_id               uuid not null references public.categories(id),
  customer_name              text,                          -- optional customer/カルテ association
  selected_materials_json    jsonb not null default '{}'::jsonb, -- chosen materials/size/stone combo params
  generated_prompt           text,                            -- final English prompt sent to FLUX
  generated_image_url        text,                            -- Supabase Storage URL
  calculated_price_jpy       numeric(14, 2),
  status                    text not null default 'completed'
                               check (status in ('pending', 'completed', 'failed')),
  share_token               uuid default gen_random_uuid(),   -- for public QR/URL sharing
  created_at                timestamptz not null default now()
);

comment on table public.designs is 'Generated design images, prompts, and calculated estimates (customer history).';

-- ---------------------------------------------------------
-- 5. gold_rates — hourly cached precious metal spot prices (JPY/gram)
-- ---------------------------------------------------------
create table public.gold_rates (
  id            uuid primary key default gen_random_uuid(),
  metal_code    text not null check (metal_code in ('XAU', 'XPT', 'XAG')), -- gold, platinum, silver
  price_jpy_per_gram numeric(12, 4) not null,
  fetched_at    timestamptz not null default now()
);

comment on table public.gold_rates is 'Hourly batch cache of precious metal spot prices, to avoid redundant Gold API calls.';

create index idx_gold_rates_metal_fetched on public.gold_rates (metal_code, fetched_at desc);

-- ---------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------
create index idx_categories_tenant on public.categories (tenant_id);
create index idx_materials_tenant on public.materials (tenant_id);
create index idx_materials_type on public.materials (material_type);
create index idx_designs_tenant on public.designs (tenant_id);
create index idx_designs_category on public.designs (category_id);
create index idx_designs_created_at on public.designs (created_at desc);
create unique index idx_designs_share_token on public.designs (share_token);

-- ---------------------------------------------------------
-- updated_at auto-touch trigger
-- ---------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_tenants_updated_at
  before update on public.tenants
  for each row execute function public.set_updated_at();

create trigger trg_categories_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create trigger trg_materials_updated_at
  before update on public.materials
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------
-- Assumes each authenticated user has a custom JWT claim `tenant_id`
-- (set via Supabase Auth hook / custom claims) identifying their store.

alter table public.tenants enable row level security;
alter table public.categories enable row level security;
alter table public.materials enable row level security;
alter table public.designs enable row level security;
alter table public.gold_rates enable row level security;

-- tenants: a user can only see/update their own tenant row
create policy tenants_select_own
  on public.tenants for select
  using (id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy tenants_update_own
  on public.tenants for update
  using (id = (auth.jwt() ->> 'tenant_id')::uuid);

-- categories: see system defaults (tenant_id IS NULL) + own tenant's rows
create policy categories_select_own_or_system
  on public.categories for select
  using (tenant_id is null or tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy categories_modify_own
  on public.categories for all
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- materials: same pattern as categories
create policy materials_select_own_or_system
  on public.materials for select
  using (tenant_id is null or tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy materials_modify_own
  on public.materials for all
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- designs: tenant can only see/manage its own designs
create policy designs_select_own
  on public.designs for select
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy designs_modify_own
  on public.designs for all
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- gold_rates: read-only reference data, visible to all authenticated users
create policy gold_rates_select_all
  on public.gold_rates for select
  using (true);

-- Note: INSERTs into gold_rates should be done by a service-role key
-- (the hourly batch job), not by tenant-scoped clients.
