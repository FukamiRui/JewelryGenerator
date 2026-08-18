import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";
import { getStripeClient, usdToCents } from "@/lib/stripe";
import { SUBSCRIPTION_PRICE_USD, SUBSCRIPTION_MONTHLY_CREDITS } from "@/lib/credits";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL!;

/**
 * Platform subscription checkout ($30/mo -> 300 credits/mo, no watermark).
 * Separate Stripe relationship from tenants.stripe_connect_account_id —
 * that's the shop's own Connect Express account for RECEIVING customer
 * payments; this is the shop paying the PLATFORM, billed on the platform's
 * own Stripe account via a regular (non-Connect) Checkout subscription.
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const { supabase, tenantId } = await requireTenant(req);
  const stripe = getStripeClient();

  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("id, company_name, stripe_customer_id, subscription_status")
    .eq("id", tenantId)
    .single();

  if (error || !tenant) throw new AppError(500, "Could not load your store.", "internal_error");
  if (tenant.subscription_status === "active") {
    throw Errors.badRequest("You're already subscribed.");
  }

  let customerId = tenant.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: tenant.company_name,
      metadata: { tenant_id: tenantId },
    });
    customerId = customer.id;

    const { error: updateErr } = await supabase
      .from("tenants")
      .update({ stripe_customer_id: customerId })
      .eq("id", tenantId);
    if (updateErr) throw new AppError(500, "Could not save your billing account. Please try again.", "internal_error");
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `Atelier subscription — ${SUBSCRIPTION_MONTHLY_CREDITS} design credits/month`,
          },
          unit_amount: usdToCents(SUBSCRIPTION_PRICE_USD),
          recurring: { interval: "month" },
        },
        quantity: 1,
      },
    ],
    metadata: { tenant_id: tenantId },
    success_url: `${SITE_URL}/settings?subscription=success`,
    cancel_url: `${SITE_URL}/settings?subscription=cancelled`,
  });

  if (!session.url) throw new AppError(502, "Stripe did not return a checkout URL.", "upstream_error");

  return NextResponse.json({ url: session.url });
});
