// Shared credit-cost constants — kept in their own client-safe module (no
// env var reads) since both server routes (lib/fal-video.ts) and client
// components (the portfolio page, showing "costs N credits" before a shop
// commits to generating) need the same number.

// Video generation costs meaningfully more than image generation on
// fal.ai (video models are priced far above single-image models), so
// generating a video costs proportionally more of a shop's monthly credit budget.
export const VIDEO_GENERATION_CREDIT_COST = 5;

// "Generate 4 angles" produces front/side/diagonal/bottom views of an
// existing design as one bundled action — priced as a single discounted
// unit (not 4x a normal generation) to encourage using it.
export const MULTI_ANGLE_CREDIT_COST = 2;

// Plan credit allowances (see tenants.subscription_status, migration 018).
export const FREE_PLAN_MONTHLY_CREDITS = 4;
export const SUBSCRIPTION_MONTHLY_CREDITS = 300;
export const SUBSCRIPTION_PRICE_USD = 30;

// Optional one-time top-ups once a shop runs out mid-cycle — same
// $0.10/credit rate as the subscription, just in smaller units. Applied by
// raising monthly_credit_limit for the current cycle only (see migration
// 020 — reset_monthly_credits() puts the limit back to the plan baseline
// on the next reset, so a top-up doesn't silently become permanent).
export const CREDIT_PRICE_USD_PER_CREDIT = 0.1;

export type CreditPackId = "small" | "medium" | "large";
export const CREDIT_PACKS: Record<CreditPackId, { credits: number; priceUsd: number }> = {
  small: { credits: 10, priceUsd: 1 },
  medium: { credits: 20, priceUsd: 2 },
  large: { credits: 100, priceUsd: 10 },
};

export const MIN_CUSTOM_CREDITS = 5;
export const MAX_CUSTOM_CREDITS = 5000;

export function creditsToUsd(credits: number): number {
  return Math.round(credits * CREDIT_PRICE_USD_PER_CREDIT * 100) / 100;
}
