import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";
import { getStripeClient, usdToCents } from "@/lib/stripe";
import {
  CREDIT_PACKS,
  creditsToUsd,
  MIN_CUSTOM_CREDITS,
  MAX_CUSTOM_CREDITS,
  type CreditPackId,
} from "@/lib/credits";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL!;
const VALID_PACKS = new Set<CreditPackId>(["small", "medium", "large"]);

interface BuyCreditsBody {
  pack?: CreditPackId;
  custom_credits?: number;
}

/**
 * One-time credit top-up ($1/10 credits or $10/100 credits) — a regular
 * payment-mode Checkout session, not a subscription. Distinguished from
 * the order-payment checkout (app/api/orders/[id]/checkout) by
 * metadata.type, which the webhook branches on.
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const { supabase, tenantId } = await requireTenant(req);
  const stripe = getStripeClient();

  const body: BuyCreditsBody = await req.json().catch(() => {
    throw Errors.badRequest("Request body must be valid JSON.");
  });

  let pack: { credits: number; priceUsd: number };
  if (body.custom_credits !== undefined) {
    const credits = Math.round(body.custom_credits);
    if (!Number.isFinite(credits) || credits < MIN_CUSTOM_CREDITS || credits > MAX_CUSTOM_CREDITS) {
      throw Errors.badRequest(`custom_credits must be between ${MIN_CUSTOM_CREDITS} and ${MAX_CUSTOM_CREDITS}.`);
    }
    pack = { credits, priceUsd: creditsToUsd(credits) };
  } else if (body.pack && VALID_PACKS.has(body.pack)) {
    pack = CREDIT_PACKS[body.pack];
  } else {
    throw Errors.badRequest("Provide either pack ('small' | 'medium' | 'large') or custom_credits.");
  }

  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("id, stripe_customer_id")
    .eq("id", tenantId)
    .single();

  if (error || !tenant) throw new AppError(500, "Could not load your store.", "internal_error");

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: tenant.stripe_customer_id ?? undefined,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: `${pack.credits} extra design credits` },
          unit_amount: usdToCents(pack.priceUsd),
        },
        quantity: 1,
      },
    ],
    metadata: { type: "credit_purchase", tenant_id: tenantId, credits: String(pack.credits) },
    success_url: `${SITE_URL}/settings?credits=success`,
    cancel_url: `${SITE_URL}/settings?credits=cancelled`,
  });

  if (!session.url) throw new AppError(502, "Stripe did not return a checkout URL.", "upstream_error");

  return NextResponse.json({ url: session.url });
});
