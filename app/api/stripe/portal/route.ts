import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";
import { getStripeClient } from "@/lib/stripe";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL!;

/** Lets a subscribed shop manage/cancel their subscription or update their card via Stripe's hosted portal. */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const { supabase, tenantId } = await requireTenant(req);
  const stripe = getStripeClient();

  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("stripe_customer_id")
    .eq("id", tenantId)
    .single();

  if (error || !tenant) throw new AppError(500, "Could not load your store.", "internal_error");
  if (!tenant.stripe_customer_id) throw Errors.badRequest("No subscription to manage yet.");

  const session = await stripe.billingPortal.sessions.create({
    customer: tenant.stripe_customer_id,
    return_url: `${SITE_URL}/settings`,
  });

  return NextResponse.json({ url: session.url });
});
