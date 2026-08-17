// Shared credit-cost constants — kept in their own client-safe module (no
// env var reads) since both server routes (lib/fal-video.ts) and client
// components (the portfolio page, showing "costs N credits" before a shop
// commits to generating) need the same number.

// Video generation costs meaningfully more than image generation on
// fal.ai (video models are priced far above single-image models), so a
// video post costs proportionally more of a shop's monthly credit budget.
export const VIDEO_GENERATION_CREDIT_COST = 10;
