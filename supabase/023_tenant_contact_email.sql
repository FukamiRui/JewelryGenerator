-- Optional public contact email for a shop's profile — separate from the
-- account's login email (auth.users), and separate from the in-chat
-- contact-info filter (content-filter.ts), which blocks exchanging contact
-- details *inside a conversation* to keep deals on-platform. A shop
-- publishing a general inquiries address on its own public page is a
-- normal thing a business does; it isn't a customer/shop bypassing the
-- platform mid-transaction.

alter table public.tenants
  add column contact_email text;
