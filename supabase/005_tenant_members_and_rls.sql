-- Replaces the "tenant_id via custom JWT claim" assumption from 001_schema.sql
-- with a standard membership table. This avoids needing Supabase Auth Hooks
-- (extra infra) to inject custom claims — auth.uid() alone is enough.

create table public.tenant_members (
  user_id    uuid not null references auth.users(id) on delete cascade,
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  role       text not null default 'owner' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  primary key (user_id, tenant_id)
);

alter table public.tenant_members enable row level security;

-- A user can see their own membership rows (needed so the server can resolve
-- "which tenant does this logged-in user belong to").
create policy tenant_members_select_own
  on public.tenant_members for select
  using (user_id = auth.uid());

-- Inserts/updates to tenant_members only happen via the service-role client
-- in /api/tenant/bootstrap, never directly from an authenticated client.

-- ---------------------------------------------------------
-- Drop the old claim-based policies from 001_schema.sql
-- ---------------------------------------------------------
drop policy if exists tenants_select_own on public.tenants;
drop policy if exists tenants_update_own on public.tenants;
drop policy if exists categories_select_own_or_system on public.categories;
drop policy if exists categories_modify_own on public.categories;
drop policy if exists materials_select_own_or_system on public.materials;
drop policy if exists materials_modify_own on public.materials;
drop policy if exists designs_select_own on public.designs;
drop policy if exists designs_modify_own on public.designs;

-- ---------------------------------------------------------
-- Recreate them keyed off tenant_members + auth.uid()
-- ---------------------------------------------------------
create policy tenants_select_own
  on public.tenants for select
  using (id in (select tenant_id from public.tenant_members where user_id = auth.uid()));

create policy tenants_update_own
  on public.tenants for update
  using (id in (select tenant_id from public.tenant_members where user_id = auth.uid()));

create policy categories_select_own_or_system
  on public.categories for select
  using (
    tenant_id is null
    or tenant_id in (select tenant_id from public.tenant_members where user_id = auth.uid())
  );

create policy categories_modify_own
  on public.categories for all
  using (tenant_id in (select tenant_id from public.tenant_members where user_id = auth.uid()))
  with check (tenant_id in (select tenant_id from public.tenant_members where user_id = auth.uid()));

create policy materials_select_own_or_system
  on public.materials for select
  using (
    tenant_id is null
    or tenant_id in (select tenant_id from public.tenant_members where user_id = auth.uid())
  );

create policy materials_modify_own
  on public.materials for all
  using (tenant_id in (select tenant_id from public.tenant_members where user_id = auth.uid()))
  with check (tenant_id in (select tenant_id from public.tenant_members where user_id = auth.uid()));

create policy designs_select_own
  on public.designs for select
  using (tenant_id in (select tenant_id from public.tenant_members where user_id = auth.uid()));

create policy designs_modify_own
  on public.designs for all
  using (tenant_id in (select tenant_id from public.tenant_members where user_id = auth.uid()))
  with check (tenant_id in (select tenant_id from public.tenant_members where user_id = auth.uid()));
