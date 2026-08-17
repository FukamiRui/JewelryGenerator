-- =========================================================
-- SNS-style features for shops: follow, like/save/comment on
-- portfolio posts, and a boosted/featured-listing flag — all in
-- service of surfacing shops' work to more customers.
-- =========================================================

create table public.follows (
  customer_id uuid not null references public.customers(user_id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (customer_id, tenant_id)
);

create index idx_follows_tenant on public.follows (tenant_id);

create table public.portfolio_likes (
  customer_id       uuid not null references public.customers(user_id) on delete cascade,
  portfolio_item_id uuid not null references public.portfolio_items(id) on delete cascade,
  created_at        timestamptz not null default now(),
  primary key (customer_id, portfolio_item_id)
);

create index idx_portfolio_likes_item on public.portfolio_likes (portfolio_item_id);

create table public.portfolio_saves (
  customer_id       uuid not null references public.customers(user_id) on delete cascade,
  portfolio_item_id uuid not null references public.portfolio_items(id) on delete cascade,
  created_at        timestamptz not null default now(),
  primary key (customer_id, portfolio_item_id)
);

create index idx_portfolio_saves_item on public.portfolio_saves (portfolio_item_id);

create table public.portfolio_comments (
  id                uuid primary key default gen_random_uuid(),
  portfolio_item_id uuid not null references public.portfolio_items(id) on delete cascade,
  customer_id       uuid not null references public.customers(user_id) on delete cascade,
  body              text not null,
  created_at        timestamptz not null default now()
);

create index idx_portfolio_comments_item on public.portfolio_comments (portfolio_item_id, created_at);

-- Shops can boost their own post to rank higher in the feed for a limited
-- window (set by the app, e.g. 7 days from POST /api/portfolio/[id]/boost).
-- Free for now — see README "Known simplifications" for the no-payment-gate note.
alter table public.portfolio_items
  add column boost_expires_at timestamptz;

create index idx_portfolio_items_boost on public.portfolio_items (boost_expires_at);

alter table public.follows enable row level security;
alter table public.portfolio_likes enable row level security;
alter table public.portfolio_saves enable row level security;
alter table public.portfolio_comments enable row level security;

create policy follows_select_own
  on public.follows for select
  using (
    customer_id = auth.uid()
    or tenant_id in (select tenant_id from public.tenant_members where user_id = auth.uid())
  );

create policy follows_modify_own
  on public.follows for all
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid());

create policy portfolio_likes_select_public
  on public.portfolio_likes for select
  using (true);

create policy portfolio_likes_modify_own
  on public.portfolio_likes for all
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid());

create policy portfolio_saves_select_own
  on public.portfolio_saves for select
  using (customer_id = auth.uid());

create policy portfolio_saves_modify_own
  on public.portfolio_saves for all
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid());

create policy portfolio_comments_select_public
  on public.portfolio_comments for select
  using (true);

create policy portfolio_comments_insert_own
  on public.portfolio_comments for insert
  with check (customer_id = auth.uid());

create policy portfolio_comments_delete_own
  on public.portfolio_comments for delete
  using (customer_id = auth.uid());
