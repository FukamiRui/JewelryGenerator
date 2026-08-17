import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/supabase";
import { withErrorHandling, AppError } from "@/lib/api-error";
import { getStripeClient } from "@/lib/stripe";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL!;

export const GET = withErrorHandling(async (req: NextRequest) => {
  const { supabase, tenantId } = await requireTenant(req);

  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("stripe_connect_account_id, stripe_charges_enabled")
    .eq("id", tenantId)
    .single();

  if (error || !tenant) throw new AppError(500, "Could not load your store's payment status.", "internal_error");

  return NextResponse.json({
    connected: !!tenant.stripe_connect_account_id,
    charges_enabled: tenant.stripe_charges_enabled,
  });
});

/**
 * Creates (if needed) a Stripe Express connected account for the calling
 * tenant and returns a fresh Account Link URL to send the shop owner
 * through onboarding. Safe to call repeatedly — reuses the existing
 * account and just issues a new link (links expire quickly).
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const { supabase, tenantId } = await requireTenant(req);
  const stripe = getStripeClient();

  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("id, company_name, stripe_connect_account_id")
    .eq("id", tenantId)
    .single();

  if (error || !tenant) throw new AppError(500, "Could not load your store.", "internal_error");

  let accountId = tenant.stripe_connect_account_id;

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      business_type: "company",
      business_profile: { name: tenant.company_name },
      metadata: { tenant_id: tenantId },
    });
    accountId = account.id;

    const { error: updateErr } = await supabase
      .from("tenants")
      .update({ stripe_connect_account_id: accountId })
      .eq("id", tenantId);

    if (updateErr) {
      throw new AppError(500, "Could not save your Stripe account. Please try again.", "internal_error");
    }
  }

  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${SITE_URL}/settings?stripe=refresh`,
    return_url: `${SITE_URL}/settings?stripe=return`,
    type: "account_onboarding",
  });

  return NextResponse.json({ url: accountLink.url });
});
