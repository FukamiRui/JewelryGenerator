import Stripe from "stripe";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY!;

if (!STRIPE_SECRET_KEY) {
  throw new Error("Missing STRIPE_SECRET_KEY — check .env.local");
}

let client: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!client) {
    client = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2026-07-29.dahlia" });
  }
  return client;
}

// Platform's marketplace commission — collected as Stripe Connect's
// `application_fee_amount`, deducted from the shop's payout. The shop is
// never charged more than this, regardless of Stripe's own processing cost.
export const PLATFORM_FEE_RATE = 0.05;

// Standard US Stripe card rate. Card-present/international/Connect pricing
// can differ; this is used only to gross up the customer's charge so the
// shop and platform get exactly amount_usd - platform_fee_usd and
// platform_fee_usd respectively — Stripe's own charge object is always the
// authoritative source of the actual fee taken.
const STRIPE_PERCENT_FEE = 0.029;
const STRIPE_FIXED_FEE_USD = 0.3;

export interface OrderFees {
  amountUsd: number;
  platformFeeUsd: number;
  stripeFeeUsd: number;
  customerChargeUsd: number;
}

/**
 * Gross up `amountUsd` (the shop's quoted price) so that, after Stripe takes
 * its processing cut from the total charge, the shop still nets
 * amountUsd * (1 - PLATFORM_FEE_RATE) and the platform nets
 * amountUsd * PLATFORM_FEE_RATE — i.e. the customer, not the shop or the
 * platform, absorbs Stripe's fee.
 *
 * Derivation: customerCharge * (1 - r) - f = amountUsd
 *          => customerCharge = (amountUsd + f) / (1 - r)
 */
export function computeOrderFees(amountUsd: number): OrderFees {
  const customerChargeUsd =
    Math.round(((amountUsd + STRIPE_FIXED_FEE_USD) / (1 - STRIPE_PERCENT_FEE)) * 100) / 100;
  const stripeFeeUsd = Math.round((customerChargeUsd - amountUsd) * 100) / 100;
  const platformFeeUsd = Math.round(amountUsd * PLATFORM_FEE_RATE * 100) / 100;

  return { amountUsd, platformFeeUsd, stripeFeeUsd, customerChargeUsd };
}

export function usdToCents(usd: number): number {
  return Math.round(usd * 100);
}
