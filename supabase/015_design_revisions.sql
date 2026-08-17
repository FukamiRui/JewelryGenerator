-- =========================================================
-- Per-request revision cap for online (chat) design generation.
-- =========================================================
-- Separate from the existing rate-limit columns (007) — those throttle
-- spammy/rapid-fire generation; this caps how many times a customer can
-- regenerate while chasing "the one" design before it becomes a shop
-- judgment call, per the product intent: unlimited free regeneration
-- either burns the shop's credits forever or leaves the customer stuck
-- with no path forward once they're unhappy.

alter table public.tenants
  add column max_design_revisions integer not null default 3
    check (max_design_revisions between 1 and 5);

comment on column public.tenants.max_design_revisions is 'Max self-service design generations per revision cycle in chat (1-5, shop-configurable). See lib/design-revisions.ts.';

alter table public.conversations
  add column revision_grant_at timestamptz;

comment on column public.conversations.revision_grant_at is 'Set by the shop (POST /api/conversations/[id]/grant-revisions) to reset the customer''s revision count for this conversation once they''ve hit max_design_revisions.';
