# Jewelry AI SaaS

A jewelry design simulator, master-data manager, and estimate/history tool for
jewelry stores — Next.js (App Router) + Supabase + Claude + FLUX.1 [pro].

## Setup

1. `npm install`
2. Copy `.env.example` → `.env.local`, fill in real keys (Supabase, Anthropic, fal.ai,
   goldapi.io, Stripe).
3. Run the SQL migrations against your Supabase project, **in order**:
   `001_schema.sql` → `002_increment_credit_usage.sql` → `003_selection_hash.sql` →
   `004_reset_monthly_credits.sql` → `005_tenant_members_and_rls.sql` →
   `006_usd_pricing.sql` → `007_marketplace.sql` → `008_stripe_orders.sql` →
   `009_portfolio_details.sql` → `010_trust_and_policy.sql` → `011_shop_profile.sql` →
   `012_social_feed.sql` → `013_video_posts.sql` → `014_shop_geo.sql` →
   `015_design_revisions.sql`
   (`005` is the one that matters most for auth: it moves tenant scoping off a
   custom JWT claim and onto a real `tenant_members` table keyed by
   `auth.uid()`, which is what the app actually uses — see **Auth model**
   below. `007`/`008` add the Shop/Customer marketplace: chat, orders, and
   Stripe Connect payment fields — see **Payments** below.)
4. In the Supabase dashboard, enable **Email** auth (Authentication → Providers).
   Turn off "Confirm email" while developing locally, or the sign-up flow will
   require clicking an email link before the account is usable.
5. Create a **public** Storage bucket named `design-images` (Storage → New bucket).
6. Create a [Stripe](https://dashboard.stripe.com) account (test mode is fine for
   development) and enable **Connect** (Connect → Get started → Express accounts).
7. `npm run dev`, open `http://localhost:3000` → redirects to `/login`.
8. Sign up with a store name — this creates a `tenants` row and links your user
   to it via `tenant_members`, then drops you into the simulator. From
   **Settings**, click "Connect Stripe" to complete Express onboarding (use
   [Stripe's test onboarding data](https://stripe.com/docs/connect/testing) in
   test mode) before customers can pay online.
9. Point a Stripe webhook at `POST /api/stripe/webhook` (use the
   [Stripe CLI](https://stripe.com/docs/stripe-cli) — `stripe listen --forward-to
   localhost:3000/api/stripe/webhook` — for local dev) listening for
   `checkout.session.completed` and `account.updated`. Copy the signing secret
   it prints into `STRIPE_WEBHOOK_SECRET`.
10. Schedule two cron jobs (Vercel Cron / Supabase scheduled Edge Function), each
    sending header `x-cron-secret: <CRON_SECRET>`:
    - `POST /api/gold-rate/refresh` — hourly (spot prices won't exist until this
      runs at least once; the simulator will show a clear "not available yet"
      error until then, not a silent $0)
    - `POST /api/cron/reset-credits` — monthly, 1st at 00:00

## Auth model

Every protected API route calls `requireTenant(req)` (`lib/supabase.ts`), which:
1. Reads the `Authorization: Bearer <access_token>` header.
2. Verifies it against Supabase Auth (`auth.getUser()`).
3. Looks up the caller's `tenant_id` from `tenant_members` — **never** from the
   request body.

This means a client can no longer read or write another store's data by
editing a `tenant_id` field in a request — the old `001_schema.sql` design
(trusting a `tenant_id` claim or body field) had that hole; `005` closes it.
`middleware.ts` handles the browser side: it redirects signed-out visitors away
from `/simulator`, `/materials`, `/history`, `/messages`, `/portfolio`,
`/settings` to `/login`, and signed-in visitors away from `/login`. The
equivalent customer-side redirect covers `/customer/messages` → `/customer/login`.
`requireCustomer(req)` is the customer-side equivalent of `requireTenant`,
resolving the caller's `customers` row instead of a tenant.

## Payments (Stripe Connect)

Orders are proposed by a shop from within a chat conversation
(`POST /api/orders`), for either an in-store visit (`fulfillment_type:
"shop_visit"`, no online payment) or online payment
(`fulfillment_type: "online_payment"`).

**Fee model** (`lib/stripe.ts`, `computeOrderFees`): the shop quotes
`amount_usd`. The platform takes a flat 5% commission (`platform_fee_usd`,
Stripe Connect's `application_fee_amount`) out of that quote — the shop always
nets `amount_usd * 0.95`, full stop. Stripe's own card-processing fee is
**not** taken from the shop or the platform's cut — it's added on top of what
the *customer* is charged (`stripe_fee_usd`, `customer_charge_usd` — see the
comment in `008_stripe_orders.sql` for the gross-up derivation). This is
implemented as a Stripe Checkout **destination charge**
(`POST /api/orders/[id]/checkout`): the charge is created on the platform's
account with `transfer_data.destination` set to the shop's connected account
and `application_fee_amount` covering both the platform's cut and Stripe's fee,
so the connected account receives exactly `amount_usd - platform_fee_usd`
regardless of card network/processing cost.

`POST /api/stripe/webhook` verifies the Stripe signature and:
- `checkout.session.completed` → marks the order `confirmed`, sets `paid_at`
  and `stripe_payment_intent_id` (looked up via the session's `order_id`
  metadata, matched idempotently — a retry can't double-process it).
- `account.updated` → syncs `tenants.stripe_charges_enabled`, which gates
  whether a shop can be paid online at all (checked in the checkout route).

Order status moves `proposed → confirmed → in_progress → ready → completed`
(shop-driven via `PATCH /api/orders/[id]` `{ action: "advance" }`, except the
`proposed → confirmed` step for `shop_visit` orders, which is a customer
`{ action: "confirm" }`; `online_payment` orders instead move to `confirmed`
automatically via the webhook once paid). Either side can `{ action: "cancel"
}` while still `proposed` — see **Known simplifications** for why cancellation
isn't available once an order is paid/confirmed.

## Portfolio & trust signals

Shops post portfolio highlights from **Settings → Portfolio**
(`app/(dashboard)/portfolio`), either by uploading a real photo (JPEG/PNG/WebP,
≤8MB, stored under `portfolio/{tenant_id}/…` in the `design-images` bucket —
see `uploadPortfolioImage` in `lib/image-cache.ts`) with a title, materials,
and description, or by pulling an existing generated design in one click. The
public shop page (`app/shops/[id]`) shows the grid; clicking a piece opens the
full detail (photo, title, materials, description).

Trust signals are computed/verified rather than self-declared where possible,
so they can't be gamed:
- **Shop verified badge** — shown whenever `tenants.stripe_charges_enabled` is
  true, i.e. the shop has completed Stripe's own identity verification via
  Express onboarding. Shown on the shop directory, shop profile, and in the
  chat header.
- **Customer verified badge** — mirrors Supabase Auth's own
  `email_confirmed_at` into `customers.email_verified` (migration `010`, kept
  in sync by a trigger on `auth.users` — see `sync_customer_email_verified`).
  Shown to the shop in the conversation list and chat header, so a shop knows
  they're talking to someone with a confirmed email before proposing an order.
- **Returns policy badge** — the one genuinely shop-declared field:
  `tenants.returns_accepted` (+ optional `return_policy_note`), set from
  **Settings**. Shown on the shop directory, shop profile, and on order cards
  in chat — customers see it right at the point of paying, not just buried in
  a bio.
- **Typical response time** — `lib/response-time.ts` walks each shop's
  message history (last 90 days) and averages the gap between a customer's
  message and the shop's next reply in that conversation, shown on the shop
  profile as "Typically responds within Xh".

`POST /api/reports` wires up the `reports` table (present in the schema since
`007` but previously unused): either side of a conversation can flag it with
a reason + optional details, available via the "Report" link in the chat
header. There's no admin review UI yet — see **Known simplifications**.

Conversation lists (`/messages` and `/customer/messages`) show an avatar,
the other party's verified badge, a last-message preview, and a relative
timestamp ("2h ago", via `lib/format.ts`) instead of a bare company/customer
name and raw date — the goal being to make it obvious at a glance which
conversation needs attention, on both the shop and customer side.

## Shop profile & directory

A shop edits its own public profile from **Settings → Shop profile**
(`app/(dashboard)/settings`): a circular logo and a cover/banner photo
(`POST /api/tenant/profile-image`, multipart, reuses the same upload
validation as portfolio photos — see `uploadShopProfileImage` in
`lib/image-cache.ts`, stored under `shop-profile-logo/{tenant_id}/` and
`shop-profile-cover/{tenant_id}/`), plus bio, free-text location, and a tag
list of specialty materials (all via `PATCH /api/tenant/me`). None of these
fields (`bio`, `logo_url`, `cover_image_url`, `location`,
`specialty_materials` — migration `011`) were actually editable from the app
before this, even though `bio`/`logo_url` existed in the schema since `001`/`007`.

The public directory (`app/shops`) renders shops as 2-column cards (cover
photo banner, circular avatar, verified/returns badges, star rating,
specialty tags) and supports combinable filters — search text, location
(free-text with autocomplete from `GET /api/shops`'s `filters.locations`),
specialty materials (multi-select from `filters.materials`, matched with a
Postgres array `overlaps`), verified-only, returns-accepted-only, and a
minimum-rating threshold. Rating is aggregated from `reviews` per request
(not a stored column), so the minimum-rating filter is applied in JS after
fetching up to 200 candidate shops, then capped to 50 results — see `GET
/api/shops` in `app/api/shops/route.ts`.

**"Sort by nearest"** (the "Shops" tab is meant to stay secondary to the
Feed/craftsperson-visibility side of the product — see below — but jewelry
commissions still often want someone local for consultations/fittings, so
distance matters) uses **only the browser's Geolocation API on both ends**,
no geocoding service: a shop pins its location once from **Settings → Shop
profile** ("📍 Use my current location", saved as `tenants.latitude`/
`longitude`, migration `014`, kept separate from the free-text `location`
field used for display/search), and a customer clicks "📍 Sort by nearest"
on the shop directory, which asks the browser for their position and passes
it as `lat`/`lng` to `GET /api/shops`. The route computes straight-line
(Haversine, `lib/geo.ts`) distance server-side for every shop that has
coordinates and sorts ascending; shops without a pinned location sort to
the end rather than being hidden. No address input or geocoding API
involved — a shop that hasn't opened Settings from its actual location
(or one that intentionally sets it elsewhere) just won't have a distance.

## Feed (SNS-style discovery)

The point of `app/feed` is to give shops/craftspeople a way to reach
customers who aren't already searching for them — an Instagram-style scroll
of portfolio posts across every shop, not just the person's own shop page.
Migration `012_social_feed.sql` adds the schema for it:

- **Follow** (`follows`) — a customer follows a shop from its profile page
  (`POST`/`DELETE /api/follows`). Drives the feed's **Following** tab
  (`GET /api/feed?mode=following`), which is just **Discover**
  (`mode=discover`, the default — every public shop's posts) filtered to the
  caller's followed `tenant_id`s.
- **Like / Save / Comment** (`portfolio_likes`, `portfolio_saves`,
  `portfolio_comments`) — one row per customer per portfolio item (like/save)
  or a comment thread per item. `GET /api/feed` and `GET
  /api/portfolio/[id]/comments` are public (comments and counts are visible
  to anyone), but acting (`POST`/`DELETE` on like/save, `POST` on comments)
  requires a customer session — `components/feed/FeedPost.tsx` redirects to
  `/customer/login?next=/feed` if a signed-out visitor taps one.
- **Boost** (`portfolio_items.boost_expires_at`) — a shop can boost one of
  its own posts from **Settings → Portfolio** for 7 days
  (`POST`/`DELETE /api/portfolio/[id]/boost`), which ranks it ahead of
  everything else in the feed while active. Capped at 3 concurrently-boosted
  posts per shop (`MAX_CONCURRENT_BOOSTS` in the boost route) so one shop
  can't fill the whole feed — see **Known simplifications** for why this is
  free rather than a paid tier.

`GET /api/feed`'s ranking is computed in JS, not SQL: it pulls up to 300
recent candidate posts (scoped to followed shops for the Following tab),
splits them into boosted (unexpired `boost_expires_at`) vs. the rest, puts
boosted first, and paginates the combined list with `offset`/`limit`. Same
bounded-scan tradeoff as the shop directory's rating filter — see **Known
simplifications**.

## Video posts & credit economics

The positioning here is deliberately not "another Etsy": the product's edge
is AI tooling that gets a shop/craftsperson *seen*, not just a storefront —
video is the sharpest version of that, so it's built as a premium, metered
feature on top of the same credit system that already gates image
generation, rather than a free unlimited upload.

`POST /api/portfolio/video` (`app/(dashboard)/portfolio` → "Post a video")
takes either path, both costing `VIDEO_GENERATION_CREDIT_COST` (10 credits —
`lib/credits.ts`) per post:
- **AI-generate** (`lib/fal-video.ts`) — animates a source image (an
  existing design or a fresh upload) into a short clip via fal.ai's
  image-to-video API (`generateJewelryVideo`, default model
  `fal-ai/kling-video/v2.1/standard/image-to-video`, overridable with
  `FAL_VIDEO_MODEL_ENDPOINT`), with a motion prompt (defaults to a slow
  360° product-rotation shot if left blank). The source image doubles as
  the video's poster/thumbnail.
- **Raw upload** — the shop's own edited video file (MP4/MOV/WebM, ≤50MB,
  `uploadPortfolioVideo` in `lib/image-cache.ts`). No poster image unless
  the shop also picks a source image — see **Known simplifications**.

`portfolio_items.media_type` (`'image' | 'video'`, migration `013`) drives
rendering everywhere a portfolio item shows up (feed, shop profile grid +
detail modal, portfolio management) — a `<video controls>` element instead
of `<Image>`. `increment_credit_usage` (the RPC every credit deduction goes
through) gained an optional `p_amount` parameter (default `1`, so existing
image-generation call sites are unaffected) so video's 10-credit cost and
image's 1-credit cost share the same accounting path.

## Design revision limits, the advisor, and in-store consultations

The original point of AI generation here isn't "get a finished product" —
it's giving a customer a fast way to show a craftsperson "something like
this" for a custom order, instead of a dozen back-and-forth text messages.
Unbounded free regeneration undermines that in two ways: it either burns
the shop's credits indefinitely, or leaves a customer stuck with no next
step once they're unhappy. So online (chat) generation is capped, with two
deliberate ways out once capped, plus an entirely separate in-store path
that isn't capped at all.

- **The cap** (`lib/design-revisions.ts`, migration `015`) —
  `tenants.max_design_revisions` (1–5, shop-configurable in **Settings →
  Design revisions**, default 3) counts the customer's design-generation
  messages in a conversation since the *later* of the conversation
  starting, the shop's last grant, or their most recent non-cancelled order
  (ordering means they settled on something — a future request should get
  a fresh count, not inherit the old one). `POST
  /api/conversations/[id]/generate` checks this before generating and
  `GET /api/conversations/[id]/revision-status` exposes it so
  `GeneratePanel` can show "N of M tries left" proactively, not just after
  a rejected request.
- **Way out #1 — the advisor** (`lib/design-advisor.ts`,
  `GET /api/conversations/[id]/advice`): once capped, `GeneratePanel`
  swaps to an advisor view that asks Groq/Llama (the same provider
  `lib/claude-prompt.ts` already uses for FLUX prompts, despite that
  file's name — no Anthropic call exists anywhere in this codebase, so no
  new API key needed) for one concrete suggestion based on the prompts
  behind the customer's past attempts, falling back to a static tip if
  Groq is unreachable or nothing's been tried yet.
- **Way out #2 — reference-image generation** (FLUX.1 Kontext,
  `generateJewelryImageFromReference` in `lib/flux-image.ts`): the advisor
  also offers "upload a reference photo instead." `POST
  /api/conversations/[id]/generate-from-reference` takes an uploaded photo
  + the current material selection, generates a design guided by that
  image via fal.ai's Kontext model (verified request/response shape
  directly against fal.ai's docs before implementing), and — deliberately
  — is **not** gated by the revision cap (it's the escape hatch, not a way
  around the limit), though it still goes through the same
  `checkGenerationRateLimit` spam guard and credit check as ordinary
  generation.
- **Way out #3 — shop discretion**: either way, the shop can just grant
  more tries directly. `ChatThread` shows a banner + "Allow more
  revisions" button to the shop whenever the customer they're talking to
  is capped; `POST /api/conversations/[id]/grant-revisions` resets the
  count by stamping `conversations.revision_grant_at`.
- **In-store consultations aren't capped at all.** The pre-existing
  `/simulator` (shop staff generating directly, e.g. with a walk-in
  customer standing there) now also has the reference-photo path — a
  "Reference photo" section in `SelectionRail` calling `POST
  /api/design/generate-from-reference` — but no revision limit, since a
  staff member is already exercising judgment on every click; the
  online cap exists specifically because that supervision is absent in
  unattended chat.

## Keeping deals on-platform

`lib/content-filter.ts`'s `checkForExternalContactInfo` runs on every chat
message (`POST /api/conversations/[id]/messages`, both customer- and
shop-sent) and rejects (not silently redacts) any message containing a URL,
an `@handle`, a named messaging app (Instagram, WhatsApp, LINE, Telegram,
…), an email address, or a phone-number-shaped digit run — the goal being
that a shop and customer can't just take the relationship to Instagram DMs
and skip the platform (and its 5% fee) entirely. This is a blunt
regex heuristic, not a moderation system — see **Known simplifications**
for its false-positive/negative tradeoffs.

## Error handling

- **API routes**: wrapped in `withErrorHandling` (`lib/api-error.ts`), which
  turns any thrown `AppError` into a consistent `{ error, code }` JSON response
  with the right status code, and anything unexpected into a logged 500 with a
  generic message (no stack traces leak to the client).
- **External API calls** (Claude, FLUX, Gold API, Storage) each catch their own
  failure modes (auth, rate limit, timeout, empty response) and re-throw a
  message a user could actually act on. `design/generate` treats prompt
  generation, image generation, and storage upload as separate failure points
  so the error message tells you which stage broke.
- **Frontend**: `lib/api-client.ts`'s `apiFetch` turns non-2xx responses into a
  typed `ApiRequestError` and network failures (offline, DNS, timeout) into a
  readable message instead of a raw `TypeError`. Every dashboard page has
  loading / empty / error+retry states, not just a happy path. A global toast
  (`components/ui/Toast.tsx`) surfaces async errors that happen outside the
  main content area (e.g. a credit-limit hit while generating). `app/error.tsx`,
  `app/global-error.tsx`, and `app/not-found.tsx` catch anything that still
  slips through as an unhandled render error.
- **Env vars**: `lib/supabase.ts`, `lib/claude-prompt.ts`, `lib/flux-image.ts`,
  `lib/gold-api.ts`, and `lib/stripe.ts` each fail at import time with a clear
  message if their required key is missing, instead of surfacing later as an
  obscure runtime error.

## Structure
- `supabase/` — SQL migrations, run in numeric order
- `lib/` — external API clients (`flux-image.ts` incl. Kontext reference-guided gen, `fal-video.ts`, `gold-api.ts`, `claude-prompt.ts` — actually Groq, not Anthropic, despite the name), pricing calc, image-cache/storage + portfolio image/video/reference upload helpers, auth (`supabase.ts` server-side, `supabase-browser.ts` client-side, `customer-auth-context.tsx` client-side for customers), error handling (`api-error.ts`), env validation (`env.ts`), Stripe client + fee math (`stripe.ts`), rate limiting (`rate-limit.ts`), design revision cap (`design-revisions.ts`), design advisor (`design-advisor.ts`), shop response-time stat (`response-time.ts`), relative-time formatting (`format.ts`), off-platform-contact message filter (`content-filter.ts`), shared credit-cost constants (`credits.ts`), Haversine distance (`geo.ts`)
- `middleware.ts` — route protection
- `app/login/`, `app/customer/login/` — shop / customer sign in & sign up
- `app/(dashboard)/` — authenticated store-staff screens: `simulator`, `materials`, `history`, `messages`, `portfolio`, `settings`, wrapped in a session-resolving layout with navbar
- `app/customer/(dashboard)/messages/` — authenticated customer chat screens
- `app/shops/`, `app/shops/[id]/` — public shop directory (2-col cards, filters) & profile (cover/avatar, location, specialty materials, portfolio with detail view, follow, reviews, verified badge, response time, "message this shop")
- `app/feed/` — public Instagram-style Discover/Following feed across all shops' portfolio posts
- `app/share/[token]/` — public, unauthenticated design share view
- `components/simulator/` — the design simulator's rail + result canvas
- `components/chat/` — chat thread, design-generation panel, order proposal panel, order card (pay/confirm/advance/review), report dialog
- `components/feed/FeedPost.tsx` — a feed post card: like/save/comment, shop identity, boosted badge
- `components/ui/Toast.tsx` — global toast notifications
- `components/ui/StarRating.tsx` — read-only 5-star display
- `components/ui/FacetLoader.tsx` — the generation loading animation

## API routes
| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/tenant/bootstrap` | POST | session | Create a tenant + link it to the calling user (sign-up flow) |
| `/api/tenant/me` | GET/PATCH | tenant | Current store's plan/credits / update returns policy |
| `/api/customer/bootstrap` | POST | session | Create a customer profile (sign-up flow) |
| `/api/customer/me` | GET | customer | Current customer's profile |
| `/api/gold-rate/refresh` | POST | cron secret | Fetch & cache XAU/XPT/XAG spot prices |
| `/api/gold-rate/latest` | GET | tenant | Latest cached rates |
| `/api/categories` | GET/POST | tenant | List / create item categories |
| `/api/categories/[id]` | PATCH/DELETE | tenant | Edit / soft-delete a category |
| `/api/materials` | GET/POST | tenant | List / create metals, gemstones, finishes |
| `/api/materials/[id]` | PATCH/DELETE | tenant | Edit / soft-delete a material |
| `/api/prompt/generate` | POST | tenant | Claude-only prompt preview |
| `/api/design/generate` | POST | tenant | Full flow: credit check → cache check → Claude prompt → FLUX image → Storage → price → save |
| `/api/design/generate-from-reference` | POST | tenant | In-store: generate from an uploaded reference photo (FLUX Kontext), no revision cap |
| `/api/design` | GET | tenant | List a tenant's design/estimate history (customer search) |
| `/api/design/pdf/[id]` | GET | tenant | One-click PDF estimate |
| `/api/design/share/[token]` | GET | public | Read-only design lookup for the customer share link |
| `/api/shops` | GET | public | Search/filter public shop directory (`q`, `location`, `materials`, `verified`, `returns_accepted`, `min_rating`, `lat`+`lng` for nearest-first sort) |
| `/api/shops/[id]` | GET | public | Shop profile: bio, portfolio, reviews, catalog |
| `/api/tenant/profile-image` | POST | tenant | Upload shop logo or cover photo (multipart, `kind=logo\|cover`) |
| `/api/conversations` | GET/POST | session | List my conversations (shop or customer) / start one (customer) |
| `/api/conversations/[id]/messages` | GET/POST | session | Read / send chat messages |
| `/api/conversations/[id]/generate` | POST | customer | Generate a design inside a chat (rate-limited, revision-capped, consumes shop credit) |
| `/api/conversations/[id]/generate-from-reference` | POST | customer | Generate from an uploaded reference photo — the advisor's escape hatch, not revision-capped |
| `/api/conversations/[id]/revision-status` | GET | session | This conversation's design-tries used/remaining |
| `/api/conversations/[id]/grant-revisions` | POST | tenant | Shop resets the customer's revision count for this request |
| `/api/conversations/[id]/advice` | GET | session | AI (Groq) suggestion for what to try next, once revisions are exhausted |
| `/api/orders` | GET/POST | session/tenant | List a conversation's orders / shop proposes an order |
| `/api/orders/[id]` | PATCH | session | Status transitions: customer `confirm` (shop_visit only), shop `advance`, either `cancel` (while `proposed`) |
| `/api/orders/[id]/checkout` | POST | customer | Create a Stripe Checkout session for an `online_payment` order |
| `/api/stripe/connect` | GET/POST | tenant | Payment status / create Express account + onboarding link |
| `/api/stripe/webhook` | POST | Stripe signature | `checkout.session.completed`, `account.updated` |
| `/api/reviews` | POST | customer | Review a completed order (one per order) |
| `/api/reports` | POST | session | Either side reports a conversation (reason + optional details) |
| `/api/portfolio` | GET/POST | tenant | List / add a portfolio item (uploaded photo or from an existing design) |
| `/api/portfolio/video` | POST | tenant | Post a video (upload or fal.ai-generated from an image) — costs 10 credits |
| `/api/portfolio/[id]` | PATCH/DELETE | tenant | Edit title/description/materials/order / remove a portfolio item |
| `/api/portfolio/[id]/like` | POST/DELETE | customer | Like / unlike a portfolio post |
| `/api/portfolio/[id]/save` | POST/DELETE | customer | Save / unsave a portfolio post |
| `/api/portfolio/[id]/comments` | GET/POST | public/customer | Read comments (public) / post one (customer) |
| `/api/portfolio/[id]/comments/[commentId]` | DELETE | customer | Delete your own comment |
| `/api/portfolio/[id]/boost` | POST/DELETE | tenant | Boost/unboost a post for 7 days (max 3 concurrent per shop) |
| `/api/feed` | GET | public/optional customer | `mode=discover\|following` paginated feed, boosted posts ranked first |
| `/api/follows` | GET/POST | customer | List followed shops / follow one |
| `/api/follows/[tenantId]` | DELETE | customer | Unfollow a shop |
| `/api/cron/reset-credits` | POST | cron secret | Monthly credit counter reset |

## Known simplifications (flagged, not silently skipped)
- **Gemstone carat weight**: pricing treats each selected gemstone's
  `cost_per_gram_or_carat` as a flat per-piece cost. For per-carat sizing (e.g.
  "0.3ct side stone"), add a carat field to the frontend selection and thread
  it through `calculatePrice`.
- **Engraving (Ideogram branch)**: `lib/flux-image.ts` has `generateEngravingImage`,
  but no UI wires it up yet — the simulator only calls the standard FLUX path.
- **Multi-image gallery**: `design/generate` generates 4 FLUX images but only
  persists/stores the first (to control storage cost). Loop over all 4 in
  `persistImageToStorage` if you want a full gallery + lightbox as in the spec.
- **Staff roles**: `tenant_members.role` (`owner`/`staff`) exists in the schema
  but isn't checked anywhere yet — every member currently has full access.
- **Order cancellation after payment/confirmation**: `PATCH /api/orders/[id]`
  only allows `cancel` while an order is still `proposed`. Cancelling a paid
  `online_payment` order requires issuing a Stripe refund, which isn't wired
  up — do that manually from the Stripe dashboard (and update the order's
  `status` to `cancelled` yourself) until this is automated.
- **Stripe's processing fee is estimated, not authoritative**: `computeOrderFees`
  (`lib/stripe.ts`) grosses up the customer's charge using Stripe's published
  standard US card rate (2.9% + $0.30) so the shop nets exactly 95% of its
  quote regardless of the customer's actual card. Stripe's real per-charge fee
  (international cards, Connect pricing, etc.) can differ slightly from this
  estimate — Stripe's own charge object is the authoritative source if you
  need exact reconciliation; `stripe_fee_usd`/`customer_charge_usd` on `orders`
  are for receipts/display, not accounting.
- **Response-time stat is a snapshot, not live-updating**: `computeAverageResponseHours`
  runs fresh on every shop-profile request over a bounded window (last 90
  days / 3000 messages) — fine at current scale, but a very high-traffic shop
  would want this cached/precomputed instead of recomputed per page view.
  Also only shown on the shop profile page, not the directory listing (would
  mean computing it for every shop in the list).
- **Reports have no admin review UI**: `POST /api/reports` writes to the
  `reports` table (`status` defaults to `open`) but nothing reads or actions
  them yet — review reported conversations directly in the Supabase
  dashboard until an admin screen exists.
- **Shop directory rating filter is bounded, not paginated**: `GET
  /api/shops` fetches up to 200 candidate shops, applies the minimum-rating
  filter in JS (rating is an aggregate, not a stored column), then caps
  results at 50. Past ~200 public shops, the directory would need real
  pagination and a database-side rating aggregate instead of this in-memory
  approach.
- **Last-message preview is best-effort**: `/api/conversations` fetches the
  most recent 200 messages across all of the caller's conversations to build
  each row's preview snippet. A shop/customer whose *other* conversations
  stay quiet while one conversation gets flooded with 200+ new messages could
  see a stale/missing preview on the quiet ones until they refresh after that
  burst passes. Raise the limit or move to a per-conversation query if this
  matters at your scale.
- **Boost is free, not monetized**: `POST /api/portfolio/[id]/boost` is a
  flat 7-day self-serve promotion, capped at 3 concurrent boosts per shop to
  keep the feed from being dominated by one shop — there's no paid tier,
  credit cost, or admin control over it. If boosting becomes a real revenue
  lever, it'd want to hook into the existing credit/Stripe machinery instead
  of being unconditionally free.
- **Feed ranking is recency + boost only**: `GET /api/feed` doesn't
  personalize the Discover tab beyond "not-yet-followed shops are still
  included" — no engagement-based or affinity ranking. It also scans up to
  300 recent candidates in memory before paginating (same tradeoff as the
  shop directory's rating filter above).
- **Comments have no shop-side moderation**: a customer can delete their own
  comment (`DELETE /api/portfolio/[id]/comments/[commentId]`), but a shop
  can't remove a comment left on its own post — only `POST /api/reports`
  (flagged for manual review, see above) until a dedicated moderation action
  exists.
- **Video credit cost is uniform regardless of source**: a raw video upload
  costs the same 10 credits as an AI-generated one (`POST
  /api/portfolio/video`), even though a raw upload has no fal.ai compute
  cost behind it — this is a deliberate business-policy choice (video posts
  as the metered/premium action, full stop) rather than a cost-reflective
  price. Revisit if that framing doesn't hold up in practice.
- **Video generation is a long synchronous call, not a queue/webhook job**:
  `generateJewelryVideo` (`lib/fal-video.ts`) calls fal.ai's synchronous
  `fal.run` endpoint with a 180s timeout, mirroring the existing image-gen
  pattern, rather than fal.ai's async queue API. Simpler, but the request
  can legitimately take 1–3 minutes and ties up the connection the whole
  time — a production version generating longer/higher-quality clips would
  want the queue + webhook flow instead.
- **A raw video upload with no source image has no poster/thumbnail**: the
  AI-generate path gets a poster for free (the source image), but a shop
  that uploads its own edited video without also supplying an image gets a
  blank first frame in the grid/feed until the video is played. Add a
  thumbnail-upload field or frame-extraction if this matters.
- **Off-platform-contact filter is a blunt regex, not real moderation**:
  `lib/content-filter.ts` will false-positive (e.g. a price or measurement
  that happens to look like a phone number) and false-negative (creatively
  obfuscated contact info, e.g. "insta dot com slash myshop") — it's a
  meaningful deterrent, not a guarantee. It also currently only covers chat
  messages, not portfolio captions/descriptions or comments, so a shop
  could still put a handle in its bio/portfolio text.
- **"Near me" needs a device location, not an address**: there's no
  geocoding, so a shop that hasn't clicked "Use my current location" from
  its actual premises (or a customer who denies the location permission
  prompt) gets no distance sorting — no manual lat/lng entry or address
  autocomplete fallback. Fine for an MVP where the shop sets this up once;
  add a geocoding provider (Google/Mapbox/Nominatim) if shops need to set a
  business address that isn't wherever their device happened to be.
- **Revision counting is message-based, not session-based**: `getRevisionStatus`
  counts design-bearing customer messages since the last order/grant/conversation
  start — simple and requires no new state machine, but it means the "cycle"
  boundary is implicit (an order or a shop grant) rather than an explicit
  "start a new request" action. A customer working two genuinely separate
  requests in one long-running conversation without ever ordering or being
  granted more will find them sharing one revision budget.
- **The design advisor doesn't see images, only past prompts**: `lib/design-advisor.ts`
  feeds Groq the *text* prompts behind previous attempts, not the generated
  images themselves — reasonable since Llama 3.3 here is text-only, but it
  means the advice is only as good as how well the prompt captured what
  came out visually.
- **Reference-guided generation isn't selection-hash cached**: unlike plain
  text generation, `generateDesignFromReferenceForTenant` always calls
  fal.ai — no cache-hit path, since a reference photo makes every request
  effectively unique. Fine given it's already the "try something different"
  path, but worth knowing if you're watching fal.ai costs.
- **Not tested against live APIs**: this was built and reviewed for
  correctness, but has not been run against real Supabase/Anthropic/fal.ai/
  goldapi.io/Stripe credentials or deployed. Run `npm run build` locally after
  adding real keys before shipping, and expect to fix at least minor
  integration issues (exact response shapes from third-party APIs can drift
  from their docs).

Also fixed in passing: a pre-existing syntax error in
`lib/design-generation.ts` (`as Record<MetalCode, GoldRate>` was missing its
`<`) that broke `tsc`/`next build` outright, unrelated to any feature above.
