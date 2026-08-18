# Jewelry AI SaaS

An AI design tool for jewelry craftspeople — Next.js (App Router) + Supabase +
Groq (prompting) + FLUX.1 [pro] / FLUX Kontext (image generation) + fal.ai
video. Generate a design from a description, sketch corrections directly on
top of the result with a pen/finger/Apple Pencil, and regenerate from that
sketch — a personal workbench for exploring ideas, separate from the
revision-capped quoting a shop does with an actual customer in chat. Payments,
in-chat customer conversations, and a portfolio are still here, but the
product's center of gravity is this generate → sketch → regenerate loop, not
a two-sided marketplace — see
**Design revision limits, the advisor, and sketch-to-regenerate** below for
why, and **Known simplifications** for what was deliberately cut to get here.

## Setup

1. `npm install`
2. Copy `.env.example` → `.env.local`, fill in real keys (Supabase, fal.ai,
   goldapi.io, Stripe, Groq).
3. Run the SQL migrations against your Supabase project, **in order**:
   `001_schema.sql` → `002_increment_credit_usage.sql` → `003_selection_hash.sql` →
   `004_reset_monthly_credits.sql` → `005_tenant_members_and_rls.sql` →
   `006_usd_pricing.sql` → `007_marketplace.sql` → `008_stripe_orders.sql` →
   `009_portfolio_details.sql` → `010_trust_and_policy.sql` → `011_shop_profile.sql` →
   `012_social_feed.sql` → `013_video_posts.sql` → `014_shop_geo.sql` →
   `015_design_revisions.sql` → `016_personal_designs.sql` → `017_shop_experience.sql` →
   `018_subscription_and_angles.sql` → `019_storage_upload_policy.sql` →
   `020_credit_topups.sql` → `021_fix_reset_credits_where_clause.sql` →
   `022_design_title.sql` → `023_tenant_contact_email.sql`
   (`005` is the one that matters most for auth: it moves tenant scoping off a
   custom JWT claim and onto a real `tenant_members` table keyed by
   `auth.uid()`, which is what the app actually uses — see **Auth model**
   below. `012` created tables for a feed/follow/like/boost layer that's since
   been removed from the app — see **Known simplifications**; harmless to
   leave migrated, just unused.)
4. In the Supabase dashboard, enable **Email** auth (Authentication → Providers
   → Email). **Turn off "Confirm email"** while developing locally — if it's
   on, sign-up requires clicking an email confirmation link, and that link
   uses a PKCE flow that only completes correctly in the *same browser/tab*
   that started the sign-up. Opening it from a mail app or a different tab
   fails with a confusing `otp_expired` error that has nothing to do with
   actual expiry.
5. Create a **public** Storage bucket named `design-images` (Storage → New bucket).
   "Public" only affects read access — the authenticated-upload INSERT policy
   needed for raw uploads (portfolio photo/video, reference photos, shop
   logo/cover) comes from migration `019`, so make sure that one's run too.
6. Create a [Stripe](https://dashboard.stripe.com) account (test mode is fine for
   development) and enable **Connect** (Connect → Get started → Express accounts).
   If account creation fails with `Stripe no longer recommends Accounts v1`,
   turn on **Accounts v1 support** at
   `dashboard.stripe.com/settings/features/feat_accounts_v1_support` — Stripe
   now defaults new platforms to Accounts v2, but this codebase still uses v1.
7. `npm run dev`, open `http://localhost:3000` → the public marketing page
   (`app/page.tsx`). Click "Start free" (or go straight to `/login`) to sign up.
8. Sign up with a store name — this creates a `tenants` row and links your user
   to it via `tenant_members`, then drops you into the simulator. From
   **Settings**, click "Connect Stripe" to complete Express onboarding (use
   [Stripe's test onboarding data](https://stripe.com/docs/connect/testing) in
   test mode) before customers can pay online.
9. Point a Stripe webhook at `POST /api/stripe/webhook` (use the
   [Stripe CLI](https://stripe.com/docs/stripe-cli) — `stripe listen --forward-to
   localhost:3000/api/stripe/webhook` — for local dev) listening for
   `checkout.session.completed`, `account.updated`, `customer.subscription.created`,
   `customer.subscription.updated`, and `customer.subscription.deleted`. Copy the
   signing secret it prints into `STRIPE_WEBHOOK_SECRET`.
10. Schedule two cron jobs. `vercel.json` already declares both for **Vercel
    Cron** (`/api/gold-rate/refresh` hourly, `/api/cron/reset-credits`
    monthly on the 1st at 00:00) — Vercel Cron sends `GET` with
    `Authorization: Bearer $CRON_SECRET` automatically once `CRON_SECRET` is
    set as a project env var, no extra setup needed. Using a different
    scheduler instead (Supabase Edge Function schedule, cron-job.org, curl)?
    Both routes also accept `POST` with header `x-cron-secret: <CRON_SECRET>`
    — `lib/cron-auth.ts` accepts either convention. Spot prices won't exist
    until `/api/gold-rate/refresh` runs at least once; the simulator shows a
    clear "not available yet" error until then, not a silent $0.

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
`/settings` to `/login`, and signed-in visitors away from `/login` (and from
`/`, the marketing page, straight into `/simulator`). The equivalent
customer-side redirect covers `/customer/messages` → `/customer/login`.
`requireCustomer(req)` is the customer-side equivalent of `requireTenant`,
resolving the caller's `customers` row instead of a tenant.

**Password reset**: both `/login` and `/customer/login` have a "Forgot
password?" link (visible only in sign-in mode) that calls Supabase's
`resetPasswordForEmail`, emailing a recovery link to `/reset-password?type=shop`
or `?type=customer` — the `type` param is just so that one shared page
(`app/reset-password/page.tsx`) knows which login page to send the user back
to, since the recovery link itself carries no other context. That page waits
for the recovery session to establish (`onAuthStateChange`'s
`PASSWORD_RECOVERY` event, or an already-present session if it beat the
listener) before showing the new-password form; if neither happens within 4s
(expired/invalid link) it shows an error instead of a stuck spinner.
`supabase.auth.updateUser({ password })` sets the new password, followed by
an explicit sign-out so the recovery session doesn't linger.

## Design revision limits, the advisor, and sketch-to-regenerate

The point of AI generation here isn't "get a finished product on the first
try" — it's giving a customer (or the shop itself) a fast way to land on
"something like this" for a custom order, instead of a dozen back-and-forth
text messages. Unbounded free regeneration undermines that: it either burns
the shop's credits indefinitely, or leaves someone stuck with no next step
once they're unhappy with every attempt. So online (chat) generation is
capped, with concrete ways out once capped — and a shop's own use of the
simulator gets a more direct tool for the same underlying need: sketching
corrections right onto the image instead of re-describing them in words.

- **The simulator is a personal workbench, not a quoting tool.** Real
  customer-facing quoting happens in chat (`/api/conversations/[id]/generate`,
  below) — that's the channel with an actual customer attached and a revision
  cap. `/simulator` is the shop's own space to explore ideas before or between
  conversations, so every design it creates is tagged `designs.is_personal =
  true` (migration `016`) automatically, with no mode toggle to think about.
  **History** shows a "Personal" badge on these so they don't get mixed up
  with real customer estimates from chat.
- **Sketch & regenerate** (`components/simulator/SketchCanvas.tsx`) — after
  generating a design, the shop can open it in a drawing canvas and mark it up
  (color/brush-size picker, works identically with mouse, touch, or Apple
  Pencil — Pointer Events don't need special-casing per input device, and
  pressure drives line width when available). Submitting flattens the
  annotated image and sends it through the same image-guided generation path
  as the reference-photo flow below (FLUX Kontext), so the correction actually
  gets applied to a new render instead of just being a note to self.
- **The revision cap** (`lib/design-revisions.ts`, migration `015`) — applies
  to the *online chat* flow specifically, where there's no shop staff present
  to exercise judgment on every click. `tenants.max_design_revisions` (1–5,
  shop-configurable in **Settings → Design revisions**, default 3) counts the
  customer's design-generation messages in a conversation since the *later*
  of the conversation starting, the shop's last grant, or their most recent
  non-cancelled order (ordering means they settled on something — a future
  request should get a fresh count). `POST /api/conversations/[id]/generate`
  checks this before generating; `GET /api/conversations/[id]/revision-status`
  exposes it so `GeneratePanel` can show "N of M tries left" proactively.
- **Way out #1 — the advisor** (`lib/design-advisor.ts`,
  `GET /api/conversations/[id]/advice`): once capped, `GeneratePanel` swaps to
  an advisor view that asks Groq (the same provider `lib/claude-prompt.ts`
  already uses for FLUX prompts, despite that file's name — no Anthropic call
  exists anywhere in this codebase) for one concrete suggestion based on the
  prompts behind the customer's past attempts, falling back to a static tip if
  Groq is unreachable or nothing's been tried yet.
- **Way out #2 — reference-image generation** (FLUX.1 Kontext,
  `generateJewelryImageFromReference` in `lib/flux-image.ts`; request/response
  shape verified directly against fal.ai's docs before implementing): the
  advisor also offers "upload a reference photo instead" —
  `POST /api/conversations/[id]/generate-from-reference` — deliberately **not**
  gated by the revision cap (it's the escape hatch, not a way around it),
  though it still runs through the same `checkGenerationRateLimit` spam guard
  and credit check as ordinary generation. This is the same underlying path
  the sketch canvas uses.
- **Way out #3 — shop discretion**: the shop can just grant more tries
  directly. `ChatThread` shows a banner + "Allow more revisions" button
  whenever the customer they're talking to is capped;
  `POST /api/conversations/[id]/grant-revisions` resets the count by stamping
  `conversations.revision_grant_at`.
- **In-store consultations aren't capped at all.** `/simulator`'s reference-photo
  section (`POST /api/design/generate-from-reference`) and the sketch canvas
  both work with no revision limit, since a staff member is already exercising
  judgment on every generate click — the online cap exists specifically
  because that supervision is absent in unattended chat.
- **First-use explainer** (`components/ui/InfoTooltip.tsx`) — before a shop's
  first generate, `ResultCanvas`'s empty state walks through the
  generate → sketch → regenerate loop as three steps, each with a click-to-expand
  "?" for more detail, plus a couple more of the same tooltips next to the
  reference-photo and sketch-and-regenerate controls themselves. Click-triggered
  rather than hover, so it works the same on a touchscreen point-of-sale
  device as on desktop.

## Pricing & credits

Two separate Stripe relationships exist on the same `tenants` row, and it's
worth keeping them straight:
- **This section** — the shop pays the **platform** for its subscription
  (`tenants.stripe_customer_id`, `stripe_subscription_id`, a regular
  Checkout subscription on the platform's own Stripe account).
- **Payments (Stripe Connect), below** — a **customer** pays the **shop**
  for an order (`tenants.stripe_connect_account_id`, a Connect Express
  account, with the platform's 5% commission taken out).

A shop is on one of two tiers (`tenants.subscription_status`, migration `018`):
| | Free | Subscribed |
|---|---|---|
| Credits/month | `FREE_PLAN_MONTHLY_CREDITS` = 4 | `SUBSCRIPTION_MONTHLY_CREDITS` = 300 |
| Price | — | `SUBSCRIPTION_PRICE_USD` = $30/mo |
| Generated images | watermarked | clean |
| Portfolio pieces | 1, ever | unlimited |
| Reference-photo / sketch-and-regenerate | ✕ | ✓ |
| Video (generate or upload) | ✕ | ✓ |

The free tier is deliberately a taste of the product rather than a smaller
parallel plan — see **Free-tier gates**, below, for why: without these,
subscribing would just be "buy the same 300 credits for $30 instead of
$30 in top-ups," with no functional reason to actually pay monthly.

**Upgrading** (`POST /api/stripe/subscribe`, Settings → Subscription →
"Upgrade"): creates (or reuses) a Stripe Customer for the tenant and opens a
Checkout session in `mode: "subscription"`, priced inline via `price_data`
(no pre-created Stripe Product/Price needed — same approach the order
checkout already uses for one-off payments, just with `recurring` added).
`POST /api/stripe/portal` opens Stripe's hosted Billing Portal so a
subscribed shop can update their card or cancel without contacting support.
Both routes are tenant-scoped and distinct from the Connect onboarding routes
above them in the codebase (`app/api/stripe/subscribe`, `app/api/stripe/portal`
vs `app/api/stripe/connect`).

**Watermarking** (`lib/watermark.ts`, using `sharp`): free-tier tenants get a
semi-transparent diagonal watermark composited directly into the pixels of
every newly-generated image, in `persistImageToStorage`
(`lib/image-cache.ts`) — checked via `tenantNeedsWatermark`, which just reads
`subscription_status`. Because it's baked into the stored image itself
rather than gated in the UI, every downstream use (History, Portfolio, PDF
export, share links) is automatically covered with no separate gating logic
needed — and there's no separate "can't save the image" restriction to
implement, since a saved copy already carries the watermark.

**Credit costs per action** (`lib/credits.ts`):
| Action | Credits |
|---|---|
| Design generation (text, reference photo, or sketch — any of them) | 1 |
| Generate Video (AI-generated or uploaded, either one) | `VIDEO_GENERATION_CREDIT_COST` = 5 |
| Generate 4 angles (see below) | `MULTI_ANGLE_CREDIT_COST` = 2, for all 4 images together |
| Portfolio description (✨ Generate with AI) | 0 |

**Size, fabrication, and manual pricing** (Simulator rail, sections "Size &
fabrication" and "Pricing"): two free-text fields — size/dimensions (e.g. "US
ring size 7") and fabrication method/tools (e.g. "hand-forged", "CNC-milled")
— are folded into the Groq prompt (`lib/claude-prompt.ts`) so the AI render
reflects them instead of just documenting them; they're also part of the
selection-cache hash (`hashSelection` in `lib/image-cache.ts`) so a changed
note always produces a fresh render rather than reusing a cached image that
never saw it. The "Pricing" section optionally lets a shop type an exact
material cost and desired profit instead of the automatic
spot-rate-based estimate — `calculatePrice` (`lib/pricing.ts`) short-circuits
to `total = material cost + profit` when both are present, and
`PriceBreakdown.manual` flags which mode produced a given price. Both fields
are required together (client and server both reject one without the
other); leaving both blank uses the normal automatic calculation.

**Buying extra credits mid-cycle** (`POST /api/stripe/buy-credits`, Settings
→ Subscription → "Run out mid-month?"): a one-time, regular (non-subscription)
Checkout session, either for a preset pack in `CREDIT_PACKS` (`lib/credits.ts`
— 10/$1, 20/$2, 100/$10) or a custom amount (`MIN_CUSTOM_CREDITS`–
`MAX_CUSTOM_CREDITS`, priced via `creditsToUsd` at the same
`CREDIT_PRICE_USD_PER_CREDIT` = $0.10/credit rate as the presets and the
subscription). The Settings UI shows each option as a card with an
approximate "≈N designs" usage readout (`usageBreakdown` in
`app/(dashboard)/settings/page.tsx`, converting credits into designs/4-angle
sets/videos at their respective costs) — credits alone don't mean much until
they're translated into the actions a shop actually cares about. Available
to free and subscribed shops alike (the *reset* — see below — is what keeps
this from becoming a backdoor around the free-tier feature gates: a top-up
buys generation credits, not portfolio slots, reference photos, or video).
The webhook's `checkout.session.completed` handler branches on
`session.metadata.type` (`"credit_purchase"` vs. the order-payment path used
elsewhere) and adds the purchased amount directly onto
`tenants.monthly_credit_limit`. That only works as a genuine *top-up for
this billing period* — not a silent permanent limit increase — because
migration `020` also updated `reset_monthly_credits()` to reset
`monthly_credit_limit` back to the plan baseline (300 if active, 4
otherwise) on every monthly reset, alongside the `credits_used_this_month`
reset it already did.

**Free-tier gates** (beyond the raw credit count): a free-tier shop can
generate up to 4 credits/month of designs, but three specific actions are
blocked outright regardless of credit balance, each enforced **server-side**
(not just hidden in the UI — see the routes below) with a matching
`UpgradeGate` component (`components/ui/UpgradeGate.tsx`) shown client-side
in its place:
- **Portfolio capped at 1 piece, ever** (`POST /api/portfolio`) — counts
  existing `portfolio_items` and rejects a 2nd add for a non-`active` tenant
  with `Errors.subscriptionRequired`. Not a monthly allowance; an all-time
  cap, since the point is a one-piece taste of the feature, not a slow trickle.
- **No reference-photo or sketch-and-regenerate generation**
  (`POST /api/design/generate-from-reference` — used by both the Simulator's
  "Use a reference photo" and "✎ Sketch & regenerate", since sketch submits
  through the same reference-guided endpoint).
- **No video, generated or uploaded** (`POST /api/portfolio/video`) —
  blocked ahead of the existing credit check, since a free-tier shop
  couldn't afford `VIDEO_GENERATION_CREDIT_COST` = 5 out of 4 monthly
  credits anyway; the explicit gate makes the reason clear instead of a
  generic "insufficient credits" error.

Each gated surface (Simulator's reference-photo section and Sketch button,
Portfolio's upload/history/video sections) reads `tenant.subscription_status
=== "active"` client-side to swap in `UpgradeGate` before a request is even
attempted — the server check is what actually enforces it, the client check
is what makes the limit legible instead of a surprise error after a failed
submit. Settings' Subscription section spells out these three gates
explicitly (not just the credit numbers) so upgrading reads as unlocking
real functionality, not "the same 300 credits, priced differently."

**Generate 4 angles** (`generateMultiAngleViews` in `lib/design-generation.ts`,
`POST /api/design/generate-angles`, the "⊞ Generate 4 angles" button next to
"✎ Sketch & regenerate" in the simulator): takes an existing generated
design and renders front/side/diagonal/bottom views of the same piece via
FLUX Kontext, using the original image as the reference and its own stored
prompt (plus an angle instruction) as the text guide — no extra Groq call
needed. This is a deliberately cheap, 2D-only stand-in for real 3D model
generation (see **Known simplifications** for why: true 3D generation is
priced far above 2D image generation per call, and general-purpose 3D models
tend to render fine jewelry detail — prongs, small stones — poorly since
they aren't trained for it). The 4 images are saved as ordinary `designs`
rows sharing one `angle_set_id` (migration `018`), so they show up in
History like anything else — grouped into a single card there instead of 4
separate ones (see **History** below). In the simulator, the result renders
inline under the main image via `AngleGrid` rather than a closeable modal,
so it stays visible as part of the result instead of vanishing once you
navigate away from it.

**History** (`app/(dashboard)/history/page.tsx`) lists a tenant's generated
designs, most recent first. Each card has an editable title (`designs.title`,
migration `022`, `PATCH /api/design/[id]`) and a Delete button
(`DELETE /api/design/[id]`, tenant-scoped, DB-row-only — same convention as
Portfolio's delete). Designs sharing an `angle_set_id` from "Generate 4
angles" are grouped into one card (small 4-up thumbnail strip, a "4 angles"
badge, one shared title/delete for the set) instead of 4 separate rows,
since a flat list made a 4-angle batch hard to tell apart from 4 unrelated
designs.

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
- `customer.subscription.created`/`.updated` → syncs `tenants.subscription_status`
  and `monthly_credit_limit` from the platform subscription (see **Pricing &
  credits** below) — looked up by `stripe_customer_id`, not `order_id`, since
  this is the shop paying the platform rather than a customer paying the shop.
- `customer.subscription.deleted` → same sync, forced to `canceled`/4 credits.

Order status moves `proposed → confirmed → in_progress → ready → completed`
(shop-driven via `PATCH /api/orders/[id]` `{ action: "advance" }`, except the
`proposed → confirmed` step for `shop_visit` orders, which is a customer
`{ action: "confirm" }`; `online_payment` orders instead move to `confirmed`
automatically via the webhook once paid). Either side can `{ action: "cancel"
}` while still `proposed` — see **Known simplifications** for why cancellation
isn't available once an order is paid/confirmed.

## Portfolio, chat, and trust signals

Shops post portfolio highlights from **Portfolio** (`app/(dashboard)/portfolio`),
either by uploading a real photo/video or pulling an existing generated design
in one click — see **Video posts & credit economics** below for the video
path. Each piece can have a title, materials tag, and a description — typed
by hand, or drafted with "✨ Generate with AI" (`lib/portfolio-copy.ts`,
`POST /api/portfolio/generate-description`), which asks Groq for a
short caption from the title/materials/category text (it's a text model, not
vision, so it drafts from those fields rather than "looking at" the photo —
always editable afterward, never posted without the shop seeing it first). A
shop's public profile page (`app/shops/[id]`, reached via a direct link the
shop shares — see **Known simplifications** for why there's no public
browse/search page) shows the portfolio grid; clicking a piece opens the
full detail.

Trust signals are computed/verified rather than self-declared where possible:
- **Shop verified badge** — shown whenever `tenants.stripe_charges_enabled` is
  true, i.e. the shop has completed Stripe's own identity verification via
  Express onboarding. Shown on the shop profile and in the chat header.
- **Customer verified badge** — mirrors Supabase Auth's own
  `email_confirmed_at` into `customers.email_verified` (migration `010`, kept
  in sync by a trigger on `auth.users`). Shown to the shop in the conversation
  list and chat header.
- **Returns policy badge** — the one genuinely shop-declared field:
  `tenants.returns_accepted` (+ optional `return_policy_note`), set from
  **Settings**. Shown on the shop profile and on order cards in chat.
- **Typical response time** — `lib/response-time.ts` walks the shop's message
  history (last 90 days) and averages the gap between a customer's message
  and the shop's next reply, shown on the profile as "Typically responds
  within Xh".

`POST /api/reports` wires up the `reports` table (present in the schema since
`007`): either side of a conversation can flag it via the "Report" link in the
chat header. There's no admin review UI yet — see **Known simplifications**.

Conversation lists (`/messages` and `/customer/messages`) show an avatar, the
other party's verified badge, a last-message preview, and a relative
timestamp ("2h ago", via `lib/format.ts`).

A shop edits its public profile from **Settings → Shop profile**: a circular
logo and cover photo (`POST /api/tenant/profile-image`), bio, free-text
location, specialty-material tags, and an optional founded year
(`tenants.founded_year`, migration `017`) shown on the profile as "N years in
the craft" — a self-reported credibility signal, not a verified one (`PATCH
/api/tenant/me`). It can also pin its location via the browser's Geolocation
API ("📍 Use my current location", `tenants.latitude`/`longitude`, migration
`014`) — this originally powered a "sort by nearest" feature on the public
shop directory; that directory has since been removed (see **Known
simplifications**), so the pin currently has no consumer, but is left in
place since it's harmless and cheap to revive.

An optional **contact email** (`tenants.contact_email`, migration `023`,
loosely validated server-side against a simple email pattern) shows as a
`mailto:` link on the shop's public profile page. This is deliberately
distinct from `lib/content-filter.ts`'s in-chat contact-info blocking — that
filter stops a shop and customer from exchanging contact details *mid-chat*
to route around the platform; a general inquiries address published on a
shop's own page is just a normal thing a business does, not a bypass.

## Generate Video

Video is a premium, metered feature on top of the same credit system that
gates image generation, rather than a free unlimited upload — see **Pricing
& credits** above for its cost. `POST /api/portfolio/video`
(**Portfolio** → "Generate Video") takes either path:
- **AI-generate** (`lib/fal-video.ts`) — animates a source image (an existing
  design or a fresh upload) into a short clip via fal.ai's image-to-video API
  (`generateJewelryVideo`, default model
  `fal-ai/kling-video/v2.1/standard/image-to-video`, overridable with
  `FAL_VIDEO_MODEL_ENDPOINT`), with a motion prompt (defaults to a slow 360°
  product-rotation shot if left blank). The source image doubles as the
  video's poster/thumbnail.
- **Raw upload** — the shop's own edited video file (MP4/MOV/WebM, ≤50MB,
  `uploadPortfolioVideo` in `lib/image-cache.ts`). No poster image unless the
  shop also picks a source image.

`portfolio_items.media_type` (`'image' | 'video'`, migration `013`) drives
rendering everywhere a portfolio item shows up — a `<video controls>` element
instead of `<Image>`. `increment_credit_usage` (the RPC every credit
deduction goes through) has an optional `p_amount` parameter (default `1`, so
image-generation call sites are unaffected), which is what lets video and
the 4-angle feature charge a different amount than a plain image generation
through the same accounting path.

### Social export tools (free — no extra API cost)

Once a portfolio video exists, two small tools help a shop actually post it,
without either one calling a paid API:
- **Platform export** (`lib/video-export.ts`, `POST /api/portfolio/[id]/export-video`) —
  reformats the video to a target platform's preferred aspect ratio via a
  local `ffmpeg` binary (`fluent-ffmpeg` + `@ffmpeg-installer/ffmpeg`, no
  network call, no per-export fee): 1080×1920 vertical for TikTok/Reels,
  1080×1080 square for X/Twitter — center-crop + scale, re-encoded to H.264/AAC
  MP4. The result is uploaded to Storage (`social-export/{tenantId}/…`) and
  returned as a plain download URL — **this doesn't publish anywhere**; the
  shop still downloads and posts it themselves. A real "post directly to
  TikTok" integration would need OAuth + each platform's own developer API
  approval, which is a much bigger scope than this.
- **Caption + hashtags** (`lib/social-copy.ts`, `POST /api/portfolio/[id]/social-caption`) —
  same Groq call pattern as the portfolio description feature above (0
  credits), but tuned per platform: a short punchy hook for TikTok, a
  warmer/longer caption for Reels, or a sub-200-character line for
  X/Twitter, plus 5-8 relevant hashtags. Unlike video export, this works for
  photo pieces too — the server call only needs `caption`/`materials`, not a
  video file.

Both tools live in their own **"For SNS"** tab on the Portfolio page,
separate from the **"Portfolio"** tab (`app/(dashboard)/portfolio/page.tsx`,
`PAGE_TABS`) — the two were originally mixed into one page (a tiny "Social
tools" strip buried under each video tile), which made it unclear that
**Portfolio** is specifically what's shown on the shop's public page while
**For SNS** is a separate, nothing-published-automatically prep tool. For
SNS has its own piece picker (thumbnail grid of every Portfolio item) and a
platform selector; the caption comes back as a paragraph and the hashtags
render as individual pill "tags" (`SocialToolsPanel`), with "Export video"
only shown when the selected piece is actually a video
(`item.media_type === "video"`).

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
- **External API calls** (Groq, FLUX, Gold API, Storage) each catch their own
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
- `lib/` — external API clients (`flux-image.ts` incl. Kontext reference-guided
  gen, `fal-video.ts`, `gold-api.ts`, `claude-prompt.ts` — actually Groq, not
  Anthropic, despite the name), pricing calc, image-cache/storage + portfolio
  image/video/reference upload helpers, auth (`supabase.ts` server-side,
  `supabase-browser.ts` client-side, `customer-auth-context.tsx` client-side
  for customers), error handling (`api-error.ts`), env validation (`env.ts`),
  Stripe client + fee math (`stripe.ts`), rate limiting (`rate-limit.ts`),
  design revision cap (`design-revisions.ts`), design advisor
  (`design-advisor.ts`), shop response-time stat (`response-time.ts`),
  relative-time formatting (`format.ts`), off-platform-contact message filter
  (`content-filter.ts`), shared credit-cost + plan constants (`credits.ts`),
  Haversine distance (`geo.ts`), AI portfolio-caption drafting (`portfolio-copy.ts`),
  free-tier image watermarking (`watermark.ts`, via `sharp`), platform video
  reformatting (`video-export.ts`, via `fluent-ffmpeg`), social caption/hashtag
  drafting (`social-copy.ts`)
- `middleware.ts` — route protection, plus redirecting a signed-in shop away
  from `/` (marketing) and `/login` back into the app
- `app/page.tsx` — public marketing/landing page (hero, how-it-works,
  pricing) — the only page that isn't behind auth and isn't the sign-in form
- `app/login/`, `app/customer/login/` — shop / customer sign in & sign up
  (`/login?mode=sign_up` deep-links straight into the sign-up tab, used by
  the marketing page's primary CTA)
- `app/(dashboard)/` — authenticated store-staff screens: `simulator`
  (mode selector + sketch-and-regenerate), `materials`, `history`, `messages`,
  `portfolio`, `settings`, `help` (static reference page — getting started,
  how generation/pricing/portfolio/SNS export work, troubleshooting common
  errors; the "Watch the full illustrated walkthrough" pattern reappears
  here too, reopening the same `TutorialModal` via the `atelier:open-tutorial`
  event), wrapped in a session-resolving layout with navbar
- `app/customer/(dashboard)/messages/` — authenticated customer chat screens
- `app/shops/[id]/` — a shop's public profile, reached via a direct link (no
  browse/search directory — see **Known simplifications**)
- `app/share/[token]/` — public, unauthenticated design share view
- `components/simulator/` — the design simulator's rail (Meta-style pill-tab
  selectors), result canvas, `SketchCanvas.tsx` (pointer-events drawing layer
  for mark-up-and-regenerate), and `AngleGrid.tsx` (inline 2x4 grid of the
  "Generate 4 angles" result, rendered persistently under the main image
  rather than a closeable modal, so it doesn't disappear once generated)
- `components/chat/` — chat thread, design-generation panel, order proposal
  panel, order card (pay/confirm/advance/review), report dialog
- `components/ui/Toast.tsx` — global toast notifications
- `components/ui/StarRating.tsx` — read-only 5-star display
- `components/ui/FacetLoader.tsx` — the generation loading animation
- `components/ui/InfoTooltip.tsx` — click-to-reveal "?" explanation popover

## API routes
| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/tenant/bootstrap` | POST | session | Create a tenant + link it to the calling user (sign-up flow) |
| `/api/tenant/me` | GET/PATCH | tenant | Current store's plan/credits / update profile & policy fields |
| `/api/tenant/profile-image` | POST | tenant | Upload shop logo or cover photo (multipart, `kind=logo\|cover`) |
| `/api/customer/bootstrap` | POST | session | Create a customer profile (sign-up flow) |
| `/api/customer/me` | GET | customer | Current customer's profile |
| `/api/gold-rate/refresh` | POST | cron secret | Fetch & cache XAU/XPT/XAG spot prices |
| `/api/gold-rate/latest` | GET | tenant | Latest cached rates |
| `/api/categories` | GET/POST | tenant | List / create item categories |
| `/api/categories/[id]` | PATCH/DELETE | tenant | Edit / soft-delete a category |
| `/api/materials` | GET/POST | tenant | List / create metals, gemstones, finishes |
| `/api/materials/[id]` | PATCH/DELETE | tenant | Edit / soft-delete a material |
| `/api/prompt/generate` | POST | tenant | Prompt preview only |
| `/api/design/generate` | POST | tenant | Full flow: credit check → cache check → prompt → FLUX image → Storage → price → save (`is_personal` flag for "For myself" mode) |
| `/api/design/generate-from-reference` | POST | tenant | In-store: generate from an uploaded/sketched reference photo (FLUX Kontext), no revision cap |
| `/api/design/generate-angles` | POST | tenant | "Generate 4 angles" from an existing design (FLUX Kontext) — 2 credits for the bundle |
| `/api/design` | GET | tenant | List a tenant's design/estimate history (customer search) |
| `/api/design/[id]` | PATCH/DELETE | tenant | Rename (`title`) or delete a design from History |
| `/api/design/pdf/[id]` | GET | tenant | One-click PDF estimate |
| `/api/design/share/[token]` | GET | public | Read-only design lookup for the customer share link |
| `/api/shops/[id]` | GET | public | Shop profile: bio, portfolio, reviews, catalog |
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
| `/api/stripe/connect` | GET/POST | tenant | Connect payment status / create Express account + onboarding link (shop gets paid) |
| `/api/stripe/subscribe` | POST | tenant | Start the $30/mo platform subscription Checkout (shop pays the platform) |
| `/api/stripe/portal` | POST | tenant | Open Stripe's Billing Portal to manage/cancel the subscription |
| `/api/stripe/buy-credits` | POST | tenant | One-time top-up ($1/10 credits or $10/100 credits) |
| `/api/stripe/webhook` | POST | Stripe signature | `checkout.session.completed`, `account.updated`, `customer.subscription.*` |
| `/api/reviews` | POST | customer | Review a completed order (one per order) |
| `/api/reports` | POST | session | Either side reports a conversation (reason + optional details) |
| `/api/portfolio` | GET/POST | tenant | List / add a portfolio item (uploaded photo or from an existing design) |
| `/api/portfolio/video` | POST | tenant | Generate a video (upload or fal.ai-generated from an image) — costs 5 credits |
| `/api/portfolio/[id]` | PATCH/DELETE | tenant | Edit title/description/materials/order / remove a portfolio item |
| `/api/portfolio/generate-description` | POST | tenant | Draft a short portfolio caption from title/materials/category (Groq) |
| `/api/portfolio/[id]/export-video` | POST | tenant | Reformat a portfolio video for TikTok/Reels/X (local ffmpeg, no external API) |
| `/api/portfolio/[id]/social-caption` | POST | tenant | Platform-tuned caption + hashtags for a portfolio video (Groq) |
| `/api/cron/reset-credits` | POST | cron secret | Monthly credit counter reset |

## Security

A pre-launch hardening pass, in the order it's usually asked about:

- **Secrets**: `.env.local` is gitignored; only `.env.example` (empty
  placeholders) is tracked, and there's no secret ever committed to git
  history. `lib/env.ts` fails loudly at boot if a required server var is
  missing rather than surfacing as a cryptic downstream error. The only
  `NEXT_PUBLIC_*` vars are the Supabase anon key/URL (meant to be public —
  RLS is what actually protects data behind it) and the site URL; every
  paid-API key (Groq, fal.ai, Stripe, Gold API) and the Supabase service
  role key stay server-only.
- **Record access**: every table has RLS enabled with matching policies
  (`supabase/001`, `005`, `007`, `012`) — verified by diffing "every table
  ever created" against "every table with RLS enabled," not just spot
  checks. API routes layer explicit `tenant_id`/`customer_id` ownership
  checks on top (e.g. `conversation.customer_id !== customerId` →
  `Errors.forbidden`) as defense-in-depth beyond what RLS alone provides,
  including on `getServiceClient()` paths that bypass RLS entirely and so
  depend on that check being right.
- **Mass assignment**: every `PATCH`/`POST` builds its DB `update`/`insert`
  object field-by-field from an explicit allowlist (see `PATCH
  /api/tenant/me` for the pattern) — never `.update(body)` or a raw spread
  of the request body, so a client can't set a column just by adding an
  unexpected key to the JSON it sends.
- **Session cookies** (`middleware.ts`): `secure` is forced in production
  and `sameSite: "lax"` is pinned explicitly rather than trusting
  `@supabase/ssr`'s defaults. Deliberately **not** `httpOnly` — the browser
  Supabase client (`lib/supabase-browser.ts`) reads this same cookie
  client-side to manage the session, so marking it `httpOnly` would break
  login.
- **Bot / abuse protection**: the customer chat's generation endpoints
  already had per-conversation rate limiting (`lib/rate-limit.ts`,
  `checkGenerationRateLimit` — cooldown, daily cap, fair-use share vs. other
  customers of the same shop). The **staff-facing** Simulator/Portfolio
  generation endpoints (`/api/design/generate`, `/api/design/generate-from-reference`,
  `/api/design/generate-angles`, `/api/portfolio/video`) had none until this
  pass — `checkTenantGenerationCooldown` adds a minimum 2s gap between a
  tenant's own generations, DB-backed (reads the tenant's most recent
  `designs`/`portfolio_items` row) rather than in-memory, so it holds up
  across serverless instances instead of resetting per cold start. Cron
  endpoints require `CRON_SECRET`, accepted either as Vercel Cron's own
  `Authorization: Bearer` header or the `x-cron-secret` header a manually
  configured scheduler would send (`lib/cron-auth.ts`); the Stripe webhook
  verifies its signature (`stripe.webhooks.constructEvent`) before trusting
  anything in the payload.
- **Input validation**: every route with a body validates required fields,
  types, and ranges before touching the DB or an external API (weight > 0,
  email format, credit amounts within `MIN_CUSTOM_CREDITS`–
  `MAX_CUSTOM_CREDITS`, manual pricing fields required together, etc.) — see
  any route's top for the pattern.
- **XSS**: no `dangerouslySetInnerHTML` anywhere in the codebase — all
  user-supplied text (chat messages, bios, captions, portfolio
  descriptions) renders through normal JSX, which escapes by default. PDF
  generation (`pdf-lib`) draws text as glyphs, not markup, so there's no
  injection surface there either.
- **Response shape**: public/shared endpoints (`GET /api/shops/[id]`,
  `GET /api/design/share/[token]`) hand-pick an explicit field list rather
  than `select("*")`, so a stray column added later (Stripe IDs, internal
  notes) doesn't silently leak into a public response just because it
  exists on the table.
- **Security headers** (`next.config.js`): `Content-Security-Policy`,
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy`, `Permissions-Policy` (`geolocation=(self)` for
  Settings' "use my current location," everything else denied), and
  `Strict-Transport-Security` (forces HTTPS on repeat visits once deployed;
  harmless over local HTTP since browsers ignore it there). The CSP is
  deliberately not a strict nonce-based policy — Next.js's own hydration
  script and dev-mode HMR need `'unsafe-inline'`/`'unsafe-eval'` to
  function, and a nonce-based policy needs the nonce wired through
  middleware and every script tag by hand, which is easy to get subtly
  wrong. This version blocks the concrete browser-exploitable classes
  (framing/clickjacking, MIME-sniffing, cross-origin data exfil to
  arbitrary hosts, form-action hijacking) without touching how the app
  itself runs; tighten it later (nonces, dropping `'unsafe-inline'`) if
  there's a concrete reason to.
- **Password storage**: never touched directly — Supabase Auth owns
  hashing/storage entirely; the app only ever sees a session token.
- **Dependency scan** (`npm audit`): clean except **Next.js 14.2.35 itself**,
  which is the newest 14.2.x release but still carries several disclosed
  advisories (mostly DoS/SSRF/cache-poisoning classes, a few rated High)
  that are only fixed from Next.js 15/16 onward — see **Known
  simplifications** below. Not patched in this pass: jumping two major
  versions touches App Router internals and config keys (e.g.
  `experimental.serverComponentsExternalPackages` is renamed in 15+) widely
  enough that doing it silently, right before a launch, felt likelier to
  introduce a fresh bug than to prevent one. Deliberate, flagged omission —
  plan the Next.js upgrade as its own tested change, not a drive-by part of
  a security pass.

## Known simplifications (flagged, not silently skipped)
- **No public shop directory/marketplace discovery, by design**: `app/shops`
  (browse/search/filter) and its `GET /api/shops` list endpoint, the SNS-style
  feed (`app/feed`, `GET /api/feed`), follow (`follows` table,
  `/api/follows*`), and portfolio like/save/comment/boost were all built and
  then **removed** — see project history for the reasoning: a two-sided
  marketplace's hardest problem is discovery/liquidity on both sides, and
  jewelers + customers already coordinate for free over Instagram DMs, so
  betting the product on winning that discovery layer was the highest-risk,
  least-validated part of the build. What's left (`app/shops/[id]`, reached
  via a link the shop shares themselves) covers "let a customer pay/chat once
  they already know which shop they want" without that bet. The underlying
  DB tables from migration `012` are still there, unused — reviving the
  feature is a frontend/route job, not a schema migration, if it's ever
  worth revisiting.
- **"Near me" has no directory to sort**: the geolocation pinning in
  Settings (`tenants.latitude`/`longitude`, migration `014`) and
  `lib/geo.ts`'s Haversine distance function still exist, but the shop
  directory page that consumed them (`GET /api/shops?lat=&lng=`) was removed
  along with the rest of the browse/search surface above.
- **Sketch canvas has no undo, only clear-all**: `SketchCanvas.tsx` redraws
  the original image and discards all strokes on "Clear marks" — no
  per-stroke undo/redo. Also flattens to a single PNG client-side
  (`canvas.toBlob`), so very large source images could produce a sizeable
  upload; there's no client-side downscale beyond the 640px max canvas width
  already applied when loading the source image.
- **Personal (simulator) and customer (chat) designs share one credit pool**:
  `designs.is_personal` tags rows by origin for the History badge, but both
  channels draw from the same `monthly_credit_limit` and land in the same
  History list. A shop exploring heavily in the simulator can eat into the
  budget meant for real customer quotes in chat — if personal exploration
  needs its own allowance, that's a schema change (a second counter), not
  just a UI filter.
- **AI-generated portfolio captions are text-only, not vision**: "✨ Generate
  with AI" (`lib/portfolio-copy.ts`) drafts from the title/materials/category
  text a shop has already entered — Groq's `openai/gpt-oss-120b` here has no image input,
  so it can't actually see the photo/video being captioned. Works fine when
  those fields are filled in; produces a generic caption if they're empty.
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
- **Reports have no admin review UI**: `POST /api/reports` writes to the
  `reports` table (`status` defaults to `open`) but nothing reads or actions
  them yet — review reported conversations directly in the Supabase
  dashboard until an admin screen exists.
- **Last-message preview is best-effort**: `/api/conversations` fetches the
  most recent 200 messages across all of the caller's conversations to build
  each row's preview snippet. A shop/customer whose *other* conversations
  stay quiet while one conversation gets flooded with 200+ new messages could
  see a stale/missing preview on the quiet ones until they refresh after that
  burst passes. Raise the limit or move to a per-conversation query if this
  matters at your scale.
- **Video credit cost is uniform regardless of source**: a raw video upload
  costs the same 5 credits as an AI-generated one, even though a raw upload
  has no fal.ai compute cost behind it — this is a deliberate business-policy
  choice (video generation as the metered/premium action, full stop) rather
  than a cost-reflective price.
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
  blank first frame until the video is played.
- **Cancelling via the Billing Portal is graceful; a failed payment isn't**
  (verified with a real test-mode subscription + cancellation, plus a
  synthetic `customer.subscription.deleted` via `stripe trigger`): clicking
  "Cancel subscription" in the portal sets Stripe's `cancel_at_period_end`,
  and the subscription's `status` stays `active` until the period actually
  ends — so `subscription_status` correctly stays `active`/300 credits for
  the rest of what the shop already paid for, only dropping to `canceled`/4
  once Stripe fires `customer.subscription.deleted` at period end. A failed
  card charge is a different story: `invoice.payment_failed` isn't handled
  at all here, so a `past_due` subscription only gets caught on Stripe's own
  next `customer.subscription.updated` retry event, not immediately when
  the charge fails — fine for a demo, but a production version would want
  to handle `invoice.payment_failed` directly and probably surface a
  "payment failed, update your card" banner in the app itself.
- **The monthly credit reset had never actually worked** (found by invoking
  the RPC directly, not by reading the SQL — fixed in migration `021`):
  `reset_monthly_credits()` has done a bare `update public.tenants set ...`
  with no `WHERE` clause since migration `004`, and this Supabase project
  has an UPDATE/DELETE-without-WHERE guard enabled that rejects exactly
  that with `"UPDATE requires a WHERE clause"`. Since
  `POST /api/cron/reset-credits` swallows the RPC error into a 500 and logs
  it server-side, this would have failed silently every month with nothing
  user-visible — no shop's `credits_used_this_month` has ever actually been
  reset by the cron. Migration `021` adds `where true` (intentional — the
  function really does mean every row). Worth remembering if you add
  another bulk-update function later: this project's DB will reject it the
  same way until it has an explicit `WHERE`, even a trivially-true one.
- **Credit top-ups aren't idempotency-guarded**: unlike the order-payment
  webhook path (which no-ops on retry via `.eq("status", "proposed")`),
  `handleCreditPurchase` has no "already applied this session" check — a
  rare Stripe webhook retry of the same `checkout.session.completed` event
  would add the credits twice. Low-stakes at this scale (worst case a shop
  gets free extra credits, not charged twice — Stripe itself dedupes the
  actual charge), but a production version should record processed
  session ids before crediting.
- **The $30/mo price isn't a Stripe Product/Price object**: `POST
  /api/stripe/subscribe` builds the subscription's `price_data` inline on
  each Checkout session rather than referencing a pre-created Stripe Price
  id — simpler to keep in sync with `SUBSCRIPTION_PRICE_USD` in
  `lib/credits.ts` (change one constant, no Stripe Dashboard trip), but it
  means Stripe's own reporting sees a distinct ad-hoc price object per
  session rather than one canonical "Atelier subscription" product.
- **The Billing Portal needs a default configuration in the Stripe
  Dashboard**: `POST /api/stripe/portal` will error until one exists for
  your account (Stripe usually creates a default one automatically in test
  mode; if not, Stripe Dashboard → Settings → Billing → Customer portal →
  Activate).
- **The watermark is a plain diagonal text overlay, not a logo**:
  `lib/watermark.ts` composites literal "ATELIER · FREE PLAN" text via an
  SVG layer with `sharp` — swap in an actual logo image or adjust the
  wording/opacity there if you want something more polished before shipping
  the free tier to real users.
- **Storage RLS had no INSERT policy for authenticated users** (fixed,
  migration `019`): while building the social export tool, uploading a raw
  video through the normal UI path failed with `new row violates row-level
  security policy` against the `design-images` bucket. "Public" bucket only
  ever affected read access. Every *AI-generated* image/video was
  unaffected since it's persisted with the service-role client
  (`persistImageToStorage`, `persistGeneratedVideo`, `persistExportedVideo`),
  but the *raw upload* paths (`uploadPortfolioImage`, `uploadPortfolioVideo`,
  `uploadReferenceImage`, `uploadShopProfileImage` in `lib/image-cache.ts`)
  all use the user-scoped client from `requireTenant`, so a shop uploading
  their own photo/video/logo/reference image hit this every time. Migration
  `019` adds a `storage.objects` INSERT policy scoped to the tenant folder
  the authenticated user actually belongs to (checked via `tenant_members`).
- **ffmpeg-based tooling needs `serverComponentsExternalPackages`**:
  `sharp` and `@ffmpeg-installer/ffmpeg` both resolve their native binary via
  a `require()` call keyed off the current platform/arch at runtime —
  webpack can't statically follow that, so bundling them into the server
  build throws `Cannot find module '.../darwin-arm64/package.json'` (or
  equivalent) the first time the route actually runs, even though `next
  build`/`tsc` both stay clean. Fixed in `next.config.js` via
  `experimental.serverComponentsExternalPackages` (Next.js 14 — this became
  the stable top-level `serverExternalPackages` key in Next.js 15+, so
  update the key name on any future upgrade). Worth knowing if either
  library ever gets added to a new route: the failure only shows up at
  request time, not at build time.
- **Social export/caption tools don't publish anywhere**: both are
  prepare-and-download helpers, not a TikTok/Instagram/X posting
  integration — there's no OAuth, no scheduling, no direct-publish button.
  A shop still has to open TikTok/Instagram/X themselves and upload the
  exported file with the generated caption pasted in.
- **Video export runs ffmpeg synchronously in the request**, via
  `fluent-ffmpeg` + `@ffmpeg-installer/ffmpeg` (a bundled static binary, no
  system ffmpeg install required) — simple, but transcoding a video ties up
  the request for its full duration same as the generation routes, and very
  memory/CPU-constrained serverless environments could need a larger
  function size/timeout than the defaults. `fluent-ffmpeg` itself is an
  unmaintained package (last release years ago) — it still works fine here,
  but a maintained alternative (or shelling out to ffmpeg directly) would be
  worth it before leaning on this long-term.
- **Video export always re-encodes, even if the source already matches the
  target aspect ratio** — no short-circuit check, so every export pays the
  same transcode cost (compute, not a fal.ai/API fee) regardless of whether
  cropping was actually necessary.
- **"Generate 4 angles" has no real 3D consistency guarantee**: each angle
  is an independent FLUX Kontext call guided by the same source image and
  prompt, not a shared 3D representation — it's usually visually coherent
  since Kontext is specifically an image-guided model, but small proportion
  or detail drift between the 4 images is possible, unlike a true 3D
  model where every view is provably the same underlying geometry.
- **Off-platform-contact filter is a blunt regex, not real moderation**:
  `lib/content-filter.ts` will false-positive (e.g. a price or measurement
  that happens to look like a phone number) and false-negative (creatively
  obfuscated contact info, e.g. "insta dot com slash myshop") — it's a
  meaningful deterrent, not a guarantee. It also currently only covers chat
  messages, not portfolio captions/descriptions, so a shop could still put a
  handle in its bio/portfolio text.
- **Revision counting is message-based, not session-based**: `getRevisionStatus`
  counts design-bearing customer messages since the last order/grant/conversation
  start — simple and requires no new state machine, but it means the "cycle"
  boundary is implicit (an order or a shop grant) rather than an explicit
  "start a new request" action.
- **The design advisor doesn't see images, only past prompts**: `lib/design-advisor.ts`
  feeds Groq the *text* prompts behind previous attempts, not the generated
  images themselves — reasonable since Groq's `openai/gpt-oss-120b` here is text-only, but it
  means the advice is only as good as how well the prompt captured what
  came out visually.
- **Reference-guided generation isn't selection-hash cached**: unlike plain
  text generation, `generateDesignFromReferenceForTenant` always calls
  fal.ai — no cache-hit path, since a reference photo (or a sketch) makes
  every request effectively unique.
- **Live-API testing, and what it actually caught**: sign-up/login, the
  simulator, Settings, Portfolio, History, the Groq-backed text calls, the
  full Stripe subscription/webhook/top-up round-trip, and FLUX text and
  reference-photo generation have all been run against real Supabase/Groq/
  Stripe/fal.ai credentials this round — each bug below was found by
  actually clicking the feature, not by reading the code:
  - Groq stopped serving `llama-3.3-70b-versatile` — `GROQ_MODEL` in
    `lib/claude-prompt.ts`, `lib/design-advisor.ts`, and `lib/portfolio-copy.ts`
    now uses `openai/gpt-oss-120b`. If Groq's lineup shifts again, expect a
    404 `model_not_found`, surfaced as a 502 from the relevant route. Also,
    `openai/gpt-oss-120b` is a reasoning model — without
    `reasoning_effort: "low"` on the request, it can burn the entire
    `max_tokens` budget on hidden reasoning and return an empty `content`
    string (silently, `finish_reason: "length"`, no thrown error).
  - fal.ai's FLUX.1 [pro] endpoint now rejects `output_format: "webp"` with
    a 422 (`"Input should be 'jpeg' or 'png'"`) — both FLUX call sites in
    `lib/flux-image.ts` now request `"jpeg"`, and the content-type-to-file-extension
    logic in `persistImageToStorage` (`lib/image-cache.ts`) was widened to
    handle it instead of mislabeling non-png files as `.webp`.
  - **The "PDF" download never actually worked when clicked**: it was a
    plain `<a href="/api/design/pdf/...">`, but that route requires the same
    `Authorization: Bearer` header every tenant route does — a browser
    navigation never sends one, so every click 401'd. Fixed by having
    `downloadDesignPdf` (`lib/api-client.ts`) `fetch` the route with the
    header attached and open the result as a blob URL instead, used from
    both **History** and the simulator's result panel.
  - `reset_monthly_credits()` had a second, separate bug (this Supabase
    project rejects UPDATE without a `WHERE` clause) — see migration `021`
    above.
  - Video generation (fal.ai Kling) and goldapi.io remain unverified against
    live credentials — the "Generate 4 angles" and reference-photo/sketch
    paths share the exact FLUX Kontext call already verified above, so
    they're lower-risk, but video generation calls a structurally different
    endpoint (`lib/fal-video.ts`) that hasn't been exercised live.
