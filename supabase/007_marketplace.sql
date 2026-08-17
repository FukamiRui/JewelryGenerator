-- =========================================================
-- Marketplace expansion: Customers, Chat, Reviews, Portfolio,
-- Orders/Payments (Stripe Connect), Reports, Favorites
-- =========================================================

create table public.customers (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger trg_customers_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

alter table public.tenants
  add column bio                       text,
  add column is_public                 boolean not null default true,
  add column stripe_connect_account_id text,
  add column stripe_charges_enabled    boolean not null default false,
  add column min_seconds_between_generations   integer not null default 30,
  add column max_generations_per_conversation_per_day integer not null default 10,
  add column max_daily_credit_share_per_customer_pct numeric(5,2) not null default 20.00;

create table public.portfolio_items (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  design_id     uuid references public.designs(id) on delete set null,
  image_url     text not null,
  caption       text,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

create index idx_portfolio_items_tenant on public.portfolio_items (tenant_id, sort_order);

create table public.conversations (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.customers(user_id) on delete cascade,
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  status       text not null default 'open' check (status in ('open', 'closed')),
  created_at   timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create unique index idx_conversations_customer_tenant on public.conversations (customer_id, tenant_id);
create index idx_conversations_tenant on public.conversations (tenant_id, last_message_at desc);
create index idx_conversations_customer on public.conversations (customer_id, last_message_at desc);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_type     text not null check (sender_type in ('customer', 'shop')),
  sender_id       uuid not null,
  body            text,
  design_id       uuid references public.designs(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index idx_messages_conversation on public.messages (conversation_id, created_at);

create or replace function public.touch_conversation_last_message()
returns trigger as $$
begin
  update public.conversations
  set last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$ language plpgsql;

create trigger trg_messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation_last_message();

create table public.orders (
  id                    uuid primary key default gen_random_uuid(),
  conversation_id       uuid not null references public.conversations(id) on delete cascade,
  customer_id           uuid not null references public.customers(user_id),
  tenant_id             uuid not null references public.tenants(id),
  design_id             uuid references public.designs(id),
  fulfillment_type      text not null check (fulfillment_type in ('shop_visit', 'online_payment')),
  status                text not null default 'proposed'
                          check (status in ('proposed', 'confirmed', 'in_progress', 'ready', 'completed', 'cancelled')),
  proposed_datetime     timestamptz,
  appointment_note      text,
  amount_usd            numeric(12, 2),
  platform_fee_usd      numeric(12, 2),
  stripe_payment_intent_id text,
  stripe_transfer_id       text,
  paid_at               timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

create index idx_orders_conversation on public.orders (conversation_id);
create index idx_orders_tenant on public.orders (tenant_id, status);
create index idx_orders_customer on public.orders (customer_id, status);

create table public.reviews (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null unique references public.orders(id) on delete cascade,
  customer_id  uuid not null references public.customers(user_id),
  tenant_id    uuid not null references public.tenants(id),
  rating       integer not null check (rating between 1 and 5),
  comment      text,
  created_at   timestamptz not null default now()
);

create index idx_reviews_tenant on public.reviews (tenant_id, created_at desc);

create table public.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_type    text not null check (reporter_type in ('customer', 'shop')),
  reporter_id      uuid not null,
  conversation_id  uuid references public.conversations(id) on delete cascade,
  message_id       uuid references public.messages(id) on delete cascade,
  reason           text not null,
  details          text,
  status           text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at       timestamptz not null default now()
);

create index idx_reports_status on public.reports (status, created_at desc);

create table public.favorites (
  customer_id uuid not null references public.customers(user_id) on delete cascade,
  design_id   uuid not null references public.designs(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (customer_id, design_id)
);

alter table public.customers enable row level security;
alter table public.portfolio_items enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.orders enable row level security;
alter table public.reviews enable row level security;
alter table public.reports enable row level security;
alter table public.favorites enable row level security;

create policy customers_select_own
  on public.customers for select
  using (user_id = auth.uid());

create policy customers_update_own
  on public.customers for update
  using (user_id = auth.uid());

create policy portfolio_items_select_public
  on public.portfolio_items for select
  using (true);

create policy portfolio_items_modify_own
  on public.portfolio_items for all
  using (tenant_id in (select tenant_id from public.tenant_members where user_id = auth.uid()))
  with check (tenant_id in (select tenant_id from public.tenant_members where user_id = auth.uid()));

create policy conversations_select_participant
  on public.conversations for select
  using (
    customer_id = auth.uid()
    or tenant_id in (select tenant_id from public.tenant_members where user_id = auth.uid())
  );

create policy conversations_insert_customer
  on public.conversations for insert
  with check (customer_id = auth.uid());

create policy conversations_update_participant
  on public.conversations for update
  using (
    customer_id = auth.uid()
    or tenant_id in (select tenant_id from public.tenant_members where user_id = auth.uid())
  );

create policy messages_select_participant
  on public.messages for select
  using (
    conversation_id in (
      select id from public.conversations
      where customer_id = auth.uid()
         or tenant_id in (select tenant_id from public.tenant_members where user_id = auth.uid())
    )
  );

create policy messages_insert_participant
  on public.messages for insert
  with check (
    conversation_id in (
      select id from public.conversations
      where customer_id = auth.uid()
         or tenant_id in (select tenant_id from public.tenant_members where user_id = auth.uid())
    )
  );

create policy orders_select_participant
  on public.orders for select
  using (
    customer_id = auth.uid()
    or tenant_id in (select tenant_id from public.tenant_members where user_id = auth.uid())
  );

create policy orders_modify_participant
  on public.orders for all
  using (
    customer_id = auth.uid()
    or tenant_id in (select tenant_id from public.tenant_members where user_id = auth.uid())
  )
  with check (
    customer_id = auth.uid()
    or tenant_id in (select tenant_id from public.tenant_members where user_id = auth.uid())
  );

create policy reviews_select_public
  on public.reviews for select
  using (true);

create policy reviews_insert_customer
  on public.reviews for insert
  with check (customer_id = auth.uid());

create policy reports_select_own
  on public.reports for select
  using (reporter_id = auth.uid());

create policy reports_insert_own
  on public.reports for insert
  with check (reporter_id = auth.uid());

create policy favorites_all_own
  on public.favorites for all
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid());
