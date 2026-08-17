-- Lets a shop post real portfolio highlights — not just designs generated in
-- this app. `caption` (existing column) doubles as the item's title;
-- `description` is the longer highlight text, `materials` is free-text on
-- what the piece is made of (no structured materials catalog link needed
-- for a portfolio post).

alter table public.portfolio_items
  add column description text,
  add column materials   text;

comment on column public.portfolio_items.caption is 'Short title/heading for this portfolio piece.';
comment on column public.portfolio_items.description is 'Longer highlight text about this piece.';
comment on column public.portfolio_items.materials is 'Free-text materials description (e.g. "18K gold, 0.5ct diamond").';
