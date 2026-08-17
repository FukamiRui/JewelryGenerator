-- =========================================================
-- Video posts for shop portfolios, and variable-cost credits
-- (video generation costs meaningfully more than an image, so
-- increment_credit_usage needs to accept an amount).
-- =========================================================

alter table public.portfolio_items
  alter column image_url drop not null,
  add column media_type text not null default 'image' check (media_type in ('image', 'video')),
  add column video_url text;

alter table public.portfolio_items
  add constraint portfolio_items_media_url_check check (
    (media_type = 'image' and image_url is not null) or
    (media_type = 'video' and video_url is not null)
  );

comment on column public.portfolio_items.media_type is 'image or video post.';
comment on column public.portfolio_items.video_url is 'Video file URL when media_type = video. image_url doubles as the poster/thumbnail when present (e.g. the source image an AI-generated video was animated from) — optional for a raw video upload with no source image.';

-- Postgres treats (uuid) and (uuid, integer) as distinct overloads, so
-- `create or replace` alone would leave the old single-arg function in
-- place alongside this one instead of replacing it. Drop it explicitly.
drop function if exists public.increment_credit_usage(uuid);

create or replace function public.increment_credit_usage(p_tenant_id uuid, p_amount integer default 1)
returns void
language sql
security definer
as $$
  update public.tenants
  set credits_used_this_month = credits_used_this_month + p_amount
  where id = p_tenant_id;
$$;

-- p_amount defaults to 1, so every existing caller (image generation) is
-- unaffected — only the new video-generation path passes an explicit
-- higher amount (see lib/fal-video.ts VIDEO_GENERATION_CREDIT_COST).
